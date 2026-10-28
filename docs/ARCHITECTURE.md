# Architecture and maintenance reference

This guide complements [AGENTS.md](../AGENTS.md). Consult source when changing
behavior; release numbers and test totals are intentionally not duplicated here.

## Runtime map

- `manifest.json`: Chrome baseline, permissions, worker, popup, options page,
  icons, content security policy and spanning Incognito mode.
- `core.js`: pure configuration validation/migration, program projections,
  environment defaults, HTTPS/path matching, publish URL resolution, request
  headers, purge policies, permission origins and response interpretation.
- `storage.js`: load and validate persistent configuration, fall back to bundled
  configuration, read legacy session secrets, and restrict storage access to
  trusted extension contexts.
- `activation.js`: toolbar domain recognition and icon/title refresh on tab,
  permission and configuration changes. Recognition scans every program.
- `background.js`: privileged message handling, configuration writes, session
  header rules, publish navigation, PURGE requests and activity persistence.
- `popup.html` / `popup.js`: current-tab context, program/environment/country
  selection, action previews, permission requests, confirmations and results.
- `options.html` / `options.js`: program management, per-program environment
  editor, permissions, imports/exports, key clearing and reset.
- `activity.js`: saved activity rendering, program/status/search filters,
  historical program badges, refresh and worker-mediated clearing.
- `sections.js`: Settings/activity hash routing and accessible tab navigation.
- `theme.js`: shared deferred script for popup and Settings. Persists local
  appearance choice separately from environment configuration and listens for
  changes from other extension pages.
- `styles.css`: extension UI and light/dark palettes. CSS media queries follow
  OS theme in System mode; explicit Light/Dark overrides it.
- `help.html`, `privacy.html`, `site.css`: packaged help/privacy and the public
  presentation site. The presentation has its own styling.

## Configuration and storage

There are two supported normalized configuration shapes:

```json
{ "version": 2, "environments": [] }
```

```json
{
  "version": 3,
  "programs": [{ "id": "default", "name": "Default", "environments": [] }]
}
```

Version 1 imports migrate through `migrateConfig` when compatible. Version 2 is
projected as the virtual Default program; it need not be rewritten merely to
read it. Program management produces version 3 workspaces. Program IDs are
stable identities, while names are editable labels. IDs and program names must
be unique; environment names must be unique within each program.

Use `programList(workspace)` for iteration and
`programConfig(workspace, programId)` for a version 2 environment projection.
Call `validateConfig` before accepting or persisting changes. Do not flatten
programs into one environment list when looking up credentials or actions.

An environment contains its CDN setup, name, publish origin, edge/purge keys, country
mappings, cache parameter, purge mode, publish destination and confirmation/full
purge flags. `createEnvironment` is the default factory. `defaults()` supplies
legacy example environments used by tests; it is not the first-install config.
Country mappings contain `code`, `publicBaseUrl` and `publishPathPrefix`.

`chrome.storage.local` holds:

- `config`: validated version 2 or 3 configuration, including saved keys.
- `selectedProgram`: last Settings selection, not the URL detection authority.
- `themePreference`: `system`, `light` or `dark`; missing/invalid means System.
- `purgeHistory`: up to 100 latest regular-browsing requests.

`chrome.storage.session` holds temporary `publishTabs` and legacy `secrets`.
`loadSecrets` expects a single-program projection. Legacy environment-name
secret fallback is allowed only for Default; other programs pass `false` as
its second argument. Saved keys are plaintext extension storage, not a vault.

Import replaces the entire workspace. Export/key clearing cover all programs;
duplication uses the key-stripping export behavior. Reset returns to an empty
Default configuration and retains saved activity. Appearance is independent of
configuration import/export/reset.

## CDN setup

`cdnMode` is `byo` (default for legacy configurations and new environments) or `standard`. Standard resolves only public mappings, preserves public paths, and returns an empty forwarded host with no publish URL. Page purge uses `page.publicUrl`; full purge uses its origin. BYO retains publish path rewriting and ingress routing.

Pass the environment mode as the fourth `requestHeaders` argument for purge. Standard sends only purge key/mode, even if legacy secrets contain an edge key. The worker rejects Standard publish actions before navigation or rule installation; the popup hides/disables publish and Settings hides BYO-only fields. Validation clears Standard publish origins/edge keys. Mode is included in credential identity, so setup changes clear active rules/context. Permissions derive from normalized targets. Activity records include setup and omit empty forwarded-host rows.

## BYO service routing

Mapping `service` defaults to Publish; Preview maps to `previewUrl`. `mappingId` retains legacy country codes for Publish and appends `@preview` for Preview, allowing the same country code in both services without mixing actions or tab context. `serviceOrigin` selects ingress, `serviceSecrets` selects separate preview credentials unless `previewUsePublishKeys` explicitly enables reuse. No implicit preview-to-publish credential fallback is allowed.

