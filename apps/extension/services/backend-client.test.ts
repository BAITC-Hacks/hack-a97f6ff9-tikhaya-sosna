import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../tests/fixtures/backend-chat-success.json';
import legacyFixture from '../tests/fixtures/backend-chat-legacy-success.json';
import { resolveBackendConfig } from '../config/backend';
import { createBackendClient } from './backend-client';
import type { ChatPayload } from '../contracts/chat';

const payload: ChatPayload = { session_id: 'session_fixture', message: '  Точный вопрос  ', attachment_ids: [],
  page_context: { url: 'https://ekt.kz/', origin: 'https://ekt.kz', region: null, locale: 'ru', current_product_id: null } };
const config = resolveBackendConfig('http://localhost:8000');
const json = (value: unknown, status = 200, contentType = 'application/json; charset=utf-8') =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': contentType } });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('one fixed POST omits credentials, carries request ID, and returns normalized facts', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json(fixture));
  const result = await createBackendClient({ config, fetch: fetcher }).sendChat(payload, 'runtime_req_1');
  expect(result).toMatchObject({ ok: true, data: { request_id: fixture.request_id, products: [{ id: 42 }] } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe('http://localhost:8000/api/v1/chat');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer', headers: {
      'Content-Type': 'application/json', Accept: 'application/json', 'X-Request-ID': 'runtime_req_1',
    } });
  expect(JSON.parse(String(init?.body))).toEqual(payload);
});

test('HTTP 200 legacy list response uses the exact outbound request ID without a retry', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json(legacyFixture));
  const result = await createBackendClient({ config, fetch: fetcher }).sendChat(payload, 'outbound_legacy_1');
  expect(result).toMatchObject({ ok: true, data: { request_id: 'outbound_legacy_1',
    products: [{ id: 42, price: 1250.5, available_quantity: null, stores: [] },
      { id: 43, article: null, available_quantity: null }] } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe('http://localhost:8000/api/v1/chat');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { 'X-Request-ID': 'outbound_legacy_1' } });
  expect(JSON.parse(String(init?.body))).toEqual(payload);
  expect(JSON.stringify(init)).not.toContain('Cookie');
  expect(JSON.stringify(init)).not.toContain('Authorization');
});

test('disabled config and attachments never fetch', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await createBackendClient({ config: null, fetch: fetcher }).sendChat(payload, 'id'))
    .toMatchObject({ code: 'BACKEND_NOT_CONFIGURED' });
  expect(await createBackendClient({ config, fetch: fetcher }).sendChat({ ...payload, attachment_ids: ['x'] }, 'id'))
    .toMatchObject({ code: 'ATTACHMENTS_NOT_SUPPORTED' });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([[400, 'BACKEND_REQUEST_REJECTED'], [422, 'BACKEND_REQUEST_REJECTED'],
  [401, 'BACKEND_ACCESS_DENIED'], [403, 'BACKEND_ACCESS_DENIED'], [429, 'BACKEND_RATE_LIMITED'],
  [503, 'BACKEND_UNAVAILABLE'], [302, 'BACKEND_HTTP_ERROR']])
('maps status %i to %s with no retry', async (status, code) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }));
  expect(await createBackendClient({ config, fetch: fetcher }).sendChat(payload, 'id')).toMatchObject({ ok: false, code });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('rejects HTML, error envelope, oversized declared and streamed bodies', async () => {
  for (const response of [new Response(null, { status: 204 }), json(fixture, 200, 'text/html'), json({ error: 'private' }),
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '524289' } }),
    new Response(new Uint8Array(524289), { status: 200, headers: { 'content-type': 'application/json' } })]) {
    const fetcher = vi.fn<typeof fetch>(async () => response);
    expect(await createBackendClient({ config, fetch: fetcher }).sendChat(payload, 'id'))
      .toMatchObject({ ok: false, code: 'BACKEND_INVALID_RESPONSE' });
  }
});

test('network rejection and deadlines before headers and during body do not retry', async () => {
  const rejected = vi.fn<typeof fetch>(async () => { throw new Error('private'); });
  expect(await createBackendClient({ config, fetch: rejected }).sendChat(payload, 'id'))
    .toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  vi.useFakeTimers();
  const hanging = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
  const before = createBackendClient({ config, fetch: hanging, timeoutMs: 5 }).sendChat(payload, 'id');
  await vi.advanceTimersByTimeAsync(5);
  expect(await before).toMatchObject({ code: 'BACKEND_TIMEOUT' });
  const body = new ReadableStream<Uint8Array>({ start() { /* intentionally pending */ } });
  const stalled = vi.fn<typeof fetch>(async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
  const during = createBackendClient({ config, fetch: stalled, timeoutMs: 5 }).sendChat(payload, 'id');
  await vi.advanceTimersByTimeAsync(5);
  expect(await during).toMatchObject({ code: 'BACKEND_TIMEOUT' });
  expect(hanging).toHaveBeenCalledTimes(1);
  expect(stalled).toHaveBeenCalledTimes(1);
});
