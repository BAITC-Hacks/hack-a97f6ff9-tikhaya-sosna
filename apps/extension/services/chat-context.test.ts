import { afterEach, describe, expect, test, vi } from 'vitest';
import { createFailure, type PageContext, type SessionGetSuccess } from '../contracts';
import { createChatContextService } from './chat-context';

const initial: PageContext = {
  url: 'https://nursultan.ekt.kz/catalog/item/', origin: 'https://nursultan.ekt.kz',
  region: 'nursultan', locale: 'ru', current_product_id: null,
};
const sessionId = '35bc8d96-6c74-4f72-9760-0cd617ba3a83';
const success: SessionGetSuccess = {
  channel: 'ekt-ai-extension', version: 1, request_id: 'req',
  type: 'SESSION_GET', ok: true, data: { session_id: sessionId, origin: initial.origin },
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('prepareChatContext', () => {
  test('reads twice, sends one GET, and uses a fresh snapshot on every invocation', async () => {
    const fetch = vi.fn(() => { throw new Error('external fetch forbidden'); });
    vi.stubGlobal('fetch', fetch);
    const readContext = vi.fn(() => ({ ...initial }));
    const getSession = vi.fn(async () => success);
    const service = createChatContextService({ readContext, getSession });
    expect(getSession).not.toHaveBeenCalled();
    expect(await service.prepareChatContext()).toEqual({ ok: true,
      data: { session_id: sessionId, page_context: initial } });
    expect(await service.prepareChatContext()).toEqual({ ok: true,
      data: { session_id: sessionId, page_context: initial } });
    expect(readContext).toHaveBeenCalledTimes(4);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('unavailable or thrown initial reader makes no runtime call', async () => {
    const getSession = vi.fn(async () => success);
    for (const readContext of [() => null, () => { throw new Error('raw page data'); }]) {
      expect(await createChatContextService({ readContext, getSession }).prepareChatContext())
        .toEqual({ ok: false, error: { code: 'PAGE_CONTEXT_UNAVAILABLE',
          message: 'EKT page context is unavailable.', retryable: false } });
    }
    expect(getSession).not.toHaveBeenCalled();
  });

  test('propagates sanitized runtime failure and hides thrown transport errors', async () => {
    const failure = createFailure('SESSION_UNAVAILABLE', 'req', 'SESSION_GET');
    const getSession = vi.fn(async () => failure);
    expect(await createChatContextService({ readContext: () => initial, getSession }).prepareChatContext())
      .toEqual({ ok: false, error: failure.error });
    expect(getSession).toHaveBeenCalledTimes(1);
    const thrown = createChatContextService({ readContext: () => initial,
      getSession: async () => { throw new Error('private request'); } });
    expect(await thrown.prepareChatContext()).toEqual({ ok: false,
      error: { code: 'RUNTIME_UNAVAILABLE', message: 'Extension runtime is unavailable.', retryable: true } });
  });

  test('rejects malformed or origin-mismatched success', async () => {
    for (const reply of [
      { ...success, data: { ...success.data, origin: 'https://ekt.kz' } },
      { ...success, data: { ...success.data, session_id: 'bad' } },
      { ...success, type: 'SESSION_RESET' },
    ]) {
      const getSession = vi.fn(async () => reply as SessionGetSuccess);
      expect(await createChatContextService({ readContext: () => initial, getSession }).prepareChatContext())
        .toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
      expect(getSession).toHaveBeenCalledTimes(1);
    }
  });

  test('detects navigation or locale change while awaiting GET, without retry', async () => {
    for (const changed of [
      { ...initial, url: 'https://nursultan.ekt.kz/catalog/other/' },
      { ...initial, locale: 'kk' },
      { ...initial, origin: 'https://ekt.kz', url: 'https://ekt.kz/', region: null },
    ]) {
      let current = initial;
      let resolve!: (value: SessionGetSuccess) => void;
      const getSession = vi.fn(() => new Promise<SessionGetSuccess>((done) => { resolve = done; }));
      const service = createChatContextService({ readContext: () => current, getSession });
      const waiting = service.prepareChatContext();
      current = changed;
      resolve(success);
      expect(await waiting).toMatchObject({ ok: false, error: { code: 'PAGE_CONTEXT_CHANGED' } });
      expect(getSession).toHaveBeenCalledTimes(1);
    }
  });

  test('returns a local error if context disappears after GET', async () => {
    let count = 0;
    const service = createChatContextService({
      readContext: () => ++count === 1 ? initial : null,
      getSession: async () => success,
    });
    expect(await service.prepareChatContext()).toMatchObject({ ok: false,
      error: { code: 'PAGE_CONTEXT_UNAVAILABLE' } });
  });
});
