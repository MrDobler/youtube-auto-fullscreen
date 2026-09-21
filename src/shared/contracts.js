/**
 * Shared, serializable contracts for every extension context.
 * Boundaries supply trusted sender context, identifiers and timestamps before
 * the domain sees an event. This module never accesses Chrome, DOM or time.
 */

export const PROTOCOL_VERSION = 1;
export const STORAGE_SCHEMA_VERSION = 1;
export const MAX_MESSAGE_PAYLOAD_BYTES = 16 * 1024;
export const MAX_IDENTIFIER_LENGTH = 128;

export const MESSAGE_TYPES = Object.freeze({
  PLAYER_REPORTED: 'player:reported',
  PLAYER_EXIT_REQUESTED: 'player:exit-requested',
  PREFERENCE_GET: 'preference:get',
  PREFERENCE_SET: 'preference:set',
  PREFERENCE_RESULT: 'preference:result',
  PRESENTATION_APPLY: 'presentation:apply',
  PRESENTATION_RESTORE: 'presentation:restore',
  PRESENTATION_RESULT: 'presentation:result',
  OPERATION_FAILED: 'operation:failed',
});

/** @type {Set<string>} */
const MESSAGE_TYPE_VALUES = new Set(Object.values(MESSAGE_TYPES));
/** @type {Set<string>} */
const OPERATION_MESSAGE_TYPES = new Set([
  MESSAGE_TYPES.PREFERENCE_RESULT,
  MESSAGE_TYPES.PRESENTATION_APPLY,
  MESSAGE_TYPES.PRESENTATION_RESTORE,
  MESSAGE_TYPES.PRESENTATION_RESULT,
  MESSAGE_TYPES.OPERATION_FAILED,
]);
/** @type {Set<string>} */
const CONTENT_TO_WORKER_TYPES = new Set([
  MESSAGE_TYPES.PLAYER_REPORTED,
  MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
  MESSAGE_TYPES.PRESENTATION_RESULT,
]);
/** @type {Set<string>} */
const POPUP_TO_WORKER_TYPES = new Set([
  MESSAGE_TYPES.PREFERENCE_GET,
  MESSAGE_TYPES.PREFERENCE_SET,
]);
/** @type {Set<string>} */
const PLAYER_REPORT_REASONS = new Set([
  'initial',
  'url-change',
  'player-replaced',
  'state-change',
]);
/** @type {Set<string>} */
const PRESENTATION_RESULTS = new Set([
  'applied',
  'restored',
  'partial',
  'failed',
]);
/** @type {Set<string>} */
const OPERATION_KINDS = new Set([
  'window:enter-fullscreen',
  'window:restore',
  'presentation:apply',
  'presentation:restore',
]);
/** @type {Set<string>} */
const EFFECT_KINDS = new Set([
  'storage:write-preference',
  'storage:write-session',
  'window:enter-fullscreen',
  'window:restore',
  'content:send',
  'popup:reply',
]);

/** @typedef {'invalid-message'|'invalid-sender'|'invalid-state'|'payload-too-large'} ContractErrorCode */
/** @typedef {{ code: ContractErrorCode, message: string, path: string }} ContractError */
/** @template T @typedef {{ ok: true, value: T } | { ok: false, error: ContractError }} ValidationResult */
/** @typedef {{ tabId: number, windowId: number, documentId: string, navigationGeneration: number }} DocumentIdentity */
/** @typedef {{ document: DocumentIdentity, videoId: string, videoGeneration: number }} VideoIdentity */
/** @typedef {{ schemaVersion: number, enabled: boolean, revision: number }} PreferenceRecord */
/** @typedef {{ videoId: string, videoGeneration: number }} VideoSuppression */
/** @typedef {{ operationId: string, kind: string, target: VideoIdentity | null, createdAtEpochMs: number, completedEffects: string[], pendingEffects: string[] }} PendingOperation */
/** @typedef {{ operationId: string, windowId: number, previousState: 'normal'|'maximized', changed: boolean }} OwnedWindowChange */
/** @typedef {{ document: DocumentIdentity, video: VideoIdentity | null, suppression: VideoSuppression | null, operations: PendingOperation[], window?: OwnedWindowChange | null }} TabSession */
/** @typedef {{ schemaVersion: number, tabs: Record<string, TabSession> }} SessionRecord */

