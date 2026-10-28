import test from 'node:test';
import assert from 'node:assert/strict';
import { responseLog } from '../core.js';

test('response logs preserve JSON details while redacting keys and credentials', () => {
  const value = responseLog(
    JSON.stringify({
      status: 'error',
      message: 'Rejected secret-value',
      token: 'private',
      nested: { 'X-AEM-Purge-Key': 'private' },
    }),
    ['secret-value'],
  );
  assert.match(value, /Rejected \[REDACTED\]/);
  assert.doesNotMatch(value, /private|secret-value/);
  assert.match(value, /error/);
});
test('response logs bound output and keep HTML as literal text', () => {
  assert.equal(
    responseLog('<script>example</script>'),
    '<script>example</script>',
  );
  assert.ok(responseLog('x'.repeat(20000)).length < 17000);
  assert.match(responseLog('x'.repeat(20000)), /truncated/);
});

test('malformed JSON never exposes credential fields', () => {
  for (const value of ['{"token":"private",', '  [{"password":"private"']) {
    assert.doesNotMatch(responseLog(value), /private/);
    assert.match(responseLog(value), /omitted/);
  }
});
