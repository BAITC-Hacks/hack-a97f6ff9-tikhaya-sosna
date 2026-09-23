import { expect, test, vi } from 'vitest';
import fixture from '../tests/fixtures/backend-chat-success.json';
import { normalizeBackendReply } from '../contracts/backend';
import { createChatService } from './chat-service';
import type { PageContext } from '../contracts/chat';
import type { PreparedChatContext } from './chat-context';

const context: PageContext = { url: 'https://ekt.kz/', origin: 'https://ekt.kz', region: null,
  locale: 'ru', current_product_id: null };
const prepared: PreparedChatContext = { ok: true, data: { session_id: 'session_fixture', page_context: context } };
const data = normalizeBackendReply(fixture);
if (!data) throw new Error('bad fixture');

test('prepares once, signals session, sends exactly one bounded payload and checks context again', async () => {
  const prepareChatContext = vi.fn(async () => prepared);
  const requestChat = vi.fn(async () => ({ channel: 'ekt-ai-extension' as const, version: 1 as const,
    request_id: 'runtime_req', type: 'CHAT_REQUEST' as const, ok: true as const, data }));
  const readContext = vi.fn(() => context);
  const onPrepared = vi.fn();
  const service = createChatService({ prepareChatContext, requestChat, readContext });
  expect(await service.sendMessage('  Кабель?  ', onPrepared)).toEqual({ ok: true, data });
  expect(prepareChatContext).toHaveBeenCalledTimes(1);
  expect(onPrepared).toHaveBeenCalledExactlyOnceWith('session_fixture');
  expect(requestChat).toHaveBeenCalledExactlyOnceWith({ session_id: 'session_fixture',
    message: '  Кабель?  ', attachment_ids: [], page_context: context });
  expect(readContext).toHaveBeenCalledTimes(1);
});

test('invalid text and failed preparation cannot send; changed page suppresses late answer', async () => {
  const requestChat = vi.fn(async () => ({ channel: 'ekt-ai-extension' as const, version: 1 as const,
    request_id: 'runtime_req', type: 'CHAT_REQUEST' as const, ok: true as const, data }));
  const failed = createChatService({ prepareChatContext: async () => ({ ok: false,
    error: { code: 'PAGE_CONTEXT_UNAVAILABLE', message: 'EKT page context is unavailable.', retryable: false } }), requestChat });
  expect(await failed.sendMessage(' ')).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE' } });
  expect(await failed.sendMessage('valid')).toMatchObject({ ok: false, error: { code: 'PAGE_CONTEXT_UNAVAILABLE' } });
  expect(requestChat).not.toHaveBeenCalled();
  const changed = createChatService({ prepareChatContext: async () => prepared, requestChat,
    readContext: () => ({ ...context, url: 'https://ekt.kz/catalog/other/' }) });
  expect(await changed.sendMessage('valid')).toMatchObject({ error: { code: 'PAGE_CONTEXT_CHANGED' } });
});
