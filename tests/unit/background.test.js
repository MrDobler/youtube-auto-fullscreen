import { beforeEach, expect, test, vi } from 'vitest';

let runtime;
beforeEach(() => {
  vi.resetModules();
  runtime = {
    id: 'own-id',
    onMessage: { addListener: vi.fn() },
    getManifest: vi.fn(() => ({ version: '0.1.0' })),
  };
  const storageArea = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(),
  };
  vi.stubGlobal('chrome', {
    runtime,
    storage: { local: storageArea, session: storageArea },
    tabs: {
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    windows: { onFocusChanged: { addListener: vi.fn() } },
  });
});

test('registers synchronously and answers a probe from this extension', async () => {
  await import('../../src/background/index.js');
  expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const reply = vi.fn();
  expect(listener({ type: 'foundation:status' }, { id: 'own-id' }, reply)).toBe(
    false,
  );
  expect(reply).toHaveBeenCalledWith({ ready: true, version: '0.1.0' });
});

test.each([
  [{ type: 'foundation:status' }, { id: 'foreign' }],
  [{ type: 'other' }, { id: 'own-id' }],
  [null, { id: 'own-id' }],
])('ignores unauthorized or unrelated probes %j', async (message, sender) => {
  await import('../../src/background/index.js');
  const reply = vi.fn();
  expect(
    runtime.onMessage.addListener.mock.calls[0][0](message, sender, reply),
  ).toBe(true);
  expect(reply).not.toHaveBeenCalled();
  expect(runtime.getManifest).not.toHaveBeenCalled();
});

test('registers tab and window lifecycle listeners without delaying worker startup', async () => {
  await import('../../src/background/index.js');
  const { tabs, windows } = chrome;
  expect(tabs.onActivated.addListener).toHaveBeenCalledOnce();
  expect(tabs.onUpdated.addListener).toHaveBeenCalledOnce();
  expect(tabs.onRemoved.addListener).toHaveBeenCalledOnce();
  expect(windows.onFocusChanged.addListener).toHaveBeenCalledOnce();
  tabs.onActivated.addListener.mock.calls[0][0]({ tabId: 1, windowId: 1 });
  tabs.onUpdated.addListener.mock.calls[0][0](1, { status: 'loading' });
  tabs.onUpdated.addListener.mock.calls[0][0](1, { status: 'complete' });
  tabs.onRemoved.addListener.mock.calls[0][0](1);
  windows.onFocusChanged.addListener.mock.calls[0][0](1);
  await Promise.resolve();
});

test('absorbs a rejected asynchronous message boundary', async () => {
  await import('../../src/background/index.js');
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const sender = { id: 'own-id' };
  Object.defineProperty(sender, 'url', {
    get() {
      throw new Error('sender unavailable');
    },
  });
  expect(listener({ type: 'other' }, sender, vi.fn())).toBe(true);
  await Promise.resolve();
});

test('forwards an asynchronous popup reply', async () => {
  await import('../../src/background/index.js');
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const reply = vi.fn();
  expect(
    listener(
      {
        protocolVersion: 1,
        type: 'preference:get',
        requestId: 'req_01',
        payload: {},
      },
      { id: 'own-id', url: 'chrome-extension://own-id/popup/index.html' },
      reply,
    ),
  ).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledOnce());
});
