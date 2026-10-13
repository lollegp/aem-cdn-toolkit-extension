# AEM CDN Toolkit — session handoff

Saved: 2026-10-13. Read this file when resuming from another folder.

## Project and published state

- Project: Chrome Manifest V3 extension for AEM CDN purge, authenticated publish access, country mappings and cache-busting query parameters.
- Original working directory: `/Users/lodraghi/Downloads/aem-cdn-toolkit`.
- GitHub repository: https://github.com/lollegp/aem-cdn-toolkit-extension
- SSH remote: `git@github.com:lollegp/aem-cdn-toolkit-extension.git`
- Branch: `main`.
- Latest committed/pushed version: **2.5.0**.
- Commit: `73a80b9a825481291207cef6777b4e1eb54aee0d`.
- Commit URL: https://github.com/lollegp/aem-cdn-toolkit-extension/commit/73a80b9a825481291207cef6777b4e1eb54aee0d
- Commit subject: `feat: prepare v2.5 for Chrome Web Store review`.
- All 51 uploaded repository files were verified against local Git blob hashes before advancing `main`.
- Publication used the GitHub connector. The original local `.git` is an unborn `main`, has no remote, and contains staged icon files. It is NOT a normal checkout of the published history. Do not treat local git status as a diff against the remote.
- Best way to resume in another folder: clone the GitHub repository, verify the latest commit, then read this handoff. Preserve any newer remote or local changes.
- This handoff was created after the commit above; it has not been committed or pushed.

## User preferences and authorization

- User explicitly said: **do not commit automatically**. Commit/push only when explicitly requested. The last `commit and push` request was fulfilled; it does not authorize future commits.
- Keep replies concise, in English. User's AGENTS instructions select caveman full mode at `/Users/lodraghi/.agents/skills/caveman/SKILL.md`; comments, docs and commit messages use normal prose.
- User requested a complete UX/UI and code review to prepare for Chrome Web Store publication.
- User also requested a GitHub Pages site. Site, privacy policy and manual deployment workflow are prepared and committed, but the site has NOT been deployed.
- No extension submission, marketplace publication or live PURGE request has occurred.

## Completed functionality

- Arbitrary named environments: add, rename, remove, reorder using arrow buttons. Names are unique ignoring case; empty environment lists supported.
- Reordering saves immediately and preserves selected environment and unsaved form edits.
- New environments have full purge disabled. PROD can enable full purge explicitly; no permanent PROD block.
- Separate page/full purge confirmation flags. Checkbox confirmation only; typed confirmation removed.
- Publish opening mode per environment: `publishOpenMode: "tab"` by default, or `"window"`.
- Toolbar green dot on configured public/publish domains; matching uses exact origins.
- Settings and Purge activity are separate tabs within one options page, with dedicated popup buttons and hash routes.
- Reset configuration saves an empty configuration, clears saved keys and active publish headers; activity retained. Reset can recover invalid stored configuration.
- Clear saved keys removes keys from all environments and active publish context/rules, retaining mappings/settings/activity.
- Export omits keys by default; user can explicitly opt in to exporting keys.
- Fresh installs use empty `config.json`. `config.example.json` is an optional generic template, excluded from release ZIP.
- Four-step Settings layout, teal styling, sticky Save bar, discard control, unsaved-change warnings, responsive controls and accessible dropdown/reorder arrows.
- Import/export/reset stay at bottom of Settings. Credential maintenance is expandable.
- Popup separates page actions from full purge; publish button states tab/window destination.
- Activity icons: succeeded ✅, failed ❌, pending ⏳, unknown ⚠️, accepted 📨. Bold field labels, search and status filters.

## Code-review fixes

- `loadSecrets(config)` uses the same validated config snapshot as the request target; prevents new keys going to an old publish host.
- All Settings writes go through trusted worker `saveConfiguration` messages with `expectedConfig` compare and a serialized mutation queue. Stale Settings tabs cannot silently overwrite newer settings or restore removed keys.
- Configuration epoch invalidation prevents pending publish/purge work from using cleared/replaced credentials, including operations started during a save.
- Changing credential identity or mappings clears publish rules/context automatically.
- Popup sends `expectedTarget`, `expectedMode`, and `expectedForwardedHost`. Worker rejects changed or missing descriptors before publish/purge, so stale confirmations cannot silently use a new target/mode.
- Activity clearing is serialized through the worker; earlier in-flight completions cannot restore deleted history.
- New purge activity records persist origin/path only, excluding query strings and fragments. Actual requests still use intended queries. Old history may contain queries; privacy page explains clearing it.
- No duplicate console logging of purge records.
- Unsent cancelled purges are distinguished from uncertain network outcomes.
- Manifest explicitly disables incognito (`not_allowed`).
- Purge fetch uses HTTPS, redirect rejection, no cookies, no cache and a 25-second timeout. Request-header rules are scoped to a specific publish origin and tab.

## Files and architecture

