import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  validateMessage,
  validatePreferenceRecord,
} from '../shared/contracts.js';

const COPY = Object.freeze({
  en: {
    title: 'YouTube Auto Fullscreen',
    preferenceLabel: 'Automatic fullscreen',
    toggleLabel: 'Enable for videos and live streams',
    enabled: 'Enabled',
    disabled: 'Disabled',
    loading: 'Loading preference…',
    saving: 'Saving preference…',
    loadError:
      'Could not load the preference. Reopen the extension to try again.',
    saveError: 'The change was not confirmed. Try again.',
  },
  'pt-BR': {
    title: 'YouTube Auto Fullscreen',
    preferenceLabel: 'Tela cheia automática',
    toggleLabel: 'Ativar para vídeos e lives',
    enabled: 'Ativado',
    disabled: 'Desativado',
    loading: 'Carregando preferência…',
    saving: 'Salvando preferência…',
    loadError:
      'Não foi possível carregar a preferência. Reabra a extensão para tentar novamente.',
    saveError: 'A alteração não foi confirmada. Tente novamente.',
  },
});

/** @typedef {'loading'|'ready'|'saving'|'error'} PopupPhase */
/** @typedef {{ send: (message: Record<string, unknown>) => Promise<unknown> }} PreferenceTransport */
/** @typedef {{ toggle: HTMLInputElement, title: HTMLElement, preferenceLabel: HTMLElement, toggleLabel: HTMLElement, toggleState: HTMLElement, status: HTMLElement, main: HTMLElement }} PopupElements */

/** @param {string | undefined} locale */
function copyFor(locale) {
  return locale?.toLowerCase().startsWith('pt') ? COPY['pt-BR'] : COPY.en;
}

/** @param {Document} document @returns {PopupElements | null} */
function popupElements(document) {
  const toggle = document.getElementById('enabled');
  const title = document.getElementById('popup-title');
  const preferenceLabel = document.getElementById('preference-label');
  const toggleLabel = document.getElementById('toggle-label');
  const toggleState = document.getElementById('toggle-state');
  const status = document.getElementById('status');
  const main = document.querySelector('main');
  return toggle instanceof HTMLInputElement &&
    title instanceof HTMLElement &&
    preferenceLabel instanceof HTMLElement &&
    toggleLabel instanceof HTMLElement &&
    toggleState instanceof HTMLElement &&
    status instanceof HTMLElement &&
    main instanceof HTMLElement
    ? { toggle, title, preferenceLabel, toggleLabel, toggleState, status, main }
    : null;
}

/** @param {Record<string, unknown>} message @param {string} requestId */
function confirmedPreference(message, requestId) {
  const validMessage = validateMessage(message);
  if (!validMessage.ok || validMessage.value.requestId !== requestId)
    return null;
  if (validMessage.value.type !== MESSAGE_TYPES.PREFERENCE_RESULT) return null;
  const payload = validMessage.value.payload;
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !('preference' in payload)
  )
    return null;
  const validPreference = validatePreferenceRecord(payload.preference);
  return validPreference.ok ? validPreference.value : null;
}

/** @param {string} requestId @param {boolean | null} enabled */
function preferenceMessage(requestId, enabled) {
  return enabled === null
    ? {
        protocolVersion: PROTOCOL_VERSION,
        type: MESSAGE_TYPES.PREFERENCE_GET,
        requestId,
        payload: {},
      }
    : {
        protocolVersion: PROTOCOL_VERSION,
        type: MESSAGE_TYPES.PREFERENCE_SET,
        requestId,
        payload: { enabled },
      };
}

/** @param {typeof chrome} chromeApi @returns {PreferenceTransport} */
export function createChromePreferenceTransport(chromeApi) {
  return Object.freeze({
    /** @param {Record<string, unknown>} message */
    async send(message) {
      return chromeApi.runtime.sendMessage(message);
    },
  });
}

/**
 * Mounts the preference UI against an injected worker transport. The worker
 * owns persistence and operations so a popup closing cannot cancel a change.
 *
 * @param {{ document: Document, transport: PreferenceTransport, createRequestId: () => string, locale?: string }} dependencies
 */
export function mountPopup(dependencies) {
  const elements = popupElements(dependencies.document);
  if (elements === null)
    return Object.freeze({
      ready: Promise.resolve(),
      reload: async () => {},
      dispose: () => {},
    });
  const ui = elements;
  const copy = copyFor(dependencies.locale);
  ui.title.textContent = copy.title;
  ui.preferenceLabel.textContent = copy.preferenceLabel;
  ui.toggleLabel.textContent = copy.toggleLabel;

  /** @type {import('../shared/contracts.js').PreferenceRecord | null} */
  let preference = null;
  /** @type {PopupPhase} */
  let phase = 'loading';
  let disposed = false;
  let requestInFlight = false;

  function render() {
    ui.main.dataset.phase = phase;
    ui.main.setAttribute(
      'aria-busy',
      phase === 'loading' || phase === 'saving' ? 'true' : 'false',
    );
    ui.toggle.disabled =
      preference === null || phase === 'loading' || phase === 'saving';
    if (preference !== null) ui.toggle.checked = preference.enabled;
    const state = preference?.enabled === true ? copy.enabled : copy.disabled;
    ui.toggleState.textContent =
      phase === 'loading' || phase === 'saving' ? copy[phase] : state;
    ui.status.textContent =
      phase === 'loading'
        ? copy.loading
        : phase === 'saving'
          ? copy.saving
          : phase === 'error'
            ? preference === null
              ? copy.loadError
              : copy.saveError
            : state;
  }

  /** @param {boolean | null} enabled */
  async function requestPreference(enabled) {
    const requestId = dependencies.createRequestId();
    try {
      const response = await dependencies.transport.send(
        preferenceMessage(requestId, enabled),
      );
      return confirmedPreference(
        /** @type {Record<string, unknown>} */ (response),
        requestId,
      );
    } catch {
      return null;
    }
  }

  async function reload() {
    if (disposed || requestInFlight) return;
    requestInFlight = true;
    phase = 'loading';
    render();
    const confirmed = await requestPreference(null);
    requestInFlight = false;
    if (disposed) return;
    if (confirmed === null) {
      phase = 'error';
    } else {
      preference = confirmed;
      phase = 'ready';
    }
    render();
  }

  async function save() {
    if (disposed || preference === null || requestInFlight) return;
    const enabled = ui.toggle.checked;
    requestInFlight = true;
    phase = 'saving';
    render();
    const confirmed = await requestPreference(enabled);
    requestInFlight = false;
    if (disposed) return;
    if (confirmed === null) {
      phase = 'error';
    } else {
      preference = confirmed;
      phase = 'ready';
    }
    render();
  }

  function handleChange() {
    void save();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ui.toggle.removeEventListener('change', handleChange);
  }

  ui.toggle.addEventListener('change', handleChange);
  render();
  const ready = reload();
  return Object.freeze({ ready, reload, dispose });
}

function defaultRequestId() {
  return `req_${globalThis.crypto.randomUUID()}`;
}

const chromeApi = /** @type {typeof chrome | undefined} */ (
  /** @type {unknown} */ (globalThis.chrome)
);

if (chromeApi !== undefined) {
  const controller = mountPopup({
    document,
    transport: createChromePreferenceTransport(chromeApi),
    createRequestId: defaultRequestId,
    locale: chromeApi.i18n.getUILanguage(),
  });
  void controller.ready;
}
