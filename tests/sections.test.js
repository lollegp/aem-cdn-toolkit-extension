import test from 'node:test';
import assert from 'node:assert/strict';
let instance = 0;
async function setup(hash) {
  const elements = Object.fromEntries(
    ['settingsTab', 'activityTab', 'settingsPanel', 'activityPanel'].map(
      (id) => [
        id,
        {
          hidden: false,
          attributes: {},
          listeners: {},
          setAttribute(name, value) {
            this.attributes[name] = value;
          },
          addEventListener(name, handler) {
            this.listeners[name] = handler;
          },
          focus() {
            this.focused = true;
          },
        },
      ],
    ),
  );
  const listeners = {};
  globalThis.document = { getElementById: (id) => elements[id] };
  globalThis.location = { hash };
  globalThis.window = {
    addEventListener: (event, handler) => (listeners[event] = handler),
  };
  await import('../sections.js?test=' + instance++);
  return { elements, listeners };
}
test('Section routes show only the requested tab and default unknown routes to Settings', async () => {
  for (const hash of ['', '#settings', '#activity', '#unknown']) {
    const { elements } = await setup(hash),
      activity = hash === '#activity';
    assert.equal(elements.settingsPanel.hidden, activity);
    assert.equal(elements.activityPanel.hidden, !activity);
    assert.equal(
      elements.activityTab.attributes['aria-selected'],
      String(activity),
    );
    assert.equal(elements.settingsTab.tabIndex, activity ? -1 : 0);
  }
});
test('Tab clicks, keyboard navigation and hash changes update the visible section', async () => {
  const { elements, listeners } = await setup('#settings');
  elements.activityTab.listeners.click();
  assert.equal(location.hash, '#activity');
  assert.equal(elements.activityPanel.hidden, false);
  let prevented = false;
  elements.activityTab.listeners.keydown({
    key: 'ArrowLeft',
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(location.hash, '#settings');
  assert.equal(elements.settingsTab.focused, true);
  location.hash = '#activity';
  listeners.hashchange();
  assert.equal(elements.settingsPanel.hidden, true);
  assert.equal(elements.activityPanel.hidden, false);
});
