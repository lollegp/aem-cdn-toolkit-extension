import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.children = [];
    this.listeners = {};
    this.dataset = {};
  }
  set textContent(value) {
    this.text = value;
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
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
    [
      'history',
      'refreshHistory',
      'clearHistory',
      'activityStatus',
      'historySearch',
      'historyState',
    ].map((id) => [id, new Element()]),
  );
  const state = { records },
    listeners = {};
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => Object.assign(new Element(), { tag }),
  };
  globalThis.chrome = {
    runtime: {
      sendMessage: async (message) => {
        assert.equal(message.action, 'clearHistory');
        state.records = [];
        return { ok: true };
      },
    },
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

test('Activity shows distinct status icons and bold labels with literal log values', async () => {
  const records = ['succeeded', 'failed', 'pending', 'unknown'].map(
    (state) => ({
      id: state,
      environment: 'QA',
      country: 'US',
      scope: 'page',
      state,
      startedAt: new Date().toISOString(),
      target: '<script>literal</script>',
      forwardedHost: 'public.example.invalid',
      mode: 'soft',
      httpStatus: 500,
      error: 'Example error',
    }),
  );
  const { elements } = await setup(records);
  const icons = ['✅', '❌', '⏳', '⚠️'];
  elements.history.children.forEach((card, index) => {
    assert.ok(card.children[0].textContent.includes(icons[index]));
    const rows = card.children[1].children;
    const purge = rows.find((row) => row.children[0].textContent === 'PURGE ');
    assert.equal(purge.children[0].tag, 'strong');
    assert.equal(purge.children[1].textContent, '<script>literal</script>');
    assert.ok(rows.some((row) => row.children[0].textContent === 'Mode: '));
  });
});

test('Activity filters by effective status and a case-insensitive search', async () => {
  const records = ['accepted', 'failed'].map((state) => ({
    id: state,
    state,
    environment: 'QA Europe',
    country: 'US',
    scope: 'page',
    startedAt: new Date().toISOString(),
    target: 'https://publish.example.invalid/page',
    mode: 'soft',
  }));
  const h = await setup(records);
  assert.match(
    h.elements.history.children[0].children[0].textContent,
    /📨.*ACCEPTED/,
  );
  h.elements.historyState.value = 'failed';
  await h.elements.historyState.listeners.change();
  assert.equal(h.elements.history.children.length, 1);
  h.elements.historySearch.value = 'missing';
  await h.elements.historySearch.listeners.input();
  assert.match(h.elements.history.textContent, /No requests match/);
  h.elements.historySearch.value = 'europe';
  await h.elements.historySearch.listeners.input();
  assert.equal(h.elements.history.children.length, 1);
});

test('Failed activity clearing keeps records and shows an actionable error', async () => {
  const h = await setup([
    { state: 'succeeded', startedAt: new Date().toISOString(), id: 'kept' },
  ]);
  chrome.runtime.sendMessage = async () => ({
    ok: false,
    text: 'Cannot clear activity',
  });
  await h.elements.clearHistory.listeners.click();
  assert.equal(h.state.records.length, 1);
  assert.equal(h.elements.activityStatus.textContent, 'Cannot clear activity');
});
