import { beforeEach, expect, test, vi } from 'vitest';

let runtime;
beforeEach(() => {
  vi.resetModules();
  runtime = {
    id: 'own-id',
    onMessage: { addListener: vi.fn() },
    getManifest: vi.fn(() => ({ version: '0.1.0' })),
  };
  vi.stubGlobal('chrome', { runtime });
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
  runtime.onMessage.addListener.mock.calls[0][0](message, sender, reply);
  expect(reply).not.toHaveBeenCalled();
  expect(runtime.getManifest).not.toHaveBeenCalled();
});
