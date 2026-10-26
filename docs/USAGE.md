# AEM CDN Toolkit — usage reference

[Back to the project overview](../README.md) · [Help page](../help.html)

## Installation and update

1. Clone this repository or extract its ZIP archive.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the extension folder containing `manifest.json`.
4. If updating an existing installation, replace its source files (including the `icons` folder), press **Reload** on the extension card, then close and reopen Settings and any popup already open.
5. Open the extension options from its Details page, then save environments to grant access to configured domains.
6. Pin the extension. Its icon displays a green dot on configured public and publish domains. The popup remains accessible on every tab so you can always open Settings.

Existing version 1 configurations are migrated when each environment has one publish origin. Country labels are initially generated as SITE1, SITE2 and so on. Rename them to your country codes. Generic CDN API settings are replaced by the direct AEM CDN integration. Keys can now be configured directly at environment level in JSON and remain available after restart.

## Programs, appearance and activity

Settings opens with the selected program. Existing configurations appear under **Default**. Use **Add program**, **Rename**, **Duplicate without keys**, or **Delete program** to manage independent configurations. Every program contains its own environments, mappings, credentials and purge policies. Environment names must be unique within a program. Keep at least one program.

The toolbar and popup scan URLs across all programs, independently of the last Settings selection. Unique matches select the program automatically. Overlapping matches require an explicit program or environment choice before page actions. Publish context and purge activity retain program identity.

Choose **System**, **Light** or **Dark** under **Appearance**. System is the default and follows computer settings. Changes save automatically and apply to Settings and the popup.

In **Purge activity**, combine **Program**, **Status** and search filters. Program badges identify every request; old logs appear under Default. Programs with recorded activity remain available in the filter even if their configuration was deleted. The filter retains its selection during refresh while that program has records.

Import, export, reset and saved-key clearing apply across all programs. Older version 1 and 2 imports are accepted as Default; multi-program exports use version 3. Import replaces the complete configuration rather than merging programs.

## Incognito browsing

Open `chrome://extensions`, select **Details** for AEM CDN Toolkit, and turn on **Allow in Incognito**. Reload the extension first when upgrading an unpacked installation. Chrome requires this opt-in; the extension cannot enable it for you.

Environments, saved keys and preferences are shared with regular browsing. Page actions work in incognito, and authenticated publish tabs or windows keep the source page's browsing mode. Purge requests still go to the configured AEM service with its required credentials.

Incognito purge attempts are never saved to persistent activity history, including success, failure and unknown outcomes. Read the result in the popup before closing it. Settings and saved activity open in a regular window. Publish tab context stays in session memory and its header rules are removed when the tab closes. Settings changes and credential clearing apply across both browsing modes.

## Environment and country settings

Fresh installations start with no environments. The list is configurable, with no fixed count or required names. DEV, DEV2, TEST, STAGE and PROD are examples in the optional config.example.json template. Each environment has one publish origin and its countries share the environment edge key and purge key.

In Settings, use **Add environment** to create an environment with a unique name. Configure its publish URL, country mappings, keys and purge settings, then save. Edit **Environment name** and save to rename it. Names are trimmed and must be unique regardless of case. **Remove environment** removes its saved mappings and keys after confirmation. Renaming or removing an environment clears active publish headers; reopen publish windows afterward. Activity records retain their original environment labels. You can remove every environment and add new ones later.

Use the **up and down arrow buttons** beside the Settings environment dropdown to reorder the selected environment. Order is saved immediately and included in exported configurations. Unsaved field edits remain intact.

New custom environments start with full purge disabled and both confirmations off. JSON imports may contain any number of environments, including an empty list. The existing one-megabyte import size limit still applies.

