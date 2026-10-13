import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  validateConfig,
  resolvePage,
  matchPublicCountry,
  bypassURL,
  purgeRequest,
  requestHeaders,
  publishRule,
  responseSummary,
  permissionOrigins,
} from '../core.js';
const env = {
  ...defaults().environments[0],
  publishUrl: 'https://publish-dev.example.invalid/',
  countries: [
    {
      code: 'GB',
      publicBaseUrl: 'https://gb.example.invalid/',
      publishPathPrefix: '/',
    },
    {
      code: 'US',
      publicBaseUrl: 'https://us.example.invalid/',
      publishPathPrefix: '/',
    },
  ],
};
test('Countries share one publish URL but keep distinct forwarded hosts', () => {
  const gb = resolvePage(
    env,
    'https://gb.example.invalid/ports?q=a%20b#map',
    'GB',
  );
  const us = resolvePage(env, 'https://us.example.invalid/ports', 'US');
  assert.equal(
    gb.publishUrl.href,
    'https://publish-dev.example.invalid/ports?q=a%20b#map',
  );
  assert.equal(us.publishUrl.href, 'https://publish-dev.example.invalid/ports');
  assert.equal(gb.forwardedHost, 'gb.example.invalid');
  assert.equal(us.forwardedHost, 'us.example.invalid');
});
test('Shared publish URLs require country context and public URLs reject a mismatched country', () => {
  assert.throws(() =>
    resolvePage(env, 'https://publish-dev.example.invalid/ports'),
  );
  assert.equal(
    resolvePage(env, 'https://publish-dev.example.invalid/ports', 'US')
      .publicUrl.href,
    'https://us.example.invalid/ports',
  );
  assert.throws(() =>
    resolvePage(env, 'https://us.example.invalid/ports', 'GB'),
  );
});
test('Path prefix mapping preserves query and fragment and respects boundaries', () => {
  const e = {
    ...env,
    countries: [
      ...env.countries,
      {
        code: 'IT',
        publicBaseUrl: 'https://gb.example.invalid/it',
        publishPathPrefix: '/content/b2c/it/it',
      },
    ],
  };
  assert.equal(
    matchPublicCountry(e, 'https://gb.example.invalid/it/ports').country.code,
    'IT',
  );
  assert.equal(
    matchPublicCountry(e, 'https://gb.example.invalid/italy').country.code,
    'GB',
  );
  const p = resolvePage(e, 'https://gb.example.invalid/it/ports?q=1#map', 'IT');
  assert.equal(
    p.publishUrl.href,
    'https://publish-dev.example.invalid/content/b2c/it/it/ports?q=1#map',
  );
  assert.equal(
    resolvePage(e, p.publishUrl.href, 'IT').publicUrl.href,
    'https://gb.example.invalid/it/ports?q=1#map',
  );
});
test('Exact origin matching rejects lookalike hosts and insecure URLs', () => {
  assert.throws(() =>
    resolvePage(env, 'https://gb.example.invalid.evil.invalid/', 'GB'),
  );
  assert.throws(() => resolvePage(env, 'http://gb.example.invalid/', 'GB'));
});
test('Cache parameter replaces duplicates and produces new random values', () => {
  assert.equal(
    bypassURL(
      'https://gb.example.invalid/?x=1&_cacheBust=a&_cacheBust=b#t',
      '_cacheBust',
      'new',
    ),
    'https://gb.example.invalid/?x=1&_cacheBust=new#t',
  );
  assert.notEqual(
    bypassURL('https://gb.example.invalid/', '_cacheBust'),
    bypassURL('https://gb.example.invalid/', '_cacheBust'),
  );
});
test('Hyphenated cache parameter validates, replaces duplicates and is removed from page purge', () => {
  const config = defaults();
  config.environments[0] = { ...env, cacheParam: 'cache-key' };
  const validated = validateConfig(config).environments[0];
  const url = bypassURL(
    'https://us.example.invalid/ports?keep=1&cache-key=old&cache-key=older#map',
    validated.cacheParam,
    'new',
  );
  assert.equal(
    url,
    'https://us.example.invalid/ports?keep=1&cache-key=new#map',
  );
  assert.deepEqual(
    purgeRequest(validated, resolvePage(validated, url, 'US'), 'page'),
    { url: 'https://publish-dev.example.invalid/ports?keep=1', mode: 'soft' },
  );
  for (const cacheParam of [
    '',
    'cache key',
    'cache&key',
    'cache=key',
    'cache#key',
  ]) {
    config.environments[0].cacheParam = cacheParam;
    assert.throws(() => validateConfig(config), /Invalid cache parameter name/);
  }
});
test('Page PURGE targets publish URL with cleaned query and configured mode', () => {
  const page = resolvePage(
    env,
    'https://us.example.invalid/ports?x=1&_cacheBust=random#map',
    'US',
  );
  assert.deepEqual(purgeRequest(env, page, 'page'), {
    url: 'https://publish-dev.example.invalid/ports?x=1',
    mode: 'soft',
  });
});
test('Full purge targets environment root, sets all, and respects environment availability', () => {
  const page = resolvePage(env, 'https://gb.example.invalid/ports', 'GB');
  assert.deepEqual(purgeRequest(env, page, 'all'), {
    url: env.publishUrl,
    mode: 'all',
  });
  assert.throws(
    () => purgeRequest({ ...env, fullPurgeEnabled: false }, page, 'all'),
    /Full environment purge is disabled for DEV/,
  );
  assert.deepEqual(
    purgeRequest({ ...env, name: 'PROD', fullPurgeEnabled: true }, page, 'all'),
    { url: env.publishUrl, mode: 'all' },
  );
  assert.throws(() => purgeRequest(env, page, 'invalid'));
});
test('Purge settings default for existing configurations and retain explicit choices per environment', () => {
  const config = defaults();
  for (const e of config.environments) {
    delete e.fullPurgeEnabled;
    delete e.confirmPurge;
  }
  const migrated = validateConfig(config);
  for (const e of migrated.environments) {
    assert.equal(e.fullPurgeEnabled, e.name !== 'PROD');
    assert.equal(e.confirmPagePurge, false);
    assert.equal(e.confirmFullPurge, false);
  }
  config.environments[0].fullPurgeEnabled = false;
  config.environments[0].confirmPagePurge = true;
  config.environments[4].fullPurgeEnabled = true;
  const chosen = validateConfig(config);
  assert.equal(chosen.environments[0].fullPurgeEnabled, false);
  assert.equal(chosen.environments[0].confirmPagePurge, true);
  assert.equal(chosen.environments[4].fullPurgeEnabled, true);
  assert.equal(chosen.environments[4].confirmFullPurge, false);
  for (const field of ['fullPurgeEnabled', 'confirmPurge']) {
    for (const value of ['false', 1, null]) {
      const bad = defaults();
      bad.environments[0][field] = value;
      assert.throws(() => validateConfig(bad), /must be a boolean/);
    }
  }
});
test('Publish headers contain edge key and forwarded host but never purge key', () => {
  assert.deepEqual(
    requestHeaders(
      { edgeKey: 'edge', purgeKey: 'purge' },
      'us.example.invalid',
    ),
    { 'X-AEM-Edge-Key': 'edge', 'X-Forwarded-Host': 'us.example.invalid' },
  );
  assert.deepEqual(
    requestHeaders(
      { edgeKey: 'edge', purgeKey: 'purge' },
      'us.example.invalid',
      'all',
    ),
    {
      'X-AEM-Edge-Key': 'edge',
      'X-Forwarded-Host': 'us.example.invalid',
      'X-AEM-Purge-Key': 'purge',
      'X-AEM-Purge': 'all',
    },
  );
  assert.throws(() =>
    requestHeaders({ edgeKey: 'edge' }, 'us.example.invalid', 'soft'),
  );
  assert.throws(() =>
    requestHeaders(
      { edgeKey: 'edge\r\nInjected: value' },
      'us.example.invalid',
    ),
  );
});
test('Header rule applies to one tab and exact origin only', () => {
  const rule = publishRule(
    12,
    env.publishUrl,
    requestHeaders({ edgeKey: 'edge' }, 'gb.example.invalid'),
  );
  assert.deepEqual(rule.condition.tabIds, [12]);
  const re = new RegExp(rule.condition.regexFilter);
  assert.ok(re.test('https://publish-dev.example.invalid/image.jpg'));
  assert.ok(!re.test('https://publish-dev.example.invalid.evil.invalid/'));
  assert.ok(!re.test('https://publish-dev.example.invalid:444/'));
});
test('Configuration retains environment keys, strips unknown properties and rejects shared publish origins across environments', () => {
  const config = defaults();
  config.environments[0] = {
    ...env,
    edgeKey: 'do not export',
    purge: { mode: 'all' },
  };
  assert.equal(validateConfig(config).environments[0].edgeKey, 'do not export');
  assert.equal(validateConfig(config).environments[0].purge, undefined);
  config.environments[4] = { ...env, name: 'PROD' };
  assert.throws(() => validateConfig(config));
});
test('Country validation rejects duplicate sites, duplicate codes, unsafe prefixes and all page mode', () => {
  for (const countries of [
    [env.countries[0], env.countries[0]],
    [env.countries[0], { ...env.countries[0], code: 'IE' }],
    [{ ...env.countries[0], publishPathPrefix: '//evil.invalid' }],
  ]) {
    const c = defaults();
    c.environments[0] = { ...env, countries };
    assert.throws(() => validateConfig(c));
  }
  const c = defaults();
  c.environments[0] = { ...env, purgeMode: 'all' };
  assert.throws(() => validateConfig(c));
});
test('Version 1 migration preserves mappings and removes generic API settings', () => {
  const old = {
    version: 1,
    environments: defaults().environments.map((e) => ({
      name: e.name,
      cacheParam: e.cacheParam,
      routes:
        e.name === 'DEV'
          ? [
              {
                publicBaseUrl: 'https://gb.example.invalid/',
                publishBaseUrl: env.publishUrl,
              },
              {
                publicBaseUrl: 'https://us.example.invalid/',
                publishBaseUrl: env.publishUrl,
              },
            ]
          : [],
      purge: { endpoint: 'https://api.invalid/' },
    })),
  };
  const migrated = validateConfig(old);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.environments[0].countries.length, 2);
  assert.equal(migrated.environments[0].publishUrl, env.publishUrl);
  assert.equal(migrated.environments[0].purge, undefined);
});
test('API responses distinguish ok, acceptance and failure and retain Adobe request IDs', () => {
  assert.deepEqual(
    responseSummary(200, { status: 'ok', id: '1000098-1722961031-13237063' }),
    {
      state: 'succeeded',
      httpStatus: 200,
      purgeId: '1000098-1722961031-13237063',
    },
  );
  assert.equal(responseSummary(202, {}).state, 'accepted');
  assert.equal(responseSummary(200, { status: 'error' }).state, 'failed');
  assert.equal(responseSummary(200, { success: false }).state, 'failed');
  assert.equal(responseSummary(403, { status: 'ok' }).state, 'failed');
});
test('Permissions are explicit hosts and never a global host grant', () => {
  assert.deepEqual(permissionOrigins(env), [
    'https://gb.example.invalid/*',
    'https://us.example.invalid/*',
    'https://publish-dev.example.invalid/*',
  ]);
});

