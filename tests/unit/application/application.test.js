import { beforeEach, expect, test, vi } from 'vitest';
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
} from '../../../src/shared/contracts.js';
import { createApplication } from '../../../src/application/application.js';

const documentIdentity = {
  tabId: 7,
  windowId: 3,
  documentId: 'doc_01',
  navigationGeneration: 1,
};

function success(value) {
  return { ok: true, value };
}

function failure(message) {
  return { ok: false, error: { message } };
}

function playerMessage(videoId = 'video_01', observationId = 1) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PLAYER_REPORTED,
    requestId: `req_player_${observationId}`,
    payload: { videoId, observationId, reason: 'initial' },
  };
}

function exitMessage() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
    requestId: 'req_exit',
    payload: { videoId: 'video_01', observationId: 1, reason: 'escape' },
  };
}

function popupMessage(enabled) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_SET,
    requestId: 'req_popup',
    payload: { enabled },
  };
}

function preferenceGet() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_GET,
    requestId: 'req_get',
    payload: {},
  };
}

function fakeAdapters(overrides = {}) {
  const adapters = {
    readPreference: vi.fn().mockResolvedValue(success(null)),
    readSession: vi.fn().mockResolvedValue(success(null)),
    writePreference: vi
      .fn()
      .mockImplementation(async (value) => success(value)),
    persistIntent: vi.fn().mockImplementation(async (value) => success(value)),
    recordCompletion: vi
      .fn()
      .mockImplementation(async (value) => success(value)),
    contentContext: vi
      .fn()
      .mockImplementation((sender) =>
        sender?.kind === 'content'
          ? success({ kind: 'content', document: documentIdentity })
          : failure('not content'),
      ),
    popupContext: vi.fn().mockImplementation((sender) =>
      sender?.kind === 'popup'
        ? success({
            kind: 'popup',
            url: 'chrome-extension://own/popup/index.html',
          })
        : failure('not popup'),
    ),
    tabContext: vi.fn().mockResolvedValue(
      success({
        tabFocused: true,
        windowFocused: true,
        windowState: 'normal',
        fullscreenOwner: 'none',
      }),
    ),
    enterFullscreen: vi.fn().mockResolvedValue(
      success({
        operationId: 'owned',
        windowId: 3,
        previousState: 'normal',
        changed: true,
      }),
    ),
    restoreOwnedWindow: vi.fn().mockResolvedValue(success({ restored: true })),
    sendToDocument: vi.fn().mockImplementation(async (_document, message) =>
      success({
        protocolVersion: PROTOCOL_VERSION,
        type: MESSAGE_TYPES.PRESENTATION_RESULT,
        requestId: message.requestId,
        operationId: message.operationId,
        payload: {
          target: message.payload.target,
          result:
            message.type === MESSAGE_TYPES.PRESENTATION_APPLY
              ? 'applied'
              : 'restored',
        },
      }),
    ),
    ...overrides,
  };
  return adapters;
}

let identifiers;
beforeEach(() => {
  identifiers = 0;
});

function application(adapters) {
  return createApplication({
    adapters,
    now: () => 1000,
    createIdentifier: (prefix) => `${prefix}_${(identifiers += 1)}`,
  });
}

test('runs the complete player-to-window-to-presentation flow and Esc restoration', async () => {
  const adapters = fakeAdapters();
  const app = application(adapters);

  await app.receiveMessage(playerMessage(), { kind: 'content' });
  expect(app.snapshot().state.runtime['7']).toMatchObject({
    phase: 'active',
    ownsWindow: true,
    suppressed: false,
  });
  expect(adapters.enterFullscreen).toHaveBeenCalledOnce();
  expect(adapters.sendToDocument.mock.calls[0][1].type).toBe(
    MESSAGE_TYPES.PRESENTATION_APPLY,
  );

  await app.receiveMessage(exitMessage(), { kind: 'content' });
  expect(app.snapshot().state.runtime['7']).toMatchObject({
    phase: 'idle',
    ownsWindow: false,
    suppressed: true,
  });
  expect(adapters.restoreOwnedWindow).toHaveBeenCalledOnce();
  expect(adapters.sendToDocument.mock.calls[1][1].type).toBe(
    MESSAGE_TYPES.PRESENTATION_RESTORE,
  );
});

