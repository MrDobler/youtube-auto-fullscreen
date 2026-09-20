import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base } from '@playwright/test';
import {
  isYouTubeScenario,
  youtubeFixturePage,
} from '../../fixtures/youtube-page.js';

const youtubeOrigin = 'https://www.youtube.com';

/** @typedef {'headless'|'headed'} BrowserMode */
/** @typedef {{ context: import('@playwright/test').BrowserContext, extensionId: string, worker: import('@playwright/test').Worker, browserMode: BrowserMode, unexpectedRequests: () => string[], openPopupPage: () => Promise<import('@playwright/test').Page>, openYouTube: (scenario: import('../../fixtures/youtube-page.js').YouTubeScenario) => Promise<import('@playwright/test').Page>, waitForPlayer: (page: import('@playwright/test').Page, videoId?: string) => Promise<void>, replacePlayer: (page: import('@playwright/test').Page) => Promise<void>, advanceVideo: (page: import('@playwright/test').Page, videoId: string) => Promise<void>, windowState: () => Promise<unknown>, storageState: (area: 'local'|'session') => Promise<unknown> }} ExtensionHarness */

function browserMode() {
  return process.env.YTAF_E2E_MODE === 'headed' ? 'headed' : 'headless';
}

async function loadedWorker(context) {
  return (
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  );
}

/** @param {string} profile */
function assertTemporaryProfile(profile) {
  assert.equal(dirname(profile), tmpdir());
  assert.ok(profile.startsWith(join(tmpdir(), 'ytaf-e2e-')));
}

/** @param {import('@playwright/test').Page} page */
function collectPageErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export const test = base.extend({
  /** @param {{ browserName: string }, (fixture: ExtensionHarness) => Promise<void>, import('@playwright/test').TestInfo} args */
  extension: async ({ browserName }, use, testInfo) => {
    // This harness deliberately launches a separate persistent context.
    void browserName;
    const profile = await mkdtemp(join(tmpdir(), 'ytaf-e2e-'));
    const extensionDirectory = fileURLToPath(
      new URL('../../../dist/', import.meta.url),
    );
    let context;
    try {
      await access(extensionDirectory);
      const mode = browserMode();
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: mode === 'headless',
        args: [
          `--disable-extensions-except=${extensionDirectory}`,
          `--load-extension=${extensionDirectory}`,
        ],
      });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const worker = await loadedWorker(context);
      const extensionId = new URL(worker.url()).host;
      assert.match(extensionId, /^[a-p]{32}$/);
      /** @type {string[]} */
      const blockedRequests = [];
      await context.route('**/*', async (route) => {
        const requestUrl = new URL(route.request().url());
        const scenario = requestUrl.searchParams.get('fixture');
        if (
          requestUrl.protocol === 'chrome-extension:' &&
          requestUrl.host === extensionId
        ) {
          await route.continue();
          return;
        }
        if (
          requestUrl.origin === youtubeOrigin &&
          requestUrl.pathname === '/watch' &&
          isYouTubeScenario(scenario)
        ) {
          await route.fulfill({
            contentType: 'text/html',
            body: youtubeFixturePage(scenario),
          });
          return;
        }
        blockedRequests.push(requestUrl.toString());
        await route.abort();
      });

      /** @param {import('@playwright/test').Page} page @param {string | undefined} videoId */
      async function waitForPlayer(page, videoId) {
        const player = page.locator('#movie_player');
        await expect(player).toBeVisible();
        await expect(player.locator('video.html5-main-video')).toHaveCount(1);
        if (videoId !== undefined)
          await expect(player).toHaveAttribute('data-video-id', videoId);
        await expect(page.locator('#fixture-status')).toHaveText(
          /local-media-ready/,
        );
      }

      /** @param {import('@playwright/test').Page} page */
      async function replacePlayer(page) {
        await page.evaluate(() => window.__ytafFixture.replacePlayer());
      }

      /** @param {import('@playwright/test').Page} page @param {string} videoId */
      async function advanceVideo(page, videoId) {
        await page.evaluate(
          (nextVideoId) => window.__ytafFixture.advanceVideo(nextVideoId),
          videoId,
        );
      }

      /** @returns {Promise<unknown>} */
      async function windowState() {
        return worker.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.windows.getAll({}, (windows) => {
                const error = chrome.runtime.lastError?.message;
                resolve(error ? { ok: false, error } : { ok: true, windows });
              });
            }),
        );
      }

      /** @param {'local'|'session'} area @returns {Promise<unknown>} */
      async function storageState(area) {
        return worker.evaluate(
          (storageArea) =>
            new Promise((resolve) => {
              const storage = chrome.storage?.[storageArea];
              if (storage === undefined) {
                resolve({ ok: false, error: 'Storage API unavailable' });
                return;
              }
              storage.get(null, (items) => {
                const error = chrome.runtime.lastError?.message;
                resolve(error ? { ok: false, error } : { ok: true, items });
              });
            }),
          area,
        );
      }

      /** @returns {Promise<import('@playwright/test').Page>} */
      async function openPopupPage() {
        const page = await context.newPage();
        collectPageErrors(page);
        await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
        return page;
      }

      /** @param {import('../../fixtures/youtube-page.js').YouTubeScenario} scenario */
      async function openYouTube(scenario) {
        const page = await context.newPage();
        const pageErrors = collectPageErrors(page);
        const contentReady = page.waitForEvent(
          'console',
          (message) =>
            message.text() === 'YouTube Auto Fullscreen: content ready',
        );
        await page.goto(
          `${youtubeOrigin}/watch?v=${scenario}_id&fixture=${scenario}`,
          { waitUntil: 'domcontentloaded' },
        );
        await contentReady;
        assert.deepEqual(pageErrors, []);
        return page;
      }

      await use(
        Object.freeze({
          context,
          extensionId,
          worker,
          browserMode: mode,
          unexpectedRequests: () => [...blockedRequests],
          openPopupPage,
          openYouTube,
          waitForPlayer,
          replacePlayer,
          advanceVideo,
          windowState,
          storageState,
        }),
      );
    } finally {
      try {
        if (context !== undefined) {
          if (testInfo.status !== testInfo.expectedStatus) {
            for (const [index, page] of context.pages().entries()) {
              await page
                .screenshot({
                  path: testInfo.outputPath(`failure-${index + 1}.png`),
                  fullPage: true,
                })
                .catch(() => {});
            }
            await context.tracing.stop({
              path: testInfo.outputPath('trace.zip'),
            });
          } else {
            await context.tracing.stop();
          }
          await context.close();
        }
      } finally {
        assertTemporaryProfile(profile);
        await rm(profile, { recursive: true, force: true });
      }
    }
  },
});

export { expect };