| Setting                        | Scope       | Purpose                                                                                                            |
| :----------------------------- | :---------- | :----------------------------------------------------------------------------------------------------------------- |
| Publish URL                    | Environment | AEM service origin, for example `https://publish-p123456-e123456.adobeaemcloud.com/`                               |
| X-AEM-Edge-Key                 | Environment | Used for publish navigation and purge requests                                                                     |
| X-AEM-Purge-Key                | Environment | Used only for purge requests                                                                                       |
| Page purge mode                | Environment | Soft or hard, with soft as the default                                                                             |
| Enable full environment purge  | Environment | Controls the full purge action; disabled for newly created custom environments                                     |
| Confirm page purge             | Environment | Requires confirmation for current-page purge only; disabled by default                                             |
| Confirm full environment purge | Environment | Requires a confirmation checkbox for full purge only; disabled by default                                          |
| Random cache parameter         | Environment | Query parameter name using letters, numbers, underscores, dots or hyphens, for example `_cacheBust` or `cache-key` |
| Country code                   | Country     | Unique label such as GB, IE or US                                                                                  |
| Public URL                     | Country     | Public site origin, optionally with a path prefix                                                                  |
| Publish path prefix            | Country     | Optional replacement for the public URL prefix; normally `/`                                                       |

Different environments must use different publish origins. This keeps purge targets and per-environment settings unambiguous.

Add your own environments in Settings, or adapt `config.example.json` as an import template, replacing its fictional `.example.invalid` URLs. Release config.json must stay empty. Save each environment before switching. Switching environments warns about unsaved edits; Discard changes restores the saved values. Closing Settings also warns when edits are pending. Saving requests optional domain access for the configured public hosts and publish host.

To import, select **Import JSON**, choose a file, then select **Import** in the confirmation dialog and grant access to its configured domains. The extension clears active publish headers before saving the replacement configuration. Errors appear inside the dialog so you can retry. Invalid files, denied domain access, and failed header cleanup leave the saved configuration unchanged. Cancel or Escape discards the pending import; cancellation is blocked while an import is running.

Version 2.2 fixes the **Unable to clear session keys.** import error caused by the background handler rejecting Settings messages when Settings was opened in a browser tab. If an old Settings page still shows that error after an update, reload the extension in `chrome://extensions`, close Settings, and reopen it before importing again. A missing background response now displays explicit reload instructions.

Example environment configuration, with both public sites mapped to one publish origin:

```json
{
  "name": "DEV",
  "publishUrl": "https://publish-dev.example.invalid/",
  "edgeKey": "YOUR_DEV_EDGE_KEY",
  "purgeKey": "YOUR_DEV_PURGE_KEY",
  "countries": [
    {
      "code": "GB",
      "publicBaseUrl": "https://dev-gb.example.invalid/",
      "publishPathPrefix": "/"
    },
    {
      "code": "US",
      "publicBaseUrl": "https://dev-us.example.invalid/",
      "publishPathPrefix": "/"
    }
  ],
  "cacheParam": "_cacheBust",
  "purgeMode": "soft",
  "fullPurgeEnabled": true,
  "confirmPagePurge": false,
  "confirmFullPurge": false
}
```

Public URL path prefixes are matched at path boundaries. The most specific prefix wins. A prefix can map a public path such as `/it/ports` to `/content/b2c/it/it/ports` when the public base ends in `/it` and the publish prefix is `/content/b2c/it/it`.

The extension preserves the path, query and fragment when opening publish. It does not append `.html` automatically. Configure prefixes only when the actual publish routing requires them.

## Toolbar status and page actions

The toolbar displays a green dot when the current tab uses an exact configured HTTPS public or publish origin, including its port. Domain recognition covers all paths on that origin. The tooltip lists the matching environments. A neutral dot indicates an unmatched or unsupported URL, unavailable domain access, or invalid configuration. A green dot confirms a configured domain; it does not validate credentials or CDN connectivity.

Grant access to configured hosts by saving or importing in Settings first. The extension uses those host grants to read matching tab URLs and requests no global browsing permission. Navigation, tab switching, configuration changes, domain permission changes, and worker startup refresh the toolbar state.

Click the icon on any tab to open the popup and access Settings. Page actions are disabled until the current URL resolves to a valid country mapping. Public path prefixes still match at path boundaries, so a page outside its configured prefix can have a green dot while its actions remain disabled. A unique environment and public country are selected automatically. Multiple matching environments require an explicit environment selection; a manually opened publish URL requires an explicit country selection.

