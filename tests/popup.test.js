import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../core.js';
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.value = '';
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
  }
  append(child) {
    this.children.push(child);
    if (this.tag === 'select' && this.children.length === 1)
      this.value = child.value;
  }
  replaceChildren() {
    this.children = [];
    if (this.tag === 'select') this.value = '';
  }
  addEventListener(event, fn) {
    this.listeners[event] = fn;
  }
}
let instance = 0;
async function setup({
  url = 'https://us.example.invalid/ports',
  incognito = false,
  context,
  invalidConfig = false,
  sharedDomain = false,
  missingContextResponse = false,
  confirmPurge = false,
  confirmPagePurge = confirmPurge,
  confirmFullPurge = confirmPurge,
  fullPurgeEnabled = true,
  prodFullPurgeEnabled = false,
} = {}) {
  const ids = [
    'environment',
    'country',
    'url',
    'match',
    'forwardedHost',
    'bulkHint',
    'status',
    'latest',
    'confirm',
    'confirmed',
    'purgeTarget',
    'bypass',
    'publish',
    'purge',
    'purgeAll',
    'sendPurge',
    'cancelPurge',
    'options',
    'activity',
  ];
  const buttons = [
    'bypass',
    'publish',
    'purge',
    'purgeAll',
    'sendPurge',
    'cancelPurge',
    'options',
    'activity',
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      new Element(
        ['environment', 'country'].includes(id)
          ? 'select'
          : buttons.includes(id)
          ? 'button'
          : 'div',
      ),
    ]),
  );
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => [
      ...buttons.map((id) => elements[id]),
      elements.environment,
      elements.country,
    ],
  };
  const config = defaults();
  config.environments[0] = {
    ...config.environments[0],
    publishUrl: 'https://publish-dev.example.invalid/',
    countries: [
      {
        code: 'GB',
        publicBaseUrl: 'https://gb.example.invalid/',
        publishPathPrefix: '/',
      },
      {
        code: 'US',
        publicBaseUrl: 'https://us.example.invalid/site',
        publishPathPrefix: '/',
      },
    ],
  };
  config.environments[0].confirmPagePurge = confirmPagePurge;
  config.environments[0].confirmFullPurge = confirmFullPurge;
  config.environments[0].fullPurgeEnabled = fullPurgeEnabled;
  // Keep the existing country-detection case actionable.
  if (url === 'https://us.example.invalid/ports')
    config.environments[0].countries[1].publicBaseUrl =
      'https://us.example.invalid/';
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
  config.environments[4].fullPurgeEnabled = prodFullPurgeEnabled;
  if (sharedDomain)
    config.environments[1] = {
      ...config.environments[1],
      publishUrl: 'https://publish-dev2.example.invalid/',
      countries: [
        {
          code: 'US',
          publicBaseUrl: 'https://us.example.invalid/',
          publishPathPrefix: '/',
        },
      ],
    };
  const calls = [],
    state = {
      tab: { id: 1, url, incognito },
      response: { ok: false, text: 'Simulated request failure' },
      optionsOpened: false,
      openedURLs: [],
    };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => ({
          [key]:
            key === 'config' ? (invalidConfig ? { version: 99 } : config) : [],
        }),
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: async () => [state.tab],
      get: async () => state.tab,
      create: async ({ url }) => {
        state.openedURLs.push(url);
        if (url.endsWith('#settings')) state.optionsOpened = true;
      },
    },
    windows: {
      create: async (details) => {
        state.openedWindow = details;
      },
    },
    extension: { inIncognitoContext: incognito },
    permissions: { request: async () => true },
    runtime: {
      getURL: (path) => 'chrome-extension://test/' + path,
      sendMessage: async (message) => {
        calls.push(message);
        return message.action === 'context'
          ? missingContextResponse
            ? undefined
            : { ok: true, context }
          : state.response;
      },
      openOptionsPage: () => {
        state.optionsOpened = true;
      },
    },
  };
  await import('../popup.js?test=' + instance++);
  return { elements, config, calls, state };
}
test('Popup detects the public country and shows its forwarded hostname', async () => {
  const { elements } = await setup();
  assert.equal(elements.environment.value, 'DEV');
  assert.equal(elements.country.value, 'US');
  assert.equal(
    elements.forwardedHost.textContent,
    'X-Forwarded-Host: us.example.invalid',
  );
  assert.equal(elements.purgeAll.disabled, false);
});
test('Page and full confirmation can be configured independently in the popup', async () => {
  for (const flags of [
    { confirmPagePurge: true, confirmFullPurge: false },
    { confirmPagePurge: false, confirmFullPurge: true },
  ]) {
    const { elements, calls } = await setup(flags);
    elements.confirm.hidden = true;
    for (const [id, required] of [
      ['purge', flags.confirmPagePurge],
      ['purgeAll', flags.confirmFullPurge],
    ]) {
      const before = calls.length;
      await elements[id].listeners.click();
      assert.equal(elements.confirm.hidden, !required);
      assert.equal(calls.length, before + (required ? 0 : 1));
      if (required) elements.cancelPurge.listeners.click();
    }
  }
});
test('Settings and activity CTAs open their own section even when configuration is invalid', async () => {
  const { elements, state } = await setup({ invalidConfig: true });
  await elements.options.listeners.click();
  await elements.activity.listeners.click();
  assert.deepEqual(state.openedURLs, [
    'chrome-extension://test/options.html#settings',
    'chrome-extension://test/options.html#activity',
  ]);
  assert.equal(elements.options.disabled, false);
  assert.equal(elements.activity.disabled, false);
});
test('PROD bulk button stays disabled when the environment changes and after another action', async () => {
  const { elements } = await setup();
  elements.environment.value = 'PROD';
  await elements.environment.listeners.change();
  assert.equal(elements.purgeAll.disabled, true);
  assert.match(elements.bulkHint.textContent, /disabled for PROD/);
  await elements.publish.listeners.click();
  assert.equal(elements.purgeAll.disabled, true);
  elements.purgeAll.listeners.click();
  assert.equal(elements.confirm.hidden, true);
});
test('Bulk confirmation is required and the request carries environment and country', async () => {
  const { elements, calls } = await setup({ confirmPurge: true });
  elements.purgeAll.listeners.click();
  assert.equal(elements.confirm.hidden, false);
  const before = calls.length;
  elements.sendPurge.listeners.click();
  assert.equal(calls.length, before);
  elements.confirmed.checked = true;
  elements.sendPurge.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1).action, 'purgeAll');
  assert.equal(calls.at(-1).confirmation, 'all');
  assert.equal(calls.at(-1).country, 'US');
});
test('Purge buttons send immediately without confirmation by default', async () => {
  const { elements, calls } = await setup();
  elements.confirm.hidden = true;
  for (const [id, action] of [
    ['purge', 'purge'],
    ['purgeAll', 'purgeAll'],
  ]) {
    await elements[id].listeners.click();
    assert.equal(elements.confirm.hidden, true);
    assert.equal(calls.at(-1).action, action);
    assert.equal(calls.at(-1).confirmation, undefined);
  }
});
test('Page confirmation is shown only when enabled and requires checking the confirmation box', async () => {
  const { elements, calls } = await setup({ confirmPurge: true });
  const before = calls.length;
  elements.purge.listeners.click();
  assert.equal(elements.confirm.hidden, false);
  assert.equal(calls.length, before);
  elements.sendPurge.listeners.click();
  assert.equal(calls.length, before);
  elements.confirmed.checked = true;
  elements.sendPurge.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1).action, 'purge');
  assert.equal(calls.at(-1).confirmation, 'page');
});
test('Full purge is hidden when disabled and cannot be sent by triggering its handler', async () => {
  const { elements, calls } = await setup({ fullPurgeEnabled: false });
  assert.equal(elements.purgeAll.hidden, true);
  assert.equal(elements.purgeAll.disabled, true);
  const before = calls.length;
  await elements.purgeAll.listeners.click();
  assert.equal(calls.length, before);
  await elements.purge.listeners.click();
  assert.equal(calls.at(-1).action, 'purge');
});
test('Explicit PROD full-purge configuration enables its popup action', async () => {
  const { elements, calls } = await setup({
    url: 'https://prod-us.example.invalid/ports',
    prodFullPurgeEnabled: true,
  });
  assert.equal(elements.environment.value, 'PROD');
  assert.equal(elements.purgeAll.hidden, false);
  assert.equal(elements.purgeAll.disabled, false);
  await elements.purgeAll.listeners.click();
  assert.equal(calls.at(-1).action, 'purgeAll');
  assert.equal(calls.at(-1).environment, 'PROD');
});
test('Environment switching resets pending confirmation and applies the new environment policy', async () => {
  const { elements, calls } = await setup({
    sharedDomain: true,
    confirmPurge: true,
  });
  elements.environment.value = 'DEV';
  elements.environment.listeners.change();
  elements.purge.listeners.click();
  assert.equal(elements.confirm.hidden, false);
  elements.confirmed.checked = true;
  elements.environment.value = 'DEV2';
  elements.environment.listeners.change();
  assert.equal(elements.confirm.hidden, true);
  const before = calls.length;
  elements.sendPurge.listeners.click();
  assert.equal(calls.length, before);
  await elements.purge.listeners.click();
  assert.equal(calls.at(-1).action, 'purge');
  assert.equal(calls.at(-1).environment, 'DEV2');
  assert.equal(calls.at(-1).confirmation, undefined);
});
test('Immediate purge ignores duplicate clicks while a request is running', async () => {
  const { elements, calls } = await setup();
  let release;
  const response = new Promise((resolve) => (release = resolve));
  chrome.runtime.sendMessage = async (message) => {
    calls.push(message);
    return response;
  };
  const before = calls.length;
  const first = elements.purge.listeners.click();
  const second = elements.purge.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, before + 1);
  assert.equal(elements.purge.disabled, true);
  release({ ok: true, text: 'Purge accepted.' });
  await first;
  await second;
  assert.equal(elements.purge.disabled, false);
});
test('Unmatched and unsupported pages keep Settings accessible with page actions disabled', async () => {
  for (const url of [
    'https://other.example.invalid/',
    'chrome://extensions',
    null,
  ]) {
    const { elements, calls, state } = await setup({ url });
    for (const id of ['bypass', 'publish', 'purge', 'purgeAll'])
      assert.equal(elements[id].disabled, true, id + ' must be disabled');
    assert.equal(elements.options.disabled, false);
    elements.options.listeners.click();
    assert.equal(state.optionsOpened, true);
    const before = calls.length;
    await elements.publish.listeners.click();
    await elements.bypass.listeners.click();
    assert.equal(calls.length, before);
  }
});
test('A configured domain outside its mapped path disables page actions with an explanation', async () => {
  const { elements } = await setup({
    url: 'https://us.example.invalid/outside',
  });
  assert.equal(elements.environment.value, 'DEV');
  assert.match(elements.match.textContent, /does not match/);
  for (const id of ['bypass', 'publish', 'purge', 'purgeAll'])
    assert.equal(elements[id].disabled, true);
});
test('Manually opened publish URLs require an explicit country selection', async () => {
  const { elements } = await setup({
    url: 'https://publish-dev.example.invalid/ports',
  });
  assert.equal(elements.environment.value, 'DEV');
  assert.equal(elements.country.value, '');
  assert.equal(elements.publish.disabled, true);
  elements.country.value = 'US';
  elements.country.listeners.change();
  assert.equal(elements.publish.disabled, false);
});
test('Saved publish context restores its country and locks the country selector', async () => {
  const { elements } = await setup({
    url: 'https://publish-dev.example.invalid/ports',
    context: { environment: 'DEV', country: 'US' },
  });
  assert.equal(elements.country.value, 'US');
  assert.equal(elements.country.disabled, true);
  assert.equal(elements.publish.disabled, false);
});
test('Multiple matching environments require an explicit selection', async () => {
  const { elements } = await setup({ sharedDomain: true });
  assert.equal(elements.environment.value, '');
  assert.equal(elements.publish.disabled, true);
  elements.environment.value = 'DEV';
  elements.environment.listeners.change();
  assert.equal(elements.country.value, 'US');
  assert.equal(elements.publish.disabled, false);
});
test('Settings remains accessible when configuration or context loading fails', async () => {
  for (const flags of [
    { invalidConfig: true },
    { missingContextResponse: true },
  ]) {
    const { elements, state } = await setup(flags);
    assert.equal(elements.options.disabled, false);
    elements.options.listeners.click();
    assert.equal(state.optionsOpened, true);
    if (flags.invalidConfig) assert.equal(elements.publish.disabled, true);
  }
});
test('Adding a cache parameter refreshes the displayed current URL and eligibility', async () => {
  const { elements, state } = await setup();
  state.response = { ok: true, text: 'Random cache parameter added.' };
  state.tab = {
    id: 1,
    url: 'https://us.example.invalid/ports?_cacheBust=new-value#map',
  };
  await elements.bypass.listeners.click();
  assert.equal(elements.url.textContent, state.tab.url);
  assert.equal(elements.publish.disabled, false);
});

test('Incognito popup explains unsaved activity and opens management pages outside incognito', async () => {
  const { elements, state } = await setup({ incognito: true });
  assert.match(elements.latest.textContent, /not saved/);
  for (const [button, route] of [
    ['options', 'settings'],
    ['activity', 'activity'],
  ]) {
    await elements[button].listeners.click();
    assert.equal(state.openedWindow.incognito, false);
    assert.equal(
      state.openedWindow.url,
      'chrome-extension://test/options.html#' + route,
    );
  }
});
