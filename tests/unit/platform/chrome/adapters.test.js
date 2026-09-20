import { expect, test, vi } from 'vitest';
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  STORAGE_SCHEMA_VERSION,
} from '../../../../src/shared/contracts.js';
import {
  createChromeAdapters,
  PREFERENCE_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from '../../../../src/platform/chrome/adapters.js';

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
const session = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  tabs: {
    17: {
      document: documentIdentity,
      video: null,
      suppression: null,
      operations: [],
    },
  },
};

function presentationMessage(target = videoIdentity) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PRESENTATION_APPLY,
    requestId: 'req_001',
    operationId: 'op_009',
    payload: { target },
  };
}

function contentSender(overrides = {}) {
  return {
    id: 'own-id',
    frameId: 0,
    documentId: documentIdentity.documentId,
    origin: 'https://www.youtube.com',
    tab: { id: documentIdentity.tabId, windowId: documentIdentity.windowId },
    ...overrides,
  };
}

function popupSender(overrides = {}) {
  return {
    id: 'own-id',
    url: 'chrome-extension://own-id/popup/index.html',
    ...overrides,
  };
}

function createChromeApi(overrides = {}) {
  const local = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const sessionArea = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    runtime: { id: 'own-id' },
    storage: { local, session: sessionArea },
    tabs: {
      get: vi.fn().mockResolvedValue({
        id: documentIdentity.tabId,
        windowId: 4,
        active: true,
      }),
      sendMessage: vi.fn().mockResolvedValue({ delivered: true }),
    },
    windows: {
      get: vi.fn().mockResolvedValue({ id: 4, state: 'normal', focused: true }),
      update: vi.fn().mockResolvedValue({ id: 4, state: 'fullscreen' }),
    },
  };
  return { ...api, ...overrides, local, sessionArea };
}

test('derives content and popup contexts from trusted Chrome senders', () => {
  const api = createChromeApi();
  const adapters = createChromeAdapters(api);

  expect(adapters.contentContext(contentSender(), 12)).toMatchObject({
    ok: true,
    value: { kind: 'content', document: documentIdentity },
  });
  expect(adapters.popupContext(popupSender())).toMatchObject({ ok: true });
  expect(
    adapters.contentContext(contentSender({ frameId: 2 }), 12),
  ).toMatchObject({ ok: false, error: { code: 'invalid-sender' } });
  expect(adapters.popupContext(popupSender({ id: 'other-id' }))).toMatchObject({
    ok: false,
    error: { code: 'invalid-sender' },
  });
});

test('reads focused tab and window context without accessing a tab URL', async () => {
  const api = createChromeApi();
  const result = await createChromeAdapters(api).tabContext(documentIdentity);

  expect(result).toEqual({
    ok: true,
    value: {
      tabFocused: true,
      windowFocused: true,
      windowState: 'normal',
      fullscreenOwner: 'none',
    },
  });
  expect(api.tabs.get).toHaveBeenCalledWith(17);
  expect(api.windows.get).toHaveBeenCalledWith(4);
});

test('treats stale, closed and unsupported tab contexts as failures', async () => {
  const mismatch = createChromeApi({
    tabs: { get: vi.fn().mockResolvedValue({ windowId: 9, active: false }) },
  });
  await expect(
    createChromeAdapters(mismatch).tabContext(documentIdentity),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'target-mismatch' },
  });

  const closed = createChromeApi({
    tabs: { get: vi.fn().mockRejectedValue(new Error('No tab with id: 17')) },
  });
  await expect(
    createChromeAdapters(closed).tabContext(documentIdentity),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'tab-closed' },
  });

  const unsupported = createChromeApi({
    windows: { get: vi.fn().mockResolvedValue({ state: 'locked-fullscreen' }) },
  });
  await expect(
    createChromeAdapters(unsupported).tabContext(documentIdentity),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'unsupported-window-state' },
  });
});

