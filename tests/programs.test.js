import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig,
  exportConfiguration,
  createEnvironment,
} from '../core.js';
import { configuredSites } from '../activation.js';

function workspace() {
  const environment = createEnvironment('PROD');
  environment.publishUrl = 'https://publish.example.com';
  environment.countries = [
    {
      code: 'GB',
      publicBaseUrl: 'https://www.example.com/',
      publishPathPrefix: '/',
    },
  ];
  environment.edgeKey = 'secret';
  return {
    version: 3,
    programs: [
      { id: 'first', name: 'First', environments: [] },
      { id: 'second', name: 'Second', environments: [environment] },
    ],
  };
}
test('validates isolated programs with repeated environment names', () => {
  const value = workspace();
  value.programs[0].environments = structuredClone(
    value.programs[1].environments,
  );
  assert.equal(validateConfig(value).programs.length, 2);
});
test('recognizes URLs in any program and exposes program identity', () => {
  const config = validateConfig(workspace());
  assert.equal(
    configuredSites(config, 'https://www.example.com/test')[0].program,
    'second',
  );
  assert.equal(
    configuredSites(config, 'https://publish.example.com/test')[0].program,
    'second',
  );
});
test('export removes keys from every program without mutating saved config', () => {
  const config = validateConfig(workspace());
  const exported = exportConfiguration(config);
  assert.equal(exported.programs[1].environments[0].edgeKey, '');
  assert.equal(config.programs[1].environments[0].edgeKey, 'secret');
});
test('rejects duplicate program identities and names', () => {
  const value = workspace();
  value.programs[1].id = 'first';
  assert.throws(() => validateConfig(value), /program/i);
  value.programs[1].id = 'second';
  value.programs[1].name = 'First';
  assert.throws(() => validateConfig(value), /program/i);
});
