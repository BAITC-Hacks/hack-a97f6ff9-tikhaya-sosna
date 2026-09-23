import { z } from 'zod';
import { boundedIdSchema, chatPayloadSchema } from './chat';
import { sessionDescriptorSchema } from './session';
import { chatReplySchema } from './backend';

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

export const sessionGetRequestSchema = z.strictObject({
  ...envelope,
  type: z.literal('SESSION_GET'),
  payload: z.strictObject({}),
});

export const sessionResetRequestSchema = z.strictObject({
  ...envelope,
  type: z.literal('SESSION_RESET'),
  payload: z.strictObject({}),
});

export const runtimeRequestSchema = z.discriminatedUnion('type', [
  pingRequestSchema,
  chatRequestSchema,
  sessionGetRequestSchema,
  sessionResetRequestSchema,
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
  'SESSION_UNAVAILABLE',
  'BACKEND_NOT_CONFIGURED',
  'BACKEND_UNAVAILABLE',
  'BACKEND_TIMEOUT',
  'BACKEND_INVALID_RESPONSE',
  'BACKEND_REQUEST_REJECTED',
  'BACKEND_ACCESS_DENIED',
  'BACKEND_RATE_LIMITED',
  'BACKEND_HTTP_ERROR',
  'CHAT_SESSION_MISMATCH',
  'CHAT_REQUEST_IN_PROGRESS',
  'ATTACHMENTS_NOT_SUPPORTED',
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
  SESSION_UNAVAILABLE: 'Extension session storage is unavailable.',
  BACKEND_NOT_CONFIGURED: 'Backend URL is not configured.',
  BACKEND_UNAVAILABLE: 'Backend is unavailable.',
  BACKEND_TIMEOUT: 'Backend did not respond in time.',
  BACKEND_INVALID_RESPONSE: 'Backend returned an invalid response.',
  BACKEND_REQUEST_REJECTED: 'Backend rejected the chat request.',
  BACKEND_ACCESS_DENIED: 'Backend denied access to the chat endpoint.',
  BACKEND_RATE_LIMITED: 'Backend rate limit was reached.',
  BACKEND_HTTP_ERROR: 'Backend returned an unexpected HTTP status.',
  CHAT_SESSION_MISMATCH: 'Chat session no longer matches this page.',
  CHAT_REQUEST_IN_PROGRESS: 'A chat request is already in progress.',
  ATTACHMENTS_NOT_SUPPORTED: 'Attachments are not supported yet.',
};

const retryable = (code: RuntimeErrorCode): boolean =>
  code === 'RUNTIME_UNAVAILABLE' || code === 'RUNTIME_TIMEOUT' ||
  code === 'BACKEND_UNAVAILABLE' || code === 'BACKEND_TIMEOUT' || code === 'BACKEND_RATE_LIMITED';

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

export const chatSuccessSchema = z.strictObject({
  ...envelope,
  type: z.literal('CHAT_REQUEST'),
  ok: z.literal(true),
  data: chatReplySchema,
});

export const sessionGetSuccessSchema = z.strictObject({
  ...envelope,
  type: z.literal('SESSION_GET'),
  ok: z.literal(true),
  data: sessionDescriptorSchema,
});

export const sessionResetSuccessSchema = z.strictObject({
  ...envelope,
  type: z.literal('SESSION_RESET'),
  ok: z.literal(true),
  data: sessionDescriptorSchema,
});

export const runtimeFailureSchema = z.strictObject({
  channel: z.literal(RUNTIME_CHANNEL),
  version: z.literal(RUNTIME_VERSION),
  request_id: boundedIdSchema.nullable(),
  type: z.enum(['PING', 'CHAT_REQUEST', 'SESSION_GET', 'SESSION_RESET']).nullable(),
  ok: z.literal(false),
  error: runtimeErrorSchema,
});

export const runtimeResponseSchema = z.union([
  pingSuccessSchema, chatSuccessSchema, sessionGetSuccessSchema, sessionResetSuccessSchema, runtimeFailureSchema,
]);

export type PingSuccess = z.infer<typeof pingSuccessSchema>;
export type ChatSuccess = z.infer<typeof chatSuccessSchema>;
export type SessionGetSuccess = z.infer<typeof sessionGetSuccessSchema>;
export type SessionResetSuccess = z.infer<typeof sessionResetSuccessSchema>;
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
  const type = value.type === 'PING' || value.type === 'CHAT_REQUEST' ||
    value.type === 'SESSION_GET' || value.type === 'SESSION_RESET' ? value.type : null;
  return { requestId: requestId.success ? requestId.data : null, type };
}