- `core.js`: validation/migration, URL mapping, purge policy and construction, permission hosts, header rules, response classification, safe export.
- `storage.js`: config/secret loading, storage access restriction.
- `background.js`: trusted messaging, serialized config/history mutations, publish setup/cleanup, purge requests, generation guards.
- `activation.js`: domain matching and toolbar status.
- `options.html`, `options.js`: Settings.
- `popup.html`, `popup.js`: current-page actions and confirmations.
- `sections.js`: accessible Settings/Activity tab routing.
- `activity.js`: local activity rendering, filtering and clearing.
- `styles.css`: extension UI.
- `help.html`, `privacy.html`, `site.css`: packaged help/privacy and public site sources.
- `.github/workflows/pages.yml`: manually dispatched GitHub Pages deployment (no push trigger).
- `scripts/package.py`: explicit runtime allowlist, empty config and permission checks, ZIP content verification, checksum and Pages artifact build.
- `docs/store/RELEASE.md`: listing copy, permission/privacy guidance, review findings and remaining submission checklist.
- `tests/configuration-races.test.js`: snapshot, credential-clear, mid-save, stale-write, stale-target and activity-clear regressions.

## Verification and artifacts

Latest `npm run package` passed:

- ESLint with zero warnings.
- Prettier formatting check.
- **112 tests passed, zero failures**.
- Release ZIP: **26 files**, contents verified byte-for-byte against source.
- HTML IDs, label references, controller IDs and local assets checked.
- No organization references in publishable text; release config empty; example config has fictional domains and blank keys.

Commands from a normal checkout:

```sh
npm ci
npm run check
npm run package
```

Python 3 is required for packaging; no Python dependencies. Node tooling is pinned in package-lock.json. No runtime npm dependencies.

Original generated artifacts (ignored by Git; regenerate in a new checkout):

- `/Users/lodraghi/Downloads/aem-cdn-toolkit/dist/aem-cdn-toolkit-2.5.0.zip`
- SHA-256: `3b0e8c1f911bd457375325a726c120e1f2270a4aa58ca9a2b21bb1fd909eb84e`
- `/Users/lodraghi/Downloads/aem-cdn-toolkit/dist/site/`
- Store icon: `icons/toolkit-neutral-128.png` (updated artwork).
- Promotional tile: removed with the old artwork; a new 440×280 tile is still required.

## Outstanding release work

Do not call this already published or fully browser-verified.

1. Perform live Chrome UI and runtime verification using `docs/store/RELEASE.md`.
2. Check publish tab/window behavior in real Chrome. User previously reported always opening a window. Source and mocked tests select the correct mode, but actual loaded Chrome state could not be inspected. Reload/reopen instructions were given; live cause remains unconfirmed.
3. Verify actual DNR header behavior, redirects, tab closure, permissions, worker restart and authorized test-environment purge. No live purge was sent in this session.
4. Capture actual store screenshots (1280×800 or 640×400). Do not use fake UI screenshots or expose keys/private URLs.
5. Review privacy/support wording and deploy GitHub Pages when authorized. In repository Settings → Pages, select GitHub Actions, then run **Publish help and privacy site**.
6. Expected public URLs after deployment:
   - https://lollegp.github.io/aem-cdn-toolkit-extension/
   - https://lollegp.github.io/aem-cdn-toolkit-extension/privacy.html
7. Fill Chrome Web Store developer account, listing and privacy disclosures; upload the ZIP, icon, promo and actual screenshots. Submit only when requested.

Support link in prepared pages: https://github.com/lollegp/aem-cdn-toolkit-extension/issues

## Environment limitations and cautions

- Connected Chrome inspection failed: `failed to start codex app-server: No such file or directory (os error 2)`.
- Isolated Playwright Chromium launch also failed. Do not claim browser rendering or actual Chrome behavior was verified by mocked tests.
- A prior broad native-window screenshot was automatically rejected because it could include unrelated private tabs. Use scoped extension surfaces only.
- SSH GitHub access previously failed DNS. GitHub connector worked for commits and pushes. Recheck capabilities in the new folder rather than assuming the same limitations.
- Initial credential-bearing configs were privately backed up outside the repo under `/private/tmp/aem-cdn-private-config-pnw1xp9j`. Never publish them or print their keys. They are not part of the release or this handoff.
- `dist/`, node_modules, local config overrides and icon master source PNGs were excluded from the published file set. Do not blindly stage everything in the original unborn Git checkout.

## Suggested first action after resuming

Verify the cloned checkout against commit `73a80b9a825481291207cef6777b4e1eb54aee0d`, run `npm ci` and `npm run package`, then continue with the user's next instruction. If continuing release preparation, prioritize actual Chrome validation and screenshots before claiming store readiness.

## Icon cleanup after resuming

- Resumed in `/Users/lodraghi/WorkingSpace/Projects/Personal/aem-cdn-toolkit-extension`.
- Preserved the user-updated neutral/green PNGs and master images.
- Manifest now uses the updated neutral 128px icon. Removed the old store icon, promotional tile and SVG chevron; dropdown arrows are drawn with CSS.
- Removed the obsolete icon/artwork generators to prevent restoring the old design or overwriting the updated icons.
- Packaging excludes the removed assets. Previous ZIP counts and checksum above describe the earlier build.
- These cleanup changes have not been committed or pushed.
