import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironment,
  validateConfig,
  resolvePage,
  purgeRequest,
} from '../core.js';
import { loadSecrets } from '../storage.js';

const pageURL = 'https://public.example.invalid/page?token=private#fragment';
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
async function setup() {
  const config = validateConfig({
    version: 2,
    environments: [
      {
        ...createEnvironment('DEV'),
        publishUrl: 'https://old.example.invalid/',
        edgeKey: 'OLD_EDGE',
        purgeKey: 'OLD_PURGE',
        countries: [
          {
            code: 'US',
            publicBaseUrl: 'https://public.example.invalid/',
            publishPathPrefix: '/',
          },
        ],
      },
    ],
  });
  const local = { config },
    session = {},
    rules = new Map(),
    calls = [],
    hooks = {};
  let listener;
  const event = { addListener: () => {} };
  function store(data, area) {
    return {
      setAccessLevel: async () => {},
      get: async (key) => {
        const value = structuredClone({ [key]: data[key] });
        await hooks[area + 'Get']?.(key);
        return value;
      },
      set: async (value) => {
        await hooks[area + 'Set']?.(value);
        Object.assign(data, structuredClone(value));
      },
      remove: async (keys) => {
        for (const key of keys) delete data[key];
      },
    };
  }
  globalThis.chrome = {
    storage: {
      local: store(local, 'local'),
      session: store(session, 'session'),
      onChanged: event,
    },
    action: {
      enable: async () => {},
      setIcon: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
    },
    tabs: {
      get: async () => ({ id: 1, windowId: 2, url: pageURL }),
      query: async () => [],
      create: async () => {
        calls.push({ type: 'tab' });
        return { id: 22 };
      },
      update: async () => {},
      remove: async () => {},
      onUpdated: event,
      onActivated: event,
      onRemoved: event,
    },
    permissions: {
      contains: async () => {
        await hooks.permission?.();
        return true;
      },
      onAdded: event,
      onRemoved: event,
    },
    declarativeNetRequest: {
      getSessionRules: async () => [...rules.values()],
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => {
        removeRuleIds.forEach((id) => rules.delete(id));
        addRules.forEach((rule) => rules.set(rule.id, rule));
      },
    },
    runtime: {
      id: 'race-test',
      getURL: (path) => 'chrome-extension://race-test/' + path,
      onMessage: { addListener: (fn) => (listener = fn) },
      onInstalled: event,
    },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ type: 'fetch', url, options });
    await hooks.fetch?.();
    return { status: 200, headers: { get: () => '' } };
  };
  await import('../background.js?race=' + crypto.randomUUID());
  function send(action, fields = {}, sender = 'options.html') {
    let descriptor = {};
    if (['publish', 'purge', 'purgeAll'].includes(action)) {
      const env = validateConfig(local.config).environments[0];
      const page = resolvePage(env, pageURL, 'US');
      const request =
        action === 'publish'
          ? { url: page.publishUrl.href, mode: env.publishOpenMode }
          : purgeRequest(env, page, action === 'purgeAll' ? 'all' : 'page');
      descriptor = {
        expectedTarget: request.url,
        expectedMode: request.mode,
        expectedForwardedHost: page.forwardedHost,
      };
    }
    return new Promise((resolve) => {
      const accepted = listener(
        {
          action,
          environment: 'DEV',
          country: 'US',
          tabId: 1,
          expectedURL: pageURL,
          ...descriptor,
          ...fields,
        },
        {
          id: 'race-test',
          url: 'chrome-extension://race-test/' + sender,
          tab: { id: 99 },
        },
        resolve,
      );
      if (!accepted) resolve({ rejected: true });
    });
  }
  return { local, session, rules, calls, hooks, send, config };
}

test('Secrets use the supplied config snapshot even after stored configuration changes', async () => {
  const state = await setup();
  const snapshot = structuredClone(state.config);
  state.local.config.environments[0].edgeKey = 'NEW_EDGE';
  assert.equal((await loadSecrets(snapshot)).DEV.edgeKey, 'OLD_EDGE');
});

test('A save during permission checking invalidates purge before credentials reach the network', async () => {
  const state = await setup();
  const next = structuredClone(state.config);
  next.environments[0].publishUrl = 'https://new.example.invalid/';
  next.environments[0].edgeKey = 'NEW_EDGE';
  next.environments[0].purgeKey = 'NEW_PURGE';
  state.hooks.permission = async () => {
    assert.equal(
      (
        await state.send('saveConfiguration', {
          expectedConfig: state.config,
          config: next,
        })
      ).ok,
      true,
    );
  };
  assert.equal((await state.send('purge')).ok, false);
  assert.equal(state.calls.filter((call) => call.type === 'fetch').length, 0);
});

test('Clear invalidates a publish suspended while reading credentials', async () => {
  const state = await setup();
  const entered = deferred(),
    resume = deferred();
  state.hooks.sessionGet = async (key) => {
    if (key === 'secrets') {
      entered.resolve();
      await resume.promise;
    }
  };
  const publish = state.send('publish');
  await entered.promise;
  assert.equal((await state.send('clearCredentials')).ok, true);
  resume.resolve();
  assert.equal((await publish).ok, false);
  assert.equal(state.rules.size, 0);
  assert.equal(state.calls.length, 0);
});

