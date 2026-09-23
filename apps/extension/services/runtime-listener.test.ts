import { describe, expect, test, vi } from 'vitest';
import { createRuntimeClient } from './runtime-client';
import {
  createRuntimeListener,
  registerRuntimeListener,
  type RuntimeMessageListener,
} from './runtime-listener';
import type { RuntimeSender } from './runtime-router';

const sender: RuntimeSender = {
  id: 'extension-test-id', tab: { id: 1 }, frameId: 0,
  url: 'https://ekt.kz/', origin: 'https://ekt.kz',
};
const ping = {
  channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING', payload: {},
};

describe('runtime listener', () => {
  test('registers, cleans up the same listener, and handles repeated initialization', () => {
    const active = new Set<RuntimeMessageListener>();
    const event = {
      addListener: vi.fn((listener: RuntimeMessageListener) => { active.add(listener); }),
      removeListener: vi.fn((listener: RuntimeMessageListener) => { active.delete(listener); }),
    };
    const cleanupFirst = registerRuntimeListener(event, sender.id ?? '');
    expect(active.size).toBe(1);
    const first = [...active][0];
    cleanupFirst();
    cleanupFirst();
    expect(active.size).toBe(0);
    expect(event.removeListener).toHaveBeenCalledExactlyOnceWith(first);

    const cleanupSecond = registerRuntimeListener(event, sender.id ?? '');
    expect(active.size).toBe(1);
    cleanupSecond();
    expect(active.size).toBe(0);
  });

  test('does not capture unrelated messages or reply to them', () => {
    const listener = createRuntimeListener('extension-test-id');
    const sendResponse = vi.fn();
    expect(listener({ ...ping, channel: 'wxt' }, sender, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  test('returns literal true and responds exactly once for our channel', async () => {
    const listener = createRuntimeListener('extension-test-id');
    const sendResponse = vi.fn();
    expect(listener(ping, sender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req_ping', ok: true, data: { status: 'runtime_ready' },
    }));
  });

  test('sanitizes unexpected handler failures', async () => {
    const listener = createRuntimeListener('extension-test-id', async () => {
      throw new Error('private stack and request contents');
    });
    const sendResponse = vi.fn();
    expect(listener(ping, sender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
    const response = sendResponse.mock.calls[0]?.[0];
    expect(response).toMatchObject({
      request_id: 'req_ping', type: 'PING', ok: false,
      error: { code: 'INTERNAL_ERROR', retryable: false },
    });
    expect(JSON.stringify(response)).not.toContain('private');
  });

  test('connects the real client, listener, and router in memory', async () => {
    const listener = createRuntimeListener('extension-test-id');
    const client = createRuntimeClient({
      createRequestId: () => 'req_round_trip',
      message: (message) => new Promise((resolve) => {
        expect(listener(message, sender, resolve)).toBe(true);
      }),
    });

    expect(await client.ping()).toEqual({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_round_trip',
      type: 'PING', ok: true, data: { status: 'runtime_ready' },
    });
  });
});
