import { expect, test } from 'vitest';
import {
  MAX_MESSAGE_PAYLOAD_BYTES,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
  validateContentSender,
  validateContractError,
  validateDocumentIdentity,
  validateEffect,
  validateMessage,
  validatePendingOperation,
  validatePopupSender,
  validatePreferenceRecord,
  validateReceivedMessage,
  validateSessionRecord,
  validateTabSession,
  validateVideoIdentity,
  validateVideoSuppression,
  validationEffects,
} from '../../../src/shared/contracts.js';

const documentIdentity = {
  tabId: 17,
  windowId: 4,
  documentId: 'doc_7e39',
  navigationGeneration: 12,
};
const videoIdentity = {
  document: documentIdentity,
  videoId: 'dQw4w9WgXcQ',
  videoGeneration: 5,
};
const preference = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  enabled: true,
  revision: 8,
};
const operation = {
  operationId: 'op_009',
  kind: 'presentation:apply',
  target: videoIdentity,
  createdAtEpochMs: 1760000000000,
  completedEffects: ['storage:write-session'],
  pendingEffects: ['content:send'],
};

function clone(value) {
  return structuredClone(value);
}

function message(type, payload, operationId) {
  const envelope = {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: 'req_001',
    payload,
  };
  return operationId === undefined ? envelope : { ...envelope, operationId };
}

function contentSender(overrides = {}) {
  return {
    id: 'own-id',
    frameId: 0,
    documentId: 'doc_7e39',
    origin: 'https://www.youtube.com',
    tab: { id: 17, windowId: 4 },
    ...overrides,
  };
}

test.each([
  [
    MESSAGE_TYPES.PLAYER_REPORTED,
    { videoId: 'dQw4w9WgXcQ', observationId: 1, reason: 'initial' },
  ],
  [
    MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
    { videoId: 'dQw4w9WgXcQ', observationId: 1, reason: 'escape' },
  ],
  [MESSAGE_TYPES.PREFERENCE_GET, {}],
  [MESSAGE_TYPES.PREFERENCE_SET, { enabled: false }],
  [MESSAGE_TYPES.PREFERENCE_RESULT, { preference }, 'op_009'],
  [MESSAGE_TYPES.PRESENTATION_APPLY, { target: videoIdentity }, 'op_009'],
  [
    MESSAGE_TYPES.PRESENTATION_RESTORE,
    { target: videoIdentity, reason: 'escape' },
    'op_009',
  ],
  [
    MESSAGE_TYPES.PRESENTATION_RESULT,
    { target: videoIdentity, result: 'partial' },
    'op_009',
  ],
  [
    MESSAGE_TYPES.OPERATION_FAILED,
    { error: { code: 'invalid-state', message: 'No window.', path: 'window' } },
    'op_009',
  ],
])('accepts the documented %s message', (type, payload, operationId) => {
  expect(validateMessage(message(type, payload, operationId))).toMatchObject({
    ok: true,
  });
});

test.each([
  [null, 'invalid-message'],
  [message('unknown:type', {}), 'invalid-message'],
  [
    {
      protocolVersion: 2,
      type: MESSAGE_TYPES.PREFERENCE_GET,
      requestId: 'req_001',
      payload: {},
    },
    'invalid-message',
  ],
  [
    {
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PREFERENCE_GET,
      payload: {},
    },
    'invalid-message',
  ],
  [
    message(MESSAGE_TYPES.PRESENTATION_APPLY, { target: videoIdentity }),
    'invalid-message',
  ],
  [
    message(MESSAGE_TYPES.PREFERENCE_SET, { enabled: true, tabId: 17 }),
    'invalid-message',
  ],
  [
    message(MESSAGE_TYPES.PLAYER_REPORTED, {
      videoId: 2n,
      observationId: 1,
      reason: 'initial',
    }),
    'invalid-message',
  ],
  [
    message(MESSAGE_TYPES.PLAYER_REPORTED, {
      text: 'x'.repeat(MAX_MESSAGE_PAYLOAD_BYTES + 1),
    }),
    'payload-too-large',
  ],
])('rejects malformed or unsafe message envelopes', (candidate, code) => {
  expect(validateMessage(candidate)).toMatchObject({
    ok: false,
    error: { code },
  });
});

test('accepts valid document, video, preference and resumable session records', () => {
  const session = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    tabs: {
      17: {
        document: documentIdentity,
        video: videoIdentity,
        suppression: {
          videoId: videoIdentity.videoId,
          videoGeneration: videoIdentity.videoGeneration,
        },
        operations: [operation],
      },
    },
  };
  expect(validateDocumentIdentity(documentIdentity).ok).toBe(true);
  expect(validateVideoIdentity(videoIdentity).ok).toBe(true);
  expect(validatePreferenceRecord(preference).ok).toBe(true);
  expect(validateVideoSuppression(session.tabs[17].suppression).ok).toBe(true);
  expect(validatePendingOperation(operation).ok).toBe(true);
  expect(validateTabSession(session.tabs[17]).ok).toBe(true);
  expect(validateSessionRecord(session).ok).toBe(true);
});