/** @param {ContractErrorCode} code @param {string} message @param {string} path @returns {{ ok: false, error: ContractError }} */
function failure(code, message, path) {
  return { ok: false, error: { code, message, path } };
}

/** @template T @param {T} value @returns {ValidationResult<T>} */
function success(value) {
  return { ok: true, value };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {value is number} */
function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value @returns {value is number} */
function isPositiveSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** @param {unknown} value @returns {value is string} */
function isIdentifier(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** @param {Set<string>} values @param {unknown} value */
function isOneOf(values, value) {
  return typeof value === 'string' && values.has(value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

/** @param {unknown} value */
function serializedByteLength(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      ? new TextEncoder().encode(serialized).byteLength
      : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {ValidationResult<DocumentIdentity>} */
export function validateDocumentIdentity(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'tabId',
      'windowId',
      'documentId',
      'navigationGeneration',
    ])
  )
    return failure(
      'invalid-message',
      'Document identity has an invalid shape.',
      'document',
    );
  if (
    !isNonNegativeSafeInteger(value.tabId) ||
    !isNonNegativeSafeInteger(value.windowId)
  )
    return failure(
      'invalid-message',
      'Document tab and window IDs must be non-negative integers.',
      'document',
    );
  if (
    !isIdentifier(value.documentId) ||
    !isPositiveSafeInteger(value.navigationGeneration)
  )
    return failure(
      'invalid-message',
      'Document ID or navigation generation is invalid.',
      'document',
    );
  return success(/** @type {DocumentIdentity} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<VideoIdentity>} */
export function validateVideoIdentity(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['document', 'videoId', 'videoGeneration'])
  )
    return failure(
      'invalid-message',
      'Video identity has an invalid shape.',
      'video',
    );
  const document = validateDocumentIdentity(value.document);
  if (!document.ok) return document;
  if (
    !isIdentifier(value.videoId) ||
    !isPositiveSafeInteger(value.videoGeneration)
  )
    return failure(
      'invalid-message',
      'Video ID or video generation is invalid.',
      'video',
    );
  return success(/** @type {VideoIdentity} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<PreferenceRecord>} */
export function validatePreferenceRecord(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schemaVersion', 'enabled', 'revision'])
  )
    return failure(
      'invalid-state',
      'Preference record has an invalid shape.',
      'preference',
    );
  if (
    value.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    typeof value.enabled !== 'boolean' ||
    !isNonNegativeSafeInteger(value.revision)
  )
    return failure(
      'invalid-state',
      'Preference record has invalid values.',
      'preference',
    );
  return success(/** @type {PreferenceRecord} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<VideoSuppression>} */
export function validateVideoSuppression(value) {
  if (!isRecord(value) || !hasExactKeys(value, ['videoId', 'videoGeneration']))
    return failure(
      'invalid-state',
      'Suppression has an invalid shape.',
      'suppression',
    );
  if (
    !isIdentifier(value.videoId) ||
    !isPositiveSafeInteger(value.videoGeneration)
  )
    return failure(
      'invalid-state',
      'Suppression has invalid values.',
      'suppression',
    );
  return success(/** @type {VideoSuppression} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<PendingOperation>} */
export function validatePendingOperation(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'operationId',
      'kind',
      'target',
      'createdAtEpochMs',
      'completedEffects',
      'pendingEffects',
    ])
  )
    return failure(
      'invalid-state',
      'Pending operation has an invalid shape.',
      'operation',
    );
  if (
    !isIdentifier(value.operationId) ||
    !isOneOf(OPERATION_KINDS, value.kind) ||
    !isNonNegativeSafeInteger(value.createdAtEpochMs)
  )
    return failure(
      'invalid-state',
      'Pending operation has invalid metadata.',
      'operation',
    );
  if (value.target !== null) {
    const target = validateVideoIdentity(value.target);
    if (!target.ok) return target;
  }
  if (
    !Array.isArray(value.completedEffects) ||
    !Array.isArray(value.pendingEffects) ||
    value.pendingEffects.length === 0
  )
    return failure(
      'invalid-state',
      'Pending operation must retain one or more remaining effects.',
      'operation',
    );
  const effects = [...value.completedEffects, ...value.pendingEffects];
  if (
    !effects.every((effect) => isOneOf(EFFECT_KINDS, effect)) ||
    new Set(effects).size !== effects.length
  )
    return failure(
      'invalid-state',
      'Pending operation effects are invalid or duplicated.',
      'operation',
    );
  return success(/** @type {PendingOperation} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<TabSession>} */
export function validateTabSession(value) {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ['document', 'video', 'suppression', 'operations']) &&
      !hasExactKeys(value, [
        'document',
        'video',
        'suppression',
        'operations',
        'window',
      ]))
  )
    return failure('invalid-state', 'Tab session has an invalid shape.', 'tab');
  const document = validateDocumentIdentity(value.document);
  if (!document.ok) return document;
  /** @type {VideoIdentity | null} */
  let activeVideo = null;
  if (value.video !== null) {
    const video = validateVideoIdentity(value.video);
    if (!video.ok) return video;
    activeVideo = video.value;
    if (
      video.value.document.documentId !== document.value.documentId ||
      video.value.document.navigationGeneration !==
        document.value.navigationGeneration
    )
      return failure(
        'invalid-state',
        'Video identity must belong to the current document.',
        'tab.video',
      );
  }
  if (value.suppression !== null) {
    const suppression = validateVideoSuppression(value.suppression);
    if (!suppression.ok) return suppression;
    if (
      activeVideo === null ||
      suppression.value.videoId !== activeVideo.videoId ||
      suppression.value.videoGeneration !== activeVideo.videoGeneration
    )
      return failure(
        'invalid-state',
        'Suppression must belong to the current video view.',
        'tab.suppression',
      );
  }
  if (!Array.isArray(value.operations))
    return failure(
      'invalid-state',
      'Tab operations must be an array.',
      'tab.operations',
    );
  for (const operation of value.operations) {
    const validOperation = validatePendingOperation(operation);
    if (!validOperation.ok) return validOperation;
  }
  if ('window' in value && value.window !== null) {
    if (
      !isRecord(value.window) ||
      !hasExactKeys(value.window, [
        'operationId',
        'windowId',
        'previousState',
        'changed',
      ]) ||
      !isIdentifier(value.window.operationId) ||
      !isNonNegativeSafeInteger(value.window.windowId) ||
      !isOneOf(new Set(['normal', 'maximized']), value.window.previousState) ||
      value.window.changed !== true
    )
      return failure(
        'invalid-state',
        'Owned window record is invalid.',
        'tab.window',
      );
    if (value.window.windowId !== document.value.windowId)
      return failure(
        'invalid-state',
        'Owned window record must belong to the current document window.',
        'tab.window.windowId',
      );
  }
  return success(/** @type {TabSession} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<SessionRecord>} */
export function validateSessionRecord(value) {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'tabs']))
    return failure(
      'invalid-state',
      'Session record has an invalid shape.',
      'session',
    );
  if (value.schemaVersion !== STORAGE_SCHEMA_VERSION || !isRecord(value.tabs))
    return failure(
      'invalid-state',
      'Session schema version or tabs is invalid.',
      'session',
    );
  for (const [tabId, session] of Object.entries(value.tabs)) {
    if (!/^\d+$/.test(tabId))
      return failure(
        'invalid-state',
        'Session tab keys must be numeric.',
        'session.tabs',
      );
    const validSession = validateTabSession(session);
    if (!validSession.ok) return validSession;
    if (Number(tabId) !== validSession.value.document.tabId)
      return failure(
        'invalid-state',
        'Session tab key does not match its document.',
        'session.tabs',
      );
  }
  return success(/** @type {SessionRecord} */ (value));
}

/** @param {unknown} value @returns {ValidationResult<ContractError>} */
export function validateContractError(value) {
  if (!isRecord(value) || !hasExactKeys(value, ['code', 'message', 'path']))
    return failure(
      'invalid-message',
      'Structured error has an invalid shape.',
      'error',
    );
  if (
    !isOneOf(
      new Set([
        'invalid-message',
        'invalid-sender',
        'invalid-state',
        'payload-too-large',
      ]),
      value.code,
    ) ||
    typeof value.message !== 'string' ||
    typeof value.path !== 'string'
  )
    return failure(
      'invalid-message',
      'Structured error has invalid values.',
      'error',
    );
  return success(/** @type {ContractError} */ (value));
}

/** @param {unknown} payload */
function validatePlayerPayload(payload) {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['videoId', 'observationId', 'reason'])
  )
    return failure(
      'invalid-message',
      'Player payload has an invalid shape.',
      'payload',
    );
  if (
    !isIdentifier(payload.videoId) ||
    !isPositiveSafeInteger(payload.observationId) ||
    !isOneOf(PLAYER_REPORT_REASONS, payload.reason)
  )
    return failure(
      'invalid-message',
      'Player payload has invalid values.',
      'payload',
    );
  return success(payload);
}

