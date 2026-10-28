import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validateConfig } from '../core.js';
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
    'previewUrl',
    'previewEdgeKey',
    'previewPurgeKey',
    'previewUsePublishKeys',
    'cdnMode',
    'program',
    'addProgram',
    'renameProgram',
    'duplicateProgram',
    'removeProgram',
    'environment',
    'environmentName',
    'environmentFields',
    'emptyEnvironments',
    'addEnvironment',
    'removeEnvironment',
    'moveEnvironmentUp',
    'moveEnvironmentDown',
    'environmentDialog',
    'newEnvironmentName',
    'createEnvironment',
    'cancelEnvironment',
    'environmentStatus',
    'save',
    'discardChanges',
    'exportKeys',
    'export',
    'import',
    'resetConfiguration',
    'importFile',
    'status',
    'publishUrl',
    'publishOpenMode',
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
    ids.map((id) => [
      id,
      new Element(['program', 'environment'].includes(id) ? 'select' : 'div'),
    ]),
  );
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
  };
  const bundled = defaults(),
    saved = structuredClone(savedConfig);
  if (saved.environments?.[0]) {
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
      sendMessage: async (message) => {
        assert.equal(message.action, 'saveConfiguration');
        if (
          message.clearCredentials ||
          (message.config.environments?.length ===
            local.config.environments?.length &&
            message.config.environments &&
            message.config.environments.some(
              (env) =>
                !local.config.environments.some((old) => old.name === env.name),
            ))
        )
          events.push('cleanup');
        if (state.cleanupError) throw state.cleanupError;
        if (!state.response?.ok) return state.response;
        if (
          JSON.stringify(message.expectedConfig) !==
          JSON.stringify(validateConfig(local.config))
        )
          return {
            ok: false,
            text: 'Configuration changed in another Settings tab. Reload Settings before saving.',
          };
        try {
          await chrome.storage.local.set({ config: message.config });
        } catch (error) {
          return { ok: false, text: error.message };
        }
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
  const writer = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (message) =>
    new Promise(
      (resolve) => (release = async () => resolve(await writer(message))),
    );
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
test('Reset saves an empty configuration across restarts and preserves activity', async () => {
  const h = await setup();
  h.local.purgeHistory = [{ status: 'success' }];
  await h.elements.resetConfiguration.click();
  assert.deepEqual(h.local.config, { version: 2, environments: [] });
  assert.deepEqual(h.events, ['cleanup', 'save']);
  assert.equal(h.elements.edgeKey.value, '');
  assert.equal(h.elements.environment.children.length, 0);
  assert.deepEqual((await loadConfig()).environments, []);
  assert.deepEqual(await loadSecrets(), {});
  assert.deepEqual(h.local.purgeHistory, [{ status: 'success' }]);
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
  const writer = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (message) => {
    return new Promise(
      (resolve) => (release = async () => resolve(await writer(message))),
    );
  };
  const clearing = h.elements.clearSecrets.click();
  assert.equal(h.elements.save.disabled, true);
  assert.equal(h.elements.removeEnvironment.disabled, true);
  assert.equal(h.elements.addEnvironment.disabled, true);
  const renaming = h.elements.save.click(),
    removing = h.elements.removeEnvironment.click();
  assert.deepEqual(h.events, []);
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

test('Environment order persists while selection, keys and unsaved edits remain intact', async () => {
  const h = await setup();
  assert.equal(h.elements.moveEnvironmentUp.disabled, true);
  h.elements.environment.value = 'PROD';
  h.elements.environment.listeners.change();
  assert.equal(h.elements.moveEnvironmentDown.disabled, true);
  h.elements.environmentName.value = 'Unsaved name';
  await h.elements.moveEnvironmentUp.click();
  assert.deepEqual(
    h.local.config.environments.map((env) => env.name),
    ['DEV', 'DEV2', 'TEST', 'PROD', 'STAGE'],
  );
  assert.equal(h.elements.environment.value, 'PROD');
  assert.equal(h.elements.environmentName.value, 'Unsaved name');
  assert.equal(h.local.config.environments[0].edgeKey, 'existing-edge');
  assert.equal(h.events.includes('cleanup'), false);
  await h.elements.moveEnvironmentDown.click();
  assert.equal(h.local.config.environments.at(-1).name, 'PROD');
  const saves = h.events.length;
  await h.elements.moveEnvironmentDown.click();
  assert.equal(h.events.length, saves);
  const reloaded = await setup({ savedConfig: h.local.config });
  assert.deepEqual(
    reloaded.elements.environment.children.map((option) => option.value),
    h.local.config.environments.map((env) => env.name),
  );
});

test('Empty environment list disables both reorder actions', async () => {
  const h = await setup({ savedConfig: { version: 2, environments: [] } });
  assert.equal(h.elements.moveEnvironmentUp.disabled, true);
  assert.equal(h.elements.moveEnvironmentDown.disabled, true);
});

test('Reordering locks overlapping actions and preserves order when saving fails', async () => {
  const h = await setup();
  const original = structuredClone(h.local.config);
  let rejectSave;
  chrome.storage.local.set = () =>
    new Promise((resolve, reject) => {
      rejectSave = reject;
    });
  const moving = h.elements.moveEnvironmentDown.click();
  assert.equal(h.elements.moveEnvironmentDown.disabled, true);
  assert.equal(h.elements.addEnvironment.disabled, true);
  await h.elements.moveEnvironmentDown.click();
  await h.elements.removeEnvironment.click();
  rejectSave(new Error('Storage unavailable'));
  await moving;
  assert.deepEqual(h.local.config, original);
  assert.deepEqual(
    h.elements.environment.children.map((option) => option.value),
    original.environments.map((env) => env.name),
  );
  assert.equal(h.elements.environment.value, 'DEV');
  assert.equal(h.elements.status.textContent, 'Storage unavailable');
  assert.equal(h.elements.moveEnvironmentDown.disabled, false);
  assert.equal(h.elements.moveEnvironmentUp.disabled, true);
});

test('Reset cancellation and cleanup failure preserve saved configuration', async () => {
  const h = await setup();
  const original = structuredClone(h.local.config);
  h.state.confirmRemove = false;
  await h.elements.resetConfiguration.click();
  assert.deepEqual(h.events, []);
  h.state.confirmRemove = true;
  h.state.response = { ok: false, text: 'Cleanup failed' };
  await h.elements.resetConfiguration.click();
  assert.deepEqual(h.local.config, original);
  assert.equal(h.elements.status.textContent, 'Cleanup failed');
  assert.equal(h.elements.resetConfiguration.disabled, false);
});

test('Settings defaults publish to a new tab and saves the window preference', async () => {
  const h = await setup();
  assert.equal(h.elements.publishOpenMode.value, 'tab');
  h.elements.publishOpenMode.value = 'window';
  await h.elements.save.click();
  assert.equal(h.local.config.environments[0].publishOpenMode, 'window');
  const reopened = await setup({ savedConfig: h.local.config });
  assert.equal(reopened.elements.publishOpenMode.value, 'window');
});

test('Unsaved changes survive a cancelled environment switch and can be discarded explicitly', async () => {
  const h = await setup();
  h.elements.environmentName.value = 'Unsaved name';
  h.elements.environmentFields.listeners.input();
  assert.match(h.elements.status.textContent, /Unsaved/);
  h.state.confirmRemove = false;
  h.elements.environment.value = 'PROD';
  h.elements.environment.listeners.change();
  assert.equal(h.elements.environment.value, 'DEV');
  assert.equal(h.elements.environmentName.value, 'Unsaved name');
  await h.elements.discardChanges.click();
  assert.equal(h.elements.environmentName.value, 'DEV');
  assert.equal(h.elements.discardChanges.disabled, true);
});
test('Stale Settings save reports a conflict without restoring newer keys', async () => {
  const h = await setup();
  h.local.config.environments[0].edgeKey = 'newer-key';
  await h.elements.save.click();
  assert.equal(h.local.config.environments[0].edgeKey, 'newer-key');
  assert.match(h.elements.status.textContent, /another Settings tab/);
});

test('Clearing keys warns before discarding unrelated draft edits', async () => {
  const h = await setup();
  h.elements.environmentName.value = 'Draft';
  h.elements.environmentFields.listeners.input();
  h.state.confirmRemove = false;
  await h.elements.clearSecrets.click();
  assert.equal(h.elements.environmentName.value, 'Draft');
  assert.equal(h.local.config.environments[0].edgeKey, 'existing-edge');
  assert.deepEqual(h.events, []);
});

test('Duplicate program preserves all settings but excludes keys', async () => {
  const { elements, local } = await setup();
  globalThis.prompt = () => 'Second';
  await elements.duplicateProgram.listeners.click();
  assert.equal(local.config.version, 3);
  assert.equal(local.config.programs.length, 2);
  assert.equal(
    local.config.programs[0].environments[0].edgeKey,
    'existing-edge',
  );
  const duplicate = local.config.programs[1];
  assert.equal(duplicate.name, 'Second');
  assert.equal(duplicate.environments[0].edgeKey, '');
  assert.equal(duplicate.environments[0].purgeKey, '');
  assert.equal(
    duplicate.environments.length,
    local.config.programs[0].environments.length,
  );
  assert.equal(elements.program.value, duplicate.id);
  elements.program.value = 'default';
  await elements.program.listeners.change();
  assert.equal(elements.edgeKey.value, 'existing-edge');
});

test('Settings saves Standard mode without publish origin or edge key and retains it after reload', async () => {
  const h = await setup();
  h.elements.cdnMode.value = 'standard';
  await h.elements.cdnMode.listeners.change();
  h.elements.publishUrl.value = '';
  await h.elements.save.listeners.click();
  assert.equal(h.local.config.environments[0].cdnMode, 'standard');
  assert.equal(h.local.config.environments[0].publishUrl, '');
  assert.equal(h.local.config.environments[0].edgeKey, '');
  const reopened = await setup({ savedConfig: h.local.config });
  assert.equal(reopened.elements.cdnMode.value, 'standard');
});

test('Preview settings and mapping service survive saving and duplication excludes all keys', async () => {
  const initial = defaults();
  initial.environments[0].publishUrl = 'https://publish.example.invalid/';
  initial.environments[0].countries = [
    {
      code: 'US',
      publicBaseUrl: 'https://us.example.invalid/',
      publishPathPrefix: '/',
    },
  ];
  const h = await setup({ savedConfig: initial });
  h.elements.previewUrl.value = 'https://preview.example.invalid/';
  h.elements.previewEdgeKey.value = 'preview-edge';
  h.elements.previewPurgeKey.value = 'preview-purge';
  h.elements.countries.children[0].querySelectorAll('select')[0].value =
    'preview';
  await h.elements.save.listeners.click();
  assert.equal(
    h.local.config.environments[0].previewUrl,
    'https://preview.example.invalid/',
  );
  assert.equal(h.local.config.environments[0].countries[0].service, 'preview');
  assert.equal(h.local.config.environments[0].previewEdgeKey, 'preview-edge');
  globalThis.prompt = () => 'Preview copy';
  await h.elements.duplicateProgram.listeners.click();
  const copy = h.local.config.programs[1].environments[0];
  assert.equal(copy.previewEdgeKey, '');
  assert.equal(copy.previewPurgeKey, '');
});
