import { afterEach, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createYouTubePlayerController,
  snapshotYouTubePlayer,
} from '../../../../src/platform/youtube/player.js';

/** @type {JSDOM[]} */
const documents = [];

afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.unstubAllGlobals();
});

function page({
  url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  player = true,
  videoId = 'dQw4w9WgXcQ',
} = {}) {
  const markup = player
    ? `<main><input id="search"><div id="movie_player" data-video-id="${videoId}">
        <video class="html5-main-video" data-video-id="${videoId}"></video>
        <button class="ytp-fullscreen-button" type="button">Fullscreen</button>
        <div class="caption-window"></div>
      </div></main>`
    : '<main><input id="search"></main>';
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${markup}</body></html>`,
    {
      url,
    },
  );
  documents.push(dom);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('HTMLVideoElement', dom.window.HTMLVideoElement);
  vi.stubGlobal('HTMLStyleElement', dom.window.HTMLStyleElement);
  return dom;
}

function videoIdentity(videoId = 'dQw4w9WgXcQ') {
  return {
    document: {
      tabId: 17,
      windowId: 4,
      documentId: 'doc_7e39',
      navigationGeneration: 12,
    },
    videoId,
    videoGeneration: 1,
  };
}

async function flushMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

test.each([
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', true, 'video', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/live_stream', true, 'live', 'live_stream'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', true, 'short', null],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, 'other', null],
  ['https://www.youtube.com/results?search_query=test', true, 'other', null],
])(
  'creates an eligible snapshot only for %s',
  (url, player, mediaKind, videoId) => {
    const dom = page({ url, player, videoId: videoId ?? 'dQw4w9WgXcQ' });

    expect(snapshotYouTubePlayer(dom.window.document)).toEqual({
      mediaKind,
      videoId,
      playerAvailable: mediaKind === 'video' || mediaKind === 'live',
    });
  },
);

test('derives an identifier from player data when the URL has no video parameter', () => {
  const dom = page({
    url: 'https://www.youtube.com/watch',
    videoId: 'player_data_id',
  });

  expect(snapshotYouTubePlayer(dom.window.document)).toMatchObject({
    mediaKind: 'video',
    videoId: 'player_data_id',
  });
});

test('uses nested player data and the live path only after stronger identities are absent', () => {
  const nested = page({
    url: 'https://www.youtube.com/watch',
    videoId: 'unused_id',
  });
  const nestedVideo = nested.window.document.querySelector('video');
  const nestedPlayer = nested.window.document.querySelector('#movie_player');
  nestedVideo.removeAttribute('data-video-id');
  nestedPlayer.removeAttribute('data-video-id');
  const identityNode = nested.window.document.createElement('span');
  identityNode.dataset.videoId = 'nested_identity';
  nestedPlayer.append(identityNode);
  expect(snapshotYouTubePlayer(nested.window.document)).toMatchObject({
    videoId: 'nested_identity',
  });

  const live = page({
    url: 'https://www.youtube.com/live/channel_live_id',
    videoId: 'unused_id',
  });
  live.window.document.querySelector('video').removeAttribute('data-video-id');
  live.window.document
    .querySelector('#movie_player')
    .removeAttribute('data-video-id');
  expect(snapshotYouTubePlayer(live.window.document)).toMatchObject({
    mediaKind: 'live',
    videoId: 'channel_live_id',
  });
});

test('mounts once, observes initial media and ignores unrelated DOM mutations', async () => {
  const dom = page();
  const reports = vi.fn();
  const snapshots = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onSnapshot: snapshots,
    onPlayerReport: reports,
  });

  expect(controller.mount()).toMatchObject({ mediaKind: 'video' });
  controller.mount();
  expect(reports).toHaveBeenCalledTimes(1);
  expect(reports).toHaveBeenLastCalledWith({
    videoId: 'dQw4w9WgXcQ',
    mediaKind: 'video',
    observationId: 1,
    reason: 'initial',
  });

  dom.window.document.body.append(dom.window.document.createElement('aside'));
  dom.window.document.body.append(dom.window.document.createTextNode('idle'));
  await flushMutations();
  expect(reports).toHaveBeenCalledTimes(1);
  expect(snapshots).toHaveBeenCalledTimes(2);
});

test('reports player replacement without changing the video identity', async () => {
  const dom = page();
  const reports = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onPlayerReport: reports,
  });
  controller.mount();

  const replacement = dom.window.document.createElement('div');
  replacement.id = 'movie_player';
  replacement.dataset.videoId = 'dQw4w9WgXcQ';
  replacement.innerHTML =
    '<video class="html5-main-video" data-video-id="dQw4w9WgXcQ"></video>';
  dom.window.document.querySelector('#movie_player').replaceWith(replacement);
  await flushMutations();

  expect(reports).toHaveBeenCalledTimes(2);
  expect(reports).toHaveBeenLastCalledWith({
    videoId: 'dQw4w9WgXcQ',
    mediaKind: 'video',
    observationId: 2,
    reason: 'player-replaced',
  });
});

test('does not report a new identity for pause or playback state events', () => {
  const dom = page();
  const reports = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onPlayerReport: reports,
  });
  controller.mount();

  dom.window.document
    .querySelector('video')
    .dispatchEvent(new dom.window.Event('playing'));
  expect(reports).toHaveBeenCalledTimes(1);
});

test('reports a real video URL change through the YouTube navigation event', () => {
  const dom = page();
  const reports = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onPlayerReport: reports,
  });
  controller.mount();

  dom.reconfigure({ url: 'https://www.youtube.com/watch?v=next_video' });
  dom.window.document.dispatchEvent(new dom.window.Event('yt-navigate-finish'));
  expect(reports).toHaveBeenLastCalledWith({
    videoId: 'next_video',
    mediaKind: 'video',
    observationId: 2,
    reason: 'url-change',
  });
});

test('applies and restores only its own presentation classes and stylesheet', () => {
  const dom = page();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const search = dom.window.document.querySelector('#search');
  const player = dom.window.document.querySelector('#movie_player');
  const video = dom.window.document.querySelector('video');
  search.focus();
  controller.mount();

  expect(controller.apply(videoIdentity())).toEqual({ result: 'applied' });
  expect(controller.apply(videoIdentity())).toEqual({ result: 'applied' });
  expect(dom.window.document.documentElement.classList).toContain(
    'ytaf-presentation-root',
  );
  expect(dom.window.document.body.classList).toContain(
    'ytaf-presentation-root',
  );
  expect(player.classList).toContain('ytaf-presentation-player');
  expect(video.classList).toContain('ytaf-presentation-video');
  expect(dom.window.document.activeElement).toBe(search);
  expect(
    dom.window.document.querySelectorAll(
      'style[data-ytaf-presentation-style="true"]',
    ),
  ).toHaveLength(1);
  expect(dom.window.document.head.textContent).toContain('object-fit: contain');

  expect(controller.restore()).toEqual({ result: 'restored' });
  expect(controller.restore()).toEqual({ result: 'restored' });
  expect(dom.window.document.documentElement.classList).not.toContain(
    'ytaf-presentation-root',
  );
  expect(dom.window.document.body.classList).not.toContain(
    'ytaf-presentation-root',
  );
  expect(player.classList).not.toContain('ytaf-presentation-player');
  expect(video.classList).not.toContain('ytaf-presentation-video');
  expect(dom.window.document.querySelector(STYLE_SELECTOR)).toBeNull();
  expect(dom.window.document.activeElement).toBe(search);
});

test('preserves a class and style that belonged to the site before apply', () => {
  const dom = page();
  const player = dom.window.document.querySelector('#movie_player');
  player.classList.add('ytaf-presentation-player');
  const siteStyle = dom.window.document.createElement('style');
  siteStyle.dataset.ytafPresentationStyle = 'true';
  siteStyle.textContent = '.site-owned { color: red; }';
  dom.window.document.head.append(siteStyle);
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  controller.mount();

  controller.apply(videoIdentity());
  controller.restore();
  expect(player.classList).toContain('ytaf-presentation-player');
  expect(dom.window.document.head.contains(siteStyle)).toBe(true);
});

test('fails safely for a stale target and restores presentation after context invalidation', async () => {
  const dom = page();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  controller.mount();
  expect(controller.apply(videoIdentity('another_video'))).toEqual({
    result: 'failed',
  });
  expect(controller.apply(videoIdentity())).toEqual({ result: 'applied' });
  const oldPlayer = dom.window.document.querySelector('#movie_player');
  oldPlayer.remove();
  await flushMutations();

  expect(oldPlayer.classList).not.toContain('ytaf-presentation-player');
  expect(dom.window.document.body.classList).not.toContain(
    'ytaf-presentation-root',
  );
});

test('resumes the presentation when an eligible player returns after an in-page transition', async () => {
  const dom = page();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  controller.mount();
  controller.apply(videoIdentity());

  dom.window.document.querySelector('#movie_player').remove();
  await flushMutations();
  expect(dom.window.document.documentElement.classList).not.toContain(
    'ytaf-presentation-root',
  );

  dom.reconfigure({ url: 'https://www.youtube.com/watch?v=next_video' });
  const player = dom.window.document.createElement('div');
  player.id = 'movie_player';
  player.dataset.videoId = 'next_video';
  player.innerHTML =
    '<div class="html5-video-container"><video class="html5-main-video" data-video-id="next_video"></video></div>';
  dom.window.document.querySelector('main').append(player);
  dom.window.document.dispatchEvent(new dom.window.Event('yt-navigate-finish'));

  expect(player.classList).toContain('ytaf-presentation-player');
  expect(dom.window.document.documentElement.classList).toContain(
    'ytaf-presentation-root',
  );
});

test('clears the periodic reconciler on disposal', () => {
  const dom = page();
  const setInterval = vi.fn(() => 41);
  const clearInterval = vi.fn();
  vi.stubGlobal('setInterval', setInterval);
  vi.stubGlobal('clearInterval', clearInterval);
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });

  controller.mount();
  controller.dispose();
  expect(setInterval).toHaveBeenCalledOnce();
  expect(clearInterval).toHaveBeenCalledWith(41);
});

test('reports Escape, F and the player fullscreen button only in active automatic mode', () => {
  const dom = page();
  const exits = vi.fn();
  let automatic = true;
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onExitRequested: exits,
    isAutomaticModeActive: () => automatic,
  });
  controller.mount();
  controller.apply(videoIdentity());

  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'f', bubbles: true }),
  );
  dom.window.document
    .querySelector('.ytp-fullscreen-button')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  expect(exits.mock.calls).toEqual(
    expect.arrayContaining([
      [
        {
          videoId: 'dQw4w9WgXcQ',
          observationId: 1,
          trigger: 'escape',
        },
      ],
      [
        {
          videoId: 'dQw4w9WgXcQ',
          observationId: 1,
          trigger: 'fullscreen-toggle',
        },
      ],
    ]),
  );

  automatic = false;
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(exits).toHaveBeenCalledTimes(3);
});

test('does not interpret text composition, modifiers, repeated presses or editable fields as exit', () => {
  const dom = page();
  const exits = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onExitRequested: exits,
  });
  controller.mount();
  controller.apply(videoIdentity());
  const input = dom.window.document.querySelector('#search');

  input.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
    }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'f',
      repeat: true,
      bubbles: true,
    }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'f',
      keyCode: 229,
      bubbles: true,
    }),
  );
  const composing = new dom.window.KeyboardEvent('keydown', {
    key: 'f',
    bubbles: true,
  });
  Object.defineProperty(composing, 'isComposing', { value: true });
  dom.window.document.dispatchEvent(composing);
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'f',
      altKey: true,
      bubbles: true,
    }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
    }),
  );
  const editor = dom.window.document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  const nested = dom.window.document.createElement('span');
  editor.append(nested);
  dom.window.document.body.append(editor);
  nested.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  dom.window.document.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true }),
  );
  expect(exits).not.toHaveBeenCalled();
});

test('accepts a string target and fails safely without a video identity', () => {
  const dom = page();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  controller.mount();

  expect(controller.apply('dQw4w9WgXcQ')).toEqual({ result: 'applied' });
  expect(controller.apply('')).toEqual({ result: 'failed' });
  expect(controller.apply(null)).toEqual({ result: 'failed' });
});

test('runs without optional callbacks or a MutationObserver', () => {
  const dom = page();
  vi.stubGlobal('MutationObserver', undefined);
  const controller = createYouTubePlayerController({
    document: dom.window.document,
  });

  expect(controller.mount()).toMatchObject({ mediaKind: 'video' });
  expect(controller.restore()).toEqual({ result: 'restored' });
});

test('dispose restores changes and discards listeners and mutation observation', async () => {
  const dom = page();
  const reports = vi.fn();
  const exits = vi.fn();
  const controller = createYouTubePlayerController({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    onPlayerReport: reports,
    onExitRequested: exits,
  });
  controller.mount();
  controller.apply(videoIdentity());

  expect(controller.dispose()).toEqual({ result: 'restored' });
  expect(controller.dispose()).toEqual({ result: 'restored' });
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  dom.window.document.body.append(dom.window.document.createElement('video'));
  await flushMutations();

  expect(exits).not.toHaveBeenCalled();
  expect(reports).toHaveBeenCalledTimes(1);
  expect(controller.mount()).toBeNull();
  expect(controller.apply(videoIdentity())).toEqual({ result: 'failed' });
});

const STYLE_SELECTOR = 'style[data-ytaf-presentation-style="true"]';
