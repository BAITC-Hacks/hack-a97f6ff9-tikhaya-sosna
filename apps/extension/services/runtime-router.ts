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

export function routeRuntimeMessage(
  incoming: unknown,
  sender: RuntimeSender,
  runtimeId: string,
  sessionStore?: SessionStore,
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
    if (parsed.data.payload.page_context.origin !== scope.origin) {
      return createFailure('FORBIDDEN_SENDER', requestId, type);
    }
    return createFailure('NOT_IMPLEMENTED', requestId, type);
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
