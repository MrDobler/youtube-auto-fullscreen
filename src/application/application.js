/**
 * Application boundary for the extension's vertical flow. It serializes
 * boundary events, feeds the pure domain and executes only its declared
 * effects. Chrome and DOM stay behind the injected adapters.
 */
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
  validateMessage,
  validateReceivedMessage,
} from '../shared/contracts.js';
import { createInitialState, transition } from '../domain/transition.js';

/** @param {string} prefix @param {number} sequence */
function defaultIdentifier(prefix, sequence) {
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll('-', '_');
  return `${prefix}_${uuid ?? `${Date.now()}_${sequence}`}`;
}

/** @param {import('../domain/transition.js').DomainState} state */
function hasPendingOperations(state) {
  return Object.values(state.session.tabs).some(
    (tab) => tab.operations.length > 0,
  );
}

/** @param {unknown} value */
function presentationResult(value) {
  const valid = validateMessage(value);
  return valid.ok && valid.value.type === MESSAGE_TYPES.PRESENTATION_RESULT
    ? valid.value
    : null;
}

/** @param {unknown} sender */
function senderDocumentId(sender) {
  return sender !== null &&
    typeof sender === 'object' &&
    'documentId' in sender &&
    typeof sender.documentId === 'string'
    ? sender.documentId
    : null;
}

/**
 * @param {{ adapters: any, now?: () => number, createIdentifier?: (prefix: string) => string }} dependencies
 */
