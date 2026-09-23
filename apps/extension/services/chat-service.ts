import { createFailure, isValidChatMessage, pageContextSchema, runtimeFailureSchema,
  chatSuccessSchema, type ChatReply, type PageContext } from '../contracts';
import { createChatContextService, type PreparedChatContext } from './chat-context';
import { readPageContext } from './page-context';
import { createRuntimeClient } from './runtime-client';

type LocalError = Extract<PreparedChatContext, { ok: false }>['error'];
export type ChatServiceResult = { ok: true; data: ChatReply } | { ok: false; error: LocalError };

export interface ChatServiceOptions {
  prepareChatContext?: () => Promise<PreparedChatContext>;
  requestChat?: ReturnType<typeof createRuntimeClient>['requestChat'];
  readContext?: () => PageContext | null;
}

const changed = { code: 'PAGE_CONTEXT_CHANGED', message: 'EKT page context changed. Prepare the request again.', retryable: false } as const;
const unavailable = { code: 'PAGE_CONTEXT_UNAVAILABLE', message: 'EKT page context is unavailable.', retryable: false } as const;

function sameContext(a: PageContext, b: PageContext): boolean {
  return a.url === b.url && a.origin === b.origin && a.region === b.region &&
    a.locale === b.locale && a.current_product_id === b.current_product_id;
}

export function createChatService(options: ChatServiceOptions = {}) {
  const prepare = options.prepareChatContext ?? createChatContextService().prepareChatContext;
  const request = options.requestChat ?? createRuntimeClient().requestChat;
  const readContext = options.readContext ?? readPageContext;
  return {
    async sendMessage(text: string, onPrepared?: (sessionId: string) => void): Promise<ChatServiceResult> {
      if (!isValidChatMessage(text)) return { ok: false, error: createFailure('INVALID_MESSAGE', null, 'CHAT_REQUEST').error };
      let prepared: PreparedChatContext;
      try { prepared = await prepare(); }
      catch { return { ok: false, error: createFailure('RUNTIME_UNAVAILABLE', null, 'CHAT_REQUEST').error }; }
      if (!prepared.ok) return { ok: false, error: prepared.error };
      try { onPrepared?.(prepared.data.session_id); }
      catch { return { ok: false, error: createFailure('INTERNAL_ERROR', null, 'CHAT_REQUEST').error }; }
      let reply: Awaited<ReturnType<typeof request>>;
      try {
        reply = await request({ session_id: prepared.data.session_id, message: text,
          attachment_ids: [], page_context: prepared.data.page_context });
      } catch { return { ok: false, error: createFailure('RUNTIME_UNAVAILABLE', null, 'CHAT_REQUEST').error }; }
      let latest: PageContext | null;
      try {
        const parsed = pageContextSchema.safeParse(readContext());
        latest = parsed.success ? parsed.data : null;
      } catch { latest = null; }
      if (!latest) return { ok: false, error: unavailable };
      if (!sameContext(latest, prepared.data.page_context)) return { ok: false, error: changed };
      if (!reply.ok) {
        const checked = runtimeFailureSchema.safeParse(reply);
        return { ok: false, error: checked.success ? checked.data.error :
          createFailure('INVALID_RESPONSE', null, 'CHAT_REQUEST').error };
      }
      const checked = chatSuccessSchema.safeParse(reply);
      return checked.success ? { ok: true, data: checked.data.data } :
        { ok: false, error: createFailure('INVALID_RESPONSE', null, 'CHAT_REQUEST').error };
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
