import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironment,
  validateConfig,
  resolvePage,
  purgeRequest,
  exportConfiguration,
  permissionOrigins,
  serviceSecrets,
} from '../core.js';
import { configuredSites } from '../activation.js';
function config() {
  return validateConfig({
    version: 2,
    environments: [
      {
        ...createEnvironment('DEV'),
        publishUrl: 'https://publish.example.invalid/',
        previewUrl: 'https://preview.example.invalid/',
        edgeKey: 'publish-edge',
        purgeKey: 'publish-purge',
        previewEdgeKey: 'preview-edge',
        previewPurgeKey: 'preview-purge',
        fullPurgeEnabled: true,
        countries: [
          {
            code: 'US',
            publicBaseUrl: 'https://www.example.invalid/',
            publishPathPrefix: '/',
          },
          {
            code: 'US',
            service: 'preview',
            publicBaseUrl: 'https://preview-public.example.invalid/',
            publishPathPrefix: '/content/us',
          },
        ],
      },
    ],
  });
}
test('preview mappings select preview ingress and isolate full purge target', () => {
  const env = config().environments[0];
  const page = resolvePage(
    env,
    'https://preview-public.example.invalid/news',
    'US@preview',
  );
  assert.equal(page.service, 'preview');
  assert.equal(
    page.publishUrl.href,
    'https://preview.example.invalid/content/us/news',
  );
  assert.equal(
    purgeRequest(env, page, 'all').url,
    'https://preview.example.invalid/',
  );
  assert.equal(
    resolvePage(env, page.publishUrl.href, 'US@preview').publicUrl.href,
    'https://preview-public.example.invalid/news',
  );
  assert.throws(
    () => resolvePage(env, page.publishUrl.href, 'US'),
    /service|country|tier/i,
  );
  assert.ok(
    permissionOrigins(env).includes('https://preview.example.invalid/*'),
  );
});
test('preview origins are recognized and export strips preview credentials', () => {
  const value = config();
  assert.equal(
    configuredSites(value, 'https://preview.example.invalid/page')[0].service,
    'preview',
  );
  const env = exportConfiguration(value).environments[0];
  assert.equal(env.previewEdgeKey, '');
  assert.equal(env.previewPurgeKey, '');
});
test('preview mappings require a configured BYO preview service', () => {
  const value = config();
  value.environments[0].previewUrl = '';
  assert.throws(() => validateConfig(value), /preview/i);
  value.environments[0].cdnMode = 'standard';
  assert.throws(() => validateConfig(value), /preview/i);
});

test('preview credentials require an explicit reuse choice', () => {
  const env = config().environments[0];
  const publish = { edgeKey: 'publish-edge', purgeKey: 'publish-purge' };
  assert.deepEqual(serviceSecrets(env, publish, 'preview'), {
    edgeKey: 'preview-edge',
    purgeKey: 'preview-purge',
  });
  env.previewEdgeKey = '';
  env.previewPurgeKey = '';
  assert.deepEqual(serviceSecrets(env, publish, 'preview'), {
    edgeKey: '',
    purgeKey: '',
  });
  env.previewUsePublishKeys = true;
  assert.deepEqual(serviceSecrets(env, publish, 'preview'), publish);
});
