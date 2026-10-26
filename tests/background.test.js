import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  validateConfig,
  resolvePage,
  purgeRequest,
} from '../core.js';
let listener,
  removed,
  currentURL = 'https://us.example.invalid/ports?_cacheBust=123#map';
const events = [],
  rules = new Map();
let incognito = false;
let granted = true,
  fetchCount = 0,
  captured;
const config = defaults();
config.environments[0] = {
  ...config.environments[0],
  publishUrl: 'https://publish-dev.example.invalid/',
  countries: [
    {
      code: 'US',
      publicBaseUrl: 'https://us.example.invalid/',
      publishPathPrefix: '/',
    },
    {
      code: 'GB',
      publicBaseUrl: 'https://gb.example.invalid/',
      publishPathPrefix: '/',
    },
  ],
};
config.environments[4] = {
  ...config.environments[4],
  publishUrl: 'https://publish-prod.example.invalid/',
  countries: [
    {
      code: 'US',
      publicBaseUrl: 'https://prod-us.example.invalid/',
      publishPathPrefix: '/',
    },
  ],
};
const local = { config },
  session = {
    secrets: {
      DEV: { edgeKey: 'edge-key-value', purgeKey: 'purge-key-value' },
      PROD: { edgeKey: 'prod-edge', purgeKey: 'prod-purge' },
    },
  };
