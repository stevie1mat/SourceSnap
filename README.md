# SourceSnap

WebSource Sync for VS Code and its Chrome companion.

Two local extensions for capturing authorized frontend source, comparing changes, and selectively committing the reviewed result to an existing Git repository. No hosted backend, token service, telemetry, or paid API.

## Install

### VS Code

1. Install `artifacts/websource-sync-0.1.0.vsix` using **Extensions → … → Install from VSIX**.
2. Open a trusted local workspace and select **WebSource Sync** in the Activity Bar.
3. Choose an existing Git repository **root**, enter a dedicated destination such as `websource-captures`, add clean website URLs, and save the profile.

For Playwright capture, install Chromium once from this source folder: `npm run browser:install`. It uses Playwright's per-user browser cache. HTTP and Chrome-assisted capture do not need this download. This extension runs locally; remote repository URIs and virtual workspaces are not supported.

### Chrome / Chromium

1. Extract `artifacts/websource-sync-chrome-0.1.0.zip` to a permanent local folder (or use `dist/chrome`).
2. Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** with that folder.
3. Open the website normally. Complete any Cloudflare challenge yourself, then click the companion's toolbar icon. Its capture controls open in a separate tab and retain the original tab as the target.

Chrome asks for access to the page's origin and any additional asset hosts you explicitly list. The companion has no cookie, browsing-history, webRequest, debugger, or credential-reading permission. Its fixed host permission is the local bridge at `127.0.0.1`. Keep the website tab open until capture completes.

## First before/after capture

1. In VS Code, select the repository, add the page URL, choose image/SVG/screenshot/original-HTML options as needed, and **Save profile**.
2. Click **Pair Chrome**. This starts a loopback-only server on a random port and copies an ephemeral pairing code. Paste it into the companion. No pairing code is saved to project configuration or browser storage.
3. Select **Before** in Chrome, confirm authorization and absence of personal data, and click **Capture page**. Add exact CDN hostnames if needed; each additional host requires permission. Read the capture notices.
4. Click **Send to VS Code** and confirm the import in VS Code. The URL must already be mapped in the active profile. Alternatively download the capture JSON and use **Import capture**.
5. Make your website changes yourself. Reload the page and capture **After** the same way. For multiple URLs, repeat for each URL and snapshot slot. Imports replace that URL's files and retain other URLs already captured in that slot.
6. Click filenames in **Before → After** to use VS Code's native diff editor. Read warnings and open the change summary.
7. Choose **Repository → After (commit review)**. This is the exact publication comparison, including deletions of previously owned capture files. Select files and click **Review & stage selected files**. Confirm the explicit file list.
8. Enter a commit message and click **Review & commit**. The commit includes only the selected capture paths and ownership manifest, even if unrelated work is already staged. **Review & push** is separate and shows all outgoing commits on the current branch.

Enable matching capture options in the VS Code profile before importing: assets disabled there are intentionally discarded even if present in Chrome's capture. Screenshots are opt-in and require explicit review. Chrome captures the visible viewport; Playwright captures the full page. Neither captures iframe contents.

For direct capture, select **HTTP source** or **Playwright rendered page**, then use **Capture Before** and **Capture After** in VS Code. Direct multi-URL captures replace the whole slot atomically after all pages succeed. A failure preserves the prior snapshot. VS Code progress supports cancellation; HTTP assets use bounded retries with backoff. Missing individual assets produce warnings and a partial snapshot, not a claim of full coverage.

## Engaging Networks and Cloudflare

The supplied page `https://secure.unicef.ca/page/201629/donate/1` returned HTTP 403 with `cf-mitigated: challenge` during the initial check. HTTP/Playwright capture stops on challenge pages. The Chrome companion captures a page you have already accessed normally, after you complete any check yourself; it does not solve or bypass challenges. Independently fetched assets may still be challenged and are reported as missing. A rendered DOM is not the original HTTP source.

Engaging Networks templates, code blocks, page-builder settings, and backend/payment logic are separate from the rendered frontend. Export/copy editable custom code from the EN administration UI separately if you need to version that source. This tool does not log in to EN or modify/publish EN pages.

## Project configuration

Settings live in `.websource-sync.config.json` in the selected repository root. This file is **not automatically staged**. Use **Open project configuration** for URL-to-folder mappings, staging URLs, host allowlists, request limits, exclusions, and normalization. Configuration is reloaded before captures and Chrome imports. See `websource-sync.config.example.json`.