test('persists the popup preference before confirming it and restores active windows', async () => {
  const adapters = fakeAdapters();
  const app = application(adapters);
  await app.receiveMessage(playerMessage(), { kind: 'content' });

  const response = await app.receiveMessage(popupMessage(false), {
    kind: 'popup',
  });
  expect(response).toMatchObject({
    type: MESSAGE_TYPES.PREFERENCE_RESULT,
    payload: {
      preference: {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        enabled: false,
        revision: 1,
      },
    },
  });
  expect(adapters.writePreference).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, revision: 1 }),
  );
  expect(adapters.restoreOwnedWindow).toHaveBeenCalledOnce();
  expect(app.snapshot().state.preference.enabled).toBe(false);
});

test('keeps an error record and compensates when window entry or presentation fails', async () => {
  const adapters = fakeAdapters({
    enterFullscreen: vi.fn().mockResolvedValue(failure('window failed')),
  });
  const app = application(adapters);
  await app.receiveMessage(playerMessage(), { kind: 'content' });
  expect(app.snapshot().state.runtime['7'].phase).toBe('idle');
  expect(app.snapshot().failures).toContain('window failed');

  const presentationFailure = fakeAdapters({
    sendToDocument: vi.fn().mockResolvedValue(success({ type: 'wrong' })),
  });
  const second = application(presentationFailure);
  await second.receiveMessage(playerMessage(), { kind: 'content' });
  expect(second.snapshot().state.runtime['7'].phase).toBe('idle');
  expect(presentationFailure.restoreOwnedWindow).toHaveBeenCalledOnce();
  expect(second.snapshot().failures).toContain(
    'Content returned an invalid presentation reply.',
  );
});

test('rejects untrusted messages, refreshes known contexts and cleans up a closed tab', async () => {
  const adapters = fakeAdapters();
  const app = application(adapters);
  await expect(
    app.receiveMessage(playerMessage(), { kind: 'foreign' }),
  ).resolves.toBeNull();
  expect(app.snapshot().state.runtime).toEqual({});

  await app.receiveMessage(playerMessage(), { kind: 'content' });
  await app.refreshKnownContexts();
  expect(adapters.tabContext).toHaveBeenCalledTimes(2);
  await app.removeTab(7);
  expect(app.snapshot().state.runtime).toEqual({});
  expect(app.snapshot().state.session.tabs).toEqual({});
  expect(adapters.recordCompletion).toHaveBeenCalled();
});

test('uses stored records, defaults safely after read failures and confirms a no-op preference', async () => {
  const storedPreference = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    enabled: false,
    revision: 4,
  };
  const adapters = fakeAdapters({
    readPreference: vi.fn().mockResolvedValue(success(storedPreference)),
    readSession: vi.fn().mockResolvedValue(failure('session unreadable')),
  });
  const app = application(adapters);
  await app.initialize();
  expect(app.snapshot()).toMatchObject({
    state: { preference: storedPreference },
    failures: ['session unreadable'],
  });
  await expect(
    app.receiveMessage(preferenceGet(), { kind: 'popup' }),
  ).resolves.toMatchObject({
    payload: { preference: storedPreference },
  });
  await expect(
    app.receiveMessage(popupMessage(false), { kind: 'popup' }),
  ).resolves.toMatchObject({
    payload: { preference: storedPreference },
  });
  expect(adapters.writePreference).not.toHaveBeenCalled();

  const fallback = application(
    fakeAdapters({
      readPreference: vi
        .fn()
        .mockResolvedValue(failure('preference unreadable')),
    }),
  );
  await fallback.initialize();
  expect(fallback.snapshot().failures).toContain('preference unreadable');
});

test('records context, restore and content-reply failures without leaving operations pending', async () => {
  const contextFailure = application(
    fakeAdapters({
      tabContext: vi.fn().mockResolvedValue(failure('context unavailable')),
    }),
  );
  await contextFailure.receiveMessage(playerMessage(), { kind: 'content' });
  expect(contextFailure.snapshot().failures).toContain('context unavailable');

  const noOwnedChange = application(
    fakeAdapters({
      enterFullscreen: vi.fn().mockResolvedValue(
        success({
          operationId: 'external',
          windowId: 3,
          previousState: 'normal',
          changed: false,
        }),
      ),
    }),
  );
  await noOwnedChange.receiveMessage(playerMessage(), { kind: 'content' });
  await noOwnedChange.receiveMessage(exitMessage(), { kind: 'content' });
  expect(noOwnedChange.snapshot().state.runtime['7'].phase).toBe('idle');

  const messageFailure = application(
    fakeAdapters({
      sendToDocument: vi.fn().mockResolvedValue(failure('receiver gone')),
    }),
  );
  await messageFailure.receiveMessage(playerMessage(), { kind: 'content' });
  expect(messageFailure.snapshot().failures).toContain('receiver gone');
  expect(messageFailure.snapshot().state.runtime['7'].phase).toBe('idle');

  const restorationFailure = application(
    fakeAdapters({
      restoreOwnedWindow: vi.fn().mockResolvedValue(failure('restore failed')),
    }),
  );
  await restorationFailure.receiveMessage(playerMessage(), { kind: 'content' });
  await restorationFailure.receiveMessage(exitMessage(), { kind: 'content' });
  expect(restorationFailure.snapshot().failures).toContain('restore failed');
});

