export function createEnvironment(name) {
  return {
    name,
    cdnMode: 'byo',
    publishUrl: '',
    previewUrl: '',
    previewEdgeKey: '',
    previewPurgeKey: '',
    previewUsePublishKeys: false,
    edgeKey: '',
    purgeKey: '',
    countries: [],
    cacheParam: '_cacheBust',
    purgeMode: 'soft',
    publishOpenMode: 'tab',
    fullPurgeEnabled: false,
    confirmPagePurge: false,
    confirmFullPurge: false,
  };
}
export function defaults() {
  return {
    version: 2,
    environments: ['DEV', 'DEV2', 'TEST', 'STAGE', 'PROD'].map((name) => ({
      ...createEnvironment(name),
      fullPurgeEnabled: name !== 'PROD',
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
export function mappingId(country) {
  return country.service === 'preview'
    ? country.code + '@preview'
    : country.code;
}
export function serviceOrigin(env, service = 'publish') {
  return service === 'preview' ? env.previewUrl : env.publishUrl;
}
export function serviceSecrets(env, publishSecrets, service) {
  if (service !== 'preview' || env.previewUsePublishKeys) return publishSecrets;
  return {
    edgeKey: env.previewEdgeKey || '',
    purgeKey: env.previewPurgeKey || '',
  };
}
function publishBase(env, country) {
  const origin = serviceOrigin(env, country.service);
  if (!origin)
    throw new Error(
      'Configure the ' + (country.service || 'publish') + ' service URL.',
    );
  const base = baseURL(origin);
  base.pathname = country.publishPathPrefix || '/';
  return base;
}
export function resolvePage(env, value, countryCode) {
  const url = httpsURL(value);
  if (env.cdnMode === 'standard') {
    const { country } = matchPublicCountry(env, value);
    if (countryCode && mappingId(country) !== countryCode)
      throw new Error(
        'The selected country does not match the current public URL.',
      );
    return { country, publicUrl: url, publishUrl: null, forwardedHost: '' };
  }
  let country, tail;
  const sourceService = ['publish', 'preview'].find(
    (service) =>
      serviceOrigin(env, service) &&
      url.origin === baseURL(serviceOrigin(env, service)).origin,
  );
  if (sourceService) {
    if (!countryCode)
      throw new Error('Select a country for this shared publish URL.');
    country = env.countries.find((c) => mappingId(c) === countryCode);
    if (!country) throw new Error('Unknown country.');
    if ((country.service || 'publish') !== sourceService)
      throw new Error('Selected country belongs to a different service.');
    tail = suffix(url, publishBase(env, country));
    if (tail === null)
      throw new Error('This publish path does not match the selected country.');
  } else {
    const found = matchPublicCountry(env, value);
    country = found.country;
    tail = found.tail;
    if (countryCode && mappingId(country) !== countryCode)
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
  return {
    country,
    service: country.service || 'publish',
    publicUrl,
    publishUrl,
    forwardedHost: publicUrl.host,
  };
}
export function bypassURL(value, param, randomValue = crypto.randomUUID()) {
  const url = httpsURL(value);
  url.searchParams.set(param, randomValue);
  return url.href;
}
export function purgePolicy(env) {
  const legacyFullPurge = ['DEV', 'DEV2', 'TEST', 'STAGE'].includes(
    env?.name?.toUpperCase(),
  );
  return {
    fullPurgeEnabled: env?.fullPurgeEnabled ?? legacyFullPurge,
    confirmPagePurge: env?.confirmPagePurge ?? env?.confirmPurge ?? false,
    confirmFullPurge: env?.confirmFullPurge ?? env?.confirmPurge ?? false,
  };
}
export function requiresPurgeConfirmation(env, scope) {
  if (!['page', 'all'].includes(scope)) throw new Error('Invalid purge scope.');
  const policy = purgePolicy(env);
  return scope === 'all' ? policy.confirmFullPurge : policy.confirmPagePurge;
}
export function purgeRequest(env, page, scope) {
  if (!['page', 'all'].includes(scope)) throw new Error('Invalid purge scope.');
  if (scope === 'all' && !purgePolicy(env).fullPurgeEnabled)
    throw new Error('Full environment purge is disabled for ' + env.name + '.');
  const url =
    env.cdnMode === 'standard'
      ? new URL(scope === 'all' ? page.publicUrl.origin + '/' : page.publicUrl)
      : scope === 'all'
      ? baseURL(serviceOrigin(env, page.service))
      : new URL(page.publishUrl);
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
export function requestHeaders(
  secrets,
  forwardedHost,
  purgeMode,
  cdnMode = 'byo',
) {
  if (!['byo', 'standard'].includes(cdnMode))
    throw new Error('Invalid CDN setup.');
  if (cdnMode === 'byo' && !secrets?.edgeKey)
    throw new Error(
      'Configure edgeKey for this environment in config.json or Settings.',
    );
  const headers =
    cdnMode === 'standard'
      ? {}
      : {
          'X-AEM-Edge-Key': secrets.edgeKey,
          'X-Forwarded-Host': forwardedHost,
        };
  if (purgeMode) {
    if (!secrets?.purgeKey)
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
export function programList(config) {
  return (
    config.programs || [
      { id: 'default', name: 'Default', environments: config.environments },
    ]
  );
}
export function programConfig(config, id = 'default') {
  const program = programList(config).find((item) => item.id === id);
  if (!program) throw new Error('Invalid program.');
  return { version: 2, environments: program.environments };
}
export function validateConfig(input) {
  if (input?.version === 3) {
    if (!Array.isArray(input.programs) || !input.programs.length)
      throw new Error('At least one program is required.');
    const ids = new Set(),
      names = new Set();
    const programs = input.programs.map((program) => {
      if (
        !program ||
        typeof program.id !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(program.id) ||
        typeof program.name !== 'string' ||
        !program.name.trim() ||
        [...program.name].some(
          (character) =>
            character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
        )
      )
        throw new Error('Invalid program name or identity.');
      const name = program.name.trim();
      if (ids.has(program.id) || names.has(name.toLowerCase()))
        throw new Error('Program names and identities must be unique.');
      ids.add(program.id);
      names.add(name.toLowerCase());
      return {
        id: program.id,
        name,
        environments: validateConfig({
          version: 2,
          environments: program.environments,
        }).environments,
      };
    });
    return { version: 3, programs };
  }
  const config = migrateConfig(input);
  if (!config || config.version !== 2 || !Array.isArray(config.environments))
    throw new Error(
      'Version 2 configuration with an environments array is required.',
    );
  const publishOrigins = new Set();
  const names = new Set();
  const environments = config.environments.map((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e))
      throw new Error('Invalid environment entry.');
    if (
      typeof e.name !== 'string' ||
      !e.name.trim() ||
      [...e.name].some((character) => {
        const code = character.codePointAt(0);
        return code < 32 || code === 127;
      })
    )
      throw new Error(
        'Enter a nonempty environment name without control characters.',
      );
    const name = e.name.trim(),
      identity = name.toUpperCase();
    if (names.has(identity))
      throw new Error('Duplicate environment name: ' + name);
    names.add(identity);
    if (!/^[a-zA-Z0-9_.-]+$/.test(e.cacheParam || ''))
      throw new Error(
        'Invalid cache parameter name. Use letters, numbers, underscores, dots or hyphens.',
      );
    if (
      e.publishOpenMode !== undefined &&
      !['tab', 'window'].includes(e.publishOpenMode)
    )
      throw new Error('Publish open mode must be tab or window.');
    if (!['soft', 'hard'].includes(e.purgeMode))
      throw new Error('Page purge mode must be soft or hard.');
    for (const field of [
      'fullPurgeEnabled',
      'confirmPurge',
      'confirmPagePurge',
      'confirmFullPurge',
    ])
      if (e[field] !== undefined && typeof e[field] !== 'boolean')
        throw new Error(field + ' must be a boolean.');
    const cdnMode = e.cdnMode ?? 'byo';
    if (!['byo', 'standard'].includes(cdnMode))
      throw new Error('CDN setup must be standard or byo.');
    if (
      typeof e.publishUrl !== 'string' &&
      !(cdnMode === 'standard' && e.publishUrl === undefined)
    )
      throw new Error('Invalid publish URL.');
    let publishUrl = '';
    if (cdnMode === 'byo' && e.publishUrl) {
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
    let previewUrl = '';
    if (e.previewUrl !== undefined && typeof e.previewUrl !== 'string')
      throw new Error('Invalid preview URL.');
    if (cdnMode === 'byo' && e.previewUrl) {
      const u = baseURL(e.previewUrl);
      if (u.pathname !== '/' || publishOrigins.has(u.origin))
        throw new Error('Preview origin must be unique and contain no path.');
      publishOrigins.add(u.origin);
      previewUrl = u.origin + '/';
    }
    if (
      e.previewUsePublishKeys !== undefined &&
      typeof e.previewUsePublishKeys !== 'boolean'
    )
      throw new Error('Preview key reuse must be a boolean.');
    for (const key of ['previewEdgeKey', 'previewPurgeKey']) {
      if (e[key] !== undefined && typeof e[key] !== 'string')
        throw new Error('Preview keys must be strings.');
      if (e[key]) validateHeaders({ [key]: e[key] });
    }
    if (!Array.isArray(e.countries) || e.countries.length > 100)
      throw new Error('Invalid country mappings.');
    const codes = new Set(),
      bases = new Set();
    const countries = e.countries.map((c) => {
      const service = c.service ?? 'publish';
      if (!['publish', 'preview'].includes(service))
        throw new Error('Mapping service must be publish or preview.');
      if (service === 'preview' && (cdnMode !== 'byo' || !previewUrl))
        throw new Error('Preview mapping requires a BYO preview service URL.');
      if (
        typeof c.code !== 'string' ||
        !/^[A-Z0-9_]{2,16}$/.test(c.code) ||
        codes.has(service + '/' + c.code)
      )
        throw new Error('Country codes must be unique uppercase identifiers.');
      codes.add(service + '/' + c.code);
      const u = baseURL(c.publicBaseUrl);
      const normalized = u.origin + prefix(u.pathname);
      if (bases.has(normalized))
        throw new Error('Duplicate public country URL.');
      bases.add(normalized);
      if (
        [publishUrl, previewUrl]
          .filter(Boolean)
          .some((origin) => u.origin === baseURL(origin).origin)
      )
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
      return {
        code: c.code,
        ...(service === 'preview' ? { service } : {}),
        publicBaseUrl: u.href,
        publishPathPrefix: p,
      };
    });
    if (
      cdnMode === 'byo' &&
      countries.some((country) => country.service !== 'preview') &&
      !publishUrl
    )
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
      cdnMode,
      publishUrl,
      previewUrl,
      previewEdgeKey: cdnMode === 'byo' ? e.previewEdgeKey || '' : '',
      previewPurgeKey: cdnMode === 'byo' ? e.previewPurgeKey || '' : '',
      previewUsePublishKeys:
        cdnMode === 'byo' && (e.previewUsePublishKeys ?? false),
      publishOpenMode: e.publishOpenMode ?? 'tab',
      edgeKey: cdnMode === 'standard' ? '' : edgeKey,
      purgeKey,
      countries,
      cacheParam: e.cacheParam,
      purgeMode: e.purgeMode,
      ...purgePolicy({ ...e, name }),
    };
  });
  return { version: 2, environments };
}
export function permissionOrigins(env) {
  const urls = env.countries.map((c) => c.publicBaseUrl);
  if (env.publishUrl) urls.push(env.publishUrl);
  if (env.previewUrl) urls.push(env.previewUrl);
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
// Response previews are bounded and redact credentials before persistence.
export function responseLog(text, secrets = []) {
  const redact = (value) => {
    for (const secret of secrets
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      value = value.split(secret).join('[REDACTED]');
    return value;
  };
  let result;
  try {
    result = JSON.stringify(
      JSON.parse(text),
      (key, value) => {
        if (/key|token|secret|password|authorization|cookie/i.test(key))
          return '[REDACTED]';
        return typeof value === 'string' ? redact(value) : value;
      },
      2,
    );
  } catch {
    result = /^\s*(?:\[|\{)/.test(String(text))
      ? '[Response omitted: incomplete or invalid JSON.]'
      : redact(String(text));
  }
  result = redact(result);
  return result.length > 16384
    ? result.slice(0, 16384) + '\n[Response truncated]'
    : result;
}
// Classification uses a small set of provider fields independently of the preview.
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

export function exportConfiguration(config, includeKeys = false) {
  const exported = structuredClone(config);
  if (!includeKeys)
    for (const env of programList(exported).flatMap(
      (program) => program.environments,
    )) {
      env.edgeKey = '';
      env.purgeKey = '';
      env.previewEdgeKey = '';
      env.previewPurgeKey = '';
    }
  return exported;
}
