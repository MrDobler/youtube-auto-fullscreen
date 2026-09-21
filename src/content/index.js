import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  validateMessage,
} from '../shared/contracts.js';
import { createYouTubePlayerController } from '../platform/youtube/player.js';

let sequence = 0;

/** @param {string} prefix */
function identifier(prefix) {
  sequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll('-', '_');
  return `${prefix}_${uuid ?? `${Date.now()}_${sequence}`}`;
}

/** @param {Record<string, unknown>} message */
async function notify(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // A navigated-away or suspended worker must never leave an unhandled task.
  }
}

const player = createYouTubePlayerController({
  document,
  onPlayerReport(report) {
    void notify({
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PLAYER_REPORTED,
      requestId: identifier('req'),
      payload: {
        videoId: report.videoId,
        observationId: report.observationId,
        reason: report.reason,
      },
    });
  },
  onExitRequested(request) {
    void notify({
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
      requestId: identifier('req'),
      payload: {
        videoId: request.videoId,
        observationId: request.observationId,
        reason: 'escape',
      },
    });
  },
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const valid = validateMessage(message);
  if (
    !valid.ok ||
    (valid.value.type !== MESSAGE_TYPES.PRESENTATION_APPLY &&
      valid.value.type !== MESSAGE_TYPES.PRESENTATION_RESTORE)
  )
    return false;
  const payload =
    /** @type {{ target: import('../shared/contracts.js').VideoIdentity }} */ (
      valid.value.payload
    );
  const target = payload.target;
  const result =
    valid.value.type === MESSAGE_TYPES.PRESENTATION_APPLY
      ? player.apply(target)
      : player.restore();
  sendResponse({
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PRESENTATION_RESULT,
    requestId: valid.value.requestId,
    operationId: valid.value.operationId,
    payload: { target, result: result.result },
  });
  return false;
});

player.mount();

async function initializeContent() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'foundation:status',
    });
    if (response?.ready !== true) throw new Error('Worker unavailable');
    console.debug('YouTube Auto Fullscreen: content ready');
  } catch {
    console.warn('YouTube Auto Fullscreen: initialization unavailable');
  }
}

void initializeContent();
