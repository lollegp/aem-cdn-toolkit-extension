import {
  matchPublicCountry,
  resolvePage,
  purgePolicy,
  requiresPurgeConfirmation,
  purgeRequest,
  permissionOrigins,
} from './core.js';
import { loadConfig } from './storage.js';
import { configuredSites } from './activation.js';
const $ = (id) => document.getElementById(id);
let config,
  tab,
  context,
  busy = false,
  pendingAction;
function status(text, error = false) {
  $('status').textContent = text;
  $('status').dataset.error = error;
}
function selected() {
  return config?.environments.find((e) => e.name === $('environment').value);
}
function page() {
  if (!selected())
    throw new Error('Select an environment matching the current page.');
  if (!tab?.url)
    throw new Error(
      'Current page URL is unavailable. Open a configured HTTPS page.',
    );
  return resolvePage(selected(), tab.url, $('country').value);
}
function controls() {
  document
    .querySelectorAll('button,select')
    .forEach((el) => (el.disabled = busy));
  let actionable = false;
  try {
    page();
    actionable = true;
  } catch {}
  for (const id of ['bypass', 'publish', 'purge', 'purgeAll', 'sendPurge'])
    $(id).disabled = busy || !actionable;
  $('options').disabled = false;
  $('activity').disabled = false;
  const env = selected(),
    policy = purgePolicy(env);
  $('publish').textContent =
    env?.publishOpenMode === 'window'
      ? 'Open publish in new window'
      : 'Open publish in new tab';
  $('purgeAll').hidden = !policy.fullPurgeEnabled;
  $('purgeAll').disabled = busy || !actionable || !policy.fullPurgeEnabled;
  $('bulkHint').textContent = !env
    ? ''
    : !policy.fullPurgeEnabled
    ? 'Full environment purge is disabled for ' + env.name + '.'
    : policy.confirmFullPurge
    ? 'Full purge affects every country in this AEM environment.'
    : 'Full purge runs immediately and affects every country in this AEM environment.';
  if (
    context &&
    selected()?.name === context.environment &&
    selected()?.publishUrl &&
    new URL(tab.url).origin === new URL(selected().publishUrl).origin
  )
    $('country').disabled = true;
}
function updateCountry() {
  $('confirm').hidden = true;
  $('confirmed').checked = false;
  pendingAction = undefined;
  try {
    const p = page();
    $('match').textContent = 'Country mapping ready.';
    $('forwardedHost').textContent = 'X-Forwarded-Host: ' + p.forwardedHost;
  } catch (error) {
    $('match').textContent = error.message;
    $('forwardedHost').textContent = '';
  }
  controls();
}
function updateEnvironment() {
  $('country').replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select country';
  $('country').append(placeholder);
  for (const c of selected()?.countries || []) {
    const o = document.createElement('option');
    o.value = c.code;
    o.textContent = c.code;
    $('country').append(o);
  }
  try {
    $('country').value = matchPublicCountry(selected(), tab.url).country.code;
  } catch {
    if (context && context.environment === selected()?.name)
      $('country').value = context.country;
  }
  updateCountry();
}
async function latest() {
  const history =
    (await chrome.storage.local.get('purgeHistory')).purgeHistory || [];
  const r = history.find((r) => r.environment === $('environment').value);
  $('latest').textContent = r
    ? 'Latest purge: ' +
      r.state.toUpperCase() +
      ' · ' +
      r.scope +
      ' · ' +
      r.country +
      (r.httpStatus ? ' · HTTP ' + r.httpStatus : '')
    : '';
}
async function run(action) {
  if (busy) return;
  let expectedAction;
  try {
    const p = page();
    if (action === 'publish')
      expectedAction = {
        expectedTarget: p.publishUrl.href,
        expectedMode: selected().publishOpenMode,
        expectedForwardedHost: p.forwardedHost,
      };
    if (['purge', 'purgeAll'].includes(action)) {
      const request = purgeRequest(
        selected(),
        p,
        action === 'purgeAll' ? 'all' : 'page',
      );
      expectedAction = {
        expectedTarget: request.url,
        expectedMode: request.mode,
        expectedForwardedHost: p.forwardedHost,
      };
    }
  } catch (error) {
    status(error.message, true);
    return;
  }
  const env = selected();
  const country = $('country').value;
  const confirmation =
    ['purge', 'purgeAll'].includes(action) &&
    requiresPurgeConfirmation(env, action === 'purgeAll' ? 'all' : 'page')
      ? action === 'purgeAll'
        ? 'all'
        : action === 'purge'
        ? 'page'
        : undefined
      : undefined;
  busy = true;
  controls();
  status('Request in progress…');
  try {
    if (
      action !== 'bypass' &&
      !(await chrome.permissions.request({ origins: permissionOrigins(env) }))
    )
      throw new Error('Domain access was not granted.');
    const r = await chrome.runtime.sendMessage({
      action,
      environment: env.name,
      country,
      tabId: tab.id,
      expectedURL: tab.url,
      ...expectedAction,
      confirmation,
    });
    if (!r?.ok) throw new Error(r?.text || 'Operation failed.');
    status(r.text);
    $('confirm').hidden = true;
    pendingAction = undefined;
    if (action === 'bypass') {
      tab = await chrome.tabs.get(tab.id);
      $('url').textContent = tab.url || 'URL unavailable';
      updateCountry();
    }
    await latest();
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    controls();
  }
}
function confirmPurge(action) {
  try {
    const env = selected();
    const scope = action === 'purgeAll' ? 'all' : 'page';
    const p = page(),
      request = purgeRequest(env, p, scope);
    pendingAction = action;
    $('purgeTarget').textContent =
      'Environment: ' +
      env.name +
      '\nScope: ' +
      (scope === 'all'
        ? 'ALL countries and cached resources'
        : 'Current page') +
      '\nPURGE ' +
      request.url +
      '\nX-Forwarded-Host: ' +
      p.forwardedHost +
      '\nMode: ' +
      request.mode;
    $('confirmed').checked = false;
    $('confirm').hidden = false;
    status('Review the environment and purge scope before sending.');
  } catch (error) {
    status(error.message, true);
  }
}
function requestPurge(action) {
  if (busy) return;
  if (
    requiresPurgeConfirmation(
      selected(),
      action === 'purgeAll' ? 'all' : 'page',
    )
  )
    return confirmPurge(action);
  return run(action);
}
$('environment').addEventListener('change', () => {
  updateEnvironment();
  latest();
});
$('country').addEventListener('change', updateCountry);
$('bypass').addEventListener('click', () => run('bypass'));
$('publish').addEventListener('click', () => run('publish'));
$('purge').addEventListener('click', () => requestPurge('purge'));
$('purgeAll').addEventListener('click', () => requestPurge('purgeAll'));
$('sendPurge').addEventListener('click', () => {
  if (!pendingAction || busy) return;
  if (!$('confirmed').checked) {
    status('Confirm the purge request first.', true);
    return;
  }
  run(pendingAction);
});
$('cancelPurge').addEventListener('click', () => {
  $('confirm').hidden = true;
  pendingAction = undefined;
  status('');
});
$('options').addEventListener('click', () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#settings') }),
);
$('activity').addEventListener('click', () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#activity') }),
);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.purgeHistory) latest();
});
try {
  config = await loadConfig();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('url').textContent = tab?.url || 'URL unavailable';
  const response = await chrome.runtime.sendMessage({
    action: 'context',
    tabId: tab?.id,
  });
  if (!response?.ok)
    throw new Error(
      response?.text ||
        'The extension background did not respond. Reload the extension and reopen the popup.',
    );
  context = response.context;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select environment';
  $('environment').append(placeholder);
  for (const env of config.environments) {
    const o = document.createElement('option');
    o.value = env.name;
    o.textContent = env.name;
    $('environment').append(o);
  }
  const matches = configuredSites(config, tab?.url);
  if (matches.length === 1) $('environment').value = matches[0].environment;
  else if (
    context &&
    matches.some((match) => match.environment === context.environment)
  )
    $('environment').value = context.environment;
  updateEnvironment();
  await latest();
  if (!config.environments.length) {
    $('match').textContent =
      'No environments yet. Open Settings to add one or import a configuration.';
    $('options').textContent = 'Set up environments';
  }
  if (matches.length > 1)
    status('Multiple environments match. Select the correct one.');
} catch (error) {
  status(error.message, true);
  ['bypass', 'publish', 'purge', 'purgeAll'].forEach(
    (id) => ($(id).disabled = true),
  );
}
