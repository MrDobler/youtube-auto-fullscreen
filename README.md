# YouTube Auto Fullscreen

A Chrome extension that automatically opens eligible YouTube videos and live streams in fullscreen. Pressing Escape exits fullscreen and suppresses auto-entry for the current video. The popup provides a persistent global on/off preference.

## Development

Use Node **24.21.0** and npm **11.19.0**, as recorded in `.nvmrc`, `.node-version`, and `package.json`.

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

## Install locally

1. Run `npm run build`.
2. Open `chrome://extensions` and enable Developer mode.
3. Select **Load unpacked** and choose this repository's `dist` directory.
4. Reload the extension after each build, then reload the YouTube tab.

`npm run dev` watches JavaScript, HTML, CSS, and manifest changes. It does not reload the extension or browser tabs automatically.

## Commands

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `npm run build`         | Creates the runtime-only `dist` package.                  |
| `npm run dev`           | Watches and rebuilds source files.                        |
| `npm run lint`          | Runs ESLint.                                              |
| `npm run format:check`  | Checks formatting.                                        |
| `npm run format`        | Applies Prettier formatting.                              |
| `npm run typecheck`     | Checks JavaScript and JSDoc contracts.                    |
| `npm run test:unit`     | Runs unit tests.                                          |
| `npm run test:coverage` | Runs unit tests with coverage gates.                      |
| `npm run test:build`    | Verifies the packaged extension.                          |
| `npm run test:e2e`      | Runs the isolated Chromium extension tests.               |
| `npm run check`         | Runs lint, formatting, types, coverage, and build checks. |

Local reports in `coverage/`, `playwright-report/`, and `test-results/` are ignored by Git.

## Repository layout

- `src/`: extension source code.
- `public/`: static runtime assets and the MV3 manifest.
- `scripts/`: build tooling.
- `tests/`: unit, build, and end-to-end tests.

The release package contains only runtime files. Documentation and local AI-agent guidance are intentionally ignored by Git.
