// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<p id="status" role="status">Carregando…</p>';
});

test('shows confirmed readiness', async () => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ready: true }) },
  });
  await import('../../src/popup/index.js');
  expect(document.getElementById('status').textContent).toBe('Base carregada.');
});

test.each(['rejected', 'invalid', 'missing'])(
  'shows a recovery message for %s initialization',
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
    await import('../../src/popup/index.js');
    expect(document.getElementById('status').textContent).toContain(
      'Recarregue a extensão.',
    );
  },
);

test('does not send a request if the status element is absent', async () => {
  document.body.replaceChildren();
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  await import('../../src/popup/index.js');
  expect(sendMessage).not.toHaveBeenCalled();
});
