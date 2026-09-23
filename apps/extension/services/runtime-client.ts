import {
  boundedIdSchema,
  createFailure,
  runtimeRequestSchema,
  runtimeResponseSchema,
  RUNTIME_CHANNEL,
  RUNTIME_VERSION,
  type ChatPayload,
  type PingSuccess,
  type RuntimeFailure,
  type RuntimeOperation,
  type RuntimeRequest,
} from '../contracts';

export type RuntimeTransport = (message: RuntimeRequest) => Promise<unknown>;

export interface RuntimeClientOptions {
  message?: RuntimeTransport;
  createRequestId?: () => string;
  timeoutMs?: number;
}

async function browserTransport(message: RuntimeRequest): Promise<unknown> {
  const { browser } = await import('wxt/browser');
  return browser.runtime.sendMessage(message);
}

type TransportOutcome =
  | { kind: 'response'; value: unknown }
  | { kind: 'unavailable' }
  | { kind: 'timeout' };

export function createRuntimeClient(options: RuntimeClientOptions = {}) {
  const transport = options.message ?? browserTransport;
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive safe integer');
  }

  async function execute(request: RuntimeRequest): Promise<PingSuccess | RuntimeFailure> {
    const validated = runtimeRequestSchema.safeParse(request);
    if (!validated.success) {
      const validId = boundedIdSchema.safeParse(request.request_id);
      return createFailure('INVALID_MESSAGE', validId.success ? validId.data : null, request.type);
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<TransportOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
    });
    const sent: Promise<TransportOutcome> = Promise.resolve()
      .then(() => transport(validated.data))
      .then(
        (value): TransportOutcome => ({ kind: 'response', value }),
        (): TransportOutcome => ({ kind: 'unavailable' }),
      );

    const outcome = await Promise.race([timer, sent]);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);

    if (outcome.kind === 'timeout') {
      return createFailure('RUNTIME_TIMEOUT', request.request_id, request.type);
    }
    if (outcome.kind === 'unavailable') {
      return createFailure('RUNTIME_UNAVAILABLE', request.request_id, request.type);
    }

    const response = runtimeResponseSchema.safeParse(outcome.value);
    if (
      !response.success ||
      response.data.request_id !== request.request_id ||
      response.data.type !== request.type
    ) {
      return createFailure('INVALID_RESPONSE', request.request_id, request.type);
    }
    return response.data;
  }

  async function makeRequest(
    type: RuntimeOperation,
    payload: ChatPayload | Record<string, never>,
  ): Promise<PingSuccess | RuntimeFailure> {
    let requestId: string;
    try {
      requestId = createRequestId();
    } catch {
      return createFailure('INTERNAL_ERROR', null, type);
    }

    const request = type === 'PING'
      ? { channel: RUNTIME_CHANNEL, version: RUNTIME_VERSION, request_id: requestId, type, payload: {} }
      : { channel: RUNTIME_CHANNEL, version: RUNTIME_VERSION, request_id: requestId, type, payload };
    return execute(request as RuntimeRequest);
  }

  return {
    ping: () => makeRequest('PING', {}),
    requestChat: async (payload: ChatPayload): Promise<RuntimeFailure> => {
      const result = await makeRequest('CHAT_REQUEST', payload);
      return result.ok ? createFailure('INVALID_RESPONSE', result.request_id, 'CHAT_REQUEST') : result;
    },
  };
}