/** @param {unknown} payload */
function validateExitPayload(payload) {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['videoId', 'observationId', 'reason'])
  )
    return failure(
      'invalid-message',
      'Exit request has an invalid shape.',
      'payload',
    );
  if (
    !isIdentifier(payload.videoId) ||
    !isPositiveSafeInteger(payload.observationId) ||
    payload.reason !== 'escape'
  )
    return failure(
      'invalid-message',
      'Exit request has invalid values.',
      'payload',
    );
  return success(payload);
}

/** @param {unknown} payload */
function validatePreferenceGetPayload(payload) {
  return isRecord(payload) && hasExactKeys(payload, [])
    ? success(payload)
    : failure(
        'invalid-message',
        'Preference read payload must be empty.',
        'payload',
      );
}

/** @param {unknown} payload */
function validatePreferenceSetPayload(payload) {
  return isRecord(payload) &&
    hasExactKeys(payload, ['enabled']) &&
    typeof payload.enabled === 'boolean'
    ? success(payload)
    : failure(
        'invalid-message',
        'Preference change payload is invalid.',
        'payload',
      );
}

/** @param {unknown} payload */
function validatePreferenceResultPayload(payload) {
  if (!isRecord(payload) || !hasExactKeys(payload, ['preference']))
    return failure(
      'invalid-message',
      'Preference result has an invalid shape.',
      'payload',
    );
  return validatePreferenceRecord(payload.preference);
}

