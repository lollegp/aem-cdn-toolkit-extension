# AI contributor guide

Read this file before changing the repository. It applies to the whole project.
Use [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for implementation details and
[docs/USAGE.md](docs/USAGE.md) for user-facing behavior. Source code and current
command output take precedence over stale documentation.

## Project and conventions

- AEM CDN Toolkit is a Chrome 120+ Manifest V3 extension for configured AEM
  publish access, CDN PURGE requests, and cache-parameter navigation.
- Runtime uses vanilla JavaScript ES modules, HTML and CSS. There is no frontend
  framework, bundler, runtime dependency, developer backend, or telemetry.
- Keep changes focused. Preserve unrelated edits and local tool files.
- Match existing ESLint/Prettier conventions. Write documentation, comments and
  commit messages in normal English. Keep chat replies concise in the user's
  language. If installed, apply the user's caveman skill in full mode at
  `/Users/lodraghi/.agents/skills/caveman/SKILL.md`.
- If the user invokes `/graphify`, read the installed
  `~/.Codex/skills/graphify/SKILL.md` before doing graphify work.

## Non-negotiable boundaries

- Keep bundled `config.json` empty: `{"version":2,"environments":[]}`. Never
  commit real keys, private hosts, customer exports or private browsing data.
- Preserve optional host grants, HTTPS validation, exact-origin/tab header
  scoping, and exact extension-page sender authorization in the worker.
- Validate actions again in the worker. Do not rely on popup controls for
  authorization, current URL, purge policy, confirmation or target checks.
- Preserve serialized configuration writes, expected-config conflict detection,
  credential cleanup and configuration/history epochs.
- Identify operations by program ID and environment together. Repeated
  environment names across programs must never mix keys, context or activity.
- Scan all programs for URL matches independently of Settings selection.
  Ambiguous matches require explicit selection; domain recognition alone does
  not authorize a page action.
- Duplicating programs excludes keys. Exports omit keys unless opted in.
- Never persist Incognito purge activity. Preserve publish browsing mode and
  open Settings/saved activity in a regular window.
- Treat log/configuration values as text, not HTML. Do not add remote scripts,
  `eval`, analytics or content scripts without an explicit scope decision.

## Workflow and validation

1. Inspect `git status --short`, relevant modules and existing tests first.
2. Change the shared behavior rather than adding UI-only workarounds. Add
   regression tests for meaningful behavior changes.
3. Run focused tests during development: `node --test tests/<name>.test.js`.
4. Before completion run `npm run check`; for releases run `npm run package`.
   Install pinned development dependencies with `npm ci` when needed.
5. Run `git diff --check`. Report exactly what passed and what remains untested.
   Node tests use Chrome/DOM fakes; they do not prove live browser behavior.
6. If unrelated local files break formatting, do not reformat or delete them.
   Identify the blocker and use a narrowly excluded check when appropriate,
   e.g. `npx prettier --check . '!.serena/**'`. Report that exclusion.

## Releases and publication

- Keep `manifest.json`, `package.json` and both root version fields in
  `package-lock.json` consistent. Configuration schema versions are separate.
- Update README, help, privacy, usage and store release documentation where
  behavior/version references change. Keep screenshot claims accurate.
- `scripts/package.py` owns the explicit runtime allowlist. Add new runtime
  modules/assets there or they will be absent from the store ZIP.
- Generated ZIPs, checksums and Pages files live in ignored `dist/`; do not edit
  generated files or manually include repository/tooling files in the ZIP.
- Pages publication runs from `main` and writes only the extension subdirectory
  of `lollegp/lollegp.github.io`. See the workflow and architecture guide.
- Commit, push, merge, deploy and store submission require user authorization.
  A push to `main` can trigger the existing Pages deployment automatically.
- Do not claim a release is store-approved, publicly deployed or visually tested
  based only on local checks. See [docs/store/RELEASE.md](docs/store/RELEASE.md).
