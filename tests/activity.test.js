import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor() {
    this.textContent = '';
    this.children = [];
    this.listeners = {};
    this.dataset = {};
  }
  append(child) {
    this.children.push(child);
  }
  replaceChildren() {
    this.children = [];
    this.textContent = '';
  }
  addEventListener(event, handler) {
    this.listeners[event] = handler;
  }
}
let instance = 0;
async function setup(records = []) {
  const elements = Object.fromEntries(
    ['history', 'refreshHistory', 'clearHistory', 'activityStatus'].map(
      (id) => [id, new Element()],
    ),
  );
  const state = { records },
    listeners = {};
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => new Element(),
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ purgeHistory: state.records }),
        remove: async (key) => {
          assert.equal(key, 'purgeHistory');
          state.records = [];
        },
        setAccessLevel: async () => {},
      },
      session: { setAccessLevel: async () => {} },
      onChanged: { addListener: (handler) => (listeners.changed = handler) },
    },
  };
  await import('../activity.js?test=' + instance++);
  return { elements, state, listeners };
}
test('Activity renders stored requests independently of environment settings', async () => {
  const record = {
    id: 'request-1',
    environment: 'QA EU',
    country: 'US',
    scope: 'page',
    state: 'succeeded',
    startedAt: new Date().toISOString(),
    target: 'https://publish.example.invalid/page?q=1',
    forwardedHost: 'public.example.invalid',
    mode: 'soft',
    httpStatus: 200,
    purgeId: 'provider-1',
  };
  const { elements } = await setup([record]);
  assert.equal(elements.history.children.length, 1);
  const [title, details] = elements.history.children[0].children;
  assert.match(title.textContent, /QA EU.*PAGE.*SUCCEEDED/);
  assert.match(details.textContent, /HTTP 200/);
  assert.match(details.textContent, /provider-1/);
});
test('Activity refreshes on log changes and its own clear CTA leaves an empty state', async () => {
  const { elements, state, listeners } = await setup();
  assert.equal(elements.history.textContent, 'No purge requests recorded.');
  state.records = [
    {
      id: 'pending',
      environment: 'CUSTOM',
      country: 'US',
      scope: 'all',
      state: 'pending',
      startedAt: new Date(Date.now() - 31000).toISOString(),
      target: 'https://publish.example.invalid/',
      forwardedHost: 'public.example.invalid',
      mode: 'all',
    },
  ];
  await listeners.changed({ purgeHistory: {} }, 'local');
  assert.match(
    elements.history.children[0].children[0].textContent,
    /UNKNOWN.*interrupted/,
  );
  await elements.clearHistory.listeners.click();
  assert.deepEqual(state.records, []);
  assert.equal(elements.history.textContent, 'No purge requests recorded.');
});
