/**
 * DOM-only YouTube player observation and reversible presentation.
 * This module has no Chrome dependency; an integration boundary turns its
 * callbacks into the versioned messages defined in shared/contracts.js.
 */

const PLAYER_SELECTOR = '#movie_player, ytd-player';
const VIDEO_SELECTOR =
  '#movie_player video.html5-main-video, ytd-player video.html5-main-video, video.html5-main-video';
const ROOT_CLASS = 'ytaf-presentation-root';
const ANCESTOR_CLASS = 'ytaf-presentation-ancestor';
const PLAYER_CLASS = 'ytaf-presentation-player';
const VIDEO_CLASS = 'ytaf-presentation-video';
const STYLE_SELECTOR = 'style[data-ytaf-presentation-style="true"]';

const PRESENTATION_CSS = `
html.${ROOT_CLASS}, body.${ROOT_CLASS} {
  overflow: hidden !important;
  background: #000 !important;
}
html.${ROOT_CLASS} body * { visibility: hidden !important; }
html.${ROOT_CLASS} .${ANCESTOR_CLASS} {
  transform: none !important;
  filter: none !important;
  perspective: none !important;
  contain: none !important;
  overflow: visible !important;
  content-visibility: visible !important;
}
html.${ROOT_CLASS} .${PLAYER_CLASS},
html.${ROOT_CLASS} .${PLAYER_CLASS} * { visibility: visible !important; }
html.${ROOT_CLASS} .${PLAYER_CLASS} {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  background: #000 !important;
  border-radius: 0 !important;
}
html.${ROOT_CLASS} .${PLAYER_CLASS} .html5-video-container {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
html.${ROOT_CLASS} .${PLAYER_CLASS} .ytp-chrome-bottom {
  width: calc(100% - 24px) !important;
  left: 12px !important;
}
html.${ROOT_CLASS} .${VIDEO_CLASS} {
  width: 100% !important;
  height: 100% !important;
  left: 0 !important;
  top: 0 !important;
  object-fit: contain !important;
}
`;

/** @typedef {'video'|'live'|'short'|'other'} MediaKind */
/** @typedef {'initial'|'url-change'|'player-replaced'|'state-change'} SnapshotReason */
/** @typedef {{ mediaKind: MediaKind, videoId: string | null, playerAvailable: boolean }} PlayerSnapshot */
/** @typedef {{ videoId: string, mediaKind: 'video'|'live', observationId: number, reason: SnapshotReason }} PlayerReport */
/** @typedef {{ videoId: string, observationId: number, trigger: 'escape'|'fullscreen-toggle' }} ExitRequest */
/** @typedef {{ result: 'applied'|'restored'|'partial'|'failed' }} PresentationResult */
/** @typedef {{ snapshot: PlayerSnapshot, player: HTMLElement | null, video: HTMLVideoElement | null }} ResolvedPlayer */
/** @typedef {{ element: Element, className: string, existed: boolean }} ClassChange */

