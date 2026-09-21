import { expect, test } from 'vitest';
import { validateEffect } from '../../../src/shared/contracts.js';
import {
  canEnterFullscreen,
  createInitialState,
  isEligibleMedia,
  transition,
} from '../../../src/domain/transition.js';

const documentIdentity = {
  tabId: 17,
  windowId: 4,
  documentId: 'doc_7e39',
  navigationGeneration: 12,
};

function operation(id) {
  return {
    operationId: id,
    requestId: `req_${id}`,
    createdAtEpochMs: 1760000000000,
  };
}

function context(overrides = {}) {
  return {
    tabFocused: true,
    windowFocused: true,
    windowState: 'normal',
    fullscreenOwner: 'none',
    ...overrides,
  };
}

function player(overrides = {}) {
  return {
    type: 'player:reported',
    tabId: 17,
    document: documentIdentity,
    videoId: 'dQw4w9WgXcQ',
    mediaKind: 'video',
    observationId: 1,
    operation: operation('enter_01'),
    ...overrides,
  };
}

function focusedState() {
  return transition(createInitialState(), {
    type: 'context:updated',
    tabId: 17,
    context: context(),
  }).state;
}

function activeState() {
  const entering = transition(focusedState(), player());
  const presenting = transition(entering.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'enter_01',
    kind: 'window:enter-fullscreen',
  });
  return transition(presenting.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'enter_01',
    result: 'applied',
  });
}

function expectValidEffects(effects) {
  expect(effects.every((effect) => validateEffect(effect).ok)).toBe(true);
}

test('table: only focused eligible video and live reports can initiate entry', () => {
  const cases = [
    ['video', context(), true],
    ['live', context(), true],
    ['short', context(), false],
    ['other', context(), false],
    ['video', context({ tabFocused: false }), false],
    ['video', context({ windowFocused: false }), false],
    ['video', context({ windowState: 'minimized' }), false],
    [
      'video',
      context({ windowState: 'fullscreen', fullscreenOwner: 'external' }),
      false,
    ],
  ];

  for (const [mediaKind, tabContext, shouldEnter] of cases) {
    const state = transition(createInitialState(), {
      type: 'context:updated',
      tabId: 17,
      context: tabContext,
    }).state;
    const result = transition(
      state,
      player({
        mediaKind,
        operation: operation(`enter_${mediaKind}_${tabContext.tabFocused}`),
      }),
    );
    expect(
      result.effects.some(
        (effect) => effect.kind === 'window:enter-fullscreen',
      ),
    ).toBe(shouldEnter);
    expectValidEffects(result.effects);
  }
});

test('keeps the functional core immutable and distinguishes external fullscreen', () => {
  const state = focusedState();
  Object.freeze(state.preference);
  Object.freeze(state.session.tabs);
  Object.freeze(state.session);
  Object.freeze(state.runtime);
  Object.freeze(state);

  const result = transition(state, player());
  expect(state.runtime).toEqual({
    17: {
      phase: 'idle',
      context: context(),
      video: null,
      operation: null,
      ownsWindow: false,
      suppressed: false,
    },
  });
  expect(result.state).not.toBe(state);
  expectValidEffects(result.effects);

  const external = transition(createInitialState(), {
    type: 'context:updated',
    tabId: 17,
    context: context({
      windowState: 'fullscreen',
      fullscreenOwner: 'external',
    }),
  }).state;
  expect(canEnterFullscreen(external.runtime['17'], external.preference)).toBe(
    false,
  );
  expect(transition(external, player()).effects).toHaveLength(1);
});

