import { describe, expect, test } from 'vitest';
import {
  chatPayloadSchema,
  chatRequestSchema,
  createFailure,
  pingRequestSchema,
  pingSuccessSchema,
  runtimeResponseSchema,
  type ChatPayload,
} from './index';

const pageContext: ChatPayload['page_context'] = {
  url: 'https://nursultan.ekt.kz/catalog/example/',
  origin: 'https://nursultan.ekt.kz',
  region: 'nursultan',
  locale: 'ru',
  current_product_id: null,
};

const payload: ChatPayload = {
  session_id: 'session_demo',
  message: 'Есть этот товар?',
  attachment_ids: [],
  page_context: pageContext,
};

const ping = {
  channel: 'ekt-ai-extension',
  version: 1,
  request_id: 'req_demo_001',
  type: 'PING',
  payload: {},
};

const chat = { ...ping, request_id: 'req_demo_002', type: 'CHAT_REQUEST', payload };

describe('runtime protocol schemas', () => {
  test('accepts strict PING and CHAT_REQUEST envelopes and JSON round trips', () => {
    expect(pingRequestSchema.parse(JSON.parse(JSON.stringify(ping)))).toEqual(ping);
    expect(chatRequestSchema.parse(JSON.parse(JSON.stringify(chat)))).toEqual(chat);
    const success = {
      channel: 'ekt-ai-extension', version: 1, request_id: ping.request_id,
      type: 'PING', ok: true, data: { status: 'runtime_ready' },
    };
    expect(pingSuccessSchema.parse(JSON.parse(JSON.stringify(success)))).toEqual(success);
    const failure = createFailure('NOT_IMPLEMENTED', chat.request_id, 'CHAT_REQUEST');
    expect(runtimeResponseSchema.parse(JSON.parse(JSON.stringify(failure)))).toEqual(failure);
  });

  test('requires explicit nullable context values', () => {
    expect(chatPayloadSchema.safeParse({
      ...payload,
      page_context: { ...pageContext, region: null, current_product_id: null },
    }).success).toBe(true);
    const { region: _region, ...withoutRegion } = pageContext;
    expect(chatPayloadSchema.safeParse({ ...payload, page_context: withoutRegion }).success).toBe(false);
  });

  test('rejects blank or oversized text without transforming valid text', () => {
    expect(chatPayloadSchema.safeParse({ ...payload, message: '   ' }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({ ...payload, message: 'x'.repeat(8001) }).success).toBe(false);
    expect(chatPayloadSchema.parse({ ...payload, message: '  keep spaces  ' }).message)
      .toBe('  keep spaces  ');
  });

  test('rejects invalid IDs, unexpected keys, and invalid product IDs', () => {
    expect(pingRequestSchema.safeParse({ ...ping, request_id: ' '.repeat(2) }).success).toBe(false);
    expect(pingRequestSchema.safeParse({ ...ping, request_id: 'x'.repeat(129) }).success).toBe(false);
    expect(pingRequestSchema.safeParse({ ...ping, extra: true }).success).toBe(false);
    expect(pingRequestSchema.safeParse({ ...ping, payload: { extra: true } }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({ ...payload, attachment_ids: [' '] }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({ ...payload, attachment_ids: Array(11).fill('id') }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({ ...payload, extra: true }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({
      ...payload, page_context: { ...pageContext, current_product_id: 1.5 },
    }).success).toBe(false);
    expect(chatPayloadSchema.safeParse({
      ...payload, page_context: { ...pageContext, current_product_id: Number.MAX_SAFE_INTEGER + 1 },
    }).success).toBe(false);
  });

  test('rejects origin mismatch and unsafe page URLs', () => {
    expect(chatPayloadSchema.safeParse({
      ...payload, page_context: { ...pageContext, origin: 'https://ekt.kz' },
    }).success).toBe(false);
    for (const url of [
      'https://evil-ekt.kz/path',
      'https://ekt.kz.attacker.invalid/path',
      'javascript:alert(1)',
      'http://ekt.kz/path',
      'https://user:pass@ekt.kz/path',
      'https://ekt.kz:8443/path',
    ]) {
      expect(chatPayloadSchema.safeParse({
        ...payload, page_context: { ...pageContext, url },
      }).success, url).toBe(false);
    }
    expect(chatPayloadSchema.safeParse({
      ...payload, page_context: { ...pageContext, origin: 'https://nursultan.ekt.kz/path' },
    }).success).toBe(false);
  });

  test('rejects malformed and operation-incompatible responses', () => {
    const valid = {
      channel: 'ekt-ai-extension', version: 1, request_id: ping.request_id,
      type: 'PING', ok: true, data: { status: 'runtime_ready' },
    };
    expect(runtimeResponseSchema.safeParse({ ...valid, data: { status: 'ready' } }).success).toBe(false);
    expect(runtimeResponseSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(runtimeResponseSchema.safeParse({ ...valid, type: 'CHAT_REQUEST' }).success).toBe(false);
    expect(runtimeResponseSchema.safeParse({ ...createFailure('NOT_IMPLEMENTED', 'req', 'CHAT_REQUEST'),
      error: { code: 'NOT_IMPLEMENTED', message: 'raw exception', retryable: false },
    }).success).toBe(false);
  });
});
