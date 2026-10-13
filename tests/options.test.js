import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';
import { loadConfig, loadSecrets } from '../storage.js';

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.value = '';
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.files = [];
  }
  append(child) {
    this.children.push(child);
    if (this.tag === 'select' && !this.value) this.value = child.value;
  }
  replaceChildren() {
    this.children = [];
    if (this.tag === 'select') this.value = '';
  }
  addEventListener(event, fn) {
    this.listeners[event] = fn;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.listeners.close?.();
  }
  click() {
    return this.listeners.click?.();
  }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tag === tag ? [child] : []),
      ...child.querySelectorAll(tag),
    ]);
  }
}
let instance = 0;
async function setup({ savedConfig = defaults() } = {}) {
  const ids = [
    'environment',
    'environmentName',
    'environmentFields',
    'emptyEnvironments',
    'addEnvironment',
    'removeEnvironment',
    'environmentDialog',
    'newEnvironmentName',
    'createEnvironment',
    'cancelEnvironment',
    'environmentStatus',
    'save',
    'export',
    'import',
    'bundled',
    'importFile',
    'status',
    'publishUrl',
    'cacheParam',
    'purgeMode',
    'fullPurgeEnabled',
    'confirmPagePurge',
    'confirmFullPurge',
    'edgeKey',
    'purgeKey',
    'countries',
    'addCountry',
    'clearSecrets',
    'applyImport',
    'cancelImport',
    'importDialog',
    'importStatus',
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [id, new Element(id === 'environment' ? 'select' : 'div')]),
  );
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
  };
  const bundled = defaults(),
    saved = structuredClone(savedConfig);
  if (saved.environments[0]) {
    saved.environments[0].edgeKey = 'existing-edge';
    saved.environments[0].purgeKey = 'existing-purge';
  }
  const local = { config: saved },
    events = [];
  const state = {
    granted: true,
    response: { ok: true },
    cleanupError: null,
    confirmRemove: true,
  };
  globalThis.confirm = () => state.confirmRemove;
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: local[key] }),
        set: async (data) => {
          events.push('save');
          Object.assign(local, structuredClone(data));
        },
        remove: async (key) => {
          events.push('remove');
          delete local[key];
        },
        setAccessLevel: async () => {},
      },
      session: { get: async () => ({}), setAccessLevel: async () => {} },
      onChanged: { addListener: () => {} },
    },
    permissions: {
      request: async () => {
        events.push('permission');
        return state.granted;
      },
    },
    runtime: {
      getURL: (path) => 'chrome-extension://test/' + path,
      sendMessage: async () => {
        events.push('cleanup');
        if (state.cleanupError) throw state.cleanupError;
        return state.response;
      },
    },
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => bundled });
  await import('../options.js?test=' + instance++);
  const imported = defaults();
  imported.environments[0] = {
    ...imported.environments[0],
    publishUrl: 'https://publish.example.invalid/',
    edgeKey: 'imported-edge',
    purgeKey: 'imported-purge',
    countries: [
      {
        code: 'US',
        publicBaseUrl: 'https://us.example.invalid/',
        publishPathPrefix: '/',
      },
    ],
  };
  async function choose(data = imported) {
    elements.importFile.files = [
      {
        size: 100,
        text: async () =>
          typeof data === 'string' ? data : JSON.stringify(data),
      },
    ];
    elements.importFile.value = 'selected.json';
    await elements.importFile.listeners.change();
  }
  return { elements, local, saved, imported, state, events, choose };
}
test('Import confirms, clears headers, saves keys and persists when Settings reopens', async () => {
  const h = await setup();
  Object.assign(h.imported.environments[0], {
    cacheParam: 'cache-key',
    fullPurgeEnabled: false,
    confirmPagePurge: true,
    confirmFullPurge: false,
  });
  h.imported.environments[4].fullPurgeEnabled = true;
  await h.choose();
  assert.equal(h.elements.importDialog.open, true);
  assert.equal(h.elements.importFile.value, '');
  assert.deepEqual(h.local.config, h.saved);
  await h.elements.applyImport.click();
  assert.deepEqual(h.events, ['permission', 'cleanup', 'save']);
  assert.deepEqual(h.local.config, h.imported);
  assert.equal(h.elements.importDialog.open, false);
  assert.equal(h.elements.edgeKey.value, 'imported-edge');
  assert.equal(h.elements.cacheParam.value, 'cache-key');
  assert.equal(h.elements.fullPurgeEnabled.checked, false);
  assert.equal(h.elements.confirmPagePurge.checked, true);
  assert.equal(
    (await loadConfig()).environments[0].publishUrl,
    h.imported.environments[0].publishUrl,
  );
  assert.equal((await loadSecrets()).DEV.purgeKey, 'imported-purge');
});
test('Import cleanup errors stay visible in the dialog and leave saved configuration intact', async () => {
  const h = await setup();
  await h.choose();
  h.state.response = { ok: false, text: 'Header cleanup failed.' };
  await h.elements.applyImport.click();
  assert.equal(h.elements.importDialog.open, true);
  assert.equal(h.elements.importStatus.textContent, 'Header cleanup failed.');
  assert.deepEqual(h.local.config, h.saved);
  assert.equal(h.elements.applyImport.disabled, false);
  h.state.response = { ok: true };
  await h.elements.applyImport.click();
  assert.deepEqual(h.local.config, h.imported);
});
test('Import distinguishes a missing background response from a cleanup failure', async () => {
  const h = await setup();
  await h.choose();
  h.state.response = undefined;
  await h.elements.applyImport.click();
  assert.match(
    h.elements.importStatus.textContent,
    /background.*respond|respond.*background/i,
  );
  assert.deepEqual(h.local.config, h.saved);
});
test('Permission denial aborts import before cleanup or saving', async () => {
  const h = await setup();
  await h.choose();
  h.state.granted = false;
  await h.elements.applyImport.click();
  assert.deepEqual(h.events, ['permission']);
  assert.deepEqual(h.local.config, h.saved);
  assert.match(
    h.elements.importStatus.textContent,
    /Domain access was not granted/,
  );
});
test('Invalid JSON resets the file input and never opens the confirmation dialog', async () => {
  const h = await setup();
  await h.choose('{invalid');
  assert.equal(h.elements.importDialog.open, false);
  assert.equal(h.elements.status.dataset.error, true);
  assert.equal(h.elements.importFile.value, '');
  assert.deepEqual(h.events, []);
  await h.choose();
  assert.equal(h.elements.importDialog.open, true);
});
test('Cancel and Escape discard a pending import so it cannot be applied later', async () => {
  const h = await setup();
  await h.choose();
  await h.elements.cancelImport.click();
  await h.elements.applyImport.click();
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.local.config, h.saved);
  await h.choose();
  h.elements.importDialog.close();
  await h.elements.applyImport.click();
  assert.deepEqual(h.events, []);
});
test('Import blocks cancellation and duplicate submissions while cleanup runs', async () => {
  const h = await setup();
  await h.choose();
  let release;
  chrome.runtime.sendMessage = () =>
    new Promise((resolve) => (release = resolve));
  const first = h.elements.applyImport.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.elements.cancelImport.disabled, true);
  let prevented = false;
  h.elements.importDialog.listeners.cancel({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  const second = h.elements.applyImport.click();
  release({ ok: true });
  await first;
  await second;
  assert.equal(h.events.filter((e) => e === 'save').length, 1);
  assert.equal(h.elements.cancelImport.disabled, false);
});
test('Bundled configuration uses cleanup and removes the saved override', async () => {
  const h = await setup();
  await h.elements.bundled.click();
  assert.equal(h.local.config, undefined);
  assert.deepEqual(h.events, ['cleanup', 'remove']);
  assert.equal(h.elements.edgeKey.value, '');
});
test('Settings saves independent purge availability and confirmation choices for each environment', async () => {
  const h = await setup();
  assert.equal(h.elements.fullPurgeEnabled.checked, true);
  assert.equal(h.elements.confirmPagePurge.checked, false);
  h.elements.fullPurgeEnabled.checked = false;
  h.elements.confirmPagePurge.checked = true;
  h.elements.confirmFullPurge.checked = false;
  await h.elements.save.click();
  assert.equal(h.local.config.environments[0].fullPurgeEnabled, false);
  assert.equal(h.local.config.environments[0].confirmPagePurge, true);
  assert.equal(h.local.config.environments[0].confirmFullPurge, false);
  h.elements.environment.value = 'PROD';
  h.elements.environment.listeners.change();
  assert.equal(h.elements.fullPurgeEnabled.checked, false);
  assert.equal(h.elements.confirmPagePurge.checked, false);
  h.elements.fullPurgeEnabled.checked = true;
  h.elements.confirmFullPurge.checked = true;
  await h.elements.save.click();
  assert.equal(h.local.config.environments[4].fullPurgeEnabled, true);
  assert.equal(h.local.config.environments[4].confirmFullPurge, true);
  h.elements.environment.value = 'DEV';
  h.elements.environment.listeners.change();
  assert.equal(h.elements.fullPurgeEnabled.checked, false);
  assert.equal(h.elements.confirmPagePurge.checked, true);
  assert.equal(h.elements.confirmFullPurge.checked, false);
});

test('Settings adds and renames custom environments with safe new-environment defaults', async () => {
  const h = await setup();
  await h.elements.addEnvironment.click();
  assert.equal(h.elements.environmentDialog.open, true);
  h.elements.newEnvironmentName.value = 'QA EU';
  await h.elements.createEnvironment.click();
  assert.equal(h.local.config.environments.length, 6);
  assert.equal(h.elements.environment.value, 'QA EU');
  assert.equal(h.elements.environmentName.value, 'QA EU');
  const env = h.local.config.environments.at(-1);
  assert.equal(env.fullPurgeEnabled, false);
  assert.equal(env.confirmPagePurge, false);
  assert.equal(env.confirmFullPurge, false);
  h.elements.environmentName.value = 'QA EU WEST';
  await h.elements.save.click();
  assert.equal(h.local.config.environments.at(-1).name, 'QA EU WEST');
  assert.equal(h.elements.environment.value, 'QA EU WEST');
  assert.deepEqual(h.events, ['save', 'cleanup', 'save']);
  assert.equal(h.local.config.environments[0].edgeKey, 'existing-edge');
});
test('Adding a duplicate environment reports an error without changing saved configuration', async () => {
  const h = await setup();
  await h.elements.addEnvironment.click();
  h.elements.newEnvironmentName.value = 'dev';
  await h.elements.createEnvironment.click();
  assert.match(
    h.elements.environmentStatus.textContent,
    /duplicate environment/i,
  );
  assert.deepEqual(h.local.config, h.saved);
  assert.deepEqual(h.events, []);
});
test('Removing the last environment persists an empty configuration and still allows adding environments', async () => {
  const h = await setup({
    savedConfig: { version: 2, environments: [defaults().environments[0]] },
  });
  await h.elements.removeEnvironment.click();
  assert.deepEqual(h.local.config.environments, []);
  assert.equal(h.elements.environmentFields.disabled, true);
  assert.equal(h.elements.save.disabled, true);
  assert.equal(h.elements.addEnvironment.disabled, false);
  assert.deepEqual(h.events, ['cleanup', 'save']);
  await h.elements.addEnvironment.click();
  h.elements.newEnvironmentName.value = 'LOCAL';
  await h.elements.createEnvironment.click();
  assert.equal(h.local.config.environments[0].name, 'LOCAL');
  assert.equal(h.elements.environmentFields.disabled, false);
});
test('Cancelling environment removal preserves mappings and credentials', async () => {
  const h = await setup();
  h.state.confirmRemove = false;
  await h.elements.removeEnvironment.click();
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.local.config, h.saved);
});

test('Clearing keys blocks overlapping environment mutations until credentials are saved empty', async () => {
  const h = await setup();
  let release;
  chrome.runtime.sendMessage = () => {
    h.events.push('cleanup');
    return new Promise((resolve) => (release = resolve));
  };
  const clearing = h.elements.clearSecrets.click();
  assert.equal(h.elements.save.disabled, true);
  assert.equal(h.elements.removeEnvironment.disabled, true);
  assert.equal(h.elements.addEnvironment.disabled, true);
  const renaming = h.elements.save.click(),
    removing = h.elements.removeEnvironment.click();
  assert.deepEqual(h.events, ['cleanup']);
  release({ ok: true });
  await clearing;
  await renaming;
  await removing;
  assert.ok(
    h.local.config.environments.every(
      (env) => env.edgeKey === '' && env.purgeKey === '',
    ),
  );
  assert.equal(h.elements.save.disabled, false);
  assert.equal(h.elements.removeEnvironment.disabled, false);
});
