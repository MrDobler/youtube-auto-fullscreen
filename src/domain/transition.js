import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
} from '../shared/contracts.js';

const ELIGIBLE_MEDIA = new Set(['video', 'live']);

/** @typedef {'video'|'live'|'short'|'other'} MediaKind */
/** @typedef {'idle'|'entering'|'presenting'|'active'|'restoring'|'exiting-window'} Phase */
/** @typedef {'none'|'extension'|'external'} FullscreenOwner */
/** @typedef {{ operationId: string, requestId: string, createdAtEpochMs: number }} OperationInput */
/** @typedef {{ tabFocused: boolean, windowFocused: boolean, windowState: 'normal'|'maximized'|'fullscreen'|'minimized', fullscreenOwner: FullscreenOwner }} TabContext */
/** @typedef {{ document: import('../shared/contracts.js').DocumentIdentity, videoId: string, videoGeneration: number, observationId: number, mediaKind: MediaKind }} ActiveVideo */
/** @typedef {{ phase: Phase, context: TabContext, video: ActiveVideo | null, operation: OperationInput | null, ownsWindow: boolean, suppressed: boolean }} RuntimeTab */
/** @typedef {{ preference: import('../shared/contracts.js').PreferenceRecord, session: import('../shared/contracts.js').SessionRecord, runtime: Record<string, RuntimeTab> }} DomainState */

const DEFAULT_CONTEXT = Object.freeze({
  tabFocused: false,
  windowFocused: false,
  windowState: 'normal',
  fullscreenOwner: 'none',
});

/** @returns {DomainState} */
export function createInitialState() {
  return {
    preference: {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      enabled: true,
      revision: 0,
    },
    session: { schemaVersion: STORAGE_SCHEMA_VERSION, tabs: {} },
    runtime: {},
  };
}

/** @param {MediaKind} mediaKind */
export function isEligibleMedia(mediaKind) {
  return ELIGIBLE_MEDIA.has(mediaKind);
}

/** @param {RuntimeTab} tab @param {import('../shared/contracts.js').PreferenceRecord} preference */
export function canEnterFullscreen(tab, preference) {
  return (
    preference.enabled &&
    tab.video !== null &&
    isEligibleMedia(tab.video.mediaKind) &&
    tab.context.tabFocused &&
    tab.context.windowFocused &&
    tab.context.windowState !== 'minimized' &&
    tab.context.fullscreenOwner === 'none' &&
    tab.phase === 'idle' &&
    !tab.suppressed
  );
}

/** @param {DomainState} state @param {number} tabId */
function runtimeTab(state, tabId) {
  return (
    state.runtime[String(tabId)] ?? {
      phase: 'idle',
      context: DEFAULT_CONTEXT,
      video: null,
      operation: null,
      ownsWindow: false,
      suppressed: false,
    }
  );
}

/** @param {DomainState} state @param {number} tabId @param {RuntimeTab} tab */
function replaceRuntimeTab(state, tabId, tab) {
  return { ...state, runtime: { ...state.runtime, [String(tabId)]: tab } };
}

/** @param {DomainState} state @param {number} tabId @param {import('../shared/contracts.js').TabSession} tab */
function replaceSessionTab(state, tabId, tab) {
  return {
    ...state,
    session: {
      ...state.session,
      tabs: { ...state.session.tabs, [String(tabId)]: tab },
    },
  };
}

/** @param {DomainState} state @param {number} tabId */
function removeSessionOperation(state, tabId) {
  const sessionTab = state.session.tabs[String(tabId)];
  if (!sessionTab) return state;
  return replaceSessionTab(state, tabId, { ...sessionTab, operations: [] });
}

/** @param {DomainState} state */
function sessionEffect(state) {
  return { kind: 'storage:write-session', session: state.session };
}

/** @param {OperationInput} operation @param {string} kind @param {import('../shared/contracts.js').VideoIdentity | null} target @param {string[]} completedEffects @param {string[]} pendingEffects */
function pendingOperation(
  operation,
  kind,
  target,
  completedEffects,
  pendingEffects,
) {
  return {
    operationId: operation.operationId,
    kind,
    target,
    createdAtEpochMs: operation.createdAtEpochMs,
    completedEffects,
    pendingEffects,
  };
}

/** @param {ActiveVideo} video */
function videoIdentity(video) {
  return {
    document: video.document,
    videoId: video.videoId,
    videoGeneration: video.videoGeneration,
  };
}

