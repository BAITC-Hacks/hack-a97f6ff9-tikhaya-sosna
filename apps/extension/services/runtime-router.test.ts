import { describe, expect, test, vi } from 'vitest';
import { SessionUnavailableError, type SessionStore } from '../storage/session-storage';
import { routeRuntimeMessage, type RuntimeSender } from './runtime-router';

const runtimeId = 'extension-test-id';
const sender: RuntimeSender = {
  id: runtimeId,
  tab: { id: 0 },
  frameId: 0,
  url: 'https://nursultan.ekt.kz/catalog/example/',
  origin: 'https://nursultan.ekt.kz',
};

const ping = {
  channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING', payload: {},
};
const chat = {
  channel: 'ekt-ai-extension', version: 1, request_id: 'req_chat', type: 'CHAT_REQUEST',
  payload: {
    session_id: 'session_demo', message: 'Есть этот товар?', attachment_ids: [],
    page_context: {
      url: 'https://nursultan.ekt.kz/catalog/example/',
      origin: 'https://nursultan.ekt.kz', region: 'nursultan', locale: 'ru',
      current_product_id: null,
    },
  },
};

async function code(message: unknown, from: RuntimeSender = sender): Promise<string | undefined> {
  const result = await routeRuntimeMessage(message, from, runtimeId);
  return result?.ok === false ? result.error.code : undefined;
}

