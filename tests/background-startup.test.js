import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';

test('Background registers navigation listeners while storage initialization is still pending', async () => {
  let release;
  const ready = new Promise((resolve) => (release = resolve)),
    listeners = {};
  const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  const storage = {
    setAccessLevel: () => ready,
    get: async () => ({ config: defaults() }),
  };
  globalThis.chrome = {
    storage: { local: storage, session: storage, onChanged: event('storage') },
    permissions: { onAdded: event('added'), onRemoved: event('removed') },
    tabs: {
      query: async () => [],
      onUpdated: event('updated'),
      onActivated: event('activated'),
      onRemoved: event('tabRemoved'),
    },
    action: { enable: async () => {} },
    runtime: {
      id: 'test',
      getURL: (path) => 'chrome-extension://test/' + path,
      onMessage: event('message'),
      onInstalled: event('installed'),
    },
  };
  await import('../background.js');
  try {
    for (const name of ['updated', 'activated', 'added', 'removed', 'storage'])
      assert.equal(
        typeof listeners[name],
        'function',
        name + ' must register synchronously',
      );
  } finally {
    release();
  }
});