test('rejects an invalid document before calling Chrome for context', async () => {
  const api = createChromeApi();
  await expect(createChromeAdapters(api).tabContext({})).resolves.toMatchObject(
    {
      ok: false,
      error: { code: 'invalid-input' },
    },
  );
  expect(api.tabs.get).not.toHaveBeenCalled();
});

test('persists versioned preference only in local storage', async () => {
  const api = createChromeApi();
  api.local.get.mockResolvedValue({ [PREFERENCE_STORAGE_KEY]: preference });
  const adapters = createChromeAdapters(api);

  await expect(adapters.readPreference()).resolves.toEqual({
    ok: true,
    value: preference,
  });
  await expect(adapters.writePreference(preference)).resolves.toEqual({
    ok: true,
    value: preference,
  });
  expect(api.local.get).toHaveBeenCalledWith(PREFERENCE_STORAGE_KEY);
  expect(api.local.set).toHaveBeenCalledWith({
    [PREFERENCE_STORAGE_KEY]: preference,
  });
  expect(api.sessionArea.set).not.toHaveBeenCalled();
});

test('reports missing, corrupt and unreadable preference storage distinctly', async () => {
  const missing = createChromeApi();
  await expect(createChromeAdapters(missing).readPreference()).resolves.toEqual(
    {
      ok: true,
      value: null,
    },
  );

  const corrupt = createChromeApi();
  corrupt.local.get.mockResolvedValue({
    [PREFERENCE_STORAGE_KEY]: { schemaVersion: 9 },
  });
  await expect(
    createChromeAdapters(corrupt).readPreference(),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'corrupt-storage', path: PREFERENCE_STORAGE_KEY },
  });

  const rejected = createChromeApi();
  rejected.local.get.mockRejectedValue(new Error('disk unavailable'));
  await expect(
    createChromeAdapters(rejected).readPreference(),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'storage-read-failed' },
  });
});

test('rejects invalid and failed preference writes without treating them as success', async () => {
  const invalid = createChromeApi();
  await expect(
    createChromeAdapters(invalid).writePreference({ enabled: true }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  expect(invalid.local.set).not.toHaveBeenCalled();

  const rejected = createChromeApi();
  rejected.local.set.mockRejectedValue(new Error('quota exceeded'));
  await expect(
    createChromeAdapters(rejected).writePreference(preference),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'storage-write-failed' },
  });
});

test('persists session intent and completion separately in session storage', async () => {
  const api = createChromeApi();
  api.sessionArea.get.mockResolvedValue({ [SESSION_STORAGE_KEY]: session });
  const adapters = createChromeAdapters(api);

  await expect(adapters.readSession()).resolves.toEqual({
    ok: true,
    value: session,
  });
  await expect(adapters.persistIntent(session)).resolves.toMatchObject({
    ok: true,
  });
  await expect(adapters.recordCompletion(session)).resolves.toMatchObject({
    ok: true,
  });
  await expect(adapters.writeSession(session)).resolves.toMatchObject({
    ok: true,
  });
  expect(api.sessionArea.get).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
  expect(api.sessionArea.set).toHaveBeenCalledTimes(3);
  expect(api.sessionArea.set).toHaveBeenCalledWith({
    [SESSION_STORAGE_KEY]: session,
  });
  expect(api.local.set).not.toHaveBeenCalled();
});

test('rejects corrupt and failed session persistence', async () => {
  const corrupt = createChromeApi();
  corrupt.sessionArea.get.mockResolvedValue({
    [SESSION_STORAGE_KEY]: {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      tabs: { bad: {} },
    },
  });
  await expect(
    createChromeAdapters(corrupt).readSession(),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'corrupt-storage' },
  });

  const rejected = createChromeApi();
  rejected.sessionArea.set.mockRejectedValue(new Error('session unavailable'));
  await expect(
    createChromeAdapters(rejected).writeSession(session),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'storage-write-failed' },
  });
});