/** @param {unknown} payload @param {boolean} restore */
function validatePresentationCommandPayload(payload, restore) {
  const keys = restore ? ['target', 'reason'] : ['target'];
  if (!isRecord(payload) || !hasExactKeys(payload, keys))
    return failure(
      'invalid-message',
      'Presentation command has an invalid shape.',
      'payload',
    );
  if (
    restore &&
    !isOneOf(
      new Set(['escape', 'preference-disabled', 'navigation', 'cleanup']),
      payload.reason,
    )
  )
    return failure(
      'invalid-message',
      'Presentation restore reason is invalid.',
      'payload.reason',
    );
  return validateVideoIdentity(payload.target);
}

/** @param {unknown} payload */
function validatePresentationResultPayload(payload) {
  if (!isRecord(payload) || !hasExactKeys(payload, ['target', 'result']))
    return failure(
      'invalid-message',
      'Presentation result has an invalid shape.',
      'payload',
    );
  const target = validateVideoIdentity(payload.target);
  if (!target.ok) return target;
  return isOneOf(PRESENTATION_RESULTS, payload.result)
    ? success(payload)
    : failure(
        'invalid-message',
        'Presentation result is invalid.',
        'payload.result',
      );
}

/** @param {unknown} payload */
function validateOperationFailedPayload(payload) {
  if (!isRecord(payload) || !hasExactKeys(payload, ['error']))
    return failure(
      'invalid-message',
      'Failure payload has an invalid shape.',
      'payload',
    );
  return validateContractError(payload.error);
}