const activationEvent = { addListener: () => {} };
function store(data) {
  return {
    get: async (key) => (typeof key === 'string' ? { [key]: data[key] } : data),
    set: async (value) => Object.assign(data, value),
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
    setAccessLevel: async () => {},
  };
}
globalThis.chrome = {
  storage: {
    local: store(local),
    session: store(session),
    onChanged: activationEvent,
  },
  permissions: {
    contains: async () => granted,
    onAdded: activationEvent,
    onRemoved: activationEvent,
  },
  action: {
    enable: async () => {},
    setIcon: async () => {},
    setTitle: async () => {},
    setBadgeText: async () => {},
  },
  tabs: {
    create: async (details) => {
      events.push({ type: 'tab', ...details });
      return { id: 50 };
    },
    remove: async () => events.push({ type: 'closeTab' }),
    query: async () => [],
    get: async (id) => ({ id, url: currentURL, windowId: 12, incognito }),
    update: async (id, details) =>
      events.push({ type: 'navigate', id, ...details }),
    onUpdated: activationEvent,
    onActivated: activationEvent,
    onRemoved: { addListener: (fn) => (removed = fn) },
  },
  windows: {
    create: async (details) => {
      events.push({ type: 'window', ...details });
      return { id: 7, tabs: [{ id: 50 }] };
    },
    remove: async () => events.push({ type: 'close' }),
  },
  declarativeNetRequest: {
    updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => {
      removeRuleIds.forEach((id) => rules.delete(id));
      addRules.forEach((r) => rules.set(r.id, r));
      events.push({ type: 'rules' });
    },
    getSessionRules: async () => [...rules.values()],
  },
  runtime: {
    id: 'test',
    getURL: (path) => 'chrome-extension://test/' + path,
    onMessage: { addListener: (fn) => (listener = fn) },
    onInstalled: { addListener: () => {} },
  },
};
let response = {
  status: 200,
  body: { status: 'ok', id: '1000098-1722961031-13237063' },
};
globalThis.fetch = async (url, init) => {
  fetchCount++;
  captured = { url, init };
  return {
    status: response.status,
    headers: { get: () => 'application/json' },
    json: async () => response.body,
  };
};
const logs = [];
console.info = (...args) => logs.push(args);
await import('../background.js');
const send = (action, overrides = {}) => {
  const message = {
    action,
    environment: 'DEV',
    country: 'US',
    tabId: 1,
    expectedURL: currentURL,
    confirmation: action === 'purgeAll' ? 'all' : 'page',
    ...overrides,
  };
  try {
    const env = validateConfig(config).environments.find(
      (entry) => entry.name === message.environment,
    );
    const page = resolvePage(env, message.expectedURL, message.country);
    const request =
      action === 'publish'
        ? { url: page.publishUrl.href, mode: env.publishOpenMode }
        : purgeRequest(env, page, action === 'purgeAll' ? 'all' : 'page');
    Object.assign(
      message,
      {
        expectedTarget: request.url,
        expectedMode: request.mode,
        expectedForwardedHost: page.forwardedHost,
      },
      overrides,
    );
  } catch {
    // Invalid page and policy tests must reach the background validation.
  }
  return new Promise((resolve) =>
    listener(
      message,
      { id: 'test', url: 'chrome-extension://test/popup.html' },
      resolve,
    ),
  );
};
test('Publish sets edge key and source host before navigation and saves country context', async () => {
  const r = await send('publish');
  assert.equal(r.ok, true);
  assert.equal(events[0].url, 'about:blank');
  assert.equal(events[0].type, 'tab');
  assert.equal(events[1].type, 'rules');
  assert.equal(events[2].type, 'navigate');
  assert.deepEqual(rules.get(51).action.requestHeaders, [
    { header: 'X-AEM-Edge-Key', operation: 'set', value: 'edge-key-value' },
    {
      header: 'X-Forwarded-Host',
      operation: 'set',
      value: 'us.example.invalid',
    },
  ]);
  assert.equal(session.publishTabs[50].country, 'US');
  assert.equal(session.publishTabs[50].forwardedHost, 'us.example.invalid');
});
test('Page purge uses PURGE publish URL and all required environment headers without body', async () => {
  const r = await send('purge');
  assert.equal(r.ok, true);
  assert.equal(r.record.state, 'succeeded');
  assert.equal(captured.url, 'https://publish-dev.example.invalid/ports');
  assert.equal(captured.init.method, 'PURGE');
  assert.equal(captured.init.body, undefined);
  assert.equal(captured.init.headers['X-AEM-Purge-Key'], 'purge-key-value');
  assert.equal(captured.init.headers['X-AEM-Edge-Key'], 'edge-key-value');
  assert.equal(captured.init.headers['X-Forwarded-Host'], 'us.example.invalid');
  assert.equal(captured.init.headers['X-AEM-Purge'], 'soft');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(local.purgeHistory[0].purgeId, '1000098-1722961031-13237063');
  assert.ok(!JSON.stringify(logs).includes('edge-key-value'));
  assert.ok(!JSON.stringify(logs).includes('purge-key-value'));
});
test('Full environment purge is one all request against the root with checkbox confirmation', async () => {
  config.environments[0].confirmPagePurge = true;
  config.environments[0].confirmFullPurge = true;
  const before = fetchCount;
  const r = await send('purgeAll');
  assert.equal(r.ok, true);
  assert.equal(fetchCount, before + 1);
  assert.equal(captured.url, 'https://publish-dev.example.invalid/');
  assert.equal(captured.init.headers['X-AEM-Purge'], 'all');
  assert.equal(r.record.scope, 'all');
  const bad = await send('purgeAll', { confirmation: 'PURGE PROD' });
  assert.equal(bad.ok, false);
  assert.equal(fetchCount, before + 1);
  config.environments[0].confirmPagePurge = false;
  config.environments[0].confirmFullPurge = false;
});
test('PROD full purge is disabled by default even when directly invoked or forged', async () => {
  const before = fetchCount;
  const r = await send('purgeAll', {
    environment: 'PROD',
    confirmation: 'PURGE PROD',
  });
  assert.equal(r.ok, false);
  assert.match(r.text, /disabled for PROD/);
  assert.equal(fetchCount, before);
});
test('Current page purge remains enabled for PROD', async () => {
  const previous = currentURL;
  currentURL = 'https://prod-us.example.invalid/ports';
  const r = await send('purge', { environment: 'PROD' });
  assert.equal(r.ok, true);
  assert.equal(captured.url, 'https://publish-prod.example.invalid/ports');
  assert.equal(captured.init.headers['X-AEM-Purge-Key'], 'prod-purge');
  currentURL = previous;
});
test('Page and full purge accept direct clicks when confirmation is disabled', async () => {
  const before = fetchCount;
  assert.equal((await send('purge', { confirmation: undefined })).ok, true);
  assert.equal((await send('purgeAll', { confirmation: undefined })).ok, true);
  assert.equal(fetchCount, before + 2);
});
test('Background rejects page and full requests without configured confirmation', async () => {
  config.environments[0].confirmPagePurge = true;
  config.environments[0].confirmFullPurge = true;
  const before = fetchCount;
  try {
    for (const action of ['purge', 'purgeAll'])
      assert.equal(
        (await send(action, { confirmation: undefined, confirmPurge: false }))
          .ok,
        false,
      );
    assert.equal(fetchCount, before);
    assert.equal((await send('purge', { confirmation: 'page' })).ok, true);
    assert.equal((await send('purgeAll', { confirmation: 'all' })).ok, true);
  } finally {
    config.environments[0].confirmPagePurge = false;
    config.environments[0].confirmFullPurge = false;
  }
});
test('Background enforces page and full confirmation independently', async () => {
  const env = config.environments[0],
    before = fetchCount;
  try {
    env.confirmPagePurge = true;
    env.confirmFullPurge = false;
    assert.equal((await send('purge', { confirmation: undefined })).ok, false);
    assert.equal(fetchCount, before);
    assert.equal(
      (await send('purgeAll', { confirmation: undefined })).ok,
      true,
    );
    env.confirmPagePurge = false;
    env.confirmFullPurge = true;
    assert.equal((await send('purge', { confirmation: undefined })).ok, true);
    const afterPage = fetchCount;
    assert.equal(
      (
        await send('purgeAll', {
          confirmation: undefined,
          confirmFullPurge: false,
        })
      ).ok,
      false,
    );
    assert.equal(fetchCount, afterPage);
    assert.equal((await send('purgeAll', { confirmation: 'all' })).ok, true);
  } finally {
    env.confirmPagePurge = false;
    env.confirmFullPurge = false;
  }
});
test('Custom environments beyond the starter list can purge using their own keys', async () => {
  const previous = currentURL;
  const env = {
    ...config.environments[0],
    name: 'QA EU',
    publishUrl: 'https://publish-qa.example.invalid/',
    edgeKey: 'qa-edge',
    purgeKey: 'qa-purge',
    countries: [
      {
        code: 'US',
        publicBaseUrl: 'https://qa.example.invalid/',
        publishPathPrefix: '/',
      },
    ],
    confirmPagePurge: false,
  };
  config.environments.push(env);
  currentURL = 'https://qa.example.invalid/page';
  try {
    const r = await send('purge', {
      environment: 'QA EU',
      confirmation: undefined,
    });
    assert.equal(r.ok, true);
    assert.equal(captured.url, 'https://publish-qa.example.invalid/page');
    assert.equal(captured.init.headers['X-AEM-Purge-Key'], 'qa-purge');
  } finally {
    currentURL = previous;
    config.environments.pop();
  }
});
test('Disabled full purge is rejected from saved policy even with forged enable flags', async () => {
  config.environments[0].fullPurgeEnabled = false;
  const before = fetchCount;
  try {
    const r = await send('purgeAll', {
      fullPurgeEnabled: true,
      confirmation: 'all',
    });
    assert.equal(r.ok, false);
    assert.match(r.text, /Full environment purge is disabled for DEV/);
    assert.equal(fetchCount, before);
    assert.equal((await send('purge', { confirmation: undefined })).ok, true);
  } finally {
    config.environments[0].fullPurgeEnabled = true;
  }
});
test('PROD full purge runs only when explicitly enabled in saved configuration', async () => {
  const previous = currentURL;
  currentURL = 'https://prod-us.example.invalid/ports';
  config.environments[4].fullPurgeEnabled = true;
  try {
    const r = await send('purgeAll', {
      environment: 'PROD',
      confirmation: undefined,
    });
    assert.equal(r.ok, true);
    assert.equal(captured.url, 'https://publish-prod.example.invalid/');
    assert.equal(captured.init.headers['X-AEM-Purge'], 'all');
  } finally {
    currentURL = previous;
    config.environments[4].fullPurgeEnabled = false;
  }
});
test('Shared publish tab restores country context and rejects host changes', async () => {
  const previous = currentURL;
  currentURL = 'https://publish-dev.example.invalid/ports';
  assert.equal((await send('purge', { tabId: 50 })).ok, true);
  assert.equal(captured.init.headers['X-Forwarded-Host'], 'us.example.invalid');
  assert.equal((await send('purge', { tabId: 50, country: 'GB' })).ok, false);
  currentURL = previous;
});
test('Permissions, missing keys, stale pages and wrong public countries prevent network requests', async () => {
  const before = fetchCount;
  granted = false;
  assert.equal((await send('purge')).ok, false);
  granted = true;
  const key = session.secrets.DEV.purgeKey;
  delete session.secrets.DEV.purgeKey;
  assert.equal((await send('purge')).ok, false);
  session.secrets.DEV.purgeKey = key;
  assert.equal(
    (await send('purge', { expectedURL: 'https://us.example.invalid/other' }))
      .ok,
    false,
  );
  assert.equal((await send('purge', { country: 'GB' })).ok, false);
  assert.equal(fetchCount, before);
});
test('Failed HTTP and failed JSON application status are saved and shown as failures', async () => {
  response = {
    status: 403,
    body: { status: 'error', message: 'purge-key-value' },
  };
  assert.equal((await send('purge')).ok, false);
  assert.equal(local.purgeHistory[0].state, 'failed');
  response = { status: 200, body: { status: 'error' } };
  assert.equal((await send('purge')).ok, false);
  assert.equal(local.purgeHistory[0].state, 'failed');
  assert.ok(!JSON.stringify(local.purgeHistory).includes('purge-key-value'));
  response = { status: 200, body: { status: 'ok', id: 'edge-key-value' } };
  await send('purge');
  assert.equal(local.purgeHistory[0].purgeId, undefined);
});
test('Network errors have unknown outcome and secrets never leak into errors', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('purge-key-value');
  };
  const r = await send('purge');
  assert.equal(r.ok, false);
  assert.equal(r.record.state, 'unknown');
  assert.ok(!r.text.includes('purge-key-value'));
  globalThis.fetch = original;
});
test('Tab removal clears its headers and country context', async () => {
  removed(50);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rules.size, 0);
  assert.equal(session.publishTabs[50], undefined);
});
test('Content scripts cannot trigger actions and explicit credential removal clears the session', async () => {
  assert.equal(
    listener(
      { action: 'purge' },
      { id: 'test', tab: { id: 1 }, url: 'https://us.example.invalid/' },
      () => {},
    ),
    false,
  );
  const r = await send('clearCredentials');
  assert.equal(r.ok, true);
  assert.equal(session.secrets, undefined);
  assert.equal(session.publishTabs, undefined);
});
test('Settings opened in a browser tab can clear active headers before import', async () => {
  rules.set(51, { id: 51 });
  session.publishTabs = { 50: { environment: 'DEV', country: 'US' } };
  session.secrets = { DEV: { edgeKey: 'old-key' } };
  let respond;
  const response = new Promise((resolve) => (respond = resolve));
  const accepted = listener(
    { action: 'clearCredentials' },
    {
      id: 'test',
      url: 'chrome-extension://test/options.html',
      tab: { id: 12 },
    },
    respond,
  );
  assert.equal(
    accepted,
    true,
    'Trusted Settings tab must receive a background response',
  );
  assert.equal((await response).ok, true);
  assert.equal(rules.size, 0);
  assert.equal(session.publishTabs, undefined);
  assert.equal(session.secrets, undefined);
});
test('Settings tab routes remain trusted when opened directly on the activity section', async () => {
  let respond;
  const response = new Promise((resolve) => (respond = resolve));
  assert.equal(
    listener(
      { action: 'context', tabId: 12 },
      {
        id: 'test',
        url: 'chrome-extension://test/options.html#activity',
        tab: { id: 12 },
      },
      respond,
    ),
    true,
  );
  assert.equal((await response).ok, true);
});
test('Only exact Settings and popup URLs from this extension are trusted', () => {
  for (const sender of [
    { id: 'other', url: 'chrome-extension://test/options.html' },
    { id: 'test', url: 'chrome-extension://test/options.html.evil' },
    { id: 'test', url: 'chrome-extension://test/unknown.html' },
    { id: 'test', url: 'https://us.example.invalid/', tab: { id: 12 } },
    { id: 'test' },
  ])
    assert.equal(
      listener({ action: 'clearCredentials' }, sender, () =>
        assert.fail('Untrusted sender received a response'),
      ),
      false,
    );
});

