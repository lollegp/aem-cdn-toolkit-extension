import {
  createEnvironment,
  validateConfig,
  validateHeaders,
  permissionOrigins,
} from './core.js';
import { loadConfig, loadSecrets, secureStorage } from './storage.js';
const $ = (id) => document.getElementById(id);
let config,
  secrets,
  pendingImport,
  bundledConfig,
  importing = false,
  busy = false;
function status(text, error = false) {
  $('status').textContent = text;
  $('status').dataset.error = error;
}
function importStatus(text, error = false) {
  $('importStatus').textContent = text;
  $('importStatus').dataset.error = error;
}
function selected() {
  return config?.environments.find((e) => e.name === $('environment').value);
}
function renderEnvironments(preferred = $('environment').value) {
  $('environment').replaceChildren();
  for (const env of config.environments) {
    const option = document.createElement('option');
    option.value = env.name;
    option.textContent = env.name;
    $('environment').append(option);
  }
  $('environment').value = config.environments.some(
    (env) => env.name === preferred,
  )
    ? preferred
    : config.environments[0]?.name || '';
}
function environmentStatus(text, error = false) {
  $('environmentStatus').textContent = text;
  $('environmentStatus').dataset.error = error;
}
$('addEnvironment').addEventListener('click', () => {
  if (busy || !config) return;
  $('newEnvironmentName').value = '';
  environmentStatus('');
  $('environmentDialog').showModal();
});
$('cancelEnvironment').addEventListener('click', () => {
  if (!busy) $('environmentDialog').close();
});
$('environmentDialog').addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
$('createEnvironment').addEventListener('click', async () => {
  if (busy || !config) return;
  try {
    const draft = structuredClone(config);
    draft.environments.push(
      createEnvironment($('newEnvironmentName').value.trim()),
    );
    const validated = validateConfig(draft),
      name = validated.environments.at(-1).name;
    buttonLock(true);
    await chrome.storage.local.set({ config: validated });
    config = validated;
    secrets = await loadSecrets();
    renderEnvironments(name);
    show();
    $('environmentDialog').close();
    status(
      name +
        ' added. Configure its publish URL and country mappings, then save.',
    );
  } catch (error) {
    environmentStatus(error.message, true);
  } finally {
    buttonLock(false);
  }
});
$('removeEnvironment').addEventListener('click', async () => {
  if (busy || !selected()) return;
  const name = selected().name;
  if (!confirm('Remove ' + name + ' and its saved mappings and keys?')) return;
  buttonLock(true);
  try {
    const validated = validateConfig({
      ...config,
      environments: config.environments.filter((env) => env.name !== name),
    });
    await clearSecrets();
    await chrome.storage.local.set({ config: validated });
    config = validated;
    secrets = await loadSecrets();
    renderEnvironments();
    show();
    status(
      name +
        ' removed. Active publish headers cleared; existing activity is retained.',
    );
  } catch (error) {
    status(error.message, true);
  } finally {
    buttonLock(false);
  }
});
function addCountry(
  country = { code: '', publicBaseUrl: '', publishPathPrefix: '/' },
) {
  const row = document.createElement('div');
  row.className = 'country-row';
  for (const [field, label, placeholder] of [
    ['code', 'Country', 'GB'],
    ['publicBaseUrl', 'Public URL', 'https://www.example.invalid/'],
    ['publishPathPrefix', 'Publish path prefix', '/'],
  ]) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement('input');
    input.dataset.field = field;
    input.value = country[field];
    input.placeholder = placeholder;
    if (field === 'code') input.maxLength = 16;
    wrap.append(input);
    row.append(wrap);
  }
  const remove = document.createElement('button');
  remove.textContent = 'Remove';
  remove.className = 'secondary';
  remove.addEventListener('click', () => row.remove());
  row.append(remove);
  $('countries').append(row);
}
function readCountries() {
  return [...$('countries').children].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll('input')].map((i) => [
        i.dataset.field,
        i.value.trim(),
      ]),
    ),
  );
}
function show() {
  const e = selected();
  $('emptyEnvironments').hidden = !!e;
  if (!e) {
    for (const id of [
      'environmentName',
      'publishUrl',
      'cacheParam',
      'edgeKey',
      'purgeKey',
    ])
      $(id).value = '';
    for (const id of [
      'fullPurgeEnabled',
      'confirmPagePurge',
      'confirmFullPurge',
    ])
      $(id).checked = false;
    $('countries').replaceChildren();
    buttonLock(busy);
    status('');
    return;
  }
  const s = secrets[e.name] || {};
  $('environmentName').value = e.name;
  $('publishUrl').value = e.publishUrl;
  $('cacheParam').value = e.cacheParam;
  $('purgeMode').value = e.purgeMode;
  $('fullPurgeEnabled').checked = e.fullPurgeEnabled;
  $('confirmPagePurge').checked = e.confirmPagePurge;
  $('confirmFullPurge').checked = e.confirmFullPurge;
  $('edgeKey').value = s.edgeKey || '';
  $('purgeKey').value = s.purgeKey || '';
  $('countries').replaceChildren();
  e.countries.forEach(addCountry);
  buttonLock(busy);
  status('');
}
async function clearSecrets() {
  let r;
  try {
    r = await chrome.runtime.sendMessage({ action: 'clearCredentials' });
  } catch {
    throw new Error(
      'The extension background did not respond. Reload the extension in chrome://extensions, then reopen Settings.',
    );
  }
  if (!r)
    throw new Error(
      'The extension background did not respond. Reload the extension in chrome://extensions, then reopen Settings.',
    );
  if (!r.ok)
    throw new Error(
      r.text || 'Unable to clear active publish headers and session keys.',
    );
  secrets = {};
}
function buttonLock(value) {
  busy = value;
  [
    'save',
    'import',
    'export',
    'bundled',
    'environment',
    'clearSecrets',
    'applyImport',
    'cancelImport',
    'addEnvironment',
    'removeEnvironment',
    'createEnvironment',
    'cancelEnvironment',
  ].forEach((id) => ($(id).disabled = value));
  $('environmentFields').disabled = value || !selected();
  $('save').disabled = value || !selected();
  $('removeEnvironment').disabled = value || !selected();
}
$('environment').addEventListener('change', show);
$('addCountry').addEventListener('click', () => addCountry());
$('save').addEventListener('click', async () => {
  if (busy || !selected()) return;
  try {
    const draft = structuredClone(config),
      originalName = $('environment').value,
      name = $('environmentName').value.trim(),
      e = draft.environments.find((e) => e.name === originalName);
    e.name = name;
    e.publishUrl = $('publishUrl').value.trim();
    e.cacheParam = $('cacheParam').value.trim();
    e.purgeMode = $('purgeMode').value;
    e.countries = readCountries();
    e.fullPurgeEnabled = $('fullPurgeEnabled').checked;
    e.confirmPagePurge = $('confirmPagePurge').checked;
    e.confirmFullPurge = $('confirmFullPurge').checked;
    const values = {
      edgeKey: $('edgeKey').value,
      purgeKey: $('purgeKey').value,
    };
    validateHeaders(
      Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
    );
    Object.assign(e, values);
    const validated = validateConfig(draft),
      origins = permissionOrigins(
        validated.environments.find((e) => e.name === name),
      );
    buttonLock(true);
    if (origins.length && !(await chrome.permissions.request({ origins })))
      throw new Error('Domain access was not granted.');
    if (name !== originalName) await clearSecrets();
    await chrome.storage.local.set({ config: validated });
    config = validated;
    secrets = await loadSecrets();
    renderEnvironments(name);
    show();
    status(
      name +
        ' saved. Reopen existing publish windows to apply changed keys or mappings.',
    );
  } catch (error) {
    status(error.message, true);
  } finally {
    buttonLock(false);
  }
});
$('bundled').addEventListener('click', async () => {
  buttonLock(true);
  try {
    const origins = [
      ...new Set(bundledConfig.environments.flatMap(permissionOrigins)),
    ];
    if (origins.length && !(await chrome.permissions.request({ origins })))
      throw new Error('Domain access was not granted.');
    await clearSecrets();
    await chrome.storage.local.remove('config');
    config = await loadConfig();
    secrets = await loadSecrets();
    renderEnvironments();
    show();
    status('Bundled config.json loaded. Its environment keys are now active.');
  } catch (error) {
    status(error.message, true);
  } finally {
    buttonLock(false);
  }
});
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aem-cdn-config.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Saved configuration exported including environment keys.');
});
$('import').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async () => {
  pendingImport = undefined;
  try {
    const file = $('importFile').files[0];
    if (!file) return;
    if (file.size > 1000000)
      throw new Error('Configuration file is too large.');
    pendingImport = validateConfig(JSON.parse(await file.text()));
    importStatus('');
    $('importDialog').showModal();
  } catch (error) {
    status(error.message, true);
  } finally {
    $('importFile').value = '';
  }
});
$('cancelImport').addEventListener('click', () => {
  if (importing) return;
  $('importDialog').close();
  pendingImport = undefined;
});
$('importDialog').addEventListener('close', () => {
  if (!importing) pendingImport = undefined;
});
$('importDialog').addEventListener('cancel', (event) => {
  if (importing) event.preventDefault();
});
$('applyImport').addEventListener('click', async () => {
  if (importing || !pendingImport) return;
  const imported = pendingImport;
  importing = true;
  buttonLock(true);
  importStatus('Importing configuration…');
  try {
    const origins = [
      ...new Set(imported.environments.flatMap(permissionOrigins)),
    ];
    if (origins.length && !(await chrome.permissions.request({ origins })))
      throw new Error('Domain access was not granted.');
    await clearSecrets();
    await chrome.storage.local.set({ config: imported });
    config = imported;
    secrets = await loadSecrets();
    renderEnvironments();
    pendingImport = undefined;
    $('importDialog').close();
    show();
    status(
      'Configuration imported. Environment keys loaded and configured domain access granted.',
    );
  } catch (error) {
    importStatus(error.message, true);
    status(error.message, true);
  } finally {
    importing = false;
    buttonLock(false);
  }
});
$('clearSecrets').addEventListener('click', async () => {
  if (busy || !config) return;
  buttonLock(true);
  try {
    await clearSecrets();
    config = validateConfig({
      ...config,
      environments: config.environments.map((e) => ({
        ...e,
        edgeKey: '',
        purgeKey: '',
      })),
    });
    await chrome.storage.local.set({ config });
    secrets = await loadSecrets();
    show();
    status('Saved keys and active publish headers cleared.');
  } catch (error) {
    status(error.message, true);
  } finally {
    buttonLock(false);
  }
});
try {
  await secureStorage();
  bundledConfig = validateConfig(
    await (await fetch(chrome.runtime.getURL('config.json'))).json(),
  );
  config = await loadConfig();
  secrets = await loadSecrets();
  renderEnvironments();
  show();
} catch (error) {
  status(error.message, true);
  $('save').disabled = true;
}
