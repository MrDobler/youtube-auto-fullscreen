import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('loads MV3 worker, popup and packaged content script in an isolated browser', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'ytaf-e2e-'));
  const extension = fileURLToPath(new URL('../../dist/', import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    const popup = await context.newPage();
    popup.on('pageerror', (error) => errors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
    await expect(popup.getByRole('status')).toHaveText('Base carregada.');
    await expect(popup.getByRole('heading', { level: 1 })).toHaveText(
      'YouTube Auto Fullscreen',
    );
    // This owned fixture tests packaging/injection, not YouTube behavior or fullscreen.
    await context.route('https://**/*', async (route) => {
      if (
        route.request().url() === 'https://www.youtube.com/watch?v=bootstrap'
      ) {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><title>Bootstrap fixture</title><main><h1>Owned test page</h1></main></html>',
        });
      } else {
        await route.abort();
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = page.waitForEvent(
      'console',
      (message) => message.text() === 'YouTube Auto Fullscreen: content ready',
    );
    await page.goto('https://www.youtube.com/watch?v=bootstrap');
    await ready;
    await expect(page.getByRole('heading')).toHaveText('Owned test page');
    expect(errors).toEqual([]);
  } finally {
    try {
      if (context) {
        try {
          if (test.info().status !== test.info().expectedStatus) {
            await context.tracing.stop({
              path: test.info().outputPath('trace.zip'),
            });
          } else {
            await context.tracing.stop();
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
});