export function createApplication(dependencies) {
  const adapters = dependencies.adapters;
  let sequence = 0;
  const createIdentifier =
    dependencies.createIdentifier ??
    ((prefix) => defaultIdentifier(prefix, (sequence += 1)));
  const now = dependencies.now ?? (() => Date.now());
  let state = createInitialState();
  let initialized = false;
  /** @type {Promise<void> | null} */
  let initialization = null;
  let queue = Promise.resolve();
  /** @type {Map<number, any>} */
  const ownedWindows = new Map();
  /** @type {string[]} */
  const failures = [];

  function operation() {
    return {
      operationId: createIdentifier('op'),
      requestId: createIdentifier('req'),
      createdAtEpochMs: now(),
    };
  }

  async function initialize() {
    if (initialized) return;
    if (initialization !== null) return initialization;
    initialization = (async () => {
      const [preferenceResult, sessionResult] = await Promise.all([
        adapters.readPreference(),
        adapters.readSession(),
      ]);
      const initial = createInitialState();
      const preference =
        preferenceResult.ok && preferenceResult.value !== null
          ? preferenceResult.value
          : initial.preference;
      const session =
        sessionResult.ok && sessionResult.value !== null
          ? sessionResult.value
          : initial.session;
      state = { ...initial, preference, session };
      for (const tab of Object.values(session.tabs)) {
        if (tab.window?.changed === true)
          ownedWindows.set(tab.window.windowId, tab.window);
      }
      if (preferenceResult.ok && preferenceResult.value === null) {
        const written = await adapters.writePreference(preference);
        if (!written.ok) failures.push(written.error.message);
      } else if (!preferenceResult.ok) {
        failures.push(preferenceResult.error.message);
      }
      if (!sessionResult.ok) failures.push(sessionResult.error.message);
      initialized = true;
    })();
    return initialization;
  }

  /** @param {number} tabId @param {string} operationId */
  function tabForOperation(tabId, operationId) {
    const tab = state.runtime[String(tabId)];
    return tab?.operation?.operationId === operationId ? tab : null;
  }

  /** @param {import('../shared/contracts.js').Effect} effect */
  async function execute(effect) {
    switch (effect.kind) {
      case 'storage:write-session': {
        const write = hasPendingOperations(state)
          ? adapters.persistIntent(state.session)
          : adapters.recordCompletion(state.session);
        const result = await write;
        if (!result.ok) failures.push(result.error.message);
        return;
      }
      case 'window:enter-fullscreen': {
        const result = await adapters.enterFullscreen(
          effect.windowId,
          effect.operationId,
        );
        const tab = Object.entries(state.runtime).find(
          ([, value]) => value.operation?.operationId === effect.operationId,
        );
        if (tab === undefined) return;
        const tabId = Number(tab[0]);
        if (!result.ok) {
          failures.push(result.error.message);
          await reduce({
            type: 'operation:failed',
            tabId,
            operationId: effect.operationId,
          });
          return;
        }
        if (result.value.changed)
          ownedWindows.set(result.value.windowId, result.value);
        await reduce({
          type: 'operation:succeeded',
          tabId,
          operationId: effect.operationId,
          kind: 'window:enter-fullscreen',
          windowChange: result.value,
        });
        return;
      }
      case 'window:restore': {
        const change = ownedWindows.get(effect.windowId);
        const tab = tabForOperation(
          Number(
            Object.entries(state.runtime).find(
              ([, value]) =>
                value.operation?.operationId === effect.operationId,
            )?.[0] ?? -1,
          ),
          effect.operationId,
        );
        if (change !== undefined) {
          const result = await adapters.restoreOwnedWindow(change);
          if (!result.ok) failures.push(result.error.message);
          else ownedWindows.delete(effect.windowId);
        }
        if (tab !== null) {
          const tabId = Number(
            Object.entries(state.runtime).find(
              ([, value]) => value === tab,
            )?.[0],
          );
          await reduce({
            type: 'operation:succeeded',
            tabId,
            operationId: effect.operationId,
            kind: 'window:restore',
          });
        }
        return;
      }
      case 'content:send': {
        const command = /** @type {Record<string, unknown>} */ (effect.message);
        const payload =
          /** @type {{ target: import('../shared/contracts.js').VideoIdentity }} */ (
            command.payload
          );
        const target = payload.target.document;
        const result = await adapters.sendToDocument(target, command);
        const reply = result.ok ? presentationResult(result.value) : null;
        const replyPayload =
          reply === null
            ? null
            : /** @type {{ target: import('../shared/contracts.js').VideoIdentity, result: 'applied'|'restored'|'partial'|'failed' }} */ (
                reply.payload
              );
        if (
          reply === null ||
          reply.operationId !== effect.operationId ||
          replyPayload === null ||
          replyPayload.target.document.tabId !== target.tabId
        ) {
          failures.push(
            result.ok
              ? 'Content returned an invalid presentation reply.'
              : result.error.message,
          );
          await reduce({
            type: 'operation:failed',
            tabId: target.tabId,
            operationId: effect.operationId,
          });
          return;
        }
        await reduce({
          type: 'presentation:result',
          tabId: target.tabId,
          operationId: effect.operationId,
          result: replyPayload.result,
        });
        return;
      }
    }
  }

  /** @param {any} event @param {{ skipPreferenceWrite?: boolean }} [options] */
  async function reduce(event, options = {}) {
    const next = transition(state, event);
    state = next.state;
    for (const unknownEffect of next.effects) {
      const effect = /** @type {import('../shared/contracts.js').Effect} */ (
        unknownEffect
      );
      if (
        options.skipPreferenceWrite &&
        effect.kind === 'storage:write-preference'
      )
        continue;
      await execute(effect);
    }
  }

  /** @param {import('../shared/contracts.js').DocumentIdentity} document */
  /** @param {import('../shared/contracts.js').DocumentIdentity} document @param {boolean} reportKnownVideo */
  async function refreshContext(document, reportKnownVideo) {
    const result = await adapters.tabContext(document);
    if (!result.ok) {
      failures.push(result.error.message);
      return;
    }
    await reduce({
      type: 'context:updated',
      tabId: document.tabId,
      context: result.value,
    });
    const known = state.runtime[String(document.tabId)]?.video;
    if (reportKnownVideo && known !== null && known !== undefined) {
      await reduce({
        type: 'player:reported',
        tabId: document.tabId,
        document,
        videoId: known.videoId,
        mediaKind: known.mediaKind,
        observationId: known.observationId + 1,
        operation: operation(),
      });
    }
  }

  /** @param {unknown} sender */
  function contentContext(sender) {
    const documentId = senderDocumentId(sender);
    const tabId =
      sender !== null &&
      typeof sender === 'object' &&
      'tab' in sender &&
      sender.tab !== null &&
      typeof sender.tab === 'object' &&
      'id' in sender.tab &&
      typeof sender.tab.id === 'number'
        ? sender.tab.id
        : null;
    const previous = tabId === null ? null : state.session.tabs[String(tabId)];
    const generation =
      previous?.document.documentId === documentId
        ? previous.document.navigationGeneration
        : (previous?.document.navigationGeneration ?? 0) + 1;
    return adapters.contentContext(sender, generation);
  }

  /** @param {Record<string, unknown>} message */
  function preferenceReply(message) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PREFERENCE_RESULT,
      requestId: message.requestId,
      operationId: createIdentifier('op'),
      payload: { preference: state.preference },
    };
  }

  /** @param {Record<string, unknown>} message */
  async function updatePreference(message) {
    const payload = /** @type {{ enabled: boolean }} */ (message.payload);
    const enabled = payload.enabled;
    if (enabled === state.preference.enabled) return preferenceReply(message);
    const preference = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      enabled,
      revision: state.preference.revision + 1,
    };
    const written = await adapters.writePreference(preference);
    if (!written.ok) {
      failures.push(written.error.message);
      return null;
    }
    /** @type {Record<string, ReturnType<typeof operation>>} */
    const exits = {};
    /** @type {Record<string, ReturnType<typeof operation>>} */
    const entries = {};
    for (const [tabId, tab] of Object.entries(state.runtime)) {
      if (!enabled && tab.ownsWindow) exits[tabId] = operation();
      if (enabled && tab.video !== null) entries[tabId] = operation();
    }
    await reduce(
      {
        type: 'preference:changed',
        enabled,
        revision: preference.revision,
        exits,
        reactivation: enabled,
        entries,
      },
      { skipPreferenceWrite: true },
    );
    return preferenceReply(message);
  }

  /** @param {unknown} rawMessage @param {unknown} sender */
  async function receiveMessage(rawMessage, sender) {
    await initialize();
    const popup = adapters.popupContext(sender);
    if (popup.ok) {
      const message = validateReceivedMessage(rawMessage, popup.value);
      if (!message.ok) return null;
      if (message.value.type === MESSAGE_TYPES.PREFERENCE_GET)
        return preferenceReply(message.value);
      return updatePreference(message.value);
    }
    const content = contentContext(sender);
    if (!content.ok) return null;
    const message = validateReceivedMessage(rawMessage, content.value);
    if (!message.ok) return null;
    if (message.value.type === MESSAGE_TYPES.PLAYER_REPORTED) {
      const payload =
        /** @type {{ videoId: string, observationId: number }} */ (
          message.value.payload
        );
      await refreshContext(content.value.document, false);
      await reduce({
        type: 'player:reported',
        tabId: content.value.document.tabId,
        document: content.value.document,
        videoId: payload.videoId,
        mediaKind: 'video',
        observationId: payload.observationId,
        operation: operation(),
      });
      return null;
    }
    if (message.value.type === MESSAGE_TYPES.PLAYER_EXIT_REQUESTED) {
      await reduce({
        type: 'exit:requested',
        tabId: content.value.document.tabId,
        operation: operation(),
        reason: 'escape',
        suppress: true,
      });
    }
    return null;
  }

  /** @template T @param {() => Promise<T>} task */
  function enqueue(task) {
    const next = queue.catch(() => {}).then(task);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  return Object.freeze({
    initialize: () => enqueue(initialize),
    /** @param {unknown} message @param {unknown} sender */
    receiveMessage: (message, sender) =>
      enqueue(() => receiveMessage(message, sender)),
    refreshKnownContexts: () =>
      enqueue(async () => {
        await initialize();
        for (const tab of Object.values(state.session.tabs))
          await refreshContext(tab.document, true);
      }),
    /** @param {number} tabId */
    removeTab: (tabId) =>
      enqueue(async () => {
        await initialize();
        const tab = state.runtime[String(tabId)];
        const windowId = tab?.video?.document.windowId;
        if (windowId !== undefined) {
          const change = ownedWindows.get(windowId);
          if (change !== undefined) {
            const restored = await adapters.restoreOwnedWindow(change);
            if (!restored.ok) failures.push(restored.error.message);
            else ownedWindows.delete(windowId);
          }
        }
        const tabs = { ...state.session.tabs };
        const runtime = { ...state.runtime };
        delete tabs[String(tabId)];
        delete runtime[String(tabId)];
        state = { ...state, session: { ...state.session, tabs }, runtime };
        const saved = await adapters.recordCompletion(state.session);
        if (!saved.ok) failures.push(saved.error.message);
      }),
    snapshot: () => ({ state, failures: [...failures] }),
  });
}