## Automatic forwarded host

`X-Forwarded-Host` is generated from the public site's **host**, for example `www.example.invalid`. It contains no `https://`, path, query or fragment. A nondefault port is included when present.

When opening publish, the extension remembers the environment, country and public host for that tab in session storage. Subsequent actions in that shared publish tab use the remembered country. Switching its country is blocked to prevent mixing the original navigation headers with another public host.

If you open a publish URL manually, select its country explicitly because the shared publish origin alone cannot identify the public country site. A manually opened tab does not receive navigation headers automatically; use **Open AEM publish** to create a tab with headers installed.

If a public page has no mapping, or its selected country does not match the actual URL, the action is rejected. Reopen the popup when the current page changes.

## Open AEM publish

Select **Open AEM publish**. The extension opens a new tab by default. In Settings, choose **Open publish page in** for each environment and save to use a new window instead. Both modes install scoped request header rules and save the country context before navigating to publish. Existing configurations default to a new tab.

Publish requests contain:

```http
X-AEM-Edge-Key: <environment edge key>
X-Forwarded-Host: <public site host>
```

The purge key is never attached to navigation requests. Header rules apply only to the new tab and the exact publish origin. They also cover scripts, styles, images and API requests in that tab when served by the same publish origin. External origins, other ports and other tabs do not inherit the rules.

Closing the tab removes its headers and country context. Changing credentials or mappings clears active publish rules and context. Reopen publish through the extension to apply the saved settings.

## Purge current page

Select **Purge current page** to send the request immediately. Confirmation is disabled by default. If **Confirm page purge** is enabled for the selected environment, review the environment, country, target URL and mode, check the confirmation box and select **Send PURGE request**.

The extension sends a direct request to the AEM publish service:

```http
PURGE https://publish-p123456-e123456.adobeaemcloud.com/resource-path
X-AEM-Purge-Key: <environment purge key>
X-AEM-Edge-Key: <environment edge key>
X-Forwarded-Host: <public site host>
X-AEM-Purge: soft
```

There is no request body. The random cache parameter and fragment are removed; all other query parameters are retained. Hard page purge can be selected in environment settings. No page configuration can set the mode to `all`.

The edge key and purge key must already be configured in your AEM CDN authentication rules. This extension consumes those credentials; it does not create or deploy CDN rules.

## Purge entire environment

**Purge entire environment** is available only when **Enable full environment purge** is selected in that environment's Settings. The optional example template enables it for DEV, DEV2, TEST and STAGE and disables it for PROD; fresh installations contain no environments. Newly created custom environments start with it disabled. It uses one request to the publish origin root:

```http
PURGE https://publish-p123456-e123456.adobeaemcloud.com/
X-AEM-Purge-Key: <environment purge key>
X-AEM-Edge-Key: <environment edge key>
X-Forwarded-Host: <current public site host>
X-AEM-Purge: all
```

This is Adobe's full service purge, covering all cached resources in the selected AEM environment, including its countries. It is not a loop over known pages or country domains. The forwarded host comes from the current public country context, while the full purge scope belongs to the AEM service.

With confirmation disabled, selecting the full purge action sends the request immediately. With **Confirm full environment purge** enabled, the popup requires a checked confirmation box before sending.

PROD full purge can be enabled explicitly in PROD Settings. A disabled full purge action is hidden in the popup, and the background handler rejects the request using the saved environment policy before any network call. Current page purge remains available regardless of the full purge setting.

Availability and both confirmation settings are independent for each environment and persist through saving, importing, exporting and restart. JSON uses the boolean fields `fullPurgeEnabled`, `confirmPagePurge` and `confirmFullPurge`. The legacy `confirmPurge` field migrates to both confirmation settings; explicit scope-specific values take precedence. Missing confirmation settings default to false. Legacy starter environments retain their full-purge defaults; custom names without a full-purge setting default to disabled. The background reads the saved policy for every action, so a stale popup cannot bypass newly enabled confirmation or a disabled full purge.