test('handles preference write failure, malformed content and cleanup persistence failure', async () => {
  const preferenceFailure = application(
    fakeAdapters({
      writePreference: vi
        .fn()
        .mockResolvedValue(failure('preference write failed')),
    }),
  );
  await expect(
    preferenceFailure.receiveMessage(popupMessage(false), { kind: 'popup' }),
  ).resolves.toBeNull();
  expect(preferenceFailure.snapshot().failures).toContain(
    'preference write failed',
  );

  const adapters = fakeAdapters({
    recordCompletion: vi.fn().mockResolvedValue(failure('cleanup failed')),
  });
  const app = application(adapters);
  await expect(
    app.receiveMessage({ type: 'broken' }, { kind: 'content' }),
  ).resolves.toBeNull();
  await app.removeTab(99);
  expect(app.snapshot().failures).toContain('cleanup failed');
});

test('serializes initialization and derives navigation generations from trusted sender fields', async () => {
  const adapters = fakeAdapters();
  const app = createApplication({ adapters });
  await Promise.all([app.initialize(), app.initialize()]);
  await app.initialize();
  const sender = {
    kind: 'content',
    documentId: 'doc_01',
    tab: { id: 7 },
  };
  await app.receiveMessage(playerMessage('video_01', 1), sender);
  await app.receiveMessage(playerMessage('video_01', 2), sender);
  await app.receiveMessage(playerMessage('video_02', 3), {
    ...sender,
    documentId: 'doc_02',
  });
  expect(adapters.contentContext).toHaveBeenNthCalledWith(2, sender, 1);
  expect(adapters.contentContext).toHaveBeenLastCalledWith(
    expect.objectContaining({ documentId: 'doc_02' }),
    2,
  );
});

test('keeps the queue usable after an initialization rejection', async () => {
  const app = application(
    fakeAdapters({
      readPreference: vi.fn().mockRejectedValue(new Error('boom')),
    }),
  );
  await expect(app.initialize()).rejects.toThrow('boom');
  await expect(app.initialize()).rejects.toThrow('boom');
});

test('records default persistence and distinct malformed presentation reply shapes', async () => {
  const defaultWriteFailure = application(
    fakeAdapters({
      writePreference: vi
        .fn()
        .mockResolvedValue(failure('default write failed')),
    }),
  );
  await defaultWriteFailure.initialize();
  expect(defaultWriteFailure.snapshot().failures).toContain(
    'default write failed',
  );

  for (const mutation of ['operation', 'tab']) {
    const adapters = fakeAdapters({
      sendToDocument: vi.fn().mockImplementation(async (_document, message) => {
        const target = message.payload.target;
        return success({
          protocolVersion: PROTOCOL_VERSION,
          type: MESSAGE_TYPES.PRESENTATION_RESULT,
          requestId: message.requestId,
          operationId:
            mutation === 'operation' ? 'op_other' : message.operationId,
          payload: {
            target:
              mutation === 'tab'
                ? { ...target, document: { ...target.document, tabId: 8 } }
                : target,
            result: 'applied',
          },
        });
      }),
    });
    const app = application(adapters);
    await app.receiveMessage(playerMessage(), { kind: 'content' });
    expect(app.snapshot().failures).toContain(
      'Content returned an invalid presentation reply.',
    );
  }
});

test('rejects malformed popup requests and reports a failed tab-close restoration', async () => {
  const app = application(
    fakeAdapters({
      restoreOwnedWindow: vi
        .fn()
        .mockResolvedValue(failure('close restore failed')),
    }),
  );
  await expect(
    app.receiveMessage({ type: 'broken' }, { kind: 'popup' }),
  ).resolves.toBeNull();
  await app.receiveMessage(playerMessage(), { kind: 'content' });
  await app.removeTab(7);
  expect(app.snapshot().failures).toContain('close restore failed');
});
