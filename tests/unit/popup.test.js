// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
} from '../../src/shared/contracts.js';

let createChromePreferenceTransport;
let mountPopup;

const markup = `
  <main aria-busy="true" aria-labelledby="popup-title">
    <h1 id="popup-title">YouTube Auto Fullscreen</h1>
    <form><fieldset><legend id="preference-label">Tela cheia automática</legend>
      <div><input id="enabled" type="checkbox" aria-describedby="status" disabled>
        <label for="enabled"><span id="toggle-label"></span><span id="toggle-state"></span></label>
      </div>
    </fieldset></form>
    <p id="status" role="status" aria-live="polite" aria-atomic="true"></p>
  </main>`;

function preference(enabled, revision = 4) {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, enabled, revision };
}

function result(requestId, enabled, revision = 4) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_RESULT,
    requestId,
    operationId: 'op_001',
    payload: { preference: preference(enabled, revision) },
  };
}

function failure(requestId) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.OPERATION_FAILED,
    requestId,
    operationId: 'op_001',
    payload: {
      error: {
        code: 'invalid-state',
        message: 'Storage rejected.',
        path: 'preference',
      },
    },
  };
}

function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function ids() {
  let next = 0;
  return () => `req_00${(next += 1)}`;
}

function elements() {
  return {
    main: document.querySelector('main'),
    toggle: /** @type {HTMLInputElement} */ (
      document.getElementById('enabled')
    ),
    status: document.getElementById('status'),
    toggleState: document.getElementById('toggle-state'),
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

async function importPopup() {
  vi.resetModules();
  ({ createChromePreferenceTransport, mountPopup } =
    await import('../../src/popup/index.js'));
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  document.body.innerHTML = markup;
  await importPopup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('loads and presents the worker-confirmed global preference', async () => {
  const send = vi.fn((message) =>
    Promise.resolve(result(message.requestId, true)),
  );
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
    locale: 'pt-BR',
  });
  const ui = elements();

  expect(ui.toggle.disabled).toBe(true);
  expect(ui.status.textContent).toContain('Carregando');
  await popup.ready;
  expect(send).toHaveBeenCalledWith({
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_GET,
    requestId: 'req_001',
    payload: {},
  });
  expect(ui.toggle.checked).toBe(true);
  expect(ui.toggle.disabled).toBe(false);
  expect(ui.status.textContent).toBe('Ativado');
  expect(ui.main.getAttribute('aria-busy')).toBe('false');
});

test('sends a preference command on click and only shows its confirmed value', async () => {
  const saving = deferred();
  const send = vi.fn((message) => {
    if (message.type === MESSAGE_TYPES.PREFERENCE_GET)
      return Promise.resolve(result(message.requestId, true));
    return saving.promise;
  });
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
  });
  await popup.ready;
  const ui = elements();

  ui.toggle.click();
  expect(ui.toggle.disabled).toBe(true);
  expect(ui.toggle.checked).toBe(true);
  expect(ui.status.textContent).toBe('Saving preference…');
  expect(send).toHaveBeenLastCalledWith({
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_SET,
    requestId: 'req_002',
    payload: { enabled: false },
  });

  saving.resolve(result('req_002', false, 5));
  await settle();
  expect(ui.toggle.checked).toBe(false);
  expect(ui.toggle.disabled).toBe(false);
  expect(ui.status.textContent).toBe('Disabled');
});

test('prevents duplicate changes while a save is in flight', async () => {
  const saving = deferred();
  const send = vi.fn((message) =>
    message.type === MESSAGE_TYPES.PREFERENCE_GET
      ? Promise.resolve(result(message.requestId, false))
      : saving.promise,
  );
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
  });
  await popup.ready;
  const ui = elements();

  ui.toggle.checked = true;
  ui.toggle.dispatchEvent(new Event('change', { bubbles: true }));
  ui.toggle.dispatchEvent(new Event('change', { bubbles: true }));
  expect(send).toHaveBeenCalledTimes(2);

  saving.resolve(result('req_002', true));
  await settle();
  expect(ui.status.textContent).toBe('Enabled');
});

