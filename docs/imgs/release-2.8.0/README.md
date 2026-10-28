# Version 2.8.0 browser captures

Captured from the loaded extension in isolated headless Chrome on 2026-10-28. All configuration and history are fictional; no AEM requests were sent and no credentials were configured.

- Settings, Manage and activity use real extension pages and local storage. Light/dark, System preference, activity status filtering, and absence of horizontal overflow at 390 px were checked.
- Popup captures use the real extension modules with a fictional `chrome.tabs.query` fixture for active-page context. They show Preview recognition and Standard mode navigation visibility, not native toolbar or live service validation.
- The 1280×800 Settings and activity captures are used on the presentation website. Other captures document layout checks.

Permission prompts, authenticated requests, native popup invocation, Incognito flows and upgrade behavior still require the checks in [the release guide](../../store/RELEASE.md).
