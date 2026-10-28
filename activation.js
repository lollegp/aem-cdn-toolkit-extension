import {
  httpsURL,
  matchPublicCountry,
  mappingId,
  programList,
} from './core.js';
import { loadConfig } from './storage.js';
const icons = (state) =>
  Object.fromEntries(
    [16, 32, 48, 128].map((size) => [
      size,
      'icons/toolkit-' + state + '-' + size + '.png',
    ]),
  );
const neutralIcons = icons('neutral'),
  greenIcons = icons('green');

// Toolbar recognition is domain-wide. Page actions still use path-prefix validation.
export function configuredSites(config, value) {
  if (config.programs)
    return programList(config).flatMap((program) =>
      configuredSites({ environments: program.environments }, value).map(
        (match) => ({
          ...match,
          program: program.id,
          programName: program.name,
        }),
      ),
    );
  let url;
  try {
    url = httpsURL(value);
  } catch {
    return [];
  }
  return config.environments.flatMap((env) => {
    const countries = env.countries.filter(
      (country) => url.origin === new URL(country.publicBaseUrl).origin,
    );
    if (countries.length) {
      let country;
      try {
        country = mappingId(matchPublicCountry(env, value).country);
      } catch {
        if (countries.length === 1) country = mappingId(countries[0]);
      }
      const mapping = env.countries.find((item) => mappingId(item) === country);
      return [
        {
          environment: env.name,
          ...(country ? { country } : {}),
          ...(mapping?.service === 'preview' ? { service: 'preview' } : {}),
        },
      ];
    }
    if (env.previewUrl && url.origin === new URL(env.previewUrl).origin)
      return [{ environment: env.name, publish: true, service: 'preview' }];
    if (env.publishUrl && url.origin === new URL(env.publishUrl).origin)
      return [{ environment: env.name, publish: true }];
    return [];
  });
}
export function configuredSite(config, value) {
  return configuredSites(config, value)[0] || null;
}

export function startActivation(ready = Promise.resolve()) {
  let queue = Promise.resolve();
  function refresh(tabId) {
    queue = queue
      .then(async () => {
        let config;
        try {
          await ready;
          config = await loadConfig();
        } catch {}
        const tabs =
          tabId === undefined
            ? await chrome.tabs.query({})
            : [await chrome.tabs.get(tabId)];
        for (const tab of tabs) {
          if (tab?.id === undefined) continue;
          try {
            const matches = config ? configuredSites(config, tab.url) : [];
            const detail = matches.length
              ? matches
                  .map(
                    (match) =>
                      (match.programName ? match.programName + ' · ' : '') +
                      match.environment +
                      (match.country
                        ? ' · ' +
                          match.country.replace('@preview', ' · Preview')
                        : match.publish
                        ? ' · ' +
                          (match.service === 'preview' ? 'Preview' : 'Publish')
                        : ''),
                  )
                  .join(' / ')
              : config
              ? 'Domain not configured or access unavailable · Open Settings'
              : 'Configuration unavailable · Open Settings';
            await chrome.action.enable(tab.id);
            await chrome.action.setIcon({
              tabId: tab.id,
              path: matches.length ? greenIcons : neutralIcons,
            });
            await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
            await chrome.action.setTitle({
              tabId: tab.id,
              title: 'AEM CDN Toolkit · ' + detail,
            });
          } catch {
            // Tabs can close during a refresh; continue updating the remaining tabs.
          }
        }
      })
      .catch(() => {});
    return queue;
  }
  // Register synchronously so navigation events can wake a suspended worker.
  chrome.tabs.onUpdated.addListener((id) => refresh(id));
  chrome.tabs.onActivated.addListener(({ tabId }) => refresh(tabId));
  chrome.permissions.onAdded.addListener(() => refresh());
  chrome.permissions.onRemoved.addListener(() => refresh());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) return refresh();
  });
  // Clear the disabled default left by older versions. Keep Settings accessible everywhere.
  chrome.action.enable().catch(() => {});
  refresh();
  return refresh;
}
