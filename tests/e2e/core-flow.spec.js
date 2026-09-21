import { expect, test } from './harness/extension.js';

test.describe('core automatic fullscreen flow', () => {
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