test('enters fullscreen without focusing and restores only its own change', async () => {
  const api = createChromeApi();
  const adapters = createChromeAdapters(api);
  const entered = await adapters.enterFullscreen(4, 'op_009');

  expect(entered).toEqual({
    ok: true,
    value: {
      operationId: 'op_009',
      windowId: 4,
      previousState: 'normal',
      changed: true,
    },
  });
  expect(api.windows.update).toHaveBeenCalledWith(4, { state: 'fullscreen' });
  await expect(adapters.restoreOwnedWindow(entered.value)).resolves.toEqual({
    ok: true,
    value: { restored: true },
  });
  expect(api.windows.update).toHaveBeenLastCalledWith(4, { state: 'normal' });
});

test('does not restore external fullscreen or an unowned change', async () => {
  const external = createChromeApi({
    windows: {
      get: vi.fn().mockResolvedValue({ state: 'fullscreen' }),
      update: vi.fn().mockResolvedValue({}),
    },
  });
  const adapters = createChromeAdapters(external);
  await expect(
    adapters.enterFullscreen(4, 'op_external'),
  ).resolves.toMatchObject({
    ok: true,
    value: { changed: false },
  });
  await expect(
    adapters.restoreOwnedWindow({
      operationId: 'op_external',
      windowId: 4,
      previousState: 'normal',
      changed: false,
    }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'window-not-owned' } });
  expect(external.windows.update).not.toHaveBeenCalled();
});

test('normalizes invalid, closed and unsupported window operations', async () => {
  const invalid = createChromeApi();
  await expect(
    createChromeAdapters(invalid).enterFullscreen(-1, 'op_009'),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });

  const closed = createChromeApi({
    windows: {
      get: vi.fn().mockRejectedValue(new Error('No window with id: 4')),
    },
  });
  await expect(
    createChromeAdapters(closed).enterFullscreen(4, 'op_009'),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'window-closed' },
  });

  const minimized = createChromeApi({
    windows: { get: vi.fn().mockResolvedValue({ state: 'minimized' }) },
  });
  await expect(
    createChromeAdapters(minimized).enterFullscreen(4, 'op_009'),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'unsupported-window-state' },
  });
});

test('sends only presentation commands to the exact trusted document', async () => {
  const api = createChromeApi();
  const adapters = createChromeAdapters(api);
  const command = presentationMessage();

  await expect(
    adapters.sendToDocument(documentIdentity, command),
  ).resolves.toEqual({
    ok: true,
    value: { delivered: true },
  });
  expect(api.tabs.sendMessage).toHaveBeenCalledWith(17, command, {
    documentId: 'doc_7e39',
  });
});

test('rejects arbitrary targets, invalid commands and unavailable content receivers', async () => {
  const mismatched = createChromeApi();
  const wrongTarget = {
    ...videoIdentity,
    document: { ...documentIdentity, tabId: 55 },
  };
  await expect(
    createChromeAdapters(mismatched).sendToDocument(
      documentIdentity,
      presentationMessage(wrongTarget),
    ),
  ).resolves.toMatchObject({ ok: false, error: { code: 'target-mismatch' } });
  expect(mismatched.tabs.sendMessage).not.toHaveBeenCalled();

  const invalid = createChromeApi();
  await expect(
    createChromeAdapters(invalid).sendToDocument(documentIdentity, {
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PREFERENCE_GET,
      requestId: 'req_001',
      payload: {},
    }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });

  const unavailable = createChromeApi();
  unavailable.tabs.sendMessage.mockRejectedValue(
    new Error('Could not establish connection. Receiving end does not exist.'),
  );
  await expect(
    createChromeAdapters(unavailable).sendToDocument(
      documentIdentity,
      presentationMessage(),
    ),
  ).resolves.toMatchObject({ ok: false, error: { code: 'no-receiver' } });
});
