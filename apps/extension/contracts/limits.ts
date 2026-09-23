export const MAX_CHAT_MESSAGE_UNITS = 8000;
export const BACKEND_REQUEST_TIMEOUT_MS = 15_000;
export const RUNTIME_CHAT_TIMEOUT_MS = 25_000;
export const MAX_BACKEND_RESPONSE_BYTES = 524_288;

export function isValidChatMessage(value: string): boolean {
  return value.trim().length > 0 && value.length <= MAX_CHAT_MESSAGE_UNITS;
}
