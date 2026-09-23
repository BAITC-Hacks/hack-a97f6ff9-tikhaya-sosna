# Internal runtime protocol v1

This protocol is between the EKT content script and extension background worker. The HTTP backend contract is separate. EXT-05-06 is validated with synthetic mocks; live backend and browser compatibility remain unverified.

## Envelope and operations

Every request has channel `ekt-ai-extension`, version `1`, a nonblank `request_id` (at most 128 units), an operation `type`, and an operation-specific `payload`. Complete request/response objects are strict and JSON-only; unknown keys fail validation. The browser-provided sender is checked before storage or HTTP.

`PING` has an empty payload and returns `{ "status": "runtime_ready" }`. It checks the extension runtime, not backend health. `SESSION_GET` and `SESSION_RESET` also have strict empty payloads. GET reuses or creates a UUID for the verified tab/origin scope; RESET rotates it. Their success data contains only `session_id` and `origin`. A failed session operation returns `SESSION_UNAVAILABLE`. RESET does not delete backend history or cancel in-flight requests.

`CHAT_REQUEST` carries `{ session_id, message, attachment_ids: [], page_context }`. The message is nonblank and at most 8000 JavaScript UTF-16 code units. The generic schema allows up to ten bounded attachment IDs, but the current chat route rejects nonempty arrays with `ATTACHMENTS_NOT_SUPPORTED`. The page context has sanitized URL, canonical origin, nullable region hint, locale, and nullable product ID. It is rebuilt from the verified sender URL before chat; query, fragment and private paths cannot be forwarded. A matching existing session is required and rechecked after the HTTP response.

Example synthetic success:

```json
{"channel":"ekt-ai-extension","version":1,"request_id":"runtime_req_001","type":"CHAT_REQUEST","ok":true,"data":{"request_id":"backend_req_fixture_001","message":"Синтетический ответ.","products":[],"cart_proposal_received":false}}
```

The outer ID correlates the runtime call; `data.request_id` is a distinct backend trace ID. The strict normalized `data` has only these four top-level fields. Each product contains validated facts and safe nullable links. An opaque HTTP `cart_proposal` is reduced to `cart_proposal_received`; no cart operation is enabled.

## Sender and scope

The router accepts only the extension's own top-level EKT content script: sender ID equals runtime ID, tab ID is a nonnegative safe integer (including zero), frame ID is zero, and sender URL is HTTPS on `ekt.kz` or a subdomain with no userinfo or nonstandard port. An optional browser sender origin must agree. Other channels are ignored. Invalid messages and forbidden senders cause no storage or HTTP call. The background allows one in-flight chat per tab/origin; other scopes can proceed. A rotated or missing session suppresses a stale reply with `CHAT_SESSION_MISMATCH`.

## Errors and timeouts

All failures use the correlated channel/version/ID/type when valid, `ok: false`, and a fixed sanitized error. Existing codes remain: `INVALID_MESSAGE`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_MESSAGE_TYPE`, `FORBIDDEN_SENDER`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`, `RUNTIME_UNAVAILABLE`, `RUNTIME_TIMEOUT`, `INVALID_RESPONSE`, `SESSION_UNAVAILABLE`. The new chat codes are `BACKEND_NOT_CONFIGURED`, `BACKEND_UNAVAILABLE`, `BACKEND_TIMEOUT`, `BACKEND_INVALID_RESPONSE`, `BACKEND_REQUEST_REJECTED`, `BACKEND_ACCESS_DENIED`, `BACKEND_RATE_LIMITED`, `BACKEND_HTTP_ERROR`, `CHAT_SESSION_MISMATCH`, `CHAT_REQUEST_IN_PROGRESS`, `ATTACHMENTS_NOT_SUPPORTED`. Backend unavailable, timeout and rate limited are retryable flags; the client never retries automatically. `request_id` or `type` may be null if invalid/unrecognized.

The runtime client waits 10 seconds for PING and session calls, 25 seconds for chat. The background HTTP client has a 15-second deadline covering headers and body. A client timeout does not cancel background work; an HTTP abort does not prove the server undid processing. IDs are correlation values, not authentication, consent or idempotency keys. Files, Blobs, FormData, Date, Map, Error, functions, BigInt and cyclic values are outside this JSON protocol.

Upload and cart transport remain deferred. No real browser or live backend was contacted for EXT-05-06.