describe('runtime router', () => {
  const descriptor = { session_id: '35bc8d96-6c74-4f72-9760-0cd617ba3a83', origin: sender.origin ?? '' };
  const store: SessionStore = {
    getOrCreate: vi.fn(async (scope) => ({ ...descriptor, origin: scope.origin })),
    reset: vi.fn(async (scope) => ({ ...descriptor, origin: scope.origin })),
  };
  const sessionGet = { ...ping, type: 'SESSION_GET', request_id: 'req_get' };
  const sessionReset = { ...ping, type: 'SESSION_RESET', request_id: 'req_reset' };

  test('derives GET/RESET scope exclusively from the verified sender, including tab 0', async () => {
    vi.mocked(store.getOrCreate).mockClear();
    vi.mocked(store.reset).mockClear();
    expect(await routeRuntimeMessage(sessionGet, sender, runtimeId, store)).toMatchObject({
      request_id: 'req_get', type: 'SESSION_GET', ok: true, data: descriptor,
    });
    expect(await routeRuntimeMessage(sessionReset, sender, runtimeId, store)).toMatchObject({
      request_id: 'req_reset', type: 'SESSION_RESET', ok: true, data: descriptor,
    });
    expect(store.getOrCreate).toHaveBeenCalledExactlyOnceWith({ tab_id: 0, origin: sender.origin });
    expect(store.reset).toHaveBeenCalledExactlyOnceWith({ tab_id: 0, origin: sender.origin });
    for (const from of [
      { ...sender, tab: { id: 2 } },
      { ...sender, url: 'https://ekt.kz/', origin: 'https://ekt.kz' },
    ]) await routeRuntimeMessage(sessionGet, from, runtimeId, store);
    expect(store.getOrCreate).toHaveBeenNthCalledWith(2, { tab_id: 2, origin: sender.origin });
    expect(store.getOrCreate).toHaveBeenNthCalledWith(3, { tab_id: 0, origin: 'https://ekt.kz' });
  });

  test('invalid requests and senders never reach storage', async () => {
    vi.mocked(store.getOrCreate).mockClear();
    vi.mocked(store.reset).mockClear();
    for (const bad of [
      { ...sessionGet, payload: { origin: 'https://ekt.kz' } },
      { ...sessionGet, payload: { tab_id: 1 } },
      { ...sessionGet, payload: { session_id: descriptor.session_id } },
      { ...sessionGet, payload: { storage_key: 'spoof' } },
      { ...sessionGet, payload: null },
      { ...sessionGet, version: 2 },
      { ...sessionGet, request_id: ' ' },
      { ...sessionReset, payload: { extra: true } },
    ]) expect(await routeRuntimeMessage(bad, sender, runtimeId, store)).toMatchObject({ ok: false });
    for (const from of [
      { ...sender, id: 'other' }, { ...sender, frameId: 1 },
      { ...sender, tab: { id: -1 } }, { ...sender, tab: { id: Number.MAX_SAFE_INTEGER + 1 } },
      { ...sender, tab: undefined }, { ...sender, url: undefined },
      { ...sender, url: 'https://evil-ekt.kz/' },
      { ...sender, url: 'http://ekt.kz/' },
      { ...sender, url: 'https://user:pass@ekt.kz/' },
      { ...sender, origin: 'https://ekt.kz' },
    ]) expect(await routeRuntimeMessage(sessionGet, from, runtimeId, store)).toMatchObject({
      ok: false, error: { code: 'FORBIDDEN_SENDER' },
    });
    expect(await routeRuntimeMessage({ ...sessionGet, channel: 'other' }, sender, runtimeId, store))
      .toBeUndefined();
    await routeRuntimeMessage(ping, sender, runtimeId, store);
    await routeRuntimeMessage(chat, sender, runtimeId, store);
    expect(store.getOrCreate).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  });

  test('storage failures are safe; absent storage leaves PING available', async () => {
    const failed: SessionStore = { getOrCreate: async () => { throw new SessionUnavailableError(); },
      reset: async () => { throw new SessionUnavailableError(); } };
    expect(await routeRuntimeMessage(sessionGet, sender, runtimeId, failed))
      .toMatchObject({ ok: false, error: { code: 'SESSION_UNAVAILABLE', retryable: false } });
    expect(await routeRuntimeMessage(sessionReset, sender, runtimeId, failed))
      .toMatchObject({ ok: false, error: { code: 'SESSION_UNAVAILABLE' } });
    expect(await routeRuntimeMessage(sessionGet, sender, runtimeId))
      .toMatchObject({ ok: false, error: { code: 'SESSION_UNAVAILABLE' } });
    expect(await routeRuntimeMessage(ping, sender, runtimeId)).toMatchObject({ ok: true });
    const broken: SessionStore = { getOrCreate: async () => { throw new Error('private'); }, reset: failed.reset };
    expect(await routeRuntimeMessage(sessionGet, sender, runtimeId, broken))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    const wrongScope: SessionStore = { getOrCreate: async () => ({ ...descriptor, origin: 'https://ekt.kz' }),
      reset: failed.reset };
    expect(await routeRuntimeMessage(sessionGet, sender, runtimeId, wrongScope))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
  test('returns runtime readiness for authorized main and regional EKT pages', () => {
    expect(routeRuntimeMessage(ping, sender, runtimeId)).toEqual({
      channel: 'ekt-ai-extension', version: 1, request_id: 'req_ping', type: 'PING',
      ok: true, data: { status: 'runtime_ready' },
    });
    expect(routeRuntimeMessage(ping, {
      ...sender, url: 'https://ekt.kz/', origin: 'https://ekt.kz',
    }, runtimeId)).toMatchObject({ ok: true });
  });

  test('valid chat yields only NOT_IMPLEMENTED with its own correlation ID', () => {
    expect(routeRuntimeMessage(chat, sender, runtimeId)).toMatchObject({
      request_id: 'req_chat', type: 'CHAT_REQUEST', ok: false,
      error: { code: 'NOT_IMPLEMENTED', retryable: false },
    });
  });

  test('checks version and type before full payload schema', async () => {
    expect(await code({ ...chat, version: 2, payload: null })).toBe('UNSUPPORTED_VERSION');
    expect(await code({ ...chat, type: 'CART', payload: null })).toBe('UNSUPPORTED_MESSAGE_TYPE');
    expect(await code({ ...chat, payload: { ...chat.payload, message: ' ' } })).toBe('INVALID_MESSAGE');
    expect(await code({ ...ping, request_id: ' ', payload: {} })).toBe('INVALID_MESSAGE');
    expect(routeRuntimeMessage({ ...ping, type: 'CART' }, sender, runtimeId)).toMatchObject({
      request_id: 'req_ping', type: null,
    });
    expect(routeRuntimeMessage({ ...ping, request_id: ' ' }, sender, runtimeId)).toMatchObject({
      request_id: null, type: 'PING',
    });
  });

  test('ignores unrelated channels entirely', () => {
    expect(routeRuntimeMessage({ ...ping, channel: 'wxt' }, sender, runtimeId)).toBeUndefined();
    expect(routeRuntimeMessage(null, sender, runtimeId)).toBeUndefined();
  });

  test('rejects wrong or missing sender identity and frame metadata', async () => {
    for (const from of [
      { ...sender, id: 'other-extension' },
      { ...sender, id: undefined },
      { ...sender, tab: undefined },
      { ...sender, tab: { id: -1 } },
      { ...sender, frameId: 1 },
      { ...sender, url: undefined, tab: { id: 0, url: 'https://ekt.kz/' } },
    ]) {
      expect(await code(ping, from)).toBe('FORBIDDEN_SENDER');
    }
  });

  test('rejects unrelated or deceptive sender hosts and origin mismatch', async () => {
    for (const url of [
      'https://other.invalid/',
      'https://evil-ekt.kz/',
      'https://ekt.kz.attacker.invalid/',
      'javascript:alert(1)',
      'https://ekt.kz:8443/',
    ]) {
      expect(await code(ping, { ...sender, url, origin: undefined }), url).toBe('FORBIDDEN_SENDER');
    }
    expect(await code(ping, { ...sender, origin: 'https://ekt.kz' })).toBe('FORBIDDEN_SENDER');
    expect(await code(chat, { ...sender, origin: undefined, url: 'https://ekt.kz/' }))
      .toBe('FORBIDDEN_SENDER');
  });
});