## Purge activity and console

The popup has separate **Settings** and **Purge activity** buttons. They open the corresponding tab within the same options page (`options.html#settings` or `options.html#activity`). The tabs support arrow-key navigation and direct links. The Settings tab contains configuration controls; the Purge activity tab has its own **Refresh activity** and **Clear activity** actions. Activity remains accessible if the configuration fails to load.

Open **Purge activity** to see the latest 100 requests. The list updates when new results arrive and retains:

1. Start and finish timestamps.
2. Environment and country.
3. Page or entire environment scope and purge mode.
4. Publish target and forwarded public host.
5. HTTP status and provider request ID when supplied.
6. A local request ID and outcome.

| State     | Meaning                                                                         |
| :-------- | :------------------------------------------------------------------------------ |
| PENDING   | The request has started                                                         |
| SUCCEEDED | AEM returned a successful HTTP response with JSON `status: ok`                  |
| ACCEPTED  | HTTP was successful, but the response did not confirm `status: ok`              |
| FAILED    | HTTP failed or the JSON response reported a failure                             |
| UNKNOWN   | A network error, timeout or interrupted request prevents confirming the outcome |

These states describe the API response. The extension does not poll a separate CDN completion endpoint or verify every cache location. A pending request older than 30 seconds is displayed as an interrupted request with an unknown outcome.

Requests time out after 25 seconds and are never retried automatically. Only one purge at a time can run per environment in the active worker. Verify the result before retrying an unknown outcome, because the provider might already have processed the request.

Use **Purge activity** to inspect request results and clear local history. New records store the target origin and path without query strings or fragments. Older records may contain query strings; clear activity to remove them. Credentials and raw response bodies are not included in activity records.

## Random cache parameter

**Add random cache parameter** updates the current tab with a new UUID value and replaces any previous occurrences of that parameter. Other parameters and the fragment are preserved.

Its effectiveness depends on the CDN cache key or bypass configuration. It modifies the page URL only, not every script, image or API URL. It does not clear the browser cache.

## Credential handling and permissions

Environment settings, including `edgeKey` and `purgeKey`, are stored locally and remain available after restart. On a fresh installation, the extension loads the empty bundled `config.json`. A configuration imported or saved in Settings takes precedence over the bundled file. **Reset configuration** deletes all saved environments, mappings and keys and clears active publish headers after confirmation. It saves an empty configuration, so bundled examples do not return after restart. Activity logs remain. Export your configuration before resetting if you want a backup. Key values in JSON and local extension storage are plaintext, not an encrypted vault.

Imports can contain environment keys. Exports omit keys by default; select Include saved keys for a private credential backup. Treat configuration files as credentials. Imports clear active publish rules and load the keys from the imported configuration. **Clear saved keys and active headers** saves empty keys in the local configuration and removes active request header rules and saved publish country contexts. It does not modify the bundled file. Keys remain excluded from console logs and purge activity.

The extension requests `activeTab`, `storage` and `declarativeNetRequestWithHostAccess`, with optional HTTPS host access. There are no content scripts or remote scripts. HTTP and redirecting purge endpoints are unsupported.

This integration purges the Adobe AEM CDN. It does not purge a separate customer CDN, and it does not invalidate the Dispatcher cache. Ensure that the Dispatcher can supply updated content before purging the Adobe CDN.

## Tests and validation

Run from the extension folder with Node 20 or later. The extension has no runtime dependencies; development dependencies provide linting and formatting.

```bash
npm ci
npm run check
```

`npm run check` runs ESLint, verifies formatting with Prettier, and runs the complete test suite. Use `npm run lint:fix` and `npm run format` to apply lint fixes and formatting, or `npm test` to run tests alone. Development tool versions and their dependency tree are pinned in `package-lock.json`.