test('sequence: enters the extension-owned window and presents the exact video', () => {
  const entering = transition(focusedState(), player());
  expect(entering.state.runtime['17'].phase).toBe('entering');
  expect(entering.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'window:enter-fullscreen',
  ]);

  const presenting = transition(entering.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'enter_01',
    kind: 'window:enter-fullscreen',
  });
  expect(presenting.state.runtime['17']).toMatchObject({
    phase: 'presenting',
    ownsWindow: true,
  });
  expect(presenting.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'content:send',
  ]);
  expect(presenting.effects[1].message.type).toBe('presentation:apply');
  expectValidEffects(presenting.effects);

  const active = transition(presenting.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'enter_01',
    result: 'applied',
  });
  expect(active.state.runtime['17'].phase).toBe('active');
  expect(active.state.session.tabs['17'].operations).toEqual([]);
  expectValidEffects(active.effects);
});

test('sequence: Esc suppresses the current view through equivalent events and reload', () => {
  const active = activeState().state;
  const escaped = transition(active, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_01'),
    reason: 'escape',
    suppress: true,
  });
  expect(escaped.state.session.tabs['17'].suppression).toEqual({
    videoId: 'dQw4w9WgXcQ',
    videoGeneration: 1,
  });
  expect(escaped.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'content:send',
  ]);

  const repeated = transition(
    escaped.state,
    player({ observationId: 1, operation: operation('enter_again') }),
  );
  expect(repeated.effects).toEqual([]);

  const reloaded = transition(
    escaped.state,
    player({
      document: {
        ...documentIdentity,
        documentId: 'doc_reload',
        navigationGeneration: 13,
      },
      observationId: 1,
      operation: operation('enter_reload'),
    }),
  );
  expect(reloaded.state.runtime['17'].suppressed).toBe(true);
  expect(
    reloaded.effects.some(
      (effect) => effect.kind === 'window:enter-fullscreen',
    ),
  ).toBe(false);
  expectValidEffects(reloaded.effects);
});

test('sequence: a real video change releases Esc and starts a new generation', () => {
  const active = activeState().state;
  const escaped = transition(active, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_01'),
    reason: 'escape',
    suppress: true,
  });
  const changed = transition(
    escaped.state,
    player({
      videoId: 'new_video_01',
      observationId: 2,
      operation: operation('enter_02'),
    }),
  );
  expect(changed.state.runtime['17'].video).toMatchObject({
    videoId: 'new_video_01',
    videoGeneration: 2,
  });
  expect(changed.state.runtime['17'].suppressed).toBe(false);
  expect(
    changed.effects.some((effect) => effect.kind === 'window:enter-fullscreen'),
  ).toBe(false);
  expect(changed.state.runtime['17'].phase).toBe('restoring');
});

test('reapplies the presentation when a new video arrives after the old player was removed', () => {
  const active = activeState().state;
  const replacement = transition(
    active,
    player({
      videoId: 'replacement_video',
      observationId: 2,
      operation: operation('present_replacement'),
    }),
  );
  expect(replacement.state.runtime['17']).toMatchObject({
    phase: 'presenting',
    ownsWindow: true,
    video: { videoId: 'replacement_video', videoGeneration: 2 },
  });
  expect(replacement.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'content:send',
  ]);
  expect(replacement.effects[1]).toMatchObject({
    operationId: 'present_replacement',
    message: {
      type: 'presentation:apply',
      payload: { target: { videoId: 'replacement_video' } },
    },
  });
  expectValidEffects(replacement.effects);
});

test('reapplies the presentation after a document reload of the same video', () => {
  const active = activeState().state;
  const reloaded = transition(
    active,
    player({
      document: {
        ...documentIdentity,
        documentId: 'doc_reloaded',
        navigationGeneration: 13,
      },
      observationId: 1,
      operation: operation('present_reloaded'),
    }),
  );

  expect(reloaded.state.runtime['17']).toMatchObject({
    phase: 'presenting',
    ownsWindow: true,
    video: {
      videoId: 'dQw4w9WgXcQ',
      videoGeneration: 1,
      document: { documentId: 'doc_reloaded' },
    },
  });
  expect(reloaded.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'content:send',
  ]);
  expect(reloaded.effects[1]).toMatchObject({
    operationId: 'present_reloaded',
    message: {
      type: 'presentation:apply',
      payload: { target: { videoId: 'dQw4w9WgXcQ' } },
    },
  });
  expectValidEffects(reloaded.effects);
});

