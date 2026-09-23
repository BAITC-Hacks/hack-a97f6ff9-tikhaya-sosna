import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRuntimeClient } from './runtime-client';
import type { RuntimeRequest } from '../contracts';
import {
  createRuntimeListener,
  registerRuntimeListener,
  type RuntimeMessageListener,
} from './runtime-listener';
import type { RuntimeSender } from './runtime-router';
import { routeRuntimeMessage } from './runtime-router';
import { createSessionStore } from '../storage/session-storage';

const sender: RuntimeSender = {
  id: 'extension-test-id', tab: { id: 1 }, frameId: 0,
  url: 'https://ekt.kz/', origin: 'https://ekt.kz',
};
const ping = {
  channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING', payload: {},
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('runtime listener', () => {
  test('async session responses correlate, and unrelated channels do not respond', async () => {
    const descriptor = { session_id: '35bc8d96-6c74-4f72-9760-0cd617ba3a83', origin: 'https://ekt.kz' };
    const store = { getOrCreate: vi.fn(async () => descriptor), reset: vi.fn(async () => descriptor) };
    const listener = createRuntimeListener('extension-test-id',
      (message, from, runtimeId) => routeRuntimeMessage(message, from, runtimeId, store));
    const response = vi.fn();
    expect(listener({ ...ping, type: 'SESSION_GET' }, sender, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request_id: 'req_ping', type: 'SESSION_GET', ok: true, data: descriptor,
    })));
    expect(store.getOrCreate).toHaveBeenCalledExactlyOnceWith({ tab_id: 1, origin: 'https://ekt.kz' });
    expect(listener({ ...ping, channel: 'other' }, sender, response)).toBe(false);
    expect(response).toHaveBeenCalledTimes(1);
  });

  test('real client, listener, router and store complete GET -> RESET -> GET in memory', async () => {
    const fetchStub = vi.fn(() => { throw new Error('external fetch forbidden'); });
    vi.stubGlobal('fetch', fetchStub);
    const data = new Map<string, unknown>();
    const area = {
      get: vi.fn(async (key: string) => ({ [key]: data.get(key) })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) data.set(key, value);
      }),
    };
    const ids = ['35bc8d96-6c74-4f72-9760-0cd617ba3a83', '35bc8d96-6c74-4f72-9760-0cd617ba3a84'];
    const store = createSessionStore(area, () => ids.shift() ?? 'invalid');
    const listener = createRuntimeListener('extension-test-id',
      (message, from, runtimeId) => routeRuntimeMessage(message, from, runtimeId, store));
    const sent = vi.fn((message: RuntimeRequest) =>
      new Promise<unknown>((resolve) => { expect(listener(message, sender, resolve)).toBe(true); }));
    let index = 0;
    const client = createRuntimeClient({ message: sent, createRequestId: () => `req_${++index}` });
    const first = await client.getSession();
    const reset = await client.resetSession();
    const again = await client.getSession();
    expect(first).toMatchObject({ type: 'SESSION_GET', request_id: 'req_1', ok: true,
      data: { session_id: '35bc8d96-6c74-4f72-9760-0cd617ba3a83', origin: 'https://ekt.kz' } });
    expect(reset).toMatchObject({ type: 'SESSION_RESET', request_id: 'req_2', ok: true,
      data: { session_id: '35bc8d96-6c74-4f72-9760-0cd617ba3a84' } });
    expect(again).toMatchObject({ type: 'SESSION_GET', request_id: 'req_3', ok: true,
      data: { session_id: '35bc8d96-6c74-4f72-9760-0cd617ba3a84' } });
    expect(sent).toHaveBeenCalledTimes(3);
    expect(area.set).toHaveBeenCalledTimes(2);
    expect(data.size).toBe(1);
    expect(fetchStub).not.toHaveBeenCalled();
  });
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