```json
{
  "version": 1,
  "destination": "websource-captures",
  "activeProfile": "Donation",
  "profiles": [{
    "name": "Donation",
    "targets": [{
      "url": "https://secure.unicef.ca/page/201629/donate/1",
      "folder": "donation",
      "stagingUrl": "https://staging.example.org/donation"
    }],
    "options": {
      "mode": "http",
      "images": false,
      "svg": false,
      "metadata": true,
      "screenshot": false,
      "raw": false,
      "timeoutMs": 20000,
      "delayMs": 500,
      "retries": 2,
      "maxAssets": 100,
      "allowedAssetHosts": ["cdn.example.org"],
      "excludeUrls": ["google-analytics", "googletagmanager", "doubleclick"],
      "removeSelectors": ["[data-dynamic-timestamp]"],
      "replacements": [{"pattern": "build-[0-9]{10,}", "replacement": "build-[NORMALIZED]"}]
    }
  }]
}
```

**Compare staging → production** uses each mapping's `stagingUrl` for Before and `url` for After. Every mapping must have a staging URL. Only source/content comparison is performed: URLs and metadata can naturally differ between environments.

Import plain text (one URL per line, `#` comments allowed) or UTF-8 CSV with headers `url,folder,stagingUrl`. Quoted CSV fields are supported. Profile names and target folders must be unique; target folders cannot overlap. Use a fresh dedicated capture folder when mapping unrelated projects.

## Storage and Git behavior

- Snapshots and manifests live under VS Code's extension **global storage**, outside the selected Git repository. SHA-256 hashes identify unchanged files. Last Before/After snapshot references survive extension restarts in the workspace. Snapshots are retained locally until you remove extension global storage; do not use this for sensitive sites.
- Only **Review & stage** writes capture files into the repository. Each destination has `.websource-sync.json`, a tracked ownership manifest. Unowned existing files, locally edited owned files, symlink paths, traversal, and `.git` paths are rejected.
- Selective staging includes added, modified, and deleted files plus an updated ownership manifest. Each staging batch must be committed before another batch. On stage errors, the selected working-tree files are restored and the attempted capture paths are unstaged. No unrelated paths are touched.
- Branch selection switches existing local branches only and requires a clean working tree. Creating branches and configuring remotes/upstream remain normal Git operations.
- Git uses the installed `git` executable and its existing credential helper/SSH configuration. No GitHub token is requested. Ensure Git is in VS Code's PATH and configure an upstream before pushing. Interactive terminal-only credential prompts may need to be resolved in a terminal first.
- Review & commit uses `git commit --only` with explicit paths; unrelated staged changes are left out. Native Git hooks still run. Push publishes all outgoing branch commits, shown in the confirmation, not just the latest capture.

## Privacy and capture boundaries

- No forms are submitted, no cookies or authorization headers are exported, and form input values/checked states, textarea contents, editable contents, and selection states are stripped. Iframes are excluded. Use only clean URLs without query strings to prevent supporter identifiers and tokens from entering captures or config.
- Common private keys, access tokens, JWTs, email addresses, sensitive key/value assignments, and Luhn-valid payment numbers are redacted. Sanitization runs in Chrome and again in VS Code, and text is checked again before staging. This is a heuristic safeguard, **not a guarantee of finding arbitrary personal data**. Capture only blank/public states and review all source and screenshots before committing.
- Original HTML is stored separately as `original.sanitized.html` when available. It is sanitized rather than byte-for-byte raw: storing an untouched response could retain personal or secret values. Chrome attempts a separate credential-free HTTP request for this option, which may be blocked even when the visible page is accessible.
- Screenshots mask form controls, editable regions, iframes, and `[data-websource-private]`. Personal text elsewhere and image metadata are not reliably detectable; only enable images/screenshots on a public, non-personal page. Images are not OCR-scanned or metadata-stripped.
- HTTP requests are GET-only, omit credentials, validate public network targets, pin DNS resolution per request, use timeouts, rate limits, bounded retries, five same-origin redirects maximum, and reject HTTPS downgrades and cross-origin redirects. A redirected page on another origin must be entered explicitly. Assets require the page host or explicit hostname allowlist.
- Playwright uses an isolated, nonpersistent context. Form methods, XHR/fetch, WebSockets, popup pages, iframe documents, service workers, non-allowlisted hosts, and credential headers are blocked. This intentionally limits dynamic rendering. Browser DNS follows Chromium's resolver; it is not a network sandbox. Do not run it against untrusted hostile sites or a privileged network.
- Chrome's page has already loaded normally. The companion makes only extra credential-free asset GET requests with redirects rejected, 20-second timeouts, 500 ms spacing, a 100-asset limit, and a 20 MB aggregate budget. Failed assets produce notices; retry a capture after fixing access/allowlists. Chrome checks literal private/local hostnames, but cannot enforce DNS pinning.
- Responses are limited to 5 MB, local JSON transfers to 25 MB, and screenshots to 10 MB at import. Query-string assets are skipped, including cache-busted URLs; CSS imports/background URLs without query strings are followed within the limits. CSS URL references remain original; HTML links to captured assets are rewritten. Snapshots are source archives, **not guaranteed offline replicas**.
- Shadow DOM, cross-origin frames, runtime module graphs, source maps, fonts, responsive `srcset` variants, backend code, and EN editor configuration are outside capture coverage. Redaction and formatting can change source semantics: do not deploy these archives back to a live donation page.

