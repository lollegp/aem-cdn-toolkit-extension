# Changelog

## 2.8.0 — 2026-10-28

### Added

- Per-environment Standard Adobe CDN or BYO customer CDN setup. Standard purges mapped public domains without edge-key or forwarded-host headers and hides publish navigation.
- Optional BYO preview origin and separate edge/purge keys, with an explicit option to reuse publish keys.
- Publish/Preview selection on domain mappings. Navigation, page/full purge, tab context and activity follow the mapping service.
- Expandable response-body previews in purge activity, with JSON formatting, bounded capture and credential redaction. Incognito responses remain unsaved.

### Improved

- Compact program controls inside Settings above environments, with management actions in a dropdown.
- Popup program selector in the top-right header.
- Service labels in confirmations/activity and explicit full-purge service labels.
- Documentation, presentation website, privacy disclosures and store listing copy.

### Compatibility

- Existing environments default to BYO; mappings without a service default to Publish.
- Preview credentials never fall back to publish credentials unless reuse is explicitly enabled.
- Existing version 1/2 imports and version 3 program workspaces remain supported.
- Program duplication and key-free exports exclude preview credentials too.
- Saving Standard removes BYO origins and credentials, including preview configuration. Export a private backup before changing setup if those values must be retained.
- Full purge affects the complete selected AEM service. Preview full purge does not target Publish.

## 2.7.0

- Multiple programs with automatic URL detection across all programs.
- Independent program configuration and duplication without keys.
- Program filters and badges in purge activity.
- System, Light and Dark appearance, following computer settings by default.