/** @param {DomainState} state @param {number} tabId @param {OperationInput} operation */
function beginEntry(state, tabId, operation) {
  const tab = runtimeTab(state, tabId);
  if (!canEnterFullscreen(tab, state.preference)) return { state, effects: [] };
  const target = videoIdentity(/** @type {ActiveVideo} */ (tab.video));
  const sessionTab = {
    document: target.document,
    video: target,
    suppression: state.session.tabs[String(tabId)]?.suppression ?? null,
    operations: [
      pendingOperation(
        operation,
        'window:enter-fullscreen',
        target,
        ['storage:write-session'],
        ['window:enter-fullscreen'],
      ),
    ],
  };
  let next = replaceSessionTab(state, tabId, sessionTab);
  next = replaceRuntimeTab(next, tabId, {
    ...tab,
    phase: 'entering',
    operation,
    ownsWindow: false,
  });
  return {
    state: next,
    effects: [
      sessionEffect(next),
      {
        kind: 'window:enter-fullscreen',
        operationId: operation.operationId,
        windowId: target.document.windowId,
      },
    ],
  };
}

/** @param {DomainState} state @param {number} tabId @param {OperationInput} operation @param {'escape'|'preference-disabled'|'navigation'|'cleanup'} reason */
function beginExit(state, tabId, operation, reason) {
  const tab = runtimeTab(state, tabId);
  if (tab.video === null || !tab.ownsWindow) {
    const cleared = removeSessionOperation(state, tabId);
    const next = replaceRuntimeTab(cleared, tabId, {
      ...tab,
      phase: 'idle',
      operation: null,
      ownsWindow: false,
    });
    return {
      state: next,
      effects: cleared === state ? [] : [sessionEffect(next)],
    };
  }
  const target = videoIdentity(tab.video);
  const sessionTab = {
    ...state.session.tabs[String(tabId)],
    operations: [
      pendingOperation(
        operation,
        'presentation:restore',
        target,
        ['storage:write-session'],
        ['content:send'],
      ),
    ],
  };
  let next = replaceSessionTab(state, tabId, sessionTab);
  next = replaceRuntimeTab(next, tabId, {
    ...tab,
    phase: 'restoring',
    operation,
  });
  return {
    state: next,
    effects: [
      sessionEffect(next),
      {
        kind: 'content:send',
        operationId: operation.operationId,
        message: {
          protocolVersion: PROTOCOL_VERSION,
          type: MESSAGE_TYPES.PRESENTATION_RESTORE,
          requestId: operation.requestId,
          operationId: operation.operationId,
          payload: { target, reason },
        },
      },
    ],
  };
}

/** @param {DomainState} state @param {{ tabId: number, context: TabContext }} event */
function updateContext(state, event) {
  const tab = runtimeTab(state, event.tabId);
  const next = replaceRuntimeTab(state, event.tabId, {
    ...tab,
    context: event.context,
  });
  return { state: next, effects: [] };
}

/** @param {DomainState} state @param {{ tabId: number, document: import('../shared/contracts.js').DocumentIdentity, videoId: string, mediaKind: MediaKind, observationId: number, operation: OperationInput }} event */
function reportPlayer(state, event) {
  const tab = runtimeTab(state, event.tabId);
  if (
    tab.video !== null &&
    event.document.navigationGeneration <
      tab.video.document.navigationGeneration
  ) {
    return { state, effects: [] };
  }
  if (
    tab.video !== null &&
    event.document.documentId === tab.video.document.documentId &&
    event.observationId <= tab.video.observationId
  ) {
    return { state, effects: [] };
  }
  const previousVideo = tab.video;
  const sameVideo =
    previousVideo !== null && previousVideo.videoId === event.videoId;
  const video = {
    document: event.document,
    videoId: event.videoId,
    mediaKind: event.mediaKind,
    observationId: event.observationId,
    videoGeneration:
      sameVideo && previousVideo !== null
        ? previousVideo.videoGeneration
        : (previousVideo?.videoGeneration ?? 0) + 1,
  };
  const previousSuppression =
    state.session.tabs[String(event.tabId)]?.suppression ?? null;
  const suppression =
    sameVideo && previousSuppression?.videoGeneration === video.videoGeneration
      ? previousSuppression
      : null;
  const sessionTab = {
    document: event.document,
    video: videoIdentity(video),
    suppression,
    operations: state.session.tabs[String(event.tabId)]?.operations ?? [],
  };
  let next = replaceSessionTab(state, event.tabId, sessionTab);
  next = replaceRuntimeTab(next, event.tabId, {
    ...tab,
    video,
    suppressed: suppression !== null,
  });
  if (!sameVideo && tab.phase === 'entering') {
    next = removeSessionOperation(next, event.tabId);
    next = replaceRuntimeTab(next, event.tabId, {
      ...runtimeTab(next, event.tabId),
      phase: 'idle',
      operation: null,
    });
  }
  const entry = beginEntry(next, event.tabId, event.operation);
  return entry.effects.length === 0
    ? { state: entry.state, effects: [sessionEffect(entry.state)] }
    : entry;
}

