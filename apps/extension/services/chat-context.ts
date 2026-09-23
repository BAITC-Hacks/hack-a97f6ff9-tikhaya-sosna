import {
  createFailure,
  pageContextSchema,
  runtimeFailureSchema,
  sessionGetSuccessSchema,
  type PageContext,
  type RuntimeFailure,
  type SessionGetSuccess,
} from '../contracts';
import { readPageContext } from './page-context';
import { createRuntimeClient } from './runtime-client';

type LocalContextError = {
  code: 'PAGE_CONTEXT_UNAVAILABLE' | 'PAGE_CONTEXT_CHANGED';
  message: string;
  retryable: false;
};

export type PreparedChatContext =
  | { ok: true; data: { session_id: string; page_context: PageContext } }
  | { ok: false; error: RuntimeFailure['error'] | LocalContextError };

export interface ChatContextOptions {
  readContext?: () => PageContext | null;
  getSession?: () => Promise<SessionGetSuccess | RuntimeFailure>;
}

const contextUnavailable: LocalContextError = {
  code: 'PAGE_CONTEXT_UNAVAILABLE', message: 'EKT page context is unavailable.', retryable: false,
};
const contextChanged: LocalContextError = {
  code: 'PAGE_CONTEXT_CHANGED', message: 'EKT page context changed. Prepare the request again.', retryable: false,
};

function checkedContext(readContext: () => PageContext | null): PageContext | null {
  try {
    const parsed = pageContextSchema.safeParse(readContext());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sameContext(a: PageContext, b: PageContext): boolean {
  return a.url === b.url && a.origin === b.origin && a.region === b.region &&
    a.locale === b.locale && a.current_product_id === b.current_product_id;
}

export function createChatContextService(options: ChatContextOptions = {}) {
  const readContext = options.readContext ?? readPageContext;
  const getSession = options.getSession ?? createRuntimeClient().getSession;

  return {
    async prepareChatContext(): Promise<PreparedChatContext> {
      const initial = checkedContext(readContext);
      if (!initial) return { ok: false, error: contextUnavailable };

      let reply: SessionGetSuccess | RuntimeFailure;
      try { reply = await getSession(); }
      catch { return { ok: false, error: createFailure('RUNTIME_UNAVAILABLE', null, 'SESSION_GET').error }; }

      if (!reply.ok) {
        const failure = runtimeFailureSchema.safeParse(reply);
        return { ok: false, error: failure.success
          ? failure.data.error : createFailure('INVALID_RESPONSE', null, 'SESSION_GET').error };
      }
      const success = sessionGetSuccessSchema.safeParse(reply);
      if (!success.success) return { ok: false, error: createFailure('INVALID_RESPONSE', null, 'SESSION_GET').error };

      const latest = checkedContext(readContext);
      if (!latest) return { ok: false, error: contextUnavailable };
      if (!sameContext(initial, latest)) return { ok: false, error: contextChanged };
      if (success.data.data.origin !== initial.origin || success.data.data.origin !== latest.origin) {
        return { ok: false, error: createFailure('INVALID_RESPONSE', null, 'SESSION_GET').error };
      }
      return { ok: true, data: { session_id: success.data.data.session_id, page_context: latest } };
    },
  };
}
