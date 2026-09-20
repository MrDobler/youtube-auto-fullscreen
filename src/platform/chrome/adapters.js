/**
 * Chrome API boundary adapters. They validate data at the edge and return
 * serializable results; domain code never imports this module.
 */
import {
  MESSAGE_TYPES,
  validateContentSender,
  validateDocumentIdentity,
  validateMessage,
  validatePopupSender,
  validatePreferenceRecord,
  validateSessionRecord,
} from '../../shared/contracts.js';

export const PREFERENCE_STORAGE_KEY = 'preference';
export const SESSION_STORAGE_KEY = 'session';

/** @typedef {'corrupt-storage'|'invalid-input'|'no-receiver'|'storage-read-failed'|'storage-write-failed'|'tab-closed'|'target-mismatch'|'unexpected'|'unsupported-window-state'|'window-closed'|'window-not-owned'} AdapterErrorCode */
/** @typedef {{ code: AdapterErrorCode, message: string, path: string }} AdapterError */
/** @template T @typedef {{ ok: true, value: T } | { ok: false, error: AdapterError }} AdapterResult */
/** @typedef {{ operationId: string, windowId: number, previousState: 'normal'|'maximized', changed: boolean }} OwnedWindowChange */

/** @template T @param {T} value @returns {AdapterResult<T>} */
function success(value) {
  return { ok: true, value };
}

/** @param {AdapterErrorCode} code @param {string} message @param {string} path @returns {AdapterResult<never>} */
function failure(code, message, path) {
  return { ok: false, error: { code, message, path } };
}

/** @param {unknown} reason */
function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** @param {unknown} reason @param {AdapterErrorCode} fallback @param {string} path @returns {AdapterResult<never>} */
function chromeFailure(reason, fallback, path) {
  const message = errorMessage(reason);
  if (/no tab with id|tab .* not found/i.test(message))
    return failure('tab-closed', message, path);
  if (/no window with id|window .* not found/i.test(message))
    return failure('window-closed', message, path);
  if (
    /receiving end does not exist|could not establish connection/i.test(message)
  )
    return failure('no-receiver', message, path);
  return failure(fallback, message, path);
}

/** @param {unknown} value @returns {value is number} */
function isWindowId(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value @returns {value is string} */
function isOperationId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** @param {unknown} value */
function isRestorableState(value) {
  return value === 'normal' || value === 'maximized';
}

/** @param {unknown} value @returns {value is OwnedWindowChange} */
function isOwnedWindowChange(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.keys(value).length === 4 &&
    'operationId' in value &&
    'windowId' in value &&
    'previousState' in value &&
    'changed' in value &&
    isOperationId(value.operationId) &&
    isWindowId(value.windowId) &&
    isRestorableState(value.previousState) &&
    typeof value.changed === 'boolean'
  );
}

/** @param {import('../../shared/contracts.js').DocumentIdentity} left @param {import('../../shared/contracts.js').DocumentIdentity} right */
function sameDocument(left, right) {
  return (
    left.tabId === right.tabId &&
    left.windowId === right.windowId &&
    left.documentId === right.documentId &&
    left.navigationGeneration === right.navigationGeneration
  );
}

/** @param {Record<string, unknown>} message */
function isPresentationCommand(message) {
  return (
    message.type === MESSAGE_TYPES.PRESENTATION_APPLY ||
    message.type === MESSAGE_TYPES.PRESENTATION_RESTORE
  );
}

/**
 * Creates Chrome API adapters with the production Chrome object injected at
 * mount time. No adapter subscribes to global events or retains domain state.
 *
 * @param {typeof chrome} chromeApi
 */
