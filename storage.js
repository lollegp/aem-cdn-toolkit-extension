import { validateConfig } from './core.js';
export async function loadConfig() {
  const { config } = await chrome.storage.local.get('config');
  if (config) return validateConfig(config);
  const response = await fetch(chrome.runtime.getURL('config.json'));
  if (!response.ok) throw new Error('Unable to load bundled config.json.');
  return validateConfig(await response.json());
}
export async function loadSecrets(config = undefined) {
  config ??= await loadConfig();
  const legacy = (await chrome.storage.session.get('secrets')).secrets || {};
  return Object.fromEntries(
    config.environments.map((env) => [
      env.name,
      {
        edgeKey:
          env.edgeKey ||
          legacy[env.name]?.edgeKey ||
          legacy[env.name]?.publish?.['X-AEM-Edge-Key'] ||
          legacy[env.name]?.purge?.['X-AEM-Edge-Key'] ||
          '',
        purgeKey:
          env.purgeKey ||
          legacy[env.name]?.purgeKey ||
          legacy[env.name]?.purge?.['X-AEM-Purge-Key'] ||
          '',
      },
    ]),
  );
}
export async function secureStorage() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  await chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}
