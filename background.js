import { startActivation } from './activation.js';
import {
  resolvePage,
  bypassURL,
  purgePolicy,
  requiresPurgeConfirmation,
  purgeRequest,
  requestHeaders,
  publishRule,
  permissionOrigins,
  responseSummary,
} from './core.js';
import { loadConfig, loadSecrets, secureStorage } from './storage.js';
let queue = Promise.resolve();
function serial(fn) {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
}
const ready = secureStorage();
startActivation(ready);
const inFlight = new Set();
async function logRecord(record) {
  await serial(async () => {
    const history =
      (await chrome.storage.local.get('purgeHistory')).purgeHistory || [];
    const index = history.findIndex((r) => r.id === record.id);
    if (index >= 0) history[index] = { ...history[index], ...record };
    else history.unshift(record);
    await chrome.storage.local.set({ purgeHistory: history.slice(0, 100) });
  });
  console.info('[AEM CDN Toolkit] Purge', record);
}
async function tabContext(tabId) {
  return (await chrome.storage.session.get('publishTabs')).publishTabs?.[tabId];
}
async function clearCredentials() {
  await serial(async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    if (rules.length)
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: rules.map((r) => r.id),
      });
    await chrome.storage.session.remove(['secrets', 'publishTabs']);
  });
  return { text: 'Session keys and active publish headers cleared.' };
}
async function execute(message) {
  await ready;
  if (message.action === 'context')
    return { context: await tabContext(message.tabId) };
  if (message.action === 'clearCredentials') return clearCredentials();
  const config = await loadConfig();
  const env = config.environments.find((e) => e.name === message.environment);
  if (!env) throw new Error('Invalid environment.');
  const policy = purgePolicy(env);
  // Enforce the saved policy before any fetch, permission checks or page matching.
  if (message.action === 'purgeAll' && !policy.fullPurgeEnabled)
    throw new Error('Full environment purge is disabled for ' + env.name + '.');
  const tab = await chrome.tabs.get(message.tabId);
  if (!tab.url || tab.url !== message.expectedURL)
    throw new Error('The page changed. Reopen the popup before continuing.');
  const context = await tabContext(tab.id);
  const onPublish =
    env.publishUrl &&
    new URL(tab.url).origin === new URL(env.publishUrl).origin;
  if (
    onPublish &&
    context &&
    (context.environment !== env.name || context.country !== message.country)
  )
    throw new Error(
      'This publish tab belongs to a different country or environment.',
    );
  const page = resolvePage(env, tab.url, message.country);
  if (onPublish && context && context.forwardedHost !== page.forwardedHost)
    throw new Error(
      'The country mapping changed. Reopen the publish window from the public site.',
    );
  if (message.action === 'bypass') {
    await chrome.tabs.update(tab.id, {
      url: bypassURL(tab.url, env.cacheParam),
    });
    return { text: 'Random cache parameter added.' };
  }
  if (!(await chrome.permissions.contains({ origins: permissionOrigins(env) })))
    throw new Error(
      'Grant access to the configured domains in Settings or the popup.',
    );
  const secrets = (await loadSecrets())[env.name] || {};
  if (message.action === 'publish') {
    const headers = requestHeaders(secrets, page.forwardedHost);
    return serial(async () => {
      const win = await chrome.windows.create({
        url: 'about:blank',
        type: 'normal',
        focused: true,
      });
      const id = win.tabs?.[0]?.id;
      if (id === undefined) {
        await chrome.windows.remove(win.id);
        throw new Error('Unable to create a publish tab.');
      }
      try {
        const rule = publishRule(id, page.publishUrl.href, headers);
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [rule.id],
          addRules: [rule],
        });
        const tabs =
          (await chrome.storage.session.get('publishTabs')).publishTabs || {};
        tabs[id] = {
          environment: env.name,
          country: page.country.code,
          forwardedHost: page.forwardedHost,
        };
        await chrome.storage.session.set({ publishTabs: tabs });
        await chrome.tabs.update(id, { url: page.publishUrl.href });
        return {
          text: 'Publish opened in a new window for ' + page.country.code + '.',
        };
      } catch {
        await chrome.declarativeNetRequest
          .updateSessionRules({ removeRuleIds: [id + 1] })
          .catch(() => {});
        const tabs =
          (await chrome.storage.session.get('publishTabs')).publishTabs || {};
        delete tabs[id];
        await chrome.storage.session.set({ publishTabs: tabs }).catch(() => {});
        await chrome.windows.remove(win.id).catch(() => {});
        throw new Error(
          'Publish navigation failed. Check the configured domains and edge key.',
        );
      }
    });
  }
  if (['purge', 'purgeAll'].includes(message.action)) {
    const scope = message.action === 'purgeAll' ? 'all' : 'page';
    if (
      requiresPurgeConfirmation(env, scope) &&
      message.confirmation !== (scope === 'all' ? 'PURGE ' + env.name : 'page')
    )
      throw new Error(
        'Purge confirmation is required. Reopen the popup if environment settings changed.',
      );
    const request = purgeRequest(env, page, scope);
    const headers = requestHeaders(secrets, page.forwardedHost, request.mode);
    // Keep the environment quiet until its current purge request completes.
    if (inFlight.has(env.name))
      throw new Error(
        'A purge is already running for this environment. Check Purge activity.',
      );
    inFlight.add(env.name);
    const record = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      environment: env.name,
      country: page.country.code,
      scope,
      mode: request.mode,
      target: request.url,
      forwardedHost: page.forwardedHost,
      state: 'pending',
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      await logRecord(record);
      const response = await fetch(request.url, {
        method: 'PURGE',
        headers,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      let body;
      // A successful HTTP response still needs its application status checked.
      if ((response.headers?.get('content-type') || '').includes('json')) {
        try {
          body = await response.json();
        } catch (error) {
          if (controller.signal.aborted) throw error;
        }
      }
      if (
        typeof body?.id === 'string' &&
        [secrets.edgeKey, secrets.purgeKey].some(
          (key) => key && body.id.includes(key),
        )
      )
        body = { ...body, id: undefined };
      const result = responseSummary(response.status, body);
      const final = {
        ...record,
        ...result,
        finishedAt: new Date().toISOString(),
      };
      await logRecord(final);
      if (result.state === 'failed')
        return {
          ok: false,
          text:
            'AEM CDN purge failed (HTTP ' +
            response.status +
            '). See Purge activity.',
          record: final,
        };
      return {
        text:
          result.state === 'succeeded'
            ? 'AEM CDN returned status ok. See Purge activity for the request ID.'
            : 'Purge request accepted. Completion was not confirmed by the response.',
        record: final,
      };
    } catch (error) {
      const final = {
        ...record,
        state: 'unknown',
        finishedAt: new Date().toISOString(),
        error: controller.signal.aborted
          ? 'Request timed out after 25 seconds. Verify before retrying.'
          : 'Network request failed. Verify the outcome before retrying.',
      };
      await logRecord(final);
      return { ok: false, text: final.error, record: final };
    } finally {
      clearTimeout(timer);
      inFlight.delete(env.name);
    }
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Extension pages may be opened in tabs. Trust their exact URL, not the absence of sender.tab.
  let senderURL;
  try {
    const url = new URL(sender.url);
    url.hash = '';
    senderURL = url.href;
  } catch {
    return false;
  }
  if (
    sender.id !== chrome.runtime.id ||
    !['options.html', 'popup.html'].some(
      (path) => senderURL === chrome.runtime.getURL(path),
    )
  )
    return false;
  if (
    ![
      'context',
      'clearCredentials',
      'bypass',
      'publish',
      'purge',
      'purgeAll',
    ].includes(message?.action)
  )
    return false;
  execute(message).then(
    (result) => respond({ ok: true, ...result }),
    (error) => respond({ ok: false, text: error.message }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((id) => {
  serial(async () => {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [id + 1],
    });
    const tabs =
      (await chrome.storage.session.get('publishTabs')).publishTabs || {};
    delete tabs[id];
    await chrome.storage.session.set({ publishTabs: tabs });
  }).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  clearCredentials().catch(() => {});
});