`resolvePage` rejects cross-service ingress/mapping combinations and returns the service with the target URL. Full purge uses that service's origin. Worker context checks, credential identity, purge concurrency and history carry the service. Preview keys participate in redaction, export sanitization, duplication and key clearing. Origin validation prevents collisions within a program, and permissions include preview hosts. Standard mode rejects preview mappings.

## URL recognition and action flow

1. Toolbar recognition compares configured public/publish origins across all
   programs. A green icon means configured domain, not valid credentials or an
   actionable country path.
2. Popup loads the workspace and current tab, obtains saved publish context,
   then resolves candidate programs/environments. Unique matches select
   automatically; overlapping matches require selection unless existing
   publish-tab context disambiguates them.
3. `matchPublicCountry` checks path boundaries and prefers the longest public
   path prefix. `resolvePage` produces the selected country's publish target
   and forwarded hostname. Manually opened publish URLs need country selection.
4. Popup requests optional host permission and sends the worker the program,
   environment, country, tab ID, expected source URL and reviewed target/mode/
   forwarded host. Required purge confirmation is included explicitly.
5. Worker reloads saved configuration and revalidates all action assumptions.
   It rejects changed pages, targets, policy, context or configuration snapshots.

Publish opens a blank tab/window in the source browsing mode, installs a
session header rule scoped to the new tab and exact publish origin, records
program/country/forwarded-host context, then navigates. Failures clean up tabs,
rules and context. Tab closure removes its rule/context.

Purge requests use `PURGE`, omit cookies, reject redirects, bypass caches and
have a 25-second timeout. Full purge is disabled for newly created environments;
page/full confirmations are independent and initially off. A successful HTTP
response alone does not prove completion: explicit application `status: ok`
means succeeded; other successful responses may mean accepted. Network failures
can leave an unknown outcome; never describe these as safe automatic retries.

## Concurrency, identity and privacy

The worker serializes configuration/session mutations and activity writes.
`expectedConfig` prevents stale Settings tabs overwriting newer configuration.
Configuration epochs prevent pending actions restoring stale credentials;
history epochs prevent requests finishing after Clear activity from recreating
cleared logs. Preserve these checks when refactoring async work.

Purge concurrency is scoped by program ID plus environment name. Publish context
and new activity records include program identity; activity also retains the
program name at request time. Legacy records map to Default. Deleted programs
with retained records remain available in activity filters. Duplicate historical
labels are disambiguated by ID in the filter.

New activity target values omit query strings/fragments. Activity also retains bounded response previews, formats JSON, redacts known keys and JSON credential fields, and renders previews as literal text in expandable sections. Never log keys. Render
external/configured values with `textContent`. Incognito outcomes are shown in
the popup but excluded from persistent history, including failures. Saved
configuration remains shared because the extension uses spanning Incognito.

## Tests and development

Use a maintained Node.js release supporting ES modules and `node --test`, npm,
and Python 3 for packaging. No Python third-party packages are required.

```sh
npm ci
npm run check
npm run package
```

Tests use Node's built-in runner with fake Chrome APIs and DOM elements:

- `core.test.js`, `programs.test.js`, `cdn-mode.test.js`, `preview.test.js`: validation, migration, matching, request
  construction and program isolation/export behavior.
- `storage.test.js`: saved/bundled configuration and secret fallback.
- `activation.test.js`, `icons.test.js`: toolbar recognition and icon assets.
- `background.test.js`, `background-startup.test.js`: privileged action,
  permissions, context, headers, outcomes and startup behavior.
- `configuration-races.test.js`: stale snapshots and credential mutation races.
- `options.test.js`, `popup.test.js`: editor/action flows and program selection.
- `activity.test.js`, `sections.test.js`, `theme.test.js`: filters/badges,
  management navigation and appearance persistence/synchronization.

Extend fixtures when adding controls or API calls. Do not weaken worker checks
to make fake DOM tests pass. Live Chrome is still needed to verify actual host
grants, DNR header injection, Incognito routing, focus, layout and OS themes.

## Packaging, site deployment and store handoff

`npm run package` runs lint, formatting and tests, then `scripts/package.py`.
The builder checks empty release configuration, expected permissions, local
module inclusion and remote/dynamic code restrictions. It creates an explicit
allowlisted ZIP and verifies its entries byte-for-byte, then writes a SHA-256
checksum and builds `dist/site`. Documentation and AI instruction files are not
runtime assets and should stay outside the ZIP.

The site builder turns `help.html` into `dist/site/index.html`, copies privacy,
CSS, the presentation icon and selected images. The Pages workflow preserves a
`help.html` alias and syncs only `aem-cdn-toolkit-extension/` in the separate
`lollegp/lollegp.github.io` repository. It runs for relevant pushes to `main` or
manual dispatch, and needs the `PAGES_DEPLOY_TOKEN` Actions secret with write
access to the destination. Never embed that credential in code or logs.

Use [store release instructions](store/RELEASE.md) for listing copy, permissions,
manual checks and screenshots. Existing promotional previews are illustrative;
do not claim they show a new feature until actual screenshots are refreshed.
Local packaging does not publish the site or submit the Chrome Web Store ZIP.