/** @param {string} type @param {unknown} payload */
function validatePayload(type, payload) {
  switch (type) {
    case MESSAGE_TYPES.PLAYER_REPORTED:
      return validatePlayerPayload(payload);
    case MESSAGE_TYPES.PLAYER_EXIT_REQUESTED:
      return validateExitPayload(payload);
    case MESSAGE_TYPES.PREFERENCE_GET:
      return validatePreferenceGetPayload(payload);
    case MESSAGE_TYPES.PREFERENCE_SET:
      return validatePreferenceSetPayload(payload);
    case MESSAGE_TYPES.PREFERENCE_RESULT:
      return validatePreferenceResultPayload(payload);
    case MESSAGE_TYPES.PRESENTATION_APPLY:
      return validatePresentationCommandPayload(payload, false);
    case MESSAGE_TYPES.PRESENTATION_RESTORE:
      return validatePresentationCommandPayload(payload, true);
    case MESSAGE_TYPES.PRESENTATION_RESULT:
      return validatePresentationResultPayload(payload);
    case MESSAGE_TYPES.OPERATION_FAILED:
      return validateOperationFailedPayload(payload);
    default:
      return failure('invalid-message', 'Message type is unknown.', 'type');
  }
}

/** @param {unknown} value @returns {ValidationResult<Record<string, unknown>>} */
export function validateMessage(value) {
  if (!isRecord(value))
    return failure('invalid-message', 'Message must be an object.', 'message');
  const hasOperation =
    typeof value.type === 'string' && OPERATION_MESSAGE_TYPES.has(value.type);
  const keys = hasOperation
    ? ['protocolVersion', 'type', 'requestId', 'operationId', 'payload']
    : ['protocolVersion', 'type', 'requestId', 'payload'];
  if (!hasExactKeys(value, keys))
    return failure(
      'invalid-message',
      'Message envelope has an invalid shape.',
      'message',
    );
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    !isOneOf(MESSAGE_TYPE_VALUES, value.type)
  )
    return failure(
      'invalid-message',
      'Message protocol version or type is unsupported.',
      'message',
    );
  if (
    !isIdentifier(value.requestId) ||
    (hasOperation && !isIdentifier(value.operationId))
  )
    return failure(
      'invalid-message',
      'Message request or operation ID is invalid.',
      'message',
    );
  const size = serializedByteLength(value.payload);
  if (size === null)
    return failure(
      'invalid-message',
      'Message payload must be JSON-serializable.',
      'payload',
    );
  if (size > MAX_MESSAGE_PAYLOAD_BYTES)
    return failure(
      'payload-too-large',
      'Message payload exceeds the protocol limit.',
      'payload',
    );
  const payload = validatePayload(
    /** @type {string} */ (value.type),
    value.payload,
  );
  return payload.ok ? success(value) : payload;
}

/** @param {unknown} sender @param {string} extensionId @param {number} navigationGeneration @returns {ValidationResult<{ kind: 'content', document: DocumentIdentity }>} */
export function validateContentSender(
  sender,
  extensionId,
  navigationGeneration,
) {
  if (
    !isRecord(sender) ||
    sender.id !== extensionId ||
    sender.frameId !== 0 ||
    !isRecord(sender.tab)
  )
    return failure(
      'invalid-sender',
      'Sender is not this extension’s main-frame content script.',
      'sender',
    );
  if (
    !isIdentifier(sender.documentId) ||
    !isNonNegativeSafeInteger(sender.tab.id) ||
    !isNonNegativeSafeInteger(sender.tab.windowId)
  )
    return failure(
      'invalid-sender',
      'Content sender has no trusted tab, window or document identity.',
      'sender',
    );
  if (
    sender.origin !== 'https://youtube.com' &&
    sender.origin !== 'https://www.youtube.com'
  )
    return failure(
      'invalid-sender',
      'Content sender origin is not an allowed YouTube origin.',
      'sender.origin',
    );
  if (!isPositiveSafeInteger(navigationGeneration))
    return failure(
      'invalid-sender',
      'Content sender navigation generation is invalid.',
      'sender.navigationGeneration',
    );
  return success({
    kind: 'content',
    document: {
      tabId: sender.tab.id,
      windowId: sender.tab.windowId,
      documentId: sender.documentId,
      navigationGeneration,
    },
  });
}

/** @param {unknown} sender @param {string} extensionId @returns {ValidationResult<{ kind: 'popup', url: string }>} */
export function validatePopupSender(sender, extensionId) {
  const expectedUrl = `chrome-extension://${extensionId}/popup/index.html`;
  if (
    !isRecord(sender) ||
    sender.id !== extensionId ||
    sender.url !== expectedUrl ||
    sender.tab !== undefined
  )
    return failure(
      'invalid-sender',
      'Sender is not this extension’s packaged popup.',
      'sender',
    );
  return success({ kind: 'popup', url: expectedUrl });
}