test.each([
  ['rejection', () => Promise.reject(new Error('Worker unavailable'))],
  ['invalid response', () => Promise.resolve({ ready: true })],
  [
    'response for another request',
    () => Promise.resolve(result('req_other', true)),
  ],
  ['worker failure', (message) => Promise.resolve(failure(message.requestId))],
])('shows a loading failure for a %s', async (_name, response) => {
  const send = vi.fn((message) => response(message));
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
  });
  await popup.ready;
  const ui = elements();

  expect(ui.toggle.disabled).toBe(true);
  expect(ui.main.dataset.phase).toBe('error');
  expect(ui.status.textContent).toContain('Could not load');
});

test.each([
  ['rejected save', () => Promise.reject(new Error('Disconnected'))],
  ['invalid save response', () => Promise.resolve({})],
  ['denied save', (message) => Promise.resolve(failure(message.requestId))],
])('does not mask a %s as success', async (_name, saveResponse) => {
  const send = vi.fn((message) =>
    message.type === MESSAGE_TYPES.PREFERENCE_GET
      ? Promise.resolve(result(message.requestId, true))
      : saveResponse(message),
  );
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
  });
  await popup.ready;
  const ui = elements();

  ui.toggle.click();
  await settle();
  expect(ui.toggle.checked).toBe(true);
  expect(ui.toggle.disabled).toBe(false);
  expect(ui.main.dataset.phase).toBe('error');
  expect(ui.status.textContent).toBe(
    'The change was not confirmed. Try again.',
  );
});

test('reloads the persisted preference when the popup is opened again', async () => {
  const firstSend = vi.fn((message) =>
    Promise.resolve(failure(message.requestId)),
  );
  const first = mountPopup({
    document,
    transport: { send: firstSend },
    createRequestId: ids(),
  });
  await first.ready;
  expect(elements().status.textContent).toContain('Could not load');
  first.dispose();

  document.body.innerHTML = markup;
  const secondSend = vi.fn((message) =>
    Promise.resolve(result(message.requestId, false, 9)),
  );
  const second = mountPopup({
    document,
    transport: { send: secondSend },
    createRequestId: ids(),
  });
  await second.ready;
  expect(elements().toggle.checked).toBe(false);
  expect(elements().status.textContent).toBe('Disabled');
});

test('uses English messages when requested and removes its listener on dispose', async () => {
  const send = vi.fn((message) =>
    Promise.resolve(result(message.requestId, true)),
  );
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
    locale: 'en-US',
  });
  await popup.ready;
  const ui = elements();
  expect(document.getElementById('preference-label').textContent).toBe(
    'Automatic fullscreen',
  );
  popup.dispose();
  ui.toggle.checked = false;
  ui.toggle.dispatchEvent(new Event('change', { bubbles: true }));
  expect(send).toHaveBeenCalledTimes(1);
});

test('creates a Chrome transport without giving the UI direct window controls', async () => {
  const sendMessage = vi.fn().mockResolvedValue({});
  const transport = createChromePreferenceTransport({
    runtime: { sendMessage },
  });
  const message = { type: MESSAGE_TYPES.PREFERENCE_GET };

  await transport.send(message);
  expect(sendMessage).toHaveBeenCalledWith(message);
});

test('does not send a request when required popup controls are absent', async () => {
  document.body.replaceChildren();
  const send = vi.fn();
  const popup = mountPopup({
    document,
    transport: { send },
    createRequestId: ids(),
  });

  await popup.ready;
  await popup.reload();
  popup.dispose();
  expect(send).not.toHaveBeenCalled();
});

test('mounts through Chrome on the real popup entry point', async () => {
  const sendMessage = vi.fn((message) =>
    Promise.resolve(result(message.requestId, true)),
  );
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    i18n: { getUILanguage: () => 'en-US' },
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'popup_uuid' });
  vi.resetModules();

  await import('../../src/popup/index.js');
  await settle();
  expect(sendMessage).toHaveBeenCalledWith({
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PREFERENCE_GET,
    requestId: 'req_popup_uuid',
    payload: {},
  });
  expect(elements().status.textContent).toBe('Enabled');
});