test.each([
  [validateDocumentIdentity, { ...documentIdentity, navigationGeneration: 0 }],
  [validateVideoIdentity, { ...videoIdentity, videoGeneration: 0 }],
  [validatePreferenceRecord, { ...preference, revision: -1 }],
  [validateVideoSuppression, { videoId: '', videoGeneration: 5 }],
  [validatePendingOperation, { ...operation, pendingEffects: [] }],
])('rejects invalid persistent value %#', (validator, candidate) => {
  expect(validator(candidate)).toMatchObject({ ok: false });
});

test('rejects malformed state records at every persistence boundary', () => {
  expect(validateDocumentIdentity({}).ok).toBe(false);
  expect(validateDocumentIdentity({ ...documentIdentity, tabId: -1 }).ok).toBe(
    false,
  );
  expect(validateVideoIdentity({ ...videoIdentity, document: {} }).ok).toBe(
    false,
  );
  expect(validatePreferenceRecord({}).ok).toBe(false);
  expect(validateVideoSuppression({}).ok).toBe(false);
  expect(validatePendingOperation({}).ok).toBe(false);
  expect(validatePendingOperation({ ...operation, kind: 'unknown' }).ok).toBe(
    false,
  );
  expect(validatePendingOperation({ ...operation, target: {} }).ok).toBe(false);
  expect(
    validatePendingOperation({ ...operation, pendingEffects: ['unknown'] }).ok,
  ).toBe(false);
  expect(validateTabSession({}).ok).toBe(false);
  expect(
    validateTabSession({
      document: {},
      video: null,
      suppression: null,
      operations: [],
    }).ok,
  ).toBe(false);
  expect(
    validateTabSession({
      document: documentIdentity,
      video: null,
      suppression: null,
      operations: {},
    }).ok,
  ).toBe(false);
  expect(validateSessionRecord({}).ok).toBe(false);
  expect(validateSessionRecord({ schemaVersion: 2, tabs: {} }).ok).toBe(false);
});

test('rejects inconsistent video, suppression, operations and tab keys in session state', () => {
  const mismatchedVideo = clone(videoIdentity);
  mismatchedVideo.document.documentId = 'other_doc';
  expect(
    validateTabSession({
      document: documentIdentity,
      video: mismatchedVideo,
      suppression: null,
      operations: [],
    }).ok,
  ).toBe(false);

  expect(
    validateTabSession({
      document: documentIdentity,
      video: videoIdentity,
      suppression: { videoId: 'other_video', videoGeneration: 5 },
      operations: [],
    }).ok,
  ).toBe(false);

  const duplicateEffects = clone(operation);
  duplicateEffects.pendingEffects = ['content:send', 'content:send'];
  expect(validatePendingOperation(duplicateEffects).ok).toBe(false);

  expect(
    validateSessionRecord({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      tabs: {
        other: {
          document: documentIdentity,
          video: null,
          suppression: null,
          operations: [],
        },
      },
    }).ok,
  ).toBe(false);
  expect(
    validateSessionRecord({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      tabs: {
        1: {
          document: documentIdentity,
          video: null,
          suppression: null,
          operations: [],
        },
      },
    }).ok,
  ).toBe(false);
});

test.each([
  [{ code: 'invalid-message', message: 'Bad request.', path: 'message' }, true],
  [{ code: 'made-up', message: 'Bad request.', path: 'message' }, false],
  [{ code: 'invalid-message', message: 1, path: 'message' }, false],
])('validates structured errors', (candidate, valid) => {
  expect(validateContractError(candidate).ok).toBe(valid);
});

test('derives a content identity exclusively from an authenticated main-frame sender', () => {
  expect(validateContentSender(contentSender(), 'own-id', 12)).toEqual({
    ok: true,
    value: { kind: 'content', document: documentIdentity },
  });
  expect(
    validateContentSender(contentSender({ frameId: 1 }), 'own-id', 12).ok,
  ).toBe(false);
  expect(
    validateContentSender(
      contentSender({ origin: 'https://evil.example' }),
      'own-id',
      12,
    ).ok,
  ).toBe(false);
  expect(validateContentSender(contentSender(), 'other-id', 12).ok).toBe(false);
  expect(validateContentSender(contentSender(), 'own-id', 0).ok).toBe(false);
  expect(
    validateContentSender(
      contentSender({ tab: { id: -1, windowId: 4 } }),
      'own-id',
      12,
    ).ok,
  ).toBe(false);
});

test('accepts only the packaged popup from this extension', () => {
  const popup = {
    id: 'own-id',
    url: 'chrome-extension://own-id/popup/index.html',
  };
  expect(validatePopupSender(popup, 'own-id').ok).toBe(true);
  expect(validatePopupSender({ ...popup, tab: {} }, 'own-id').ok).toBe(false);
  expect(
    validatePopupSender(
      { ...popup, url: 'chrome-extension://own-id/popup/other.html' },
      'own-id',
    ).ok,
  ).toBe(false);
});

