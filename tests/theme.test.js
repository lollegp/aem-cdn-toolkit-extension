import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = () =>
  readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
async function setup(saved, { failRead = false, failWrite = false } = {}) {
  const root = { dataset: {} };
  const select = {
    value: '',
    addEventListener: (_, fn) => (select.change = fn),
  };
  const status = { textContent: '' };
  let changed;
  const writes = [];
  vm.runInNewContext(source(), {
    document: {
      documentElement: root,
      getElementById: (id) => (id === 'themePreference' ? select : status),
    },
    chrome: {
      storage: {
        local: {
          get: async () => {
            if (failRead) throw new Error('Unavailable');
            return { themePreference: saved };
          },
          set: async (value) => {
            if (failWrite) throw new Error('Unavailable');
            writes.push(value.themePreference);
          },
        },
        onChanged: { addListener: (fn) => (changed = fn) },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { root, select, status, writes, changed };
}

test('defaults to system for missing or invalid preferences', async () => {
  for (const value of [undefined, 'invalid']) {
    const { root, select } = await setup(value);
    assert.equal(root.dataset.theme, 'system');
    assert.equal(select.value, 'system');
  }
});
test('restores explicit theme and saves selection immediately', async () => {
  const { root, select, writes } = await setup('dark');
  assert.equal(root.dataset.theme, 'dark');
  select.value = 'light';
  await select.change();
  assert.deepEqual(writes, ['light']);
  assert.equal(root.dataset.theme, 'light');
});
test('updates open pages when local preference changes or is removed', async () => {
  const { root, select, changed } = await setup('light');
  changed({ themePreference: { newValue: 'dark' } }, 'sync');
  assert.equal(root.dataset.theme, 'light');
  changed({ themePreference: { newValue: 'dark' } }, 'local');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(select.value, 'dark');
  changed({ themePreference: {} }, 'local');
  assert.equal(root.dataset.theme, 'system');
});
test('storage failures retain usable theme and report save failure', async () => {
  const { root, select, status } = await setup(undefined, {
    failRead: true,
    failWrite: true,
  });
  assert.equal(root.dataset.theme, 'system');
  select.value = 'dark';
  await select.change();
  assert.equal(root.dataset.theme, 'system');
  assert.equal(select.value, 'system');
  assert.match(status.textContent, /Could not save/);
});
