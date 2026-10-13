# Chrome Web Store release: 2.5.0

## Prepared locally

- Minimal Manifest V3 ZIP: `dist/aem-cdn-toolkit-2.5.0.zip`.
- Empty configuration on first install. No keys, organization domains or sample environments in the runtime package.
- Local help and privacy pages, plus a GitHub Pages build and manual deployment workflow.
- 128×128 store icon: `icons/toolkit-store-128.png`.
- 440×280 promotional tile: `docs/store/promo-440x280.png`.
- Development files, tests, sample configuration and original icon master files excluded from the ZIP.
- No remote executable code, content scripts, analytics, tracking or developer backend.
- Host access optional and requested for configured hosts; incognito disabled.

## Listing copy

**Name:** AEM CDN Toolkit

**Short description:** Manage AEM CDN cache, open authenticated publish pages and configure environment-specific page actions.

**Category:** Developer Tools

**Single purpose:** Help AEM developers and operators inspect publish pages and manage CDN cache for their explicitly configured AEM environments.

**Detailed description:**

AEM CDN Toolkit brings your configured AEM environments into the current page's Chrome popup.

- Create and reorder environments with public country mappings and a shared AEM publish origin.
- Recognize configured domains with a green toolbar indicator.
- Open authenticated publish pages in a new tab by default, or a new window per environment.
- Add a random cache-busting query parameter to the current page.
- Send soft or hard page purge requests. Enable full-environment purge explicitly where needed.
- Configure independent checkbox confirmation for page and full purge.
- Search local purge activity and inspect response status and request IDs.
- Import and export JSON configurations. Exports omit keys unless you explicitly include them.

Requires an AEM as a Cloud Service publish environment and suitable edge/purge keys. The extension does not provision AEM services or issue credentials. Configuration and activity are stored in your Chrome profile; requests go directly to your configured service. No analytics or developer backend. Independent community tool, not affiliated with or endorsed by Adobe or Google.

**Support:** https://github.com/lollegp/aem-cdn-toolkit-extension/issues

**Homepage after deployment:** https://lollegp.github.io/aem-cdn-toolkit-extension/

**Privacy URL after deployment:** https://lollegp.github.io/aem-cdn-toolkit-extension/privacy.html

## Privacy dashboard preparation

Reconcile all dashboard answers with `privacy.html` and the final package; do not mark every category “not collected” simply because processing is local.

The extension handles user-entered authentication keys, configured website URLs, current-tab URL context and local purge activity. Keys and relevant request URLs are transmitted only to user-configured HTTPS services to provide the requested action. No data is sent to the developer or sold, used for advertising, or transferred to data brokers. No remote code is executed.

Permission justifications:

- `activeTab`: inspect the page the user invokes the extension on, match it to a configured environment, and apply its page action.
- `storage`: persist environment settings, keys and up to 100 purge records locally; keep temporary publish-tab context in session storage.
- `declarativeNetRequestWithHostAccess`: attach the configured edge key and forwarded hostname only to the selected publish origin within created publish tabs. Remove rules on tab closure or credential/configuration cleanup.
- Optional `https://*/*`: support arbitrary user-configured AEM and public-site hosts. Runtime requests grant only explicit configured hosts; no all-sites host access is granted at install time. Chrome host patterns cover all ports of a granted hostname; actual matching and header rules use exact origins.

## Submission gates still requiring a human/browser

1. Review and approve the final privacy wording and support route. Deploy the site and verify its public HTTPS URLs return the expected content. No site or repository publication happened during this work.
2. Load the generated ZIP contents unpacked in a fresh Chrome profile. Confirm initial Settings is empty and the runtime has no errors.
3. Add an environment with disposable test keys and an authorized test endpoint. Verify optional host permission prompts, save, import/export without keys, opt-in key export, reorder, rename, discard, reset, and configuration persistence after browser restart.
4. Verify the actual popup and Settings layouts at narrow and wide sizes, keyboard-only navigation, dialog focus, screen-reader names, high-contrast mode, and scroll behavior of the sticky Save bar.
5. Verify publish opens in the same browser window as a new tab by default, and opens a new window only when selected and saved. Inspect requests: header rules must apply to the exact publish origin and tab, never another origin or lookalike. Include redirects, tabs closed during creation, and service-worker restarts.
6. Send page/full purge only to an authorized test environment. Verify request headers, no cookies, redirect rejection, response handling, checkbox confirmation, disabled full purge, timeout/unknown outcomes and activity retention. No live PURGE requests were sent during this review.
7. Capture at least one actual UI screenshot at 1280×800 or 640×400. Recommended: Settings setup, the matched-page popup, and filtered purge activity. Use fictional domains, no keys or private information. Screenshots are not supplied because isolated Chrome launch and the connected browser were unavailable in the review environment.
8. Upload the ZIP, store icon, promotional tile and actual screenshots to your developer dashboard. Complete account/publisher details and privacy disclosures, then submit for review. Chrome Web Store approval is not guaranteed by static checks or unit tests.

## Review findings and fixes

- Fixed configuration/credential snapshot mismatch that could send newly saved credentials to an old publish host.
- Fixed credential-clear and mid-save races that could reinstall removed header rules.
- Serialized all Settings writes in the worker and reject stale configuration snapshots.
- Revoked active publish access when keys or identity/mappings change.
- Disabled incognito in the manifest instead of only documenting it as unsupported.
- Omitted URL queries/fragments from new activity records and removed duplicate console logging.
- Distinguished a cancelled, unsent purge from an uncertain network outcome.
- Added unsaved-change protection and opt-in export of keys.
- Require the popup's reviewed target, mode and forwarded host to match the current saved action before sending.
- Serialize activity clearing and suppress completions of requests that were already in flight when history was cleared.
- Reorganized configuration into steps, separated full purge from page actions, added activity filters and an explicit publish destination label.

## Official references checked

- [Prepare an extension](https://developer.chrome.com/docs/webstore/prepare)
- [Store image requirements](https://developer.chrome.com/docs/webstore/images)
- [Privacy dashboard fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Incognito manifest setting](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)
