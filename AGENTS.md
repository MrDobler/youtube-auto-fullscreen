# YouTube Auto Fullscreen

## Scope and workflow

- This is the independent root of a Chrome Manifest V3 extension. Work only inside this repository.
- Execute only the assigned slice from `docs/slices/`. S00 supplies infrastructure and an initialization probe; functional contracts begin in S01.
- Do not copy application code, tests, product documentation or Git history from outside this repository.
- Consult `.agents/skills/chrome-extensions/SKILL.md` for extension work and `.agents/skills/modern-web-guidance/SKILL.md` for client-side work. Verify API claims against current official documentation.
- No remote, publishing or agent delegation is implied by an implementation slice.

## Architecture

- JavaScript ESM with JSDoc and checkJs. Pure functions for domain decisions; Chrome, DOM, storage and time belong at boundaries.
- Prefer composition, explicit dependencies, async/await and idempotent effects. Register worker listeners synchronously and persist recoverable state when stateful functionality is introduced.
- Use minimum permissions. Preserve user intent and reversible presentation. No remote code, inline JavaScript, eval, telemetry or backend.
- Browser build target: Chrome 120+. Platform acceptance remains Chrome stable on macOS and Windows. Revisit the minimum when adding APIs.

## Verification

- Use the exact Node version in `.nvmrc` and the npm version declared in package.json.
- `npm run check` runs lint, formatting, types, unit coverage and artifact checks. `npm run test:e2e` additionally requires the Playwright Chromium download.
- Unit coverage: >=90% lines, functions, statements and branches per file and globally, including every production `src/**/*.js`. Do not exclude untested modules or count integration/E2E toward unit coverage.
- Test behavior, errors and concurrency relevant to the slice. Do not create future production placeholders to scaffold directories.
- Use temporary browser profiles, never personal profiles. Do not equate headless fixture tests with OS fullscreen acceptance.
- Keep source and dependency licenses intact. Update CHROMEWEBSTORE.md when permissions, behavior or privacy change.
