import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironment,
  validateConfig,
  resolvePage,
  purgeRequest,
  requestHeaders,
  permissionOrigins,
} from '../core.js';
function standard() {
  return validateConfig({
    version: 2,
    environments: [
      {
        ...createEnvironment('Standard'),
        cdnMode: 'standard',
        purgeKey: 'purge-secret',
        fullPurgeEnabled: true,
        countries: [
          {
            code: 'GB',
            publicBaseUrl: 'https://www.example.com/gb/',
            publishPathPrefix: '/content/ignored',
          },
        ],
      },
    ],
  }).environments[0];
}
test('standard setup needs no publish origin and preserves public paths', () => {
  const env = standard();
  const page = resolvePage(
    env,
    'https://www.example.com/gb/page?q=1&_cacheBust=abc#x',
    'GB',
  );
  assert.equal(page.forwardedHost, '');
  assert.equal(
    purgeRequest(env, page, 'page').url,
    'https://www.example.com/gb/page?q=1',
  );
  assert.equal(purgeRequest(env, page, 'all').url, 'https://www.example.com/');
  assert.deepEqual(permissionOrigins(env), ['https://www.example.com/*']);
});
test('standard requests omit BYO headers even when old keys exist', () => {
  assert.deepEqual(
    requestHeaders(
      { edgeKey: 'unused', purgeKey: 'purge-secret' },
      '',
      'soft',
      'standard',
    ),
    { 'X-AEM-Purge-Key': 'purge-secret', 'X-AEM-Purge': 'soft' },
  );
  assert.throws(() => requestHeaders({}, '', 'soft', 'standard'), /purgeKey/);
});
test('legacy setup remains BYO and invalid modes are rejected', () => {
  assert.equal(
    validateConfig({ version: 2, environments: [createEnvironment('Legacy')] })
      .environments[0].cdnMode,
    'byo',
  );
  assert.throws(
    () =>
      validateConfig({
        version: 2,
        environments: [{ ...createEnvironment('Bad'), cdnMode: 'wrong' }],
      }),
    /CDN/,
  );
});
