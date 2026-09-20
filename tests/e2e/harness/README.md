# E2E harness

The harness starts Playwright's bundled Chromium with the production `dist/`
directory loaded as an unpacked MV3 extension. Each test receives a fresh,
persistent profile created under the operating system temporary directory. The
profile is closed and only that generated directory is removed during teardown.

`YTAF_E2E_MODE=headless` is the default and covers extension loading,
packaging, routing, local media, and message delivery. Run with
`YTAF_E2E_MODE=headed` to execute the same controlled smoke in a visible
Chromium window. A headed run still does not prove macOS or Windows system
fullscreen; that acceptance remains separate.

The browser toolbar action popup cannot be opened programmatically by the
Playwright extension API. `openPopupPage()` therefore opens the packaged popup
as an extension page to test its document and runtime connection. It is not a
substitute for validating a transient toolbar popup; that user interaction is
covered by the manual acceptance matrix and later integration work.

YouTube pages are fulfilled only for the owned `/watch?...&fixture=<scenario>`
URLs. Every other network request is aborted. The fixture creates a short WebM
video in the browser with `canvas.captureStream()` and `MediaRecorder`, so it
does not fetch remote media or add files to the production build. Its buttons
and `window.__ytafFixture` controls are in routed test HTML only.

The `autonext` scenario schedules one deterministic advance after the initial
local media is ready. Other helpers can trigger replacement or SPA navigation
explicitly, so later E2E tests can control each transition independently.

`storageState()` calls the loaded extension worker directly and reports either
the real storage contents or the actual API error. The S00 manifest has not
yet declared the `storage` permission, so the bootstrap currently records the
observed `Storage API unavailable` result. When persistence is wired into the
integrated extension, the manifest owner must add the minimum permission and
the E2E assertion can require the returned storage object instead.