test('ignores stale success, stale generation and repeated reports without effects', () => {
  const entering = transition(focusedState(), player());
  expect(
    transition(entering.state, {
      type: 'operation:succeeded',
      tabId: 17,
      operationId: 'old',
      kind: 'window:enter-fullscreen',
    }),
  ).toEqual({ state: entering.state, effects: [] });
  expect(transition(entering.state, player())).toEqual({
    state: entering.state,
    effects: [],
  });
  expect(
    transition(
      entering.state,
      player({
        document: { ...documentIdentity, navigationGeneration: 11 },
        observationId: 2,
      }),
    ),
  ).toEqual({ state: entering.state, effects: [] });
});

test('sequence: disabling during an entry invalidates it and its later success', () => {
  const entering = transition(focusedState(), player());
  const disabled = transition(entering.state, {
    type: 'preference:changed',
    enabled: false,
    revision: 1,
    exits: { 17: operation('disable_01') },
    entries: {},
    reactivation: false,
  });
  expect(disabled.state.preference.enabled).toBe(false);
  expect(disabled.state.runtime['17'].phase).toBe('idle');
  expect(
    disabled.effects.some((effect) => effect.kind === 'window:restore'),
  ).toBe(false);
  expect(
    transition(disabled.state, {
      type: 'operation:succeeded',
      tabId: 17,
      operationId: 'enter_01',
      kind: 'window:enter-fullscreen',
    }),
  ).toEqual({ state: disabled.state, effects: [] });
  expectValidEffects(disabled.effects);
});

test('sequence: exit restores presentation then only the window owned by the extension', () => {
  const active = activeState().state;
  const restoring = transition(active, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_01'),
    reason: 'preference-disabled',
    suppress: false,
  });
  expect(restoring.state.runtime['17'].phase).toBe('restoring');
  expect(restoring.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'content:send',
  ]);

  const windowExit = transition(restoring.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'exit_01',
    result: 'restored',
  });
  expect(windowExit.state.runtime['17'].phase).toBe('exiting-window');
  expect(windowExit.effects.map((effect) => effect.kind)).toEqual([
    'storage:write-session',
    'window:restore',
  ]);

  const idle = transition(windowExit.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'exit_01',
    kind: 'window:restore',
  });
  expect(idle.state.runtime['17']).toMatchObject({
    phase: 'idle',
    ownsWindow: false,
  });
  expectValidEffects([
    ...restoring.effects,
    ...windowExit.effects,
    ...idle.effects,
  ]);
});

test('compensates a failed presentation but ignores failure of an unrelated operation', () => {
  const entering = transition(focusedState(), player());
  const presenting = transition(entering.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'enter_01',
    kind: 'window:enter-fullscreen',
  });
  const failed = transition(presenting.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'enter_01',
    result: 'failed',
  });
  expect(failed.state.runtime['17'].phase).toBe('exiting-window');
  expect(
    failed.effects.some((effect) => effect.kind === 'window:restore'),
  ).toBe(true);
  expect(
    transition(presenting.state, {
      type: 'operation:failed',
      tabId: 17,
      operationId: 'other',
    }),
  ).toEqual({ state: presenting.state, effects: [] });
});

test('cancels an entering video when a newer video arrives and does not accept its response', () => {
  const entering = transition(focusedState(), player());
  const changed = transition(
    entering.state,
    player({
      videoId: 'new_video_01',
      observationId: 2,
      operation: operation('enter_02'),
    }),
  );
  expect(changed.state.runtime['17']).toMatchObject({
    phase: 'entering',
    operation: operation('enter_02'),
  });
  expect(
    transition(changed.state, {
      type: 'operation:succeeded',
      tabId: 17,
      operationId: 'enter_01',
      kind: 'window:enter-fullscreen',
    }),
  ).toEqual({ state: changed.state, effects: [] });
  expectValidEffects(changed.effects);
});

