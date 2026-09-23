import {
  correlationFrom,
  createFailure,
  isRuntimeChannelMessage,
  parseEktPageUrl,
  runtimeRequestSchema,
  RUNTIME_CHANNEL,
  RUNTIME_VERSION,
  type RuntimeResponse,
} from '../contracts';

export interface RuntimeSender {
  id?: string;
  tab?: { id?: number };
  frameId?: number;
  url?: string;
  origin?: string;
}

function allowedSenderOrigin(sender: RuntimeSender, runtimeId: string): string | null {
  if (
    runtimeId.length === 0 ||
    sender.id !== runtimeId ||
    !Number.isInteger(sender.tab?.id) ||
    (sender.tab?.id ?? -1) < 0 ||
    sender.frameId !== 0 ||
    typeof sender.url !== 'string'
  ) {
    return null;
  }

  const url = parseEktPageUrl(sender.url);
  if (url === null || (sender.origin !== undefined && sender.origin !== url.origin)) {
    return null;
  }
  return url.origin;
}

export function routeRuntimeMessage(
  incoming: unknown,
  sender: RuntimeSender,
  runtimeId: string,
): RuntimeResponse | undefined {
  if (!isRuntimeChannelMessage(incoming)) return undefined;

  const { requestId, type } = correlationFrom(incoming);
  const senderOrigin = allowedSenderOrigin(sender, runtimeId);
  if (senderOrigin === null) return createFailure('FORBIDDEN_SENDER', requestId, type);

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
    if (parsed.data.payload.page_context.origin !== senderOrigin) {
      return createFailure('FORBIDDEN_SENDER', requestId, type);
    }
    return createFailure('NOT_IMPLEMENTED', requestId, type);
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