The test suite covers configurable environment lists, environment creation/rename/removal, separate confirmation policies and legacy migration, direct section links, activity rendering, credential-clearing race protection, optional confirmation, explicit PROD full purge, duplicate-click prevention, import failures, hyphenated cache parameters, trusted Settings-tab messages, packaged PNG icons, toolbar updates, synchronous worker listeners, country mapping, shared publish contexts, header scoping, purge construction, response tracking, secret exclusion, and migration. Options and popup tests use a simulated DOM; background and activation tests mock browser APIs and network calls.

The automated suite uses synthetic credentials and sends no real AEM purge requests. Native browser rendering is a separate verification step. After configuration, validate page purge and publish access in DEV before using other environments.

The PNG icons are packaged with the extension and require no build step. When updating artwork, export both neutral and green variants at 16, 32, 48 and 128 pixels. Master images are excluded from the release ZIP. The manifest uses the neutral 128px image for the extension icon.

## Official references

1. [Adobe CDN purge API](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-cache-purge)
2. [Adobe CDN credentials and authentication](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-credentials-authentication)
3. [Adobe CDN purge tutorial and response formats](https://experienceleague.adobe.com/en/docs/experience-manager-learn/cloud-service/caching/how-to/purge-cache)
4. [Chrome declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

## Release package and website

Run `npm run package` to verify the project and build `dist/aem-cdn-toolkit-2.7.0.zip`. The builder uses an explicit file list, requires empty release configuration, checks permissions and module inclusion, verifies ZIP contents byte-for-byte, and writes a SHA-256 checksum. It also builds `dist/site` for GitHub Pages. Python 3 is required; no Python packages are needed.

The bundled [help page](../help.html) and [privacy policy](../privacy.html) also form the public site at https://lollegp.github.io/aem-cdn-toolkit-extension/.

### Automatic website publishing

[Publish help and privacy site](../.github/workflows/pages.yml) runs on pushes to `main` that change `help.html`, `privacy.html`, `site.css`, the site icon, `docs/imgs/**`, the package builder or the workflow itself. It also supports **Run workflow** on `main` for the first deployment or retries.

One-time setup:

1. Create a fine-grained personal access token owned by `lollegp`, restricted to **lollegp/lollegp.github.io**, with repository **Contents: Read and write** permission. Set an expiration and renew the secret before it expires.
2. In the **aem-cdn-toolkit-extension** repository, open **Settings → Secrets and variables → Actions** and add the token as **PAGES_DEPLOY_TOKEN**. Never put the token in the repository or a workflow input.
3. In **lollegp.github.io → Settings → Pages**, use **Deploy from a branch**, branch **main**, folder **/ (root)**. The token owner must have permission to push to `main`; any branch rules must permit these updates.
4. After the workflow has been committed and pushed to this repository, run **Publish help and privacy site** once or push a matching page change. Check the sync run here and the Pages build in `lollegp.github.io`.

The workflow builds the site and synchronizes only `aem-cdn-toolkit-extension/` in the destination repository, including styles, images and the icon. It maintains both `index.html` and `help.html`, removes obsolete files inside that managed folder, and leaves sibling projects unchanged. It skips empty commits and never force-pushes. If another destination change causes a push rejection, rerun the workflow to check out the latest destination first. Runs always build the latest source `main`, including when retrying an older run.

The default `GITHUB_TOKEN` cannot write to the other repository; pushes made with that token also do not trigger branch-based Pages builds. See [checkout authentication](https://github.com/actions/checkout#checkout-multiple-repos-private) and [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The workflow uses the separate token for the destination checkout and push.

This replaces deployment from the extension repository's own Pages environment. Website sync does not submit or publish the Chrome extension.

See [store listing and release checklist](store/RELEASE.md). Creating the ZIP does not publish the site or submit the extension. Live Chrome behavior and screenshots still require the documented manual checks.

Configuration writes are serialized in the background worker and compare the expected saved configuration, so a stale Settings tab cannot silently overwrite newer data. Credential or mapping changes clear publish session state; pending actions are invalidated if configuration changes. New activity records omit query strings and fragments; older records can be removed with Clear activity.
