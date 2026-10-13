export const ENVIRONMENTS = ['DEV', 'DEV2', 'TEST', 'STAGE', 'PROD'];
export function defaults() {
  return {
    version: 2,
    environments: ENVIRONMENTS.map((name) => ({
      name,
      publishUrl: '',
      edgeKey: '',
      purgeKey: '',
      countries: [],
      cacheParam: '_cacheBust',
      purgeMode: 'soft',
      fullPurgeEnabled: name !== 'PROD',
      confirmPurge: false,
    })),
  };
}
export function httpsURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Use HTTPS URLs without embedded credentials.');
  return url;
}
export function baseURL(value) {
  const url = httpsURL(value);
  if (url.search || url.hash)
    throw new Error('Mapping URLs cannot include a query string or fragment.');
  return url;
}
const prefix = (path) => (path === '/' ? '' : path.replace(/\/$/, ''));
function suffix(url, base) {
  const p = prefix(base.pathname);
  return url.origin === base.origin &&
    (url.pathname === p || url.pathname.startsWith(p + '/'))
    ? url.pathname.slice(p.length)
    : null;
}
export function matchPublicCountry(env, value) {
  const url = httpsURL(value);
  const matches = env.countries
    .map((country) => {
      const base = baseURL(country.publicBaseUrl);
      return { country, tail: suffix(url, base), score: base.pathname.length };
    })
    .filter((m) => m.tail !== null)
    .sort((a, b) => b.score - a.score);
  if (!matches.length)
    throw new Error(
      'This page does not match a public country URL in this environment.',
    );
  return { url, ...matches[0] };
}
function publishBase(env, country) {
  const base = baseURL(env.publishUrl);
  base.pathname = country.publishPathPrefix || '/';
  return base;
}
export function resolvePage(env, value, countryCode) {
  const url = httpsURL(value);
  let country, tail;
  if (env.publishUrl && url.origin === baseURL(env.publishUrl).origin) {
    if (!countryCode)
      throw new Error('Select a country for this shared publish URL.');
    country = env.countries.find((c) => c.code === countryCode);
    if (!country) throw new Error('Unknown country.');
    tail = suffix(url, publishBase(env, country));
    if (tail === null)
      throw new Error('This publish path does not match the selected country.');
  } else {
    const found = matchPublicCountry(env, value);
    country = found.country;
    tail = found.tail;
    if (countryCode && country.code !== countryCode)
      throw new Error(
        'The selected country does not match the current public URL.',
      );
  }
  const publicUrl = baseURL(country.publicBaseUrl);
  publicUrl.pathname = prefix(publicUrl.pathname) + (tail || '/');
  publicUrl.search = url.search;
  publicUrl.hash = url.hash;
  const publishUrl = publishBase(env, country);
  publishUrl.pathname = prefix(publishUrl.pathname) + (tail || '/');
  publishUrl.search = url.search;
  publishUrl.hash = url.hash;
  return { country, publicUrl, publishUrl, forwardedHost: publicUrl.host };
}
export function bypassURL(value, param, randomValue = crypto.randomUUID()) {
  const url = httpsURL(value);
  url.searchParams.set(param, randomValue);
  return url.href;
}
export function purgePolicy(env) {
  return {
    fullPurgeEnabled: env ? env.fullPurgeEnabled ?? env.name !== 'PROD' : false,
    confirmPurge: env?.confirmPurge ?? false,
  };
}
export function purgeRequest(env, page, scope) {
  if (!['page', 'all'].includes(scope)) throw new Error('Invalid purge scope.');
  if (scope === 'all' && !purgePolicy(env).fullPurgeEnabled)
    throw new Error('Full environment purge is disabled for ' + env.name + '.');
  const url =
    scope === 'all' ? baseURL(env.publishUrl) : new URL(page.publishUrl);
  url.searchParams.delete(env.cacheParam);
  url.hash = '';
  return { url: url.href, mode: scope === 'all' ? 'all' : env.purgeMode };
}
export function validateHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers))
    throw new Error('Invalid headers.');
  for (const [name, value] of Object.entries(headers)) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      typeof value !== 'string' ||
      !value ||
      /[^\x20-\x7e\x80-\xff]/.test(value)
    )
      throw new Error('Invalid header name or value.');
  }
  return headers;
}
export function requestHeaders(secrets, forwardedHost, purgeMode) {
  if (!secrets?.edgeKey)
    throw new Error(
      'Configure edgeKey for this environment in config.json or Settings.',
    );
  const headers = {
    'X-AEM-Edge-Key': secrets.edgeKey,
    'X-Forwarded-Host': forwardedHost,
  };
  if (purgeMode) {
    if (!secrets.purgeKey)
      throw new Error(
        'Configure purgeKey for this environment in config.json or Settings.',
      );
    headers['X-AEM-Purge-Key'] = secrets.purgeKey;
    headers['X-AEM-Purge'] = purgeMode;
  }
  return validateHeaders(headers);
}
export function migrateConfig(config) {
  if (config?.version !== 1) return config;
  return {
    version: 2,
    environments: config.environments.map((e) => {
      const origins = [
        ...new Set(e.routes.map((r) => baseURL(r.publishBaseUrl).origin)),
      ];
      if (origins.length > 1)
        throw new Error(
          'Version 1 migration needs one publish origin per environment. Import a version 2 configuration.',
        );
      return {
        name: e.name,
        publishUrl: origins[0] ? origins[0] + '/' : '',
        cacheParam: e.cacheParam,
        purgeMode: 'soft',
        countries: e.routes.map((r, i) => ({
          code: 'SITE' + (i + 1),
          publicBaseUrl: r.publicBaseUrl,
          publishPathPrefix: baseURL(r.publishBaseUrl).pathname,
        })),
      };
    }),
  };
}
export function validateConfig(input) {
  const config = migrateConfig(input);
  if (
    !config ||
    config.version !== 2 ||
    !Array.isArray(config.environments) ||
    config.environments.length !== 5
  )
    throw new Error(
      'Version 2 configuration with five environments is required.',
    );
  const publishOrigins = new Set();
  const environments = ENVIRONMENTS.map((name) => {
    const matches = config.environments.filter((e) => e.name === name);
    if (matches.length !== 1)
      throw new Error('Missing or duplicate environment: ' + name);
    const e = matches[0];
    if (!/^[a-zA-Z0-9_.-]+$/.test(e.cacheParam || ''))
      throw new Error(
        'Invalid cache parameter name. Use letters, numbers, underscores, dots or hyphens.',
      );
    if (!['soft', 'hard'].includes(e.purgeMode))
      throw new Error('Page purge mode must be soft or hard.');
    for (const field of ['fullPurgeEnabled', 'confirmPurge'])
      if (e[field] !== undefined && typeof e[field] !== 'boolean')
        throw new Error(field + ' must be a boolean.');
    if (typeof e.publishUrl !== 'string')
      throw new Error('Invalid publish URL.');
    let publishUrl = '';
    if (e.publishUrl) {
      const u = baseURL(e.publishUrl);
      if (u.pathname !== '/')
        throw new Error(
          'Publish URL must contain an origin only, without a path.',
        );
      if (publishOrigins.has(u.origin))
        throw new Error(
          'Each environment must use a different publish origin.',
        );
      publishOrigins.add(u.origin);
      publishUrl = u.origin + '/';
    }
    if (!Array.isArray(e.countries) || e.countries.length > 100)
      throw new Error('Invalid country mappings.');
    const codes = new Set(),
      bases = new Set();
    const countries = e.countries.map((c) => {
      if (
        typeof c.code !== 'string' ||
        !/^[A-Z0-9_]{2,16}$/.test(c.code) ||
        codes.has(c.code)
      )
        throw new Error('Country codes must be unique uppercase identifiers.');
      codes.add(c.code);
      const u = baseURL(c.publicBaseUrl);
      const normalized = u.origin + prefix(u.pathname);
      if (bases.has(normalized))
        throw new Error('Duplicate public country URL.');
      bases.add(normalized);
      if (publishUrl && u.origin === baseURL(publishUrl).origin)
        throw new Error('Public and publish origins must differ.');
      const p = c.publishPathPrefix || '/';
      if (
        typeof p !== 'string' ||
        !p.startsWith('/') ||
        p.startsWith('//') ||
        /[?#\\\s]/.test(p) ||
        p.includes('..') ||
        !/^[\x21-\x7e]+$/.test(p)
      )
        throw new Error('Invalid publish path prefix.');
      return { code: c.code, publicBaseUrl: u.href, publishPathPrefix: p };
    });
    if (countries.length && !publishUrl)
      throw new Error('Configure the environment publish URL first.');
    const edgeKey = e.edgeKey ?? '',
      purgeKey = e.purgeKey ?? '';
    if (typeof edgeKey !== 'string' || typeof purgeKey !== 'string')
      throw new Error('Environment keys must be strings.');
    validateHeaders(
      Object.fromEntries(
        Object.entries({ edgeKey, purgeKey }).filter(([, v]) => v),
      ),
    );
    return {
      name,
      publishUrl,
      edgeKey,
      purgeKey,
      countries,
      cacheParam: e.cacheParam,
      purgeMode: e.purgeMode,
      ...purgePolicy(e),
    };
  });
  return { version: 2, environments };
}
export function permissionOrigins(env) {
  const urls = env.countries.map((c) => c.publicBaseUrl);
  if (env.publishUrl) urls.push(env.publishUrl);
  return [
    ...new Set(
      urls.map((value) => {
        const u = httpsURL(value);
        return u.protocol + '//' + u.hostname + '/*';
      }),
    ),
  ];
}
export function publishRule(tabId, url, headers) {
  const origin = httpsURL(url).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    id: tabId + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: Object.entries(validateHeaders(headers)).map(
        ([header, value]) => ({ header, operation: 'set', value }),
      ),
    },
    condition: {
      tabIds: [tabId],
      regexFilter: '^' + origin + '/',
      isUrlFilterCaseSensitive: true,
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'stylesheet',
        'script',
        'image',
        'font',
        'object',
        'xmlhttprequest',
        'ping',
        'media',
        'websocket',
        'other',
      ],
    },
  };
}
// Provider responses are reduced to safe fields. Raw bodies and credentials are never logged.
export function responseSummary(httpStatus, body) {
  const status =
    typeof body?.status === 'string' ? body.status.toLowerCase() : '';
  const id =
    typeof body?.id === 'string' && /^[A-Za-z0-9_:.-]{1,180}$/.test(body.id)
      ? body.id
      : undefined;
  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    ['error', 'failed', 'failure', 'denied'].includes(status) ||
    body?.success === false
  )
    return { state: 'failed', httpStatus };
  return {
    state: status === 'ok' ? 'succeeded' : 'accepted',
    httpStatus,
    ...(id ? { purgeId: id } : {}),
  };
}
