import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';
import { loadConfig, loadSecrets } from '../storage.js';
let saved,
  session = {};
const bundled = defaults();
bundled.environments[0].edgeKey = 'file-edge';
bundled.environments[0].purgeKey = 'file-purge';
globalThis.chrome = {
  runtime: { getURL: (path) => 'chrome-extension://test/' + path },
  storage: {
    local: { get: async () => ({ config: saved }) },
    session: { get: async () => ({ secrets: session }) },
  },
};
globalThis.fetch = async (url) => {
  assert.equal(url, 'chrome-extension://test/config.json');
  return { ok: true, json: async () => bundled };
};
test('Bundled configuration automatically supplies both environment keys with an empty session', async () => {
  assert.equal((await loadConfig()).environments[0].edgeKey, 'file-edge');
  assert.deepEqual((await loadSecrets()).DEV, {
    edgeKey: 'file-edge',
    purgeKey: 'file-purge',
  });
});
test('Imported persistent environment configuration survives session reset and overrides bundled keys', async () => {
  saved = defaults();
  saved.environments[0].edgeKey = 'saved-edge';
  saved.environments[0].purgeKey = 'saved-purge';
  session = {};
  assert.deepEqual((await loadSecrets()).DEV, {
    edgeKey: 'saved-edge',
    purgeKey: 'saved-purge',
  });
  session = { DEV: { edgeKey: 'old-session', purgeKey: 'old-session' } };
  assert.deepEqual((await loadSecrets()).DEV, {
    edgeKey: 'saved-edge',
    purgeKey: 'saved-purge',
  });
});
test('Removing the saved configuration reactivates the bundled file keys', async () => {
  saved = undefined;
  session = {};
  assert.deepEqual((await loadSecrets()).DEV, {
    edgeKey: 'file-edge',
    purgeKey: 'file-purge',
  });
});
