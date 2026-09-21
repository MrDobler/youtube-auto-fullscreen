import { beforeEach, expect, test, vi } from 'vitest';
import { MESSAGE_TYPES, PROTOCOL_VERSION } from '../../src/shared/contracts.js';

const player = vi.hoisted(() => ({
  apply: vi.fn(() => ({ result: 'applied' })),
  restore: vi.fn(() => ({ result: 'restored' })),
  mount: vi.fn(),
}));
const createYouTubePlayerController = vi.hoisted(() => vi.fn(() => player));

vi.mock('../../src/platform/youtube/player.js', () => ({
  createYouTubePlayerController,
}));

let runtime;

beforeEach(() => {
  vi.resetModules();
  player.apply.mockClear();
  player.restore.mockClear();
  player.mount.mockClear();
  createYouTubePlayerController.mockClear();
  runtime = {
    sendMessage: vi.fn().mockResolvedValue({ ready: true }),
    onMessage: { addListener: vi.fn() },
  };
  vi.stubGlobal('chrome', { runtime });
  vi.stubGlobal('document', {});
});

test('mounts the player and announces readiness only after the worker answers', async () => {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  await import('../../src/content/index.js');
  await vi.waitFor(() =>
    expect(debug).toHaveBeenCalledWith(
      'YouTube Auto Fullscreen: content ready',
    ),
  );
  expect(createYouTubePlayerController).toHaveBeenCalledWith(
    expect.objectContaining({ document: globalThis.document }),
  );
  expect(player.mount).toHaveBeenCalledOnce();
  expect(runtime.sendMessage).toHaveBeenCalledWith({
    type: 'foundation:status',
  });
});

test.each(['rejected', 'invalid', 'missing'])(
  'handles %s initialization without an unhandled rejection',
  async (mode) => {
    runtime.sendMessage =
      mode === 'rejected'
        ? vi.fn().mockRejectedValue(new Error('Disconnected'))
        : vi
            .fn()
            .mockResolvedValue(
              mode === 'invalid' ? { ready: false } : undefined,
            );
    vi.stubGlobal('chrome', { runtime });
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

test('reports player changes and Esc through validated envelopes', async () => {
  await import('../../src/content/index.js');
  const dependencies = createYouTubePlayerController.mock.calls[0][0];
  dependencies.onPlayerReport({
    videoId: 'video_01',
    observationId: 2,
    reason: 'initial',
  });
  dependencies.onExitRequested({
    videoId: 'video_01',
    observationId: 2,
    trigger: 'escape',
  });
  await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalledTimes(3));
  expect(
    runtime.sendMessage.mock.calls.slice(1).map(([message]) => message),
  ).toEqual([
    expect.objectContaining({
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PLAYER_REPORTED,
      payload: { videoId: 'video_01', observationId: 2, reason: 'initial' },
    }),
    expect.objectContaining({
      protocolVersion: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.PLAYER_EXIT_REQUESTED,
      payload: { videoId: 'video_01', observationId: 2, reason: 'escape' },
    }),
  ]);
});

test('applies and restores only presentation commands with a matching reply', async () => {
  await import('../../src/content/index.js');
  const listener = runtime.onMessage.addListener.mock.calls[0][0];
  const target = {
    document: {
      tabId: 3,
      windowId: 2,
      documentId: 'doc_01',
      navigationGeneration: 1,
    },
    videoId: 'video_01',
    videoGeneration: 1,
  };
  const reply = vi.fn();
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PRESENTATION_APPLY,
    requestId: 'req_01',
    operationId: 'op_01',
    payload: { target },
  };
  expect(listener(command, {}, reply)).toBe(false);
  expect(player.apply).toHaveBeenCalledWith(target);
  expect(reply).toHaveBeenCalledWith({
    protocolVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.PRESENTATION_RESULT,
    requestId: 'req_01',
    operationId: 'op_01',
    payload: { target, result: 'applied' },
  });
  expect(
    listener(
      {
        ...command,
        type: MESSAGE_TYPES.PRESENTATION_RESTORE,
        payload: { target, reason: 'escape' },
      },
      {},
      reply,
    ),
  ).toBe(false);
  expect(player.restore).toHaveBeenCalledOnce();
  expect(listener({ type: 'invalid' }, {}, reply)).toBe(false);
});