export function createChromeAdapters(chromeApi) {
  /** @type {Map<string, OwnedWindowChange>} */
  const ownedWindowChanges = new Map();

  /**
   * @template T
   * @param {chrome.storage.StorageArea} area
   * @param {string} key
   * @param {(value: unknown) => import('../../shared/contracts.js').ValidationResult<T>} validator
   * @returns {Promise<AdapterResult<T | null>>}
   */
  async function readRecord(area, key, validator) {
    try {
      const stored = await area.get(key);
      if (stored[key] === undefined) return success(null);
      const valid = validator(stored[key]);
      return valid.ok
        ? success(valid.value)
        : failure('corrupt-storage', valid.error.message, key);
    } catch (reason) {
      return chromeFailure(reason, 'storage-read-failed', key);
    }
  }

  /**
   * @template T
   * @param {chrome.storage.StorageArea} area
   * @param {string} key
   * @param {unknown} record
   * @param {(value: unknown) => import('../../shared/contracts.js').ValidationResult<T>} validator
   * @returns {Promise<AdapterResult<T>>}
   */
  async function writeRecord(area, key, record, validator) {
    const valid = validator(record);
    if (!valid.ok)
      return failure('invalid-input', valid.error.message, valid.error.path);
    try {
      await area.set({ [key]: valid.value });
      return success(valid.value);
    } catch (reason) {
      return chromeFailure(reason, 'storage-write-failed', key);
    }
  }

  return Object.freeze({
    /** @param {chrome.runtime.MessageSender} sender @param {number} navigationGeneration */
    contentContext(sender, navigationGeneration) {
      return validateContentSender(
        sender,
        chromeApi.runtime.id,
        navigationGeneration,
      );
    },

    /** @param {chrome.runtime.MessageSender} sender */
    popupContext(sender) {
      return validatePopupSender(sender, chromeApi.runtime.id);
    },

    /**
     * Fetches focus and state from Chrome using an already trusted document
     * identity. It never reads a URL, so it does not need the tabs permission.
     *
     * @param {unknown} document
     * @returns {Promise<AdapterResult<{ tabFocused: boolean, windowFocused: boolean, windowState: 'normal'|'maximized'|'fullscreen'|'minimized', fullscreenOwner: 'none'|'external' }>>}
     */
    async tabContext(document) {
      const validDocument = validateDocumentIdentity(document);
      if (!validDocument.ok)
        return failure(
          'invalid-input',
          validDocument.error.message,
          'document',
        );
      try {
        const tab = await chromeApi.tabs.get(validDocument.value.tabId);
        if (tab.windowId !== validDocument.value.windowId)
          return failure(
            'target-mismatch',
            'The tab no longer belongs to the trusted window.',
            'document.windowId',
          );
        const window = await chromeApi.windows.get(
          validDocument.value.windowId,
        );
        if (
          window.state !== 'normal' &&
          window.state !== 'maximized' &&
          window.state !== 'fullscreen' &&
          window.state !== 'minimized'
        )
          return failure(
            'unsupported-window-state',
            'Chrome returned an unsupported window state.',
            'window.state',
          );
        return success({
          tabFocused: tab.active === true,
          windowFocused: window.focused === true,
          windowState: window.state,
          fullscreenOwner: window.state === 'fullscreen' ? 'external' : 'none',
        });
      } catch (reason) {
        return chromeFailure(reason, 'unexpected', 'context');
      }
    },

    /** @returns {Promise<AdapterResult<import('../../shared/contracts.js').PreferenceRecord | null>>} */
    readPreference() {
      return readRecord(
        chromeApi.storage.local,
        PREFERENCE_STORAGE_KEY,
        validatePreferenceRecord,
      );
    },

    /** @param {unknown} preference @returns {Promise<AdapterResult<import('../../shared/contracts.js').PreferenceRecord>>} */
    writePreference(preference) {
      return writeRecord(
        chromeApi.storage.local,
        PREFERENCE_STORAGE_KEY,
        preference,
        validatePreferenceRecord,
      );
    },

    /** @returns {Promise<AdapterResult<import('../../shared/contracts.js').SessionRecord | null>>} */
    readSession() {
      return readRecord(
        chromeApi.storage.session,
        SESSION_STORAGE_KEY,
        validateSessionRecord,
      );
    },

    /** @param {unknown} session @returns {Promise<AdapterResult<import('../../shared/contracts.js').SessionRecord>>} */
    writeSession(session) {
      return writeRecord(
        chromeApi.storage.session,
        SESSION_STORAGE_KEY,
        session,
        validateSessionRecord,
      );
    },

    /** @param {unknown} session @returns {Promise<AdapterResult<import('../../shared/contracts.js').SessionRecord>>} */
    persistIntent(session) {
      return writeRecord(
        chromeApi.storage.session,
        SESSION_STORAGE_KEY,
        session,
        validateSessionRecord,
      );
    },

    /** @param {unknown} session @returns {Promise<AdapterResult<import('../../shared/contracts.js').SessionRecord>>} */
    recordCompletion(session) {
      return writeRecord(
        chromeApi.storage.session,
        SESSION_STORAGE_KEY,
        session,
        validateSessionRecord,
      );
    },

    /**
     * Enters fullscreen without focusing a background window. The returned
     * change record is the only value accepted by restoreOwnedWindow.
     *
     * @param {unknown} windowId
     * @param {unknown} operationId
     * @returns {Promise<AdapterResult<OwnedWindowChange>>}
     */
    async enterFullscreen(windowId, operationId) {
      if (!isWindowId(windowId) || !isOperationId(operationId))
        return failure(
          'invalid-input',
          'A window operation needs valid window and operation IDs.',
          'window',
        );
      try {
        const before = await /** @type {Promise<chrome.windows.Window>} */ (
          /** @type {unknown} */ (chromeApi.windows.get(windowId))
        );
        if (before.state === 'fullscreen')
          return success({
            operationId,
            windowId,
            previousState: 'normal',
            changed: false,
          });
        if (!isRestorableState(before.state))
          return failure(
            'unsupported-window-state',
            'The window cannot be safely restored from its current state.',
            'window.state',
          );
        await /** @type {Promise<chrome.windows.Window>} */ (
          /** @type {unknown} */ (
            chromeApi.windows.update(windowId, { state: 'fullscreen' })
          )
        );
        const change = {
          operationId,
          windowId,
          previousState: before.state,
          changed: true,
        };
        ownedWindowChanges.set(operationId, change);
        return success(change);
      } catch (reason) {
        return chromeFailure(reason, 'unexpected', 'window');
      }
    },

    /**
     * Restores only a change made by this adapter in this worker lifetime.
     * Losing the guard on worker wake is safe: it refuses to change a window.
     *
     * @param {unknown} change
     * @returns {Promise<AdapterResult<{ restored: boolean }>>}
     */
    async restoreOwnedWindow(change) {
      if (!isOwnedWindowChange(change))
        return failure(
          'invalid-input',
          'The window restoration record is invalid.',
          'windowChange',
        );
      const owned = ownedWindowChanges.get(change.operationId);
      if (
        owned === undefined ||
        owned.windowId !== change.windowId ||
        owned.previousState !== change.previousState ||
        owned.changed !== change.changed
      )
        return failure(
          'window-not-owned',
          'The extension did not make this window change.',
          'windowChange',
        );
      try {
        await /** @type {Promise<chrome.windows.Window>} */ (
          /** @type {unknown} */ (
            chromeApi.windows.update(change.windowId, {
              state: change.previousState,
            })
          )
        );
        ownedWindowChanges.delete(change.operationId);
        return success({ restored: true });
      } catch (reason) {
        return chromeFailure(reason, 'unexpected', 'window');
      }
    },

    /**
     * Sends a presentation command only to the trusted document. The command
     * payload is checked against that document before its IDs reach Chrome.
     *
     * @param {unknown} document
     * @param {unknown} message
     * @returns {Promise<AdapterResult<unknown>>}
     */
    async sendToDocument(document, message) {
      const validDocument = validateDocumentIdentity(document);
      if (!validDocument.ok)
        return failure(
          'invalid-input',
          validDocument.error.message,
          'document',
        );
      const validMessage = validateMessage(message);
      if (!validMessage.ok)
        return failure('invalid-input', validMessage.error.message, 'message');
      if (!isPresentationCommand(validMessage.value))
        return failure(
          'invalid-input',
          'Only presentation commands can be sent to a content document.',
          'message.type',
        );
      const payload = validMessage.value.payload;
      if (
        payload === null ||
        typeof payload !== 'object' ||
        !('target' in payload) ||
        payload.target === null ||
        typeof payload.target !== 'object' ||
        !('document' in payload.target) ||
        !sameDocument(
          validDocument.value,
          /** @type {import('../../shared/contracts.js').DocumentIdentity} */ (
            payload.target.document
          ),
        )
      )
        return failure(
          'target-mismatch',
          'The command target does not match the trusted document.',
          'message.payload.target.document',
        );
      try {
        const response = await chromeApi.tabs.sendMessage(
          validDocument.value.tabId,
          validMessage.value,
          { documentId: validDocument.value.documentId },
        );
        return success(response);
      } catch (reason) {
        return chromeFailure(reason, 'unexpected', 'message');
      }
    },
  });
}