test('Publish opens a new window only when configured', async () => {
  events.length = 0;
  currentURL = 'https://us.example.invalid/ports';
  granted = true;
  session.secrets = { DEV: { edgeKey: 'edge-key-value' } };
  config.environments[0].publishOpenMode = 'window';
  try {
    const r = await send('publish');
    assert.equal(r.ok, true);
    assert.equal(events[0].type, 'normal');
    assert.equal(events[0].focused, true);
    assert.match(r.text, /new window/);
  } finally {
    delete config.environments[0].publishOpenMode;
  }
});

for (const privateMode of [false, true]) {
  for (const mode of ['tab', 'window']) {
    test(`Publish preserves incognito=${privateMode} in ${mode} mode`, async () => {
      incognito = privateMode;
      events.length = 0;
      session.secrets = {
        DEV: { edgeKey: 'edge-key-value', purgeKey: 'purge-key-value' },
      };
      config.environments[0].publishOpenMode = mode;
      try {
        assert.equal((await send('publish')).ok, true);
        if (mode === 'window') assert.equal(events[0].incognito, privateMode);
        else assert.equal(events[0].windowId, 12);
        assert.deepEqual(rules.get(51).condition.tabIds, [50]);
      } finally {
        incognito = false;
        delete config.environments[0].publishOpenMode;
      }
    });
  }
}
test('Incognito purge never writes history for success, rejection or network failure', async () => {
  incognito = true;
  const before = JSON.stringify(local.purgeHistory);
  const savedFetch = globalThis.fetch;
  const storageSet = chrome.storage.local.set;
  let writes = 0;
  chrome.storage.local.set = async (value) => {
    writes++;
    return storageSet(value);
  };
  try {
    for (const action of ['purge', 'purgeAll']) {
      for (const status of [200, 500, 'network']) {
        globalThis.fetch = async () => {
          if (status === 'network') throw new Error('offline');
          return {
            status,
            headers: { get: () => 'application/json' },
            json: async () => ({ status: status === 200 ? 'ok' : 'error' }),
          };
        };
        const result = await send(action);
        assert.equal(result.ok, status === 200);
        assert.ok(result.record);
        assert.doesNotMatch(result.text, /See Purge activity/);
        assert.equal(JSON.stringify(local.purgeHistory), before);
      }
    }
    assert.equal(writes, 0);
  } finally {
    incognito = false;
    globalThis.fetch = savedFetch;
    chrome.storage.local.set = storageSet;
  }
});

test('Program actions use isolated keys and record program identity', async () => {
  const original = local.config;
  const environments = structuredClone(config.environments);
  environments[0].edgeKey = 'program-edge';
  environments[0].purgeKey = 'program-purge';
  local.config = {
    version: 3,
    programs: [
      { id: 'default', name: 'Default', environments: config.environments },
      { id: 'second', name: 'Second', environments },
    ],
  };
  try {
    const missing = await send('purge');
    assert.equal(missing.ok, false);
    assert.match(missing.text, /program/i);
    const result = await send('purge', { program: 'second' });
    assert.equal(result.ok, true);
    assert.equal(captured.init.headers['X-AEM-Edge-Key'], 'program-edge');
    assert.equal(captured.init.headers['X-AEM-Purge-Key'], 'program-purge');
    assert.equal(result.record.program, 'second');
    assert.equal(result.record.programName, 'Second');
  } finally {
    local.config = original;
  }
});