/** @param {DomainState} state @param {{ tabId: number, operation: OperationInput, reason: 'escape'|'preference-disabled'|'navigation'|'cleanup', suppress: boolean }} event */
function exitRequested(state, event) {
  const tab = runtimeTab(state, event.tabId);
  if (tab.video === null) return { state, effects: [] };
  let next = state;
  if (event.suppress) {
    const previous = state.session.tabs[String(event.tabId)];
    next = replaceSessionTab(next, event.tabId, {
      ...(previous ?? {
        document: tab.video.document,
        video: videoIdentity(tab.video),
        operations: [],
      }),
      suppression: {
        videoId: tab.video.videoId,
        videoGeneration: tab.video.videoGeneration,
      },
    });
    next = replaceRuntimeTab(next, event.tabId, { ...tab, suppressed: true });
  }
  const exit = beginExit(next, event.tabId, event.operation, event.reason);
  if (exit.effects.length === 0 && next !== state)
    return { state: exit.state, effects: [sessionEffect(exit.state)] };
  return exit;
}

/** @param {DomainState} state @param {{ tabId: number, operationId: string, kind: string }} event */
function operationSucceeded(state, event) {
  const tab = runtimeTab(state, event.tabId);
  if (tab.operation?.operationId !== event.operationId)
    return { state, effects: [] };
  if (
    tab.phase === 'entering' &&
    event.kind === 'window:enter-fullscreen' &&
    tab.video !== null
  ) {
    const target = videoIdentity(tab.video);
    const sessionTab = {
      ...state.session.tabs[String(event.tabId)],
      operations: [
        pendingOperation(
          tab.operation,
          'presentation:apply',
          target,
          ['storage:write-session', 'window:enter-fullscreen'],
          ['content:send'],
        ),
      ],
    };
    let next = replaceSessionTab(state, event.tabId, sessionTab);
    next = replaceRuntimeTab(next, event.tabId, {
      ...tab,
      phase: 'presenting',
      ownsWindow: true,
    });
    return {
      state: next,
      effects: [
        sessionEffect(next),
        {
          kind: 'content:send',
          operationId: tab.operation.operationId,
          message: {
            protocolVersion: PROTOCOL_VERSION,
            type: MESSAGE_TYPES.PRESENTATION_APPLY,
            requestId: tab.operation.requestId,
            operationId: tab.operation.operationId,
            payload: { target },
          },
        },
      ],
    };
  }
  if (tab.phase === 'exiting-window' && event.kind === 'window:restore') {
    let next = removeSessionOperation(state, event.tabId);
    next = replaceRuntimeTab(next, event.tabId, {
      ...tab,
      phase: 'idle',
      operation: null,
      ownsWindow: false,
    });
    return { state: next, effects: [sessionEffect(next)] };
  }
  return { state, effects: [] };
}

