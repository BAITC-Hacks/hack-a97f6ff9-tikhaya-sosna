import {
  correlationFrom,
  createFailure,
  isRuntimeChannelMessage,
  parseEktPageUrl,
  runtimeRequestSchema,
  RUNTIME_CHANNEL,
  RUNTIME_VERSION,
  sessionDescriptorSchema,
  type RuntimeResponse,
} from '../contracts';
import { SessionUnavailableError, type SessionStore } from '../storage/session-storage';
import { buildPageContext } from './page-context';
import type { BackendClient } from './backend-client';

export interface RuntimeSender {
  id?: string;
  tab?: { id?: number };
  frameId?: number;
  url?: string;
  origin?: string;
}

function allowedSenderScope(sender: RuntimeSender, runtimeId: string): { tab_id: number; origin: string } | null {
  const tabId = sender.tab?.id;
  if (
    runtimeId.length === 0 ||
    sender.id !== runtimeId ||
    typeof tabId !== 'number' ||
    !Number.isSafeInteger(tabId) ||
    tabId < 0 ||
    sender.frameId !== 0 ||
    typeof sender.url !== 'string'
  ) {
    return null;
  }

  const url = parseEktPageUrl(sender.url);
  if (url === null || (sender.origin !== undefined && sender.origin !== url.origin)) {
    return null;
  }
  return { tab_id: tabId, origin: url.origin };
}

export interface RuntimeRouterDependencies {
  sessions?: SessionStore;
  backend?: BackendClient;
}

export function createRuntimeRouter(dependencies: RuntimeRouterDependencies) {
  const active = new Set<string>();
  return (incoming: unknown, sender: RuntimeSender, runtimeId: string) =>
    routeRuntimeMessage(incoming, sender, runtimeId, dependencies.sessions, dependencies.backend, active);
}

export function routeRuntimeMessage(
  incoming: unknown,
  sender: RuntimeSender,
  runtimeId: string,
  sessionStore?: SessionStore,
  backend?: BackendClient,
  active: Set<string> = new Set(),
): RuntimeResponse | Promise<RuntimeResponse> | undefined {
  if (!isRuntimeChannelMessage(incoming)) return undefined;

  const { requestId, type } = correlationFrom(incoming);
  const scope = allowedSenderScope(sender, runtimeId);
  if (scope === null) return createFailure('FORBIDDEN_SENDER', requestId, type);

  if (typeof incoming.version !== 'number' || !Number.isInteger(incoming.version)) {
    return createFailure('INVALID_MESSAGE', requestId, type);
  }
  if (incoming.version !== RUNTIME_VERSION) {
    return createFailure('UNSUPPORTED_VERSION', requestId, type);
  }

  if (typeof incoming.type !== 'string') {
    return createFailure('INVALID_MESSAGE', requestId, null);
  }
  if (type === null) {
    return createFailure('UNSUPPORTED_MESSAGE_TYPE', requestId, null);
  }

  const parsed = runtimeRequestSchema.safeParse(incoming);
  if (!parsed.success) return createFailure('INVALID_MESSAGE', requestId, type);

  if (parsed.data.type === 'CHAT_REQUEST') {
    const chatRequest = parsed.data;
    const context = chatRequest.payload.page_context;
    const expected = buildPageContext({ href: sender.url ?? '', htmlLang: context.locale });
    if (!expected || expected.url !== context.url || expected.origin !== context.origin ||
      expected.region !== context.region || expected.locale !== context.locale ||
      expected.current_product_id !== context.current_product_id || context.origin !== scope.origin) {
      return createFailure('FORBIDDEN_SENDER', requestId, type);
    }
    if (chatRequest.payload.attachment_ids.length > 0) {
      return createFailure('ATTACHMENTS_NOT_SUPPORTED', requestId, type);
    }
    if (!sessionStore) return createFailure('SESSION_UNAVAILABLE', requestId, type);
    const key = `${scope.tab_id}:${scope.origin}`;
    if (active.has(key)) return createFailure('CHAT_REQUEST_IN_PROGRESS', requestId, type);
    active.add(key);
    return (async (): Promise<RuntimeResponse> => {
      try {
        const existing = await sessionStore.getExisting(scope);
        if (!existing || existing.session_id !== chatRequest.payload.session_id) {
          return createFailure('CHAT_SESSION_MISMATCH', requestId, type);
        }
        if (!backend) return createFailure('BACKEND_NOT_CONFIGURED', requestId, type);
        const result = await backend.sendChat(chatRequest.payload, chatRequest.request_id);
        if (!result.ok) return createFailure(result.code, requestId, type);
        const latest = await sessionStore.getExisting(scope);
        if (!latest || latest.session_id !== existing.session_id) {
          return createFailure('CHAT_SESSION_MISMATCH', requestId, type);
        }
        return { channel: RUNTIME_CHANNEL, version: RUNTIME_VERSION,
          request_id: chatRequest.request_id, type: 'CHAT_REQUEST', ok: true, data: result.data };
      } catch (error) {
        return createFailure(error instanceof SessionUnavailableError ? 'SESSION_UNAVAILABLE' : 'INTERNAL_ERROR',
          requestId, type);
      } finally { active.delete(key); }
    })();
  }

  if (parsed.data.type === 'SESSION_GET' || parsed.data.type === 'SESSION_RESET') {
    const operation = parsed.data.type;
    if (!sessionStore) return createFailure('SESSION_UNAVAILABLE', requestId, operation);
    return (async (): Promise<RuntimeResponse> => {
      try {
        const data = operation === 'SESSION_GET'
          ? await sessionStore.getOrCreate(scope) : await sessionStore.reset(scope);
        const checked = sessionDescriptorSchema.safeParse(data);
        if (!checked.success || checked.data.origin !== scope.origin) {
          return createFailure('INTERNAL_ERROR', requestId, operation);
        }
        return {
          channel: RUNTIME_CHANNEL, version: RUNTIME_VERSION,
          request_id: parsed.data.request_id, type: operation, ok: true, data: checked.data,
        };
      } catch (error) {
        return createFailure(error instanceof SessionUnavailableError ? 'SESSION_UNAVAILABLE' : 'INTERNAL_ERROR',
          requestId, operation);
      }
    })();
  }

  return {
    channel: RUNTIME_CHANNEL,
    version: RUNTIME_VERSION,
    request_id: parsed.data.request_id,
    type: 'PING',
    ok: true,
    data: { status: 'runtime_ready' },
  };
}
