import { afterEach, describe, expect, test, vi } from 'vitest';
import { createFailure, type ChatPayload, type RuntimeRequest } from '../contracts';
import { createRuntimeClient } from './runtime-client';

const payload: ChatPayload = {
  session_id: 'session_demo',
  message: 'Есть этот товар?',
  attachment_ids: [],
  page_context: {
    url: 'https://nursultan.ekt.kz/catalog/example/',
    origin: 'https://nursultan.ekt.kz',
    region: 'nursultan',
    locale: 'ru',
    current_product_id: null,
  },
};

const ready = (request: RuntimeRequest) => ({
  channel: 'ekt-ai-extension', version: 1, request_id: request.request_id,
  type: 'PING', ok: true, data: { status: 'runtime_ready' },
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runtime client', () => {
  test('sends one validated PING and accepts its correlated success', async () => {
    const message = vi.fn(async (request: RuntimeRequest) => ready(request));
    const client = createRuntimeClient({ message, createRequestId: () => 'req_ping' });

    expect(await client.ping()).toEqual(ready({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING', payload: {},
    }));
    expect(message).toHaveBeenCalledExactlyOnceWith({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING', payload: {},
    });
  });

  test('returns the valid CHAT_REQUEST NOT_IMPLEMENTED response', async () => {
    const message = vi.fn(async (request: RuntimeRequest) =>
      createFailure('NOT_IMPLEMENTED', request.request_id, 'CHAT_REQUEST'));
    const client = createRuntimeClient({ message, createRequestId: () => 'req_chat' });

    expect(await client.requestChat(payload)).toEqual(createFailure(
      'NOT_IMPLEMENTED', 'req_chat', 'CHAT_REQUEST',
    ));
    expect(message).toHaveBeenCalledExactlyOnceWith({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_chat',
      type: 'CHAT_REQUEST', payload,
    });
  });

  test('outgoing validation prevents a transport call', async () => {
    const message = vi.fn(async () => undefined);
    const invalidId = createRuntimeClient({ message, createRequestId: () => ' ' });
    expect(await invalidId.ping()).toMatchObject({
      ok: false, request_id: null, error: { code: 'INVALID_MESSAGE' },
    });
    const client = createRuntimeClient({ message, createRequestId: () => 'req_valid' });
    expect(await client.requestChat({ ...payload, message: '  ' })).toMatchObject({
      ok: false, error: { code: 'INVALID_MESSAGE' },
    });
    expect(message).not.toHaveBeenCalled();
  });

  test('rejects missing, malformed, and uncorrelated replies', async () => {
    for (const reply of [
      undefined,
      { bad: true },
      { ...ready({ channel: 'ekt-ai-extension', version: 1, request_id: 'req', type: 'PING', payload: {} }), request_id: 'other' },
      { ...ready({ channel: 'ekt-ai-extension', version: 1, request_id: 'req', type: 'PING', payload: {} }), type: 'CHAT_REQUEST' },
      { ...ready({ channel: 'ekt-ai-extension', version: 1, request_id: 'req', type: 'PING', payload: {} }), version: 2 },
      { ...ready({ channel: 'ekt-ai-extension', version: 1, request_id: 'req', type: 'PING', payload: {} }), channel: 'other' },
    ]) {
      const message = vi.fn(async () => reply);
      const client = createRuntimeClient({ message, createRequestId: () => 'req' });
      expect(await client.ping()).toMatchObject({
        ok: false, error: { code: 'INVALID_RESPONSE', retryable: false },
      });
      expect(message).toHaveBeenCalledTimes(1);
    }
  });

  test('maps rejection and synchronous throw to a safe unavailable error', async () => {
    for (const message of [
      vi.fn(async () => { throw new Error('secret rejection'); }),
      vi.fn((): Promise<unknown> => { throw new Error('secret throw'); }),
    ]) {
      const client = createRuntimeClient({ message, createRequestId: () => 'req' });
      const result = await client.ping();
      expect(result).toMatchObject({
        ok: false, error: { code: 'RUNTIME_UNAVAILABLE', retryable: true },
      });
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(message).toHaveBeenCalledTimes(1);
    }
  });

  test('times out locally, clears its timer, ignores late replies, and never retries', async () => {
    vi.useFakeTimers();
    let reply: ((value: unknown) => void) | undefined;
    const message = vi.fn(() => new Promise<unknown>((resolve) => { reply = resolve; }));
    const client = createRuntimeClient({ message, createRequestId: () => 'req_timeout', timeoutMs: 50 });
    const waiting = client.ping();
    await vi.advanceTimersByTimeAsync(50);
    const result = await waiting;

    expect(result).toMatchObject({ ok: false, error: { code: 'RUNTIME_TIMEOUT', retryable: true } });
    expect(vi.getTimerCount()).toBe(0);
    reply?.(ready({ channel: 'ekt-ai-extension', version: 1, request_id: 'req_timeout', type: 'PING', payload: {} }));
    await Promise.resolve();
    expect(await waiting).toEqual(result);
    await vi.advanceTimersByTimeAsync(500);
    expect(message).toHaveBeenCalledTimes(1);
  });

  test('clears timers after success and failure', async () => {
    vi.useFakeTimers();
    const success = createRuntimeClient({
      message: async (request) => ready(request), createRequestId: () => 'req_success', timeoutMs: 100,
    });
    expect((await success.ping()).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const failure = createRuntimeClient({
      message: async () => { throw new Error('no runtime'); },
      createRequestId: () => 'req_failure', timeoutMs: 100,
    });
    expect((await failure.ping()).ok).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('keeps two concurrent requests and their responses separate', async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    const message = vi.fn((request: RuntimeRequest) => new Promise<unknown>((resolve) => {
      resolvers.set(request.request_id, resolve);
    }));
    const ids = ['req_one', 'req_two'];
    const client = createRuntimeClient({ message, createRequestId: () => ids.shift() ?? 'unexpected' });
    const first = client.ping();
    const second = client.ping();
    await Promise.resolve();
    await Promise.resolve();

    resolvers.get('req_two')?.(ready({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_two', type: 'PING', payload: {},
    }));
    resolvers.get('req_one')?.(createFailure('INTERNAL_ERROR', 'req_one', 'PING'));

    expect(await first).toMatchObject({ request_id: 'req_one', ok: false });
    expect(await second).toMatchObject({ request_id: 'req_two', ok: true });
    expect(message).toHaveBeenCalledTimes(2);
  });
});