test('Publish started during a pending config commit cannot reinstall cleared keys', async () => {
  const state = await setup();
  const writing = deferred(),
    commit = deferred(),
    readSecrets = deferred();
  state.hooks.localSet = async (value) => {
    if (value.config) {
      writing.resolve();
      await commit.promise;
    }
  };
  state.hooks.sessionGet = async (key) => {
    if (key === 'secrets') readSecrets.resolve();
  };
  const next = structuredClone(state.config);
  next.environments[0].edgeKey = '';
  next.environments[0].purgeKey = '';
  const saving = state.send('saveConfiguration', {
    expectedConfig: state.config,
    config: next,
    clearCredentials: true,
  });
  await writing.promise;
  const publish = state.send('publish');
  await readSecrets.promise;
  commit.resolve();
  assert.equal((await saving).ok, true);
  assert.equal((await publish).ok, false);
  assert.equal(state.rules.size, 0);
});

test('Concurrent saves reject the stale revision without overwriting the first save', async () => {
  const state = await setup();
  const first = structuredClone(state.config),
    second = structuredClone(state.config);
  first.environments[0].cacheParam = 'first';
  second.environments[0].cacheParam = 'second';
  const results = await Promise.all([
    state.send('saveConfiguration', {
      expectedConfig: state.config,
      config: first,
    }),
    state.send('saveConfiguration', {
      expectedConfig: state.config,
      config: second,
    }),
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].text, /another Settings tab/);
  assert.equal(state.local.config.environments[0].cacheParam, 'first');
});

test('Only the exact trusted Settings URL can save configuration', async () => {
  const state = await setup();
  const fields = { expectedConfig: state.config, config: state.config };
  for (const sender of ['popup.html', 'options.html?forged=1', 'other.html']) {
    assert.deepEqual(await state.send('saveConfiguration', fields, sender), {
      rejected: true,
    });
  }
  assert.equal(
    (await state.send('saveConfiguration', fields, 'options.html#credentials'))
      .ok,
    true,
  );
});

test('Purge sends the full query but persists only origin and path', async () => {
  const state = await setup();
  assert.equal((await state.send('purge')).ok, true);
  assert.equal(
    state.calls.find((call) => call.type === 'fetch').url,
    'https://old.example.invalid/page?token=private',
  );
  assert.equal(
    state.local.purgeHistory[0].target,
    'https://old.example.invalid/page',
  );
});

test('Saving changed credential identity removes active rules and publish contexts', async () => {
  const state = await setup();
  assert.equal((await state.send('publish')).ok, true);
  assert.equal(state.rules.size, 1);
  assert.ok(state.session.publishTabs[22]);
  const next = structuredClone(state.config);
  next.environments[0].edgeKey = 'ROTATED_EDGE';
  assert.equal(
    (
      await state.send('saveConfiguration', {
        expectedConfig: state.config,
        config: next,
      })
    ).ok,
    true,
  );
  assert.equal(state.rules.size, 0);
  assert.equal(state.session.publishTabs, undefined);
});

test('Stale popup descriptors reject changed hosts, paths and modes before sending', async () => {
  for (const change of ['host', 'path', 'mode']) {
    const state = await setup();
    const env = state.local.config.environments[0];
    const old = purgeRequest(env, resolvePage(env, pageURL, 'US'), 'page');
    if (change === 'host') env.publishUrl = 'https://new.example.invalid/';
    if (change === 'path') env.countries[0].publishPathPrefix = '/changed';
    if (change === 'mode') env.purgeMode = 'hard';
    const response = await state.send('purge', {
      expectedTarget: old.url,
      expectedMode: old.mode,
      expectedForwardedHost: 'public.example.invalid',
    });
    assert.equal(response.ok, false);
    assert.match(response.text, /Action settings changed/);
    assert.equal(state.calls.length, 0);
  }
});
test('Missing publish descriptor is rejected rather than using an unreviewed destination', async () => {
  const state = await setup();
  assert.equal(
    (await state.send('publish', { expectedTarget: undefined })).ok,
    false,
  );
  assert.equal(state.calls.length, 0);
});
test('Activity clear suppresses old in-flight completions and keeps later requests', async () => {
  const state = await setup();
  const entered = deferred(),
    resume = deferred();
  state.hooks.fetch = async () => {
    entered.resolve();
    await resume.promise;
  };
  const pending = state.send('purge');
  await entered.promise;
  assert.equal(state.local.purgeHistory.length, 1);
  assert.equal((await state.send('clearHistory')).ok, true);
  assert.equal(state.local.purgeHistory, undefined);
  resume.resolve();
  assert.equal((await pending).ok, true);
  assert.equal(state.local.purgeHistory, undefined);
  state.hooks.fetch = undefined;
  assert.equal((await state.send('purge')).ok, true);
  assert.equal(state.local.purgeHistory.length, 1);
  assert.equal(
    (await state.send('clearHistory', {}, 'popup.html')).rejected,
    true,
  );
});

test('Reset recovers an invalid persisted configuration through a trusted Settings action', async () => {
  const state = await setup();
  state.local.config = { version: 999, environments: 'invalid' };
  const response = await state.send('saveConfiguration', {
    expectedConfig: null,
    config: { version: 2, environments: [] },
    clearCredentials: true,
  });
  assert.equal(response.ok, true);
  assert.deepEqual(state.local.config, { version: 2, environments: [] });
});
