import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

test('announces readiness only after the worker answers', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ready: true });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  await import('../../src/content/index.js');
  await vi.waitFor(() =>
    expect(debug).toHaveBeenCalledWith(
      'YouTube Auto Fullscreen: content ready',
    ),
  );
  expect(sendMessage).toHaveBeenCalledWith({ type: 'foundation:status' });
});

test.each(['rejected', 'invalid', 'missing'])(
  'handles %s initialization without an unhandled rejection',
  async (mode) => {
    const sendMessage =
      mode === 'rejected'
        ? vi.fn().mockRejectedValue(new Error('Disconnected'))
        : vi
            .fn()
            .mockResolvedValue(
              mode === 'invalid' ? { ready: false } : undefined,
            );
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await import('../../src/content/index.js');
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'YouTube Auto Fullscreen: initialization unavailable',
      ),
    );
    expect(debug).not.toHaveBeenCalled();
  },
);
