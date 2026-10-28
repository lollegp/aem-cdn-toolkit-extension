# Chrome Web Store release: 2.8.0

## Release artifacts

- Upload: `dist/aem-cdn-toolkit-2.8.0.zip`.
- Integrity checksum: `dist/aem-cdn-toolkit-2.8.0.zip.sha256`.
- Public website build: `dist/site/`.
- Store icon: `icons/toolkit-neutral-128.png`.
- Promotional tile: `docs/imgs/promo_tile_440x280.png`.
- Release notes: [CHANGELOG.md](../../CHANGELOG.md).

The runtime package starts with empty configuration and contains no development tools, tests, customer configuration or keys. Current Settings and activity screenshots are in `docs/imgs/release-2.8.0/`, captured in isolated Chrome with fictional data. Older promotional images remain illustrative. See the screenshot directory README for verification scope.

## What is new

- Standard Adobe CDN support for domains mapped in Cloud Manager. Purge targets the final public domain and requires a purge key, without edge-key or forwarded-host headers.
- BYO preview support with a separate origin and keys, or explicit publish-key reuse. Domain mappings select Publish or Preview; actions follow that selection.
- Expandable response-body previews in activity, with JSON formatting, size limits and credential redaction. Incognito requests remain excluded from saved activity.
- Compact program controls above environments in Settings and at the top-right of the popup.

Existing environments remain BYO and existing mappings remain Publish. Program import/export and key-clearing behavior cover both services. Switching to Standard clears BYO origins and credentials; preview full purge targets only Preview. See the changelog and usage guide for migration details.

## Store listing copy

**Name:** AEM CDN Toolkit

**Short description:** Manage AEM CDN cache across programs, Standard and BYO setups, with publish/preview access and purge response logs.

**Category:** Developer Tools

**Single purpose:** Help AEM developers and operators manage CDN cache and access their configured AEM publish and preview services.

**Detailed description:**

AEM CDN Toolkit brings configured AEM programs and environments into your Chrome toolbar.

- Choose Standard Adobe CDN for Cloud Manager domains or BYO customer CDN per environment.
- Manage multiple programs with independent environments, country mappings and credentials.
- Detect matching programs automatically from the current URL, regardless of the last Settings selection.
- In BYO mode, map domains to Publish or Preview and open the selected service with scoped authentication headers.
- Configure separate preview keys or explicitly reuse publish credentials.
- Send soft or hard page purge requests. Enable full-service purge explicitly where needed, with independent confirmation controls.
- Add a random cache-busting query parameter to the current page.
- Filter local purge activity by program and status. Inspect service labels, request IDs and expandable response previews.
- Use System, Light or Dark appearance.
- Import/export program configurations and duplicate setups without keys.

Requires configured AEM as a Cloud Service endpoints and a purge key for purge operations. BYO authenticated access also requires an edge key. The extension does not provision AEM services or issue credentials. Full purge applies to the selected AEM service, not just a country or domain. It does not purge Dispatcher or a separate customer CDN.

Configuration and up to 100 activity records stay in your Chrome profile. Requests go directly to your configured services. There is no analytics or developer backend. Incognito requires Chrome's Allow in Incognito setting; its purge activity is not saved. Independent community tool, not affiliated with or endorsed by Adobe or Google.

**Support:** https://github.com/lollegp/aem-cdn-toolkit-extension/issues

**Homepage:** https://lollegp.github.io/aem-cdn-toolkit-extension/

**Privacy:** https://lollegp.github.io/aem-cdn-toolkit-extension/privacy.html

## Privacy and permissions

Reconcile dashboard answers with [privacy.html](../../privacy.html). The extension handles authentication keys, configured URLs, invoked-tab URL context and local activity, including bounded response previews. Known request keys and JSON credential fields are redacted; other information returned by a service may remain. No data is sent to the developer, sold or used for advertising. Saved keys are plaintext extension storage.

- `activeTab`: inspect the invoked tab and match it to a configured program, environment and service.
- `storage`: persist program/environment settings, appearance, keys and up to 100 activity records; retain temporary service-tab context in session storage.
- `declarativeNetRequestWithHostAccess`: apply BYO authentication headers only to the created tab and exact configured publish/preview origin. Remove rules on tab closure or credential cleanup. Standard mode installs no navigation headers.
- Optional `https://*/*`: request access only to explicitly configured hosts at runtime. No all-sites host access is granted at installation.

## Local verification

Run `npm run package` to check lint, formatting and tests, build the allowlisted ZIP and verify its contents byte-for-byte. Confirm all release metadata versions agree and the bundled configuration is empty. Keep unrelated local files outside the package. If an unrelated tool directory prevents formatting checks, document any narrow exclusion and run the remaining checks plus `python3 scripts/package.py` explicitly.

Automated tests use synthetic credentials and browser API fakes; they send no real AEM purge requests. They cover Standard/BYO routing, preview key selection and service targets, program matching, confirmation rules, imports/exports, response previews, activity, Incognito exclusions and credential races.

Release preparation also exercised the loaded extension in isolated headless Chrome: Settings program placement, Manage bounds, 390 px layout without horizontal overflow, explicit dark mode and System light/dark, activity response rendering and status filtering. Popup Preview selection and Standard navigation visibility were checked using a fictional active-tab fixture. These checks do not establish live AEM request, native popup, permission prompt or Incognito behavior.

Local lint, tests and packaging run separately because unrelated `.serena/project.yml` fails the repository-wide formatter. Formatting excludes only `.serena/**`; that directory is neither committed nor packaged.

## Before submission

1. Load the ZIP contents unpacked in Chrome. Check a fresh installation and an upgrade with existing configurations.
2. Verify Standard public-path preservation, purge-key-only requests and absence of publish navigation against an authorized test endpoint.
3. Verify BYO Publish and Preview navigation, separate keys, shared-key opt-in, exact-origin/tab header scoping and rejection of cross-service mappings. Preview full purge must not target Publish.
4. Check popup and Settings at narrow/wide sizes, both themes, keyboard navigation and the Manage dropdown. Confirm program controls appear only inside the Settings tab on the management page.
5. Verify permission prompts, configuration persistence, import/export, duplicate-without-keys, credential clearing and stale-save protection.
6. Check response previews for success, failure, empty/text/JSON responses, truncation and credential redaction. Confirm clearing history deletes previews.
7. Test Incognito Publish/Preview tabs and windows, including session cleanup. Purge outcomes must not enter persistent history; Settings/activity open in a regular window.
8. Capture current screenshots with fictional hosts and no credentials. Existing promotional previews do not establish current browser verification.
9. Deploy and verify the updated public help/privacy pages before submitting the ZIP and listing. The existing workflow deploys relevant changes pushed to `main` using `PAGES_DEPLOY_TOKEN`; local packaging does not deploy anything.
10. Upload the ZIP and assets in the Chrome Web Store dashboard, review disclosures and submit. Store approval is a separate process.

## Official references

- [Adobe CDN purge](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-cache-purge)
- [Adobe CDN credentials](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-credentials-authentication)
- [Adobe BYO CDN and preview support](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn)
- [Prepare a Chrome extension](https://developer.chrome.com/docs/webstore/prepare)
- [Chrome Web Store images](https://developer.chrome.com/docs/webstore/images)
- [Privacy dashboard](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