/** @param {VideoIdentity} target @param {DocumentIdentity} document */
function hasSameDocument(target, document) {
  const actual = target.document;
  return (
    actual.tabId === document.tabId &&
    actual.windowId === document.windowId &&
    actual.documentId === document.documentId &&
    actual.navigationGeneration === document.navigationGeneration
  );
}

/** @param {unknown} message @param {{ kind: 'content', document: DocumentIdentity } | { kind: 'popup', url: string }} sender */
export function validateReceivedMessage(message, sender) {
  const validMessage = validateMessage(message);
  if (!validMessage.ok) return validMessage;
  const type = /** @type {string} */ (validMessage.value.type);
  const allowed =
    sender.kind === 'content'
      ? isOneOf(CONTENT_TO_WORKER_TYPES, type)
      : isOneOf(POPUP_TO_WORKER_TYPES, type);
  if (!allowed)
    return failure(
      'invalid-sender',
      'Sender is not allowed to send this message type.',
      'type',
    );
  if (
    sender.kind === 'content' &&
    validMessage.value.type === MESSAGE_TYPES.PRESENTATION_RESULT
  ) {
    const target = /** @type {{ target: VideoIdentity }} */ (
      validMessage.value.payload
    ).target;
    if (!hasSameDocument(target, sender.document))
      return failure(
        'invalid-sender',
        'Presentation result targets a different document.',
        'payload.target',
      );
  }
  return validMessage;
}

/** @typedef {{ kind: 'storage:write-preference', preference: PreferenceRecord } | { kind: 'storage:write-session', session: SessionRecord } | { kind: 'window:enter-fullscreen'|'window:restore', operationId: string, windowId: number } | { kind: 'content:send', operationId: string, message: unknown } | { kind: 'popup:reply', requestId: string, message: unknown }} Effect */

/** @param {unknown} value @returns {ValidationResult<Effect>} */
export function validateEffect(value) {
  if (!isRecord(value) || !isOneOf(EFFECT_KINDS, value.kind))
    return failure('invalid-state', 'Effect kind is invalid.', 'effect');
  switch (value.kind) {
    case 'storage:write-preference':
      if (
        !hasExactKeys(value, ['kind', 'preference']) ||
        !validatePreferenceRecord(value.preference).ok
      )
        return failure(
          'invalid-state',
          'Preference effect is invalid.',
          'effect.preference',
        );
      return success(/** @type {Effect} */ (value));
    case 'storage:write-session':
      if (
        !hasExactKeys(value, ['kind', 'session']) ||
        !validateSessionRecord(value.session).ok
      )
        return failure(
          'invalid-state',
          'Session effect is invalid.',
          'effect.session',
        );
      return success(/** @type {Effect} */ (value));
    case 'window:enter-fullscreen':
    case 'window:restore':
      if (
        !hasExactKeys(value, ['kind', 'operationId', 'windowId']) ||
        !isIdentifier(value.operationId) ||
        !isNonNegativeSafeInteger(value.windowId)
      )
        return failure('invalid-state', 'Window effect is invalid.', 'effect');
      return success(/** @type {Effect} */ (value));
    case 'content:send':
      if (
        !hasExactKeys(value, ['kind', 'operationId', 'message']) ||
        !isIdentifier(value.operationId) ||
        !validateMessage(value.message).ok
      )
        return failure(
          'invalid-state',
          'Content message effect is invalid.',
          'effect',
        );
      return success(/** @type {Effect} */ (value));
    case 'popup:reply':
      if (
        !hasExactKeys(value, ['kind', 'requestId', 'message']) ||
        !isIdentifier(value.requestId) ||
        !validateMessage(value.message).ok
      )
        return failure(
          'invalid-state',
          'Popup reply effect is invalid.',
          'effect',
        );
      return success(/** @type {Effect} */ (value));
    default:
      return failure('invalid-state', 'Effect kind is invalid.', 'effect');
  }
}

/** @param {ValidationResult<unknown>} result */
export function validationEffects(result) {
  return result.ok ? null : Object.freeze([]);
}