/** @param {unknown} value @returns {value is string} */
function isIdentifier(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** @param {Document} document */
function locationFor(document) {
  try {
    return new URL(document.location.href);
  } catch {
    return null;
  }
}

/** @param {URL | null} location */
function pathMediaKind(location) {
  if (location === null) return /** @type {MediaKind} */ ('other');
  if (location.pathname.startsWith('/shorts/')) return 'short';
  if (location.pathname === '/watch') return 'video';
  if (location.pathname === '/live' || location.pathname.startsWith('/live/'))
    return 'live';
  return 'other';
}

/** @param {URL | null} location @param {HTMLElement | null} player @param {HTMLVideoElement | null} video */
function findVideoId(location, player, video) {
  const candidates = [
    location?.searchParams.get('v') ?? null,
    video?.dataset.videoId ?? null,
    video?.getAttribute('data-video-id') ?? null,
    player?.getAttribute('data-video-id') ?? null,
    player?.querySelector('[data-video-id]')?.getAttribute('data-video-id') ??
      null,
  ];
  if (location?.pathname.startsWith('/live/'))
    candidates.push(location.pathname.split('/')[2] ?? null);
  return candidates.find(isIdentifier) ?? null;
}

/** @param {Document} document @returns {ResolvedPlayer} */
function resolvePlayer(document) {
  const location = locationFor(document);
  const mediaKind = pathMediaKind(location);
  const video = document.querySelector(VIDEO_SELECTOR);
  const player =
    video?.closest(PLAYER_SELECTOR) ?? document.querySelector(PLAYER_SELECTOR);
  const htmlVideo = video instanceof HTMLVideoElement ? video : null;
  const htmlPlayer = player instanceof HTMLElement ? player : null;
  const eligible =
    (mediaKind === 'video' || mediaKind === 'live') &&
    htmlVideo !== null &&
    htmlPlayer !== null;
  return {
    snapshot: {
      mediaKind: eligible
        ? mediaKind
        : mediaKind === 'short'
          ? 'short'
          : 'other',
      videoId: eligible ? findVideoId(location, htmlPlayer, htmlVideo) : null,
      playerAvailable: eligible,
    },
    player: eligible ? htmlPlayer : null,
    video: eligible ? htmlVideo : null,
  };
}

/**
 * Returns a serializable view of the current page. /shorts and pages without
 * an eligible player are intentionally never reported as playable media.
 *
 * @param {Document} document
 * @returns {PlayerSnapshot}
 */
export function snapshotYouTubePlayer(document) {
  return resolvePlayer(document).snapshot;
}

/** @param {unknown} target @returns {string | null} */
function targetVideoId(target) {
  if (typeof target === 'string') return isIdentifier(target) ? target : null;
  if (
    target !== null &&
    typeof target === 'object' &&
    'videoId' in target &&
    isIdentifier(target.videoId)
  )
    return target.videoId;
  return null;
}

/** @param {EventTarget | null} target */
function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return (
    target.matches('input, textarea, select, [contenteditable]') ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/** @param {Node} node */
function mayContainPlayer(node) {
  if (!(node instanceof Element)) return false;
  return (
    node.matches(PLAYER_SELECTOR) ||
    node.matches('video') ||
    node.querySelector(PLAYER_SELECTOR) !== null ||
    node.querySelector('video') !== null
  );
}

/** @param {Node} node */
function isPlayerContainer(node) {
  return (
    node instanceof Element &&
    (node.matches(PLAYER_SELECTOR) || node.matches('video'))
  );
}

/** @param {MutationRecord[]} records */
function mutationsMayChangePlayer(records) {
  return records.some(
    (record) =>
      isPlayerContainer(record.target) ||
      [...record.addedNodes, ...record.removedNodes].some(mayContainPlayer),
  );
}

/**
 * Creates one idempotent content-layer controller. It does not decide whether
 * a window may enter fullscreen and never sends messages itself.
 *
 * @param {{ document: Document, MutationObserver?: typeof MutationObserver, onSnapshot?: (snapshot: PlayerSnapshot) => void, onPlayerReport?: (report: PlayerReport) => void, onExitRequested?: (request: ExitRequest) => void, isAutomaticModeActive?: () => boolean }} dependencies
 */
export function createYouTubePlayerController(dependencies) {
  const document = dependencies.document;
  const MutationObserverClass =
    dependencies.MutationObserver ?? globalThis.MutationObserver;
  const onSnapshot = dependencies.onSnapshot ?? (() => {});
  const onPlayerReport = dependencies.onPlayerReport ?? (() => {});
  const onExitRequested = dependencies.onExitRequested ?? (() => {});
  const isAutomaticModeActive =
    dependencies.isAutomaticModeActive ?? (() => true);

  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {HTMLVideoElement | null} */
  let observedVideo = null;
  /** @type {{ videoId: string, player: HTMLElement, observationId: number } | null} */
  let lastReport = null;
  /** @type {{ videoId: string, player: HTMLElement, video: HTMLVideoElement } | null} */
  let presentation = null;
  /** @type {ClassChange[]} */
  let classChanges = [];
  /** @type {HTMLStyleElement | null} */
  let presentationStyle = null;
  let ownsPresentationStyle = false;
  let mounted = false;
  let disposed = false;
  let observationId = 0;
  let resumeOnEligiblePlayer = false;
  /** @type {ReturnType<typeof globalThis.setInterval> | null} */
  let reconciliationTimer = null;

  /** @param {SnapshotReason} reason */
  function refresh(reason) {
    const resolved = resolvePlayer(document);
    onSnapshot(resolved.snapshot);
    if (
      resolved.snapshot.mediaKind !== 'video' &&
      resolved.snapshot.mediaKind !== 'live'
    ) {
      observeVideo(null);
      if (presentation !== null) restore(true);
      return resolved.snapshot;
    }
    if (
      resolved.snapshot.videoId === null ||
      resolved.player === null ||
      resolved.video === null
    ) {
      observeVideo(null);
      if (presentation !== null) restore(true);
      return resolved.snapshot;
    }
    observeVideo(resolved.video);
    if (resumeOnEligiblePlayer) {
      resumeOnEligiblePlayer = false;
      apply(resolved.snapshot.videoId);
    }
    if (
      lastReport === null ||
      lastReport.videoId !== resolved.snapshot.videoId ||
      lastReport.player !== resolved.player ||
      reason === 'url-change' ||
      reason === 'player-replaced'
    ) {
      observationId += 1;
      lastReport = {
        videoId: resolved.snapshot.videoId,
        player: resolved.player,
        observationId,
      };
      onPlayerReport({
        videoId: resolved.snapshot.videoId,
        mediaKind: resolved.snapshot.mediaKind,
        observationId,
        reason,
      });
    }
    if (
      presentation !== null &&
      (presentation.videoId !== resolved.snapshot.videoId ||
        presentation.player !== resolved.player)
    )
      apply(resolved.snapshot.videoId);
    return resolved.snapshot;
  }

  /** @param {HTMLVideoElement | null} video */
  function observeVideo(video) {
    if (observedVideo === video) return;
    if (observedVideo !== null) {
      observedVideo.removeEventListener('loadedmetadata', handleVideoState);
      observedVideo.removeEventListener('playing', handleVideoState);
    }
    observedVideo = video;
    if (observedVideo !== null) {
      observedVideo.addEventListener('loadedmetadata', handleVideoState);
      observedVideo.addEventListener('playing', handleVideoState);
    }
  }

  function handleVideoState() {
    if (!disposed) refresh('state-change');
  }

  /** @param {KeyboardEvent} event */
  function handleKeyboard(event) {
    if (
      disposed ||
      presentation === null ||
      event.repeat ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target) ||
      !isAutomaticModeActive()
    )
      return;
    const key = event.key.toLowerCase();
    if (key === 'escape') reportExit('escape');
    if (key === 'f') reportExit('fullscreen-toggle');
  }

  /** @param {MouseEvent} event */
  function handleClick(event) {
    if (disposed || presentation === null || !isAutomaticModeActive()) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('.ytp-fullscreen-button') !== null
    )
      reportExit('fullscreen-toggle');
  }

  /** @param {'escape'|'fullscreen-toggle'} trigger */
  function reportExit(trigger) {
    if (presentation === null || lastReport === null) return;
    onExitRequested({
      videoId: presentation.videoId,
      observationId: lastReport.observationId,
      trigger,
    });
  }

  function handleNavigation() {
    if (!disposed) refresh('url-change');
  }

  /** @param {MutationRecord[]} records */
  function handleMutations(records) {
    if (!disposed && mutationsMayChangePlayer(records))
      refresh('player-replaced');
  }

  /** @param {Element} element @param {string} className */
  function addOwnedClass(element, className) {
    const existed = element.classList.contains(className);
    element.classList.add(className);
    classChanges.push({ element, className, existed });
  }

  function ensurePresentationStyle() {
    const existing = document.querySelector(STYLE_SELECTOR);
    if (existing instanceof HTMLStyleElement) {
      presentationStyle = existing;
      ownsPresentationStyle = false;
      return true;
    }
    const parent = document.head ?? document.documentElement;
    if (parent === null) return false;
    const style = document.createElement('style');
    style.dataset.ytafPresentationStyle = 'true';
    style.textContent = PRESENTATION_CSS;
    parent.append(style);
    presentationStyle = style;
    ownsPresentationStyle = true;
    return true;
  }

  /** @param {unknown} target @returns {PresentationResult} */
  function apply(target) {
    const requestedVideoId = targetVideoId(target);
    const resolved = resolvePlayer(document);
    if (
      disposed ||
      requestedVideoId === null ||
      resolved.snapshot.videoId !== requestedVideoId ||
      resolved.player === null ||
      resolved.video === null ||
      resolved.snapshot.mediaKind === 'short' ||
      resolved.snapshot.mediaKind === 'other'
    ) {
      restore();
      return { result: 'failed' };
    }
    if (
      presentation !== null &&
      presentation.player === resolved.player &&
      presentation.video === resolved.video
    )
      return { result: 'applied' };
    restore();
    if (!ensurePresentationStyle()) return { result: 'failed' };
    try {
      addOwnedClass(document.documentElement, ROOT_CLASS);
      if (document.body !== null) addOwnedClass(document.body, ROOT_CLASS);
      for (
        let ancestor = resolved.player.parentElement;
        ancestor !== null && ancestor !== document.documentElement;
        ancestor = ancestor.parentElement
      )
        addOwnedClass(ancestor, ANCESTOR_CLASS);
      addOwnedClass(resolved.player, PLAYER_CLASS);
      addOwnedClass(resolved.video, VIDEO_CLASS);
      presentation = {
        videoId: requestedVideoId,
        player: resolved.player,
        video: resolved.video,
      };
      return { result: 'applied' };
    } catch {
      restore();
      return { result: 'failed' };
    }
  }

  /** @param {boolean} [preserveResume] @returns {PresentationResult} */
  function restore(preserveResume = false) {
    for (const change of classChanges) {
      if (!change.existed) change.element.classList.remove(change.className);
    }
    classChanges = [];
    if (ownsPresentationStyle && presentationStyle?.isConnected)
      presentationStyle.remove();
    presentationStyle = null;
    ownsPresentationStyle = false;
    presentation = null;
    resumeOnEligiblePlayer = preserveResume;
    return { result: 'restored' };
  }

  /** @returns {PlayerSnapshot | null} */
  function mount() {
    if (mounted || disposed) return mounted ? refresh('state-change') : null;
    mounted = true;
    document.addEventListener('keydown', handleKeyboard, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('yt-navigate-finish', handleNavigation);
    if (MutationObserverClass !== undefined) {
      observer = new MutationObserverClass(handleMutations);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    reconciliationTimer = globalThis.setInterval(() => {
      if (!disposed) refresh('state-change');
    }, 1000);
    return refresh('initial');
  }

  function dispose() {
    if (disposed) return { result: 'restored' };
    restore();
    observer?.disconnect();
    observer?.takeRecords();
    observer = null;
    if (reconciliationTimer !== null)
      globalThis.clearInterval(reconciliationTimer);
    reconciliationTimer = null;
    observeVideo(null);
    document.removeEventListener('keydown', handleKeyboard, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('yt-navigate-finish', handleNavigation);
    disposed = true;
    mounted = false;
    return { result: 'restored' };
  }

  return Object.freeze({ mount, apply, restore, dispose });
}
