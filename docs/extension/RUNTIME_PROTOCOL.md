# Internal runtime protocol v1

This is communication inside the browser extension. It is separate from the draft FastAPI HTTP contract. The content-script UI has not been wired to this client yet. No backend, EKT API, cart, or real-browser communication was added in EXT-02.

## Envelope and operations

Every request uses channel `ekt-ai-extension`, version `1`, a nonblank `request_id`, an operation `type`, and an operation-specific `payload`. The background checks browser-provided sender metadata and validates the complete request before routing it. Unknown keys are rejected.

PING checks only extension-runtime readiness:

```json
{"channel":"ekt-ai-extension","version":1,"request_id":"req_demo_001","type":"PING","payload":{}}
```

```json
{"channel":"ekt-ai-extension","version":1,"request_id":"req_demo_001","type":"PING","ok":true,"data":{"status":"runtime_ready"}}
```

CHAT_REQUEST carries IDs and page context, with no binary attachment data:

```json
{
  "channel": "ekt-ai-extension",
  "version": 1,
  "request_id": "req_demo_002",
  "type": "CHAT_REQUEST",
  "payload": {
    "session_id": "session_demo",
    "message": "Есть этот товар?",
    "attachment_ids": [],
    "page_context": {
      "url": "https://nursultan.ekt.kz/catalog/example/",
      "origin": "https://nursultan.ekt.kz",
      "region": "nursultan",
      "locale": "ru",
      "current_product_id": null
    }
  }
}
```

A valid CHAT_REQUEST intentionally returns a correlated failure until backend transport is implemented:

```json
{"channel":"ekt-ai-extension","version":1,"request_id":"req_demo_002","type":"CHAT_REQUEST","ok":false,"error":{"code":"NOT_IMPLEMENTED","message":"Backend chat transport is not implemented yet.","retryable":false}}
```

There is no successful chat response schema yet. A failure may use `request_id: null` for an absent or invalid ID, and `type: null` for an unrecognized operation. Error codes are `INVALID_MESSAGE`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_MESSAGE_TYPE`, `FORBIDDEN_SENDER`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`, `RUNTIME_UNAVAILABLE`, `RUNTIME_TIMEOUT`, and `INVALID_RESPONSE`. Error messages are fixed and sanitized. Only runtime unavailability and timeout are marked retryable; the client never retries automatically.

## Sender and input policy

The router accepts only the extension's own top-level EKT content scripts. Browser-provided `sender.id` must equal the active runtime ID; `sender.tab.id` must be a nonnegative integer; `sender.frameId` must be zero; and `sender.url` must be an HTTPS EKT page URL. If `sender.origin` is present, it must equal that URL's origin. For CHAT_REQUEST, the payload page origin must equal the sender URL origin. Popup pages, other extensions, unrelated sites, nested frames, and missing frame URLs are rejected. Unrelated channels are ignored.

An EKT page URL must use HTTPS, have no credentials or nonstandard port, and have hostname `ekt.kz` or a subdomain ending in `.ekt.kz`. A page context origin must be a canonical HTTPS origin with no path, query, fragment, or userinfo, and match its URL.

The following nullability and limits are provisional extension-side design decisions, not EKT API limits: request, session, and attachment IDs are nonblank strings up to 128 characters; message text is 1–8000 characters and cannot be whitespace-only; at most 10 attachment IDs are allowed; URL is at most 2048 characters; origin is at most 256; region is nonblank up to 64 characters or explicit null; locale is nonblank up to 35; current product ID is a positive safe integer or explicit null. All fields are required. Message text is preserved exactly.

Wire values must be JSON-compatible. File, Blob, FormData, Date, Map, Error, functions, BigInt, and cyclic values are not part of this protocol. Uploads are deferred to EXT-09.

## Correlation and timeout

The client creates a new request ID for each call, normally with `crypto.randomUUID()`, validates the outbound request, sends it once, validates the reply, and checks its channel, version, ID, and operation. IDs correlate replies; they are not authentication, cart consent, or idempotency keys. They do not provide duplicate-cart protection.

The client waits 10 seconds by default. A timeout stops waiting locally but does not cancel receiver work. It does not use AbortController to imply cancellation. Unexpected transport and handler errors become safe fixed errors without exposing request text, URLs, stack traces, or raw exception messages.

## Deferred work and verification

Product responses, upload transport, and cart actions are deferred. This protocol does not define quantity behavior, `kratnost`, EKT basket success, or stock semantics. No UI change or real-browser verification was performed in EXT-02; the round trip is tested only with in-memory mocks.
