import {
  matchPublicCountry,
  mappingId,
  programList,
  programConfig,
  resolvePage,
  purgePolicy,
  requiresPurgeConfirmation,
  purgeRequest,
  permissionOrigins,
} from './core.js';
import { loadConfig } from './storage.js';
import { configuredSites } from './activation.js';
const $ = (id) => document.getElementById(id);
let workspace,
  programId = 'default';
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
  $('publish').hidden = env?.cdnMode === 'standard';
  $('publish').disabled = busy || !actionable || env?.cdnMode === 'standard';
  let service = 'publish';
  try {
    service = page().service || 'publish';
  } catch {}
  $('publish').textContent =
    env?.publishOpenMode === 'window'
      ? 'Open ' + service + ' in new window'
      : 'Open ' + service + ' in new tab';
  $('purgeAll').textContent = 'Purge entire ' + service + ' service';
  $('purgeAll').hidden = !policy.fullPurgeEnabled;
  $('purgeAll').disabled = busy || !actionable || !policy.fullPurgeEnabled;
  $('bulkHint').textContent = !env
    ? ''
    : !policy.fullPurgeEnabled
    ? 'Full environment purge is disabled for ' + env.name + '.'
    : policy.confirmFullPurge
    ? 'Full purge affects every country in the selected ' +
      service +
      ' service.'
    : 'Full purge runs immediately and affects every country in the selected ' +
      service +
      ' service.';
  if (
    context &&
    (context.program || 'default') === programId &&
    selected()?.name === context.environment &&
    [selected()?.publishUrl, selected()?.previewUrl]
      .filter(Boolean)
      .some((origin) => new URL(tab.url).origin === new URL(origin).origin)
  )
    $('country').disabled = true;
}
function updateCountry() {
  $('confirm').hidden = true;
  $('confirmed').checked = false;
  pendingAction = undefined;
  try {
    const p = page();
    $('match').textContent =
      'Country mapping ready' +
      (p.service === 'preview' ? ' · Preview service.' : '.');
    $('forwardedHost').textContent = p.forwardedHost
      ? 'X-Forwarded-Host: ' + p.forwardedHost
      : 'Standard Adobe CDN · Requests target the public domain.';
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
    o.value = mappingId(c);
    o.textContent = c.code + (c.service === 'preview' ? ' · Preview' : '');
    $('country').append(o);
  }
  try {
    $('country').value = mappingId(
      matchPublicCountry(selected(), tab.url).country,
    );
  } catch {
    if (
      context &&
      (context.program || 'default') === programId &&
      context.environment === selected()?.name
    )
      $('country').value = context.country;
  }
  updateCountry();
}
async function latest() {
  if (tab?.incognito) {
    $('latest').textContent =
      'Incognito purge activity is not saved. Settings and activity open in a regular window.';
    return;
  }
  const history =
    (await chrome.storage.local.get('purgeHistory')).purgeHistory || [];
  const r = history.find(
    (r) =>
      (r.program || 'default') === programId &&
      (r.service || 'publish') ===
        (selected()?.countries.find(
          (country) => mappingId(country) === $('country').value,
        )?.service || 'publish') &&
      r.environment === $('environment').value,
  );
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
  if (action === 'publish' && selected()?.cdnMode === 'standard') {
    status(
      'Publish access is unavailable for Standard Adobe CDN environments.',
      true,
    );
    return;
  }
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
      program: programId,
      environment: env.name,
      service:
        selected()?.countries.find((mapping) => mappingId(mapping) === country)
          ?.service || 'publish',
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
      'Program: ' +
      programList(workspace).find((program) => program.id === programId).name +
      '\nEnvironment: ' +
      env.name +
      '\nService: ' +
      (p.service || 'publish') +
      '\nScope: ' +
      (scope === 'all'
        ? 'ALL countries and cached resources'
        : 'Current page') +
      '\nPURGE ' +
      request.url +
      (p.forwardedHost
        ? '\nX-Forwarded-Host: ' + p.forwardedHost
        : '\nCDN setup: Standard Adobe CDN') +
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
$('country').addEventListener('change', () => {
  updateCountry();
  latest();
});
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
function openSection(section) {
  const url = chrome.runtime.getURL('options.html#' + section);
  // Spanning extensions cannot load extension pages in incognito tabs.
  const opening =
    tab?.incognito || chrome.extension?.inIncognitoContext
      ? chrome.windows.create({ url, incognito: false, focused: true })
      : chrome.tabs.create({ url });
  return opening.catch((error) => status(error.message, true));
}
$('options').addEventListener('click', () => openSection('settings'));
$('activity').addEventListener('click', () => openSection('activity'));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.purgeHistory) latest();
});
function renderPopupPrograms() {
  const picker = $('program');
  if (!picker) return;
  picker.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select program';
  picker.append(placeholder);
  for (const program of programList(workspace)) {
    const option = document.createElement('option');
    option.value = program.id;
    option.textContent = program.name;
    picker.append(option);
  }
  picker.value = programId;
}
function selectPopupProgram(matches = configuredSites(workspace, tab?.url)) {
  config = programId
    ? programConfig(workspace, programId)
    : { version: 2, environments: [] };
  $('environment').replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select environment';
  $('environment').append(placeholder);
  for (const env of config.environments) {
    const option = document.createElement('option');
    option.value = env.name;
    option.textContent = env.name;
    $('environment').append(option);
  }
  const relevant = matches.filter(
    (match) => (match.program || 'default') === programId,
  );
  if (relevant.length === 1) $('environment').value = relevant[0].environment;
  else if (
    context &&
    (context.program || 'default') === programId &&
    relevant.some((match) => match.environment === context.environment)
  )
    $('environment').value = context.environment;
}
$('program')?.addEventListener('change', () => {
  programId = $('program').value;
  selectPopupProgram();
  updateEnvironment();
  latest();
  status('');
});
try {
  workspace = await loadConfig();
  config = programConfig(workspace, programList(workspace)[0].id);
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
  const matches = configuredSites(workspace, tab?.url);
  const matchPrograms = [
    ...new Set(matches.map((match) => match.program || 'default')),
  ];
  programId = matchPrograms.length === 1 ? matchPrograms[0] : '';
  if (
    context &&
    matches.some(
      (match) =>
        (match.program || 'default') === (context.program || 'default') &&
        match.environment === context.environment,
    )
  )
    programId = context.program || 'default';
  renderPopupPrograms();
  selectPopupProgram(matches);
  updateEnvironment();
  await latest();
  if (!programList(workspace).some((program) => program.environments.length)) {
    $('match').textContent =
      'No environments yet. Open Settings to add one or import a configuration.';
    $('options').textContent = 'Set up environments';
  }
  if (!programId)
    $('match').textContent = matches.length
      ? 'Select a matching program.'
      : 'No matching program. Select a program and environment, or open Settings.';
  if (matches.length > 1)
    status('Multiple programs or environments match. Select the correct one.');
} catch (error) {
  status(error.message, true);
  ['bypass', 'publish', 'purge', 'purgeAll'].forEach(
    (id) => ($(id).disabled = true),
  );
}
