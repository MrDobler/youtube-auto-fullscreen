import { expect, test } from './harness/extension.js';

test.describe('extension bootstrap in controlled YouTube fixtures', () => {
  test('loads the real MV3 worker, popup, routed page and local media', async ({
    extension,
  }) => {
    expect(extension.worker.url()).toBe(
      `chrome-extension://${extension.extensionId}/background/index.js`,
    );

    const popup = await extension.openPopupPage();
    await expect(popup.getByRole('status')).toHaveText('Base carregada.');
    await expect(popup.getByRole('heading', { level: 1 })).toHaveText(
      'YouTube Auto Fullscreen',
    );

    const page = await extension.openYouTube('direct');
    await extension.waitForPlayer(page, 'direct_video');
    await expect(page.getByRole('heading')).toHaveText(
      'Owned YouTube test page',
    );
    expect(extension.unexpectedRequests()).toEqual([]);

    const windows = await extension.windowState();
    expect(windows).toMatchObject({ ok: true });
    const storage = await extension.storageState('local');
    expect(storage).toHaveProperty('ok');
    if (storage.ok === false)
      expect(storage).toEqual({
        ok: false,
        error: 'Storage API unavailable',
      });
  });

  test('provides delayed, replacement and controlled SPA advance scenarios', async ({
    extension,
  }) => {
    const page = await extension.openYouTube('delayed');
    await extension.waitForPlayer(page, 'delayed_video');

    await extension.replacePlayer(page);
    await extension.waitForPlayer(page, 'delayed_video');
    await expect
      .poll(() => page.evaluate(() => window.__ytafFixture.history()))
      .toContain('player-replaced:delayed_video');

    const automatic = await extension.openYouTube('autonext');
    await extension.waitForPlayer(automatic, 'autonext_video');
    await expect
      .poll(() =>
        automatic.locator('#movie_player').getAttribute('data-video-id'),
      )
      .toBe('autonext_next');
    await extension.waitForPlayer(automatic, 'autonext_next');
    await expect
      .poll(() => automatic.evaluate(() => window.__ytafFixture.history()))
      .toContain('video-advanced:autonext_next');

    await extension.advanceVideo(page, 'advanced_video');
    await extension.waitForPlayer(page, 'advanced_video');
    await expect(page).toHaveURL(
      'https://www.youtube.com/watch?v=advanced_video',
    );
    await expect
      .poll(() => page.evaluate(() => window.__ytafFixture.history()))
      .toContain('video-advanced:advanced_video');
    expect(extension.unexpectedRequests()).toEqual([]);
  });
});
