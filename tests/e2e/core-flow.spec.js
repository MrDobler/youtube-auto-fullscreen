import { expect, test } from './harness/extension.js';

test.describe('core automatic fullscreen flow', () => {
  test('hides recommendations and reapplies presentation after a page reload', async ({
    extension,
  }) => {
    const page = await extension.openYouTube('direct');
    await extension.waitForPlayer(page, 'direct_video');
    await expect(page.locator('.ytp-pause-overlay')).toBeHidden();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await extension.waitForPlayer(page, 'direct_video');
    await expect(page.locator('#movie_player')).toHaveClass(
      /ytaf-presentation-player/,
    );
    await expect(page.locator('.ytp-pause-overlay')).toBeHidden();
    expect(extension.unexpectedRequests()).toEqual([]);
  });

  test('keeps the presentation when YouTube replaces its player in the same document', async ({
    extension,
  }) => {
    const page = await extension.openYouTube('direct');
    await extension.waitForPlayer(page, 'direct_video');
    await expect(page.locator('#fixture-controls')).toBeHidden();

    await extension.advanceVideo(page, 'next_video');
    await extension.waitForPlayer(page, 'next_video');
    await expect(page.locator('#movie_player')).toHaveClass(
      /ytaf-presentation-player/,
    );
    await expect(page.locator('#fixture-controls')).toBeHidden();
    expect(extension.unexpectedRequests()).toEqual([]);
  });

  test('re-enters after the page temporarily has no eligible player', async ({
    extension,
  }) => {
    const page = await extension.openYouTube('direct');
    await extension.waitForPlayer(page, 'direct_video');

    await page.evaluate(() => window.__ytafFixture.removePlayer());
    await expect(page.locator('#movie_player')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(
      /ytaf-presentation-root/,
    );

    await extension.advanceVideo(page, 'home_to_video');
    await extension.waitForPlayer(page, 'home_to_video');
    await expect(page.locator('#movie_player')).toHaveClass(
      /ytaf-presentation-player/,
    );
    await expect(page.locator('#fixture-controls')).toBeHidden();
    expect(extension.unexpectedRequests()).toEqual([]);
  });

  test('enters for a direct video, Esc suppresses it, and a new video re-enters', async ({
    extension,
  }) => {
    const page = await extension.openYouTube('direct');
    await extension.waitForPlayer(page, 'direct_video');

    const player = page.locator('#movie_player');
    await expect(player).toHaveClass(/ytaf-presentation-player/);
    await expect(page.locator('html')).toHaveClass(/ytaf-presentation-root/);

    await page.keyboard.press('Escape');
    await expect(player).not.toHaveClass(/ytaf-presentation-player/);
    await expect(page.locator('html')).not.toHaveClass(
      /ytaf-presentation-root/,
    );

    await page.goto(
      'https://www.youtube.com/watch?v=second_video&fixture=delayed',
      { waitUntil: 'domcontentloaded' },
    );
    await extension.waitForPlayer(page, 'delayed_video');
    await expect(page.locator('#movie_player')).toHaveClass(
      /ytaf-presentation-player/,
    );
    expect(extension.unexpectedRequests()).toEqual([]);
  });
});
