import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';
import { configuredSite, startActivation } from '../activation.js';
const config = defaults();
config.environments[0] = {
  ...config.environments[0],
  publishUrl: 'https://publish.example.invalid/',
  countries: [
    {
      code: 'US',
      publicBaseUrl: 'https://us.example.invalid/site',
      publishPathPrefix: '/',
    },
  ],
};
test('Indicator matches any path on exact configured HTTPS origins', () => {
  for (const path of ['/site/ports', '/site-other', '/', '/outside'])
    assert.deepEqual(
      configuredSite(config, 'https://us.example.invalid' + path),
      { environment: 'DEV', country: 'US' },
    );
  assert.deepEqual(
    configuredSite(config, 'https://publish.example.invalid/ports'),
    { environment: 'DEV', publish: true },
  );
  for (const url of [
    'https://us.example.invalid.evil.invalid/site',
    'https://other.example.invalid/',
    'https://us.example.invalid:8443/site',
    'http://us.example.invalid/site',
    'chrome://extensions',
    'https://user:password@us.example.invalid/',
    undefined,
  ])
    assert.equal(configuredSite(config, url), null);
});
function setup() {
  const state = {},
    callbacks = {};
  const source = {
    config: structuredClone(config),
    tabs: [
      { id: 1, url: 'https://us.example.invalid/outside' },
      { id: 2, url: 'https://other.example.invalid/' },
    ],
    closed: new Set(),
  };
  const event = (name) => ({ addListener: (fn) => (callbacks[name] = fn) });
  const set = (id, field, value) => {
    if (source.closed.has(id)) throw new Error('Tab closed');
    (state[id] ||= {})[field] = value;
  };
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ config: source.config }) },
      onChanged: event('storage'),
    },
    tabs: {
      query: async () => source.tabs,
      get: async (id) => {
        if (source.closed.has(id)) throw new Error('Tab closed');
        return source.tabs.find((t) => t.id === id);
      },
      onUpdated: event('updated'),
      onActivated: event('activated'),
    },
    permissions: { onAdded: event('added'), onRemoved: event('removed') },
    action: {
      enable: async (id) => set(id, 'enabled', true),
      disable: async (id) => set(id, 'enabled', false),
      setIcon: async ({ tabId, path }) => set(tabId, 'icon', path),
      setBadgeText: async ({ tabId, text }) => set(tabId, 'badge', text),
      setTitle: async ({ tabId, title }) => set(tabId, 'title', title),
      setBadgeBackgroundColor: async () => {},
    },
  };
  return { state, callbacks, source };
}
test('Toolbar stays clickable everywhere and updates green icons on navigation and tab switches', async () => {
  const { state, callbacks, source } = setup();
  const refresh = startActivation();
  await refresh();
  assert.equal(state[1].enabled, true);
  assert.match(state[1].icon[16], /green/);
  assert.equal(state[1].badge, '');
  assert.match(state[1].title, /DEV/);
  assert.equal(state[2].enabled, true);
  assert.match(state[2].icon[16], /neutral/);
  source.tabs[0].url = 'https://other.example.invalid/';
  await callbacks.updated(1);
  assert.match(state[1].icon[16], /neutral/);
  source.tabs[1].url = 'https://publish.example.invalid/';
  await callbacks.activated({ tabId: 2 });
  assert.match(state[2].icon[16], /green/);
});
test('Removing configuration or URL access clears a previously green icon', async () => {
  const { state, callbacks, source } = setup();
  await startActivation()();
  source.tabs[0] = { id: 1 };
  await callbacks.removed();
  assert.match(state[1].icon[16], /neutral/);
  source.tabs[0].url = 'https://us.example.invalid/site';
  await callbacks.added();
  assert.match(state[1].icon[16], /green/);
  source.config = defaults();
  await callbacks.storage({ config: {} }, 'local');
  assert.match(state[1].icon[16], /neutral/);
});
test('Invalid configuration resets icons and a closed tab cannot prevent other tab updates', async () => {
  const { state, source } = setup();
  const refresh = startActivation();
  await refresh();
  source.config = { version: 99 };
  await refresh();
  assert.match(state[1].icon[16], /neutral/);
  assert.match(state[1].title, /configuration/i);
  source.config = config;
  source.closed.add(1);
  source.tabs[1].url = 'https://publish.example.invalid/';
  await refresh();
  assert.match(state[2].icon[16], /green/);
  await refresh(1);
  await refresh(2);
  assert.match(state[2].icon[16], /green/);
});
test('Tooltip lists all environments sharing a configured public origin', async () => {
  const { state, source } = setup();
  source.config.environments[1] = {
    ...source.config.environments[1],
    publishUrl: 'https://publish-dev2.example.invalid/',
    countries: [
      {
        code: 'US',
        publicBaseUrl: 'https://us.example.invalid/another',
        publishPathPrefix: '/',
      },
    ],
  };
  await startActivation()();
  assert.match(state[1].title, /DEV.*DEV2/);
});
test('Activation listeners register before asynchronous storage readiness', async () => {
  const { callbacks } = setup();
  let release;
  const ready = new Promise((resolve) => (release = resolve));
  const refresh = startActivation(ready);
  for (const event of ['updated', 'activated', 'added', 'removed', 'storage'])
    assert.equal(typeof callbacks[event], 'function');
  release();
  await refresh();
});