test('Configuration accepts any number of environments and preserves custom names and order', () => {
  for (const count of [0, 1, 3, 56]) {
    const config = {
      version: 2,
      environments: Array.from({ length: count }, (_, i) => ({
        ...defaults().environments[0],
        name: 'Custom environment ' + i,
      })),
    };
    assert.deepEqual(
      validateConfig(config).environments.map((e) => e.name),
      config.environments.map((e) => e.name),
    );
  }
});
test('Environment names are trimmed, unique ignoring case, and reject empty or control-character names', () => {
  const base = defaults().environments[0];
  assert.equal(
    validateConfig({ version: 2, environments: [{ ...base, name: ' QA EU ' }] })
      .environments[0].name,
    'QA EU',
  );
  for (const name of ['', '   ', 'bad\nname', null])
    assert.throws(
      () => validateConfig({ version: 2, environments: [{ ...base, name }] }),
      /environment name/i,
    );
  assert.throws(
    () =>
      validateConfig({
        version: 2,
        environments: [
          { ...base, name: 'QA' },
          { ...base, name: 'qa' },
        ],
      }),
    /duplicate environment/i,
  );
});
test('Legacy confirmation migrates to both purge scopes and explicit scope settings take precedence', () => {
  const config = defaults();
  const env = config.environments[0];
  delete env.confirmPagePurge;
  delete env.confirmFullPurge;
  env.confirmPurge = true;
  let normalized = validateConfig(config).environments[0];
  assert.equal(normalized.confirmPagePurge, true);
  assert.equal(normalized.confirmFullPurge, true);
  assert.equal(normalized.confirmPurge, undefined);
  env.confirmPagePurge = false;
  normalized = validateConfig(config).environments[0];
  assert.equal(normalized.confirmPagePurge, false);
  assert.equal(normalized.confirmFullPurge, true);
  env.confirmFullPurge = false;
  assert.equal(validateConfig(config).environments[0].confirmFullPurge, false);
  for (const field of ['confirmPagePurge', 'confirmFullPurge']) {
    const invalid = defaults();
    invalid.environments[0][field] = 'false';
    assert.throws(() => validateConfig(invalid), /must be a boolean/);
  }
});
