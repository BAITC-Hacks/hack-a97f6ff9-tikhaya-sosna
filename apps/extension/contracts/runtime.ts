import { z } from 'zod';
import { boundedIdSchema, chatPayloadSchema } from './chat';

export const RUNTIME_CHANNEL = 'ekt-ai-extension' as const;
export const RUNTIME_VERSION = 1 as const;

const envelope = {
  channel: z.literal(RUNTIME_CHANNEL),
  version: z.literal(RUNTIME_VERSION),
  request_id: boundedIdSchema,
};

export const pingRequestSchema = z.strictObject({
  ...envelope,
  type: z.literal('PING'),
  payload: z.strictObject({}),
});

export const chatRequestSchema = z.strictObject({
  ...envelope,
  type: z.literal('CHAT_REQUEST'),
  payload: chatPayloadSchema,
});

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  pingRequestSchema,
  chatRequestSchema,
]);

export type RuntimeOperation = z.infer<typeof runtimeRequestSchema>['type'];
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;

export const errorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UNSUPPORTED_VERSION',
  'UNSUPPORTED_MESSAGE_TYPE',
  'FORBIDDEN_SENDER',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
  'RUNTIME_UNAVAILABLE',
  'RUNTIME_TIMEOUT',
  'INVALID_RESPONSE',
]);

export type RuntimeErrorCode = z.infer<typeof errorCodeSchema>;

const ERROR_MESSAGES: Record<RuntimeErrorCode, string> = {
  INVALID_MESSAGE: 'Invalid runtime message.',
  UNSUPPORTED_VERSION: 'Unsupported runtime protocol version.',
  UNSUPPORTED_MESSAGE_TYPE: 'Unsupported runtime message type.',
  FORBIDDEN_SENDER: 'Sender is not allowed.',
  NOT_IMPLEMENTED: 'Backend chat transport is not implemented yet.',
  INTERNAL_ERROR: 'Runtime request failed.',
  RUNTIME_UNAVAILABLE: 'Extension runtime is unavailable.',
  RUNTIME_TIMEOUT: 'Extension runtime did not respond in time.',
  INVALID_RESPONSE: 'Invalid runtime response.',
};

const retryable = (code: RuntimeErrorCode): boolean =>
  code === 'RUNTIME_UNAVAILABLE' || code === 'RUNTIME_TIMEOUT';

export const runtimeErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
}).refine((error) =>
  error.message === ERROR_MESSAGES[error.code] && error.retryable === retryable(error.code));

export const pingSuccessSchema = z.strictObject({
  ...envelope,
  type: z.literal('PING'),
  ok: z.literal(true),
  data: z.strictObject({ status: z.literal('runtime_ready') }),
});

export const runtimeFailureSchema = z.strictObject({
  channel: z.literal(RUNTIME_CHANNEL),
  version: z.literal(RUNTIME_VERSION),
  request_id: boundedIdSchema.nullable(),
  type: z.enum(['PING', 'CHAT_REQUEST']).nullable(),
  ok: z.literal(false),
  error: runtimeErrorSchema,
});

export const runtimeResponseSchema = z.union([pingSuccessSchema, runtimeFailureSchema]);

export type PingSuccess = z.infer<typeof pingSuccessSchema>;
export type RuntimeFailure = z.infer<typeof runtimeFailureSchema>;
export type RuntimeResponse = z.infer<typeof runtimeResponseSchema>;

export function createFailure(
  code: RuntimeErrorCode,
  requestId: string | null,
  type: RuntimeOperation | null,
): RuntimeFailure {
  return {
    channel: RUNTIME_CHANNEL,
    version: RUNTIME_VERSION,
    request_id: requestId,
    type,
    ok: false,
    error: { code, message: ERROR_MESSAGES[code], retryable: retryable(code) },
  };
}

export function isRuntimeChannelMessage(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'channel' in value && value.channel === RUNTIME_CHANNEL;
}

export function correlationFrom(value: Record<string, unknown>): {
  requestId: string | null;
  type: RuntimeOperation | null;
} {
  const requestId = boundedIdSchema.safeParse(value.request_id);
  const type = value.type === 'PING' || value.type === 'CHAT_REQUEST' ? value.type : null;
  return { requestId: requestId.success ? requestId.data : null, type };
}