test('explicit reactivation clears Esc and may enter the eligible current tab', () => {
  const active = activeState().state;
  const escaped = transition(active, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_01'),
    reason: 'escape',
    suppress: true,
  });
  const windowExit = transition(escaped.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'exit_01',
    result: 'restored',
  });
  const idle = transition(windowExit.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'exit_01',
    kind: 'window:restore',
  });
  const enabled = transition(idle.state, {
    type: 'preference:changed',
    enabled: true,
    revision: 1,
    exits: {},
    entries: { 17: operation('reenter_01') },
    reactivation: true,
  });
  expect(enabled.state.runtime['17']).toMatchObject({
    suppressed: false,
    phase: 'entering',
  });
  expect(
    enabled.effects.some((effect) => effect.kind === 'window:enter-fullscreen'),
  ).toBe(true);
  expectValidEffects(enabled.effects);
});

test('recognizes only direct videos and lives as eligible media', () => {
  expect(isEligibleMedia('video')).toBe(true);
  expect(isEligibleMedia('live')).toBe(true);
  expect(isEligibleMedia('short')).toBe(false);
  expect(isEligibleMedia('other')).toBe(false);
});

test('treats every unmatched completion and unknown event as a harmless no-op', () => {
  const entering = transition(focusedState(), player());
  expect(
    transition(entering.state, {
      type: 'operation:succeeded',
      tabId: 17,
      operationId: 'enter_01',
      kind: 'window:restore',
    }),
  ).toEqual({ state: entering.state, effects: [] });
  expect(
    transition(entering.state, {
      type: 'presentation:result',
      tabId: 17,
      operationId: 'enter_01',
      result: 'restored',
    }),
  ).toEqual({ state: entering.state, effects: [] });
  expect(transition(entering.state, { type: 'unknown' })).toEqual({
    state: entering.state,
    effects: [],
  });
});

test('handles every failure path without reviving an entry', () => {
  const entering = transition(focusedState(), player());
  const failedEntry = transition(entering.state, {
    type: 'operation:failed',
    tabId: 17,
    operationId: 'enter_01',
  });
  expect(failedEntry.state.runtime['17'].phase).toBe('idle');
  expectValidEffects(failedEntry.effects);

  const presenting = transition(entering.state, {
    type: 'operation:succeeded',
    tabId: 17,
    operationId: 'enter_01',
    kind: 'window:enter-fullscreen',
  });
  const partial = transition(presenting.state, {
    type: 'presentation:result',
    tabId: 17,
    operationId: 'enter_01',
    result: 'partial',
  });
  expect(partial.state.runtime['17'].phase).toBe('exiting-window');
  expectValidEffects(partial.effects);

  const restoring = transition(activeState().state, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_02'),
    reason: 'cleanup',
    suppress: false,
  });
  for (const result of ['failed', 'partial']) {
    const exit = transition(restoring.state, {
      type: 'presentation:result',
      tabId: 17,
      operationId: 'exit_02',
      result,
    });
    expect(exit.state.runtime['17'].phase).toBe('exiting-window');
    expectValidEffects(exit.effects);
  }
});

test('keeps an externally owned or unconfirmed window out of restoration', () => {
  const reported = transition(focusedState(), player()).state;
  const unowned = {
    ...reported,
    runtime: {
      ...reported.runtime,
      17: { ...reported.runtime['17'], ownsWindow: false },
    },
  };
  const exit = transition(unowned, {
    type: 'exit:requested',
    tabId: 17,
    operation: operation('exit_03'),
    reason: 'cleanup',
    suppress: false,
  });
  expect(exit.effects.some((effect) => effect.kind === 'window:restore')).toBe(
    false,
  );

  const withoutSession = {
    ...unowned,
    session: { ...unowned.session, tabs: {} },
  };
  expect(
    transition(withoutSession, {
      type: 'exit:requested',
      tabId: 17,
      operation: operation('exit_04'),
      reason: 'cleanup',
      suppress: false,
    }),
  ).toEqual({
    state: expect.any(Object),
    effects: [],
  });
});