The bridge binds only to `127.0.0.1`, uses an ephemeral 256-bit token, requires a Chrome-extension origin and JSON, limits body size, and requires VS Code user confirmation before storing a mapped URL. Disconnect rotates the token. No CORS wildcard or web-page caller is accepted. If local bridge access is restricted by browser policy, JSON export/import works without pairing. One local VS Code window should own a pairing at a time.

## Build and verify

Node.js 22 LTS, npm, Git, and VS Code are recommended. Chrome/Chromium must support Manifest V3 and `AbortSignal.any` (Chrome 120+).

```sh
npm ci
npm run check
npm test
npm run build
npm run browser:install
npm run test:browser
npm run test:playwright
npm run package
npm run package:chrome
```

On this Mac, Node 24's Homebrew executable has a missing `libsimdjson` dependency; `/opt/homebrew/opt/node@22/bin` is working. Put that directory first in PATH if needed.

`npm test` runs unit and local integration tests, including real disposable Git repositories and loopback HTTP servers. `npm run test:playwright` verifies rendered capture, CSS downloads, original HTML, screenshots, and blocked form submissions/fetch against a disposable local fixture. `test:browser` launches an isolated headed Chromium profile, pre-grants only a synthetic fixture origin in a disposable test copy, and verifies the real Chrome extension's DOM sanitization, asset requests, pairing transfer, and JSON download. It does not alter your installed browser profile or connect to UNICEF. Chromium must be installed first. Close the test browser only after the test completes.

Press F5 in this source folder to open an Extension Development Host. `test/vscode-host.ts` is a separate installed-VS-Code smoke harness; it checks activation, contributed commands, sidebar invocation, bundled Prettier, and a native diff tab. Its `run` export is bundled into `dist/vscode-test.js` for `--extensionTestsPath`; set `WEBSOURCE_HOST_TEST_ROOT` to a writable temporary directory. This test harness is excluded from the VSIX.

Build artifacts: `artifacts/websource-sync-0.1.0.vsix`, `artifacts/websource-sync-chrome-0.1.0.zip`. The VSIX bundles runtime dependencies, including Playwright's driver; browser binaries are installed separately. The Chrome ZIP is for unpacked installation, not a signed Web Store release. Nothing is automatically installed, published, pushed, or deployed by the build scripts.

## Architecture

`src/capture.ts` orchestrates HTTP/Playwright capture; `network.ts` applies transport limits; `assets.ts` discovers/downloads dependencies; `sanitizer.ts` and `shared/redact.ts` scrub content; `formatter.ts` wraps Prettier; `snapshots.ts` validates, materializes, hashes, and compares captures; `git.ts` owns scoped Git operations; `bridge.ts` handles authenticated loopback transfer; `extension.ts` coordinates review and persistence; `sidebar.ts` and `media/` implement the VS Code view. `chrome/` is the independent Manifest V3 companion.

## References

- [VS Code webviews and content security policies](https://code.visualstudio.com/api/extension-guides/webview)
- [Chrome extension cross-origin requests and host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Playwright nonpersistent browser contexts](https://playwright.dev/docs/api/class-browsercontext)
- [Engaging Networks Managed Challenges](https://knowledge.engagingnetworks.net/youraccount/fraud-management-managed-challenge)
- [Engaging Networks HTML templates](https://knowledge.engagingnetworks.net/pages/managing-html-page-templates)