/** @param {DomainState} state @param {{ tabId: number, operationId: string, result: 'applied'|'restored'|'partial'|'failed' }} event */
function presentationResult(state, event) {
  const tab = runtimeTab(state, event.tabId);
  if (tab.operation?.operationId !== event.operationId)
    return { state, effects: [] };
  if (tab.phase === 'presenting' && event.result === 'applied') {
    let next = removeSessionOperation(state, event.tabId);
    next = replaceRuntimeTab(next, event.tabId, { ...tab, phase: 'active' });
    return { state: next, effects: [sessionEffect(next)] };
  }
  if (
    tab.phase === 'presenting' &&
    (event.result === 'failed' || event.result === 'partial')
  ) {
    const target = tab.video === null ? null : videoIdentity(tab.video);
    const sessionTab = {
      ...state.session.tabs[String(event.tabId)],
      operations: [
        pendingOperation(
          tab.operation,
          'window:restore',
          target,
          ['storage:write-session', 'window:enter-fullscreen'],
          ['window:restore'],
        ),
      ],
    };
    let next = replaceSessionTab(state, event.tabId, sessionTab);
    next = replaceRuntimeTab(next, event.tabId, {
      ...tab,
      phase: 'exiting-window',
    });
    return {
      state: next,
      effects: [
        sessionEffect(next),
        {
          kind: 'window:restore',
          operationId: tab.operation.operationId,
          windowId: tab.video?.document.windowId ?? 0,
        },
      ],
    };
  }
  if (
    tab.phase === 'restoring' &&
    (event.result === 'restored' ||
      event.result === 'failed' ||
      event.result === 'partial')
  ) {
    const target = tab.video === null ? null : videoIdentity(tab.video);
    const sessionTab = {
      ...state.session.tabs[String(event.tabId)],
      operations: [
        pendingOperation(
          tab.operation,
          'window:restore',
          target,
          ['storage:write-session', 'content:send'],
          ['window:restore'],
        ),
      ],
    };
    let next = replaceSessionTab(state, event.tabId, sessionTab);
    next = replaceRuntimeTab(next, event.tabId, {
      ...tab,
      phase: 'exiting-window',
    });
    return {
      state: next,
      effects: [
        sessionEffect(next),
        {
          kind: 'window:restore',
          operationId: tab.operation.operationId,
          windowId: tab.video?.document.windowId ?? 0,
        },
      ],
    };
  }
  return { state, effects: [] };
}

/** @param {DomainState} state @param {{ tabId: number, operationId: string }} event */
function operationFailed(state, event) {
  const tab = runtimeTab(state, event.tabId);
  if (tab.operation?.operationId !== event.operationId)
    return { state, effects: [] };
  if (tab.phase === 'entering') {
    let next = removeSessionOperation(state, event.tabId);
    next = replaceRuntimeTab(next, event.tabId, {
      ...tab,
      phase: 'idle',
      operation: null,
    });
    return { state: next, effects: [sessionEffect(next)] };
  }
  return presentationResult(state, { ...event, result: 'failed' });
}

/** @param {DomainState} state @param {{ enabled: boolean, revision: number, exits: Record<string, OperationInput>, reactivation: boolean, entries: Record<string, OperationInput> }} event */
function changePreference(state, event) {
  let next = {
    ...state,
    preference: {
      ...state.preference,
      enabled: event.enabled,
      revision: event.revision,
    },
  };
  /** @type {unknown[]} */
  let effects = [
    { kind: 'storage:write-preference', preference: next.preference },
  ];
  for (const [tabId, tab] of Object.entries(next.runtime)) {
    const numericTabId = Number(tabId);
    if (!event.enabled && event.exits[tabId]) {
      const exit = beginExit(
        next,
        numericTabId,
        event.exits[tabId],
        'preference-disabled',
      );
      next = exit.state;
      effects = [...effects, ...exit.effects];
    }
    if (event.enabled && event.reactivation && tab.video !== null) {
      const sessionTab = next.session.tabs[tabId];
      if (sessionTab?.suppression !== null) {
        next = replaceSessionTab(next, numericTabId, {
          ...sessionTab,
          suppression: null,
        });
        next = replaceRuntimeTab(next, numericTabId, {
          ...runtimeTab(next, numericTabId),
          suppressed: false,
        });
        effects = [...effects, sessionEffect(next)];
      }
      if (event.entries[tabId]) {
        const entry = beginEntry(next, numericTabId, event.entries[tabId]);
        next = entry.state;
        effects = [...effects, ...entry.effects];
      }
    }
  }
  return { state: next, effects };
}

/**
 * Pure state transition. All IDs, timestamps, trusted identities and context
 * are event data supplied by adapters; malformed or stale events do nothing.
 *
 * @param {DomainState} state
 * @param {any} event
 */
export function transition(state, event) {
  switch (event?.type) {
    case 'context:updated':
      return updateContext(state, event);
    case 'player:reported':
      return reportPlayer(state, event);
    case 'exit:requested':
      return exitRequested(state, event);
    case 'operation:succeeded':
      return operationSucceeded(state, event);
    case 'operation:failed':
      return operationFailed(state, event);
    case 'presentation:result':
      return presentationResult(state, event);
    case 'preference:changed':
      return changePreference(state, event);
    default:
      return { state, effects: [] };
  }
}
