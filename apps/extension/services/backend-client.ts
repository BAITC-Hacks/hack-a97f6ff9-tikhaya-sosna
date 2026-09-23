import type { BackendConfig } from '../config/backend';
import { boundedIdSchema, chatPayloadSchema, MAX_BACKEND_RESPONSE_BYTES, BACKEND_REQUEST_TIMEOUT_MS,
  normalizeBackendReply, type ChatPayload, type ChatReply, type RuntimeErrorCode } from '../contracts';

export type BackendResult = { ok: true; data: ChatReply } | { ok: false; code: RuntimeErrorCode };

export interface BackendClientOptions {
  config: BackendConfig | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

class InvalidBackendResponseError extends Error {}

function statusError(status: number): RuntimeErrorCode {
  if (status === 400 || status === 422) return 'BACKEND_REQUEST_REJECTED';
  if (status === 401 || status === 403) return 'BACKEND_ACCESS_DENIED';
  if (status === 429) return 'BACKEND_RATE_LIMITED';
  if (status >= 500) return 'BACKEND_UNAVAILABLE';
  return 'BACKEND_HTTP_ERROR';
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > MAX_BACKEND_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new InvalidBackendResponseError();
  }
  if (!response.body) throw new InvalidBackendResponseError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;
  try {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const item = await reader.read();
      if (item.done) { completed = true; break; }
      size += item.value.byteLength;
      if (size > MAX_BACKEND_RESPONSE_BYTES) throw new InvalidBackendResponseError();
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new InvalidBackendResponseError(); }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new InvalidBackendResponseError();
  } finally {
    if (!completed) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createBackendClient(options: BackendClientOptions) {
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? BACKEND_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');

  return {
    async sendChat(payload: ChatPayload, requestId: string): Promise<BackendResult> {
      const config = options.config;
      if (!config) return { ok: false, code: 'BACKEND_NOT_CONFIGURED' };
      const parsed = chatPayloadSchema.safeParse(payload);
      if (!parsed.success || !boundedIdSchema.safeParse(requestId).success) {
        return { ok: false, code: 'BACKEND_REQUEST_REJECTED' };
      }
      if (parsed.data.attachment_ids.length > 0) return { ok: false, code: 'ATTACHMENTS_NOT_SUPPORTED' };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<BackendResult>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve({ ok: false, code: 'BACKEND_TIMEOUT' }); }, timeoutMs);
      });
      const work = (async (): Promise<BackendResult> => {
        try {
          const response = await fetcher(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Request-ID': requestId },
            body: JSON.stringify(parsed.data),
            credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
            signal: controller.signal,
          });
          if (response.status === 204) return { ok: false, code: 'BACKEND_INVALID_RESPONSE' };
          if (response.status !== 200) return { ok: false, code: statusError(response.status) };
          if (!/^application\/json(?:\s*;|\s*$)/iu.test(response.headers.get('content-type') ?? '')) {
            void response.body?.cancel().catch(() => undefined);
            return { ok: false, code: 'BACKEND_INVALID_RESPONSE' };
          }
          const value = await boundedJson(response, controller.signal);
          const data = normalizeBackendReply(value, { fallbackRequestId: requestId });
          return data ? { ok: true, data } : { ok: false, code: 'BACKEND_INVALID_RESPONSE' };
        } catch (error) {
          return { ok: false, code: controller.signal.aborted ? 'BACKEND_TIMEOUT' :
            error instanceof InvalidBackendResponseError ? 'BACKEND_INVALID_RESPONSE' : 'BACKEND_UNAVAILABLE' };
        }
      })();
      try { return await Promise.race([work, deadline]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
    },
  };
}

export type BackendClient = ReturnType<typeof createBackendClient>;
