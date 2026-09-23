import { describe, expect, test } from 'vitest';
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

function code(message: unknown, from: RuntimeSender = sender): string | undefined {
  const result = routeRuntimeMessage(message, from, runtimeId);
  return result?.ok === false ? result.error.code : undefined;
}

describe('runtime router', () => {
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

  test('checks version and type before full payload schema', () => {
    expect(code({ ...chat, version: 2, payload: null })).toBe('UNSUPPORTED_VERSION');
    expect(code({ ...chat, type: 'CART', payload: null })).toBe('UNSUPPORTED_MESSAGE_TYPE');
    expect(code({ ...chat, payload: { ...chat.payload, message: ' ' } })).toBe('INVALID_MESSAGE');
    expect(code({ ...ping, request_id: ' ', payload: {} })).toBe('INVALID_MESSAGE');
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

  test('rejects wrong or missing sender identity and frame metadata', () => {
    for (const from of [
      { ...sender, id: 'other-extension' },
      { ...sender, id: undefined },
      { ...sender, tab: undefined },
      { ...sender, tab: { id: -1 } },
      { ...sender, frameId: 1 },
      { ...sender, url: undefined, tab: { id: 0, url: 'https://ekt.kz/' } },
    ]) {
      expect(code(ping, from)).toBe('FORBIDDEN_SENDER');
    }
  });

  test('rejects unrelated or deceptive sender hosts and origin mismatch', () => {
    for (const url of [
      'https://other.invalid/',
      'https://evil-ekt.kz/',
      'https://ekt.kz.attacker.invalid/',
      'javascript:alert(1)',
      'https://ekt.kz:8443/',
    ]) {
      expect(code(ping, { ...sender, url, origin: undefined }), url).toBe('FORBIDDEN_SENDER');
    }
    expect(code(ping, { ...sender, origin: 'https://ekt.kz' })).toBe('FORBIDDEN_SENDER');
    expect(code(chat, { ...sender, origin: undefined, url: 'https://ekt.kz/' }))
      .toBe('FORBIDDEN_SENDER');
  });
});