test('allows only documented routes and rejects stale content confirmations', () => {
  const sender = validateContentSender(contentSender(), 'own-id', 12).value;
  expect(
    validateReceivedMessage(
      message(MESSAGE_TYPES.PLAYER_REPORTED, {
        videoId: 'dQw4w9WgXcQ',
        observationId: 1,
        reason: 'initial',
      }),
      sender,
    ).ok,
  ).toBe(true);
  expect(
    validateReceivedMessage(message(MESSAGE_TYPES.PREFERENCE_GET, {}), sender)
      .ok,
  ).toBe(false);

  const staleTarget = clone(videoIdentity);
  staleTarget.document.documentId = 'other_doc';
  const response = message(
    MESSAGE_TYPES.PRESENTATION_RESULT,
    { target: staleTarget, result: 'applied' },
    'op_009',
  );
  expect(validateReceivedMessage(response, sender)).toMatchObject({
    ok: false,
    error: { code: 'invalid-sender' },
  });

  const popup = validatePopupSender(
    { id: 'own-id', url: 'chrome-extension://own-id/popup/index.html' },
    'own-id',
  ).value;
  expect(
    validateReceivedMessage(
      message(MESSAGE_TYPES.PREFERENCE_SET, { enabled: false }),
      popup,
    ).ok,
  ).toBe(true);
  expect(
    validateReceivedMessage(
      message(MESSAGE_TYPES.PLAYER_REPORTED, {
        videoId: 'dQw4w9WgXcQ',
        observationId: 1,
        reason: 'initial',
      }),
      popup,
    ).ok,
  ).toBe(false);
});

test.each([
  [MESSAGE_TYPES.PLAYER_REPORTED, {}],
  [
    MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
    { videoId: 'dQw4w9WgXcQ', observationId: 1, reason: 'navigation' },
  ],
  [MESSAGE_TYPES.PREFERENCE_GET, { unexpected: true }],
  [MESSAGE_TYPES.PREFERENCE_SET, { enabled: 'yes' }],
  [MESSAGE_TYPES.PREFERENCE_RESULT, {}, 'op_009'],
  [MESSAGE_TYPES.PRESENTATION_APPLY, {}, 'op_009'],
  [
    MESSAGE_TYPES.PRESENTATION_RESTORE,
    { target: videoIdentity, reason: 'unknown' },
    'op_009',
  ],
  [
    MESSAGE_TYPES.PRESENTATION_RESULT,
    { target: {}, result: 'applied' },
    'op_009',
  ],
  [
    MESSAGE_TYPES.PRESENTATION_RESULT,
    { target: videoIdentity, result: 'unknown' },
    'op_009',
  ],
  [MESSAGE_TYPES.OPERATION_FAILED, { error: {} }, 'op_009'],
])('rejects an invalid payload for %s', (type, payload, operationId) => {
  expect(validateMessage(message(type, payload, operationId)).ok).toBe(false);
});

test.each([
  [{ kind: 'storage:write-preference', preference }],
  [
    {
      kind: 'storage:write-session',
      session: { schemaVersion: STORAGE_SCHEMA_VERSION, tabs: {} },
    },
  ],
  [{ kind: 'window:enter-fullscreen', operationId: 'op_009', windowId: 4 }],
  [{ kind: 'window:restore', operationId: 'op_009', windowId: 4 }],
  [
    {
      kind: 'content:send',
      operationId: 'op_009',
      message: message(
        MESSAGE_TYPES.PRESENTATION_APPLY,
        { target: videoIdentity },
        'op_009',
      ),
    },
  ],
  [
    {
      kind: 'popup:reply',
      requestId: 'req_001',
      message: message(
        MESSAGE_TYPES.PREFERENCE_RESULT,
        { preference },
        'op_009',
      ),
    },
  ],
])(
  'accepts effect %# only when it is fully serializable and valid',
  (effect) => {
    expect(validateEffect(effect).ok).toBe(true);
  },
);

test('rejects unsafe effects and guarantees no effects after validation failure', () => {
  expect(
    validateEffect({ kind: 'storage:write-preference', preference: {} }).ok,
  ).toBe(false);
  expect(
    validateEffect({ kind: 'storage:write-session', session: {} }).ok,
  ).toBe(false);
  expect(
    validateEffect({ kind: 'window:restore', operationId: '', windowId: 4 }).ok,
  ).toBe(false);
  expect(
    validateEffect({
      kind: 'content:send',
      operationId: 'op_009',
      message: { type: 'not-valid' },
    }).ok,
  ).toBe(false);
  expect(validateEffect({ kind: 'nope' }).ok).toBe(false);

  const rejected = validateMessage({ type: 'bad' });
  expect(validationEffects(rejected)).toEqual([]);
  expect(Object.isFrozen(validationEffects(rejected))).toBe(true);
  expect(
    validationEffects(
      validateMessage(message(MESSAGE_TYPES.PREFERENCE_GET, {})),
    ),
  ).toBeNull();
});
