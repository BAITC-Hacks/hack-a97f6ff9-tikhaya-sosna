# EXT-05-06 backend chat handoff

The extension POSTs only `POST <WXT_BACKEND_BASE_URL>/api/v1/chat`. `WXT_BACKEND_BASE_URL` is one public build-time **origin**; no API-prefix inference or fallback host exists. Missing/invalid configuration yields `BACKEND_NOT_CONFIGURED` without HTTP. The build-time host permission covers one explicit scheme/host (Chromium match patterns do not encode ports); application code still uses the fixed endpoint. Rebuild/reload after changing the origin.

Synthetic draft request:

```json
{"session_id":"35bc8d96-6c74-4f72-9760-0cd617ba3a83","message":"Есть кабель?","attachment_ids":[],"page_context":{"url":"https://nursultan.ekt.kz/catalog/fixture/","origin":"https://nursultan.ekt.kz","region":"nursultan","locale":"ru","current_product_id":null}}
```

Preferred canonical HTTP 200 JSON response (synthetic fixture; final backend contract):

```json
{"request_id":"backend_req_fixture_001","message":"Синтетический ответ.","products":[{"id":42,"article":"FIX-42","name":"Кабель тестовый","price":0,"currency":"KZT","available_quantity":1.5,"image_url":"https://ekt.kz/upload/fixture.jpg","product_url":"https://ekt.kz/catalog/fixture/","certificate_url":null}],"cart_proposal":null}
```

The extension sends `X-Request-ID` for runtime correlation. A canonical HTTP `request_id` is a backend trace ID and need not echo it. The current merged backend has no response `request_id`; only for that legacy response, the extension uses the exact outbound `X-Request-ID` as a local correlation value. It is not a backend-generated trace ID, authentication, or proof of an echo. `session_id` is a conversation ID, **not** a credential, identity proof, consent or idempotency key. Backend owns authorization/session access controls, rate limits and conversation history. The extension sends no EKT cookies or shared API key. CORS, host permissions and UUIDs alone do not authenticate users or secure a public backend. An approved live backend/auth contract is a deployment gate; do not weaken browser security or add a shared extension key to bypass it.

The message is nonblank and at most 8000 UTF-16 code units; exact text is preserved. Attachments are empty for now. The page URL is sanitized, excludes query/fragment/private paths and contains only an EKT `/catalog` path or origin root. `region` is a hostname hint, not a verified city/warehouse. `current_product_id` is null until a reviewed extractor exists. No full transcript or page text is sent.

## Temporary merged-backend compatibility

The merged FastAPI `/api/v1/chat` currently returns `message`, `products`, and `cart_proposal`, with no `request_id`. Its `products` are `ProductListItem` values with `id`, `name`, `article`, `price`, `image`, `url`, `url_api_detail`, `offers`, `supplier_article`, `barcode`, and `properties`. Pydantic serializes its `Decimal` price as a JSON string; the boundary accepts a finite nonnegative decimal string or JSON number and normalizes it to a number. Null remains null. Opaque list metadata is validated for shape and discarded, never used to infer stock.

Only after canonical validation fails does the boundary try this explicit legacy shape. Legacy `id`, `article`, `name`, and `price` map directly; `currency` becomes `KZT` as an EKT catalog compatibility decision. `image` maps to `image_url` through the existing safe EKT `/upload/` URL policy, and `url` maps to `product_url` through the safe EKT `/catalog` policy. Unsafe links become null. `url_api_detail` is not a product link. `available_quantity`, `certificate_url`, `stock_location`, and `stock_checked_at` are null; `stores` is empty. Legacy compatibility must not be used to claim current stock availability, and no certificate link is fabricated. Both formats produce the same strict internal `ChatReply` and product card contract. A non-null proposal produces only the existing static unavailable notice; its fields are not acted on.

The merged `PageContext` accepts `url`, `origin`, `city`, and `current_product_id` and ignores extra fields. The extension keeps its existing sanitized `region` and `locale` outbound shape. It does not map `region` to `city`, so city remains absent and location-specific stock requires a future explicit city/store contract.

`products` may be empty. Price and available quantity are finite nonnegative JSON numbers or null; zero is known zero, null is unknown, and stock may be fractional. Currency is exactly `KZT` in this draft. Optional stock location, checked timestamp and per-store quantities must be supplied by the backend; the extension does not infer a city, sum warehouses or claim freshness without a timestamp. Unknown HTTP fields are discarded; malformed known fields fail the whole reply. Safe product links are absolute HTTPS EKT `/catalog` or `/catalog/...` URLs. Image/certificate links are absolute HTTPS EKT `/upload/...` URLs. Other hosts or paths require later explicit review and allowlist changes; they are not guessed or proxied.

HTTP 200 requires JSON, a valid schema and a body at most 512 KiB. 400/422 map to request rejected, 401/403 access denied, 429 rate limited, 5xx/network unavailable, other non-200 unexpected HTTP status; malformed content/size maps to invalid response. The 15-second client deadline includes body consumption, and the 25-second runtime wait leaves room for it. No automatic POST retry or fabricated fallback answer exists. A timeout/abort does not prove that the server did not process the request; there is no exactly-once or undo guarantee.

`/chat` must remain read-only with respect to basket and order. A text request, including “да, добавь”, is not cart consent enforcement. A non-null `cart_proposal` is reduced to a boolean static UI notice; no confirmation or cart endpoint is implemented. The future cart flow requires a separately reviewed explicit user confirmation and backend validation.

Live backend, authentication, real browser and EKT behavior were **not run** for this task. The synthetic fixtures are test data only, never application fallback content.
