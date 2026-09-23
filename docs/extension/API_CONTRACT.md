# Extension and backend API contract

Status: Draft implemented by extension EXT-05-06; live backend compatibility unverified.

This contract must stay synchronized with the backend team.

These schemas are drafts and may be refined in later tasks.

## POST /api/v1/chat

Example request:

```json
{
  "session_id": "35bc8d96-6c74-4f72-9760-0cd617ba3a83",
  "message": "Есть этот товар в Астане?",
  "attachment_ids": [],
  "page_context": {
    "url": "https://nursultan.ekt.kz/catalog/example/",
    "origin": "https://nursultan.ekt.kz",
    "region": "nursultan",
    "locale": "ru",
    "current_product_id": null
  }
}
```

Example response:

```json
{
  "request_id": "backend_req_fixture_001",
  "message": "Синтетический ответ о тестовом кабеле.",
  "products": [
    {
      "id": 42,
      "article": "FIX-42",
      "name": "Кабель тестовый",
      "price": 0,
      "currency": "KZT",
      "available_quantity": 1.5,
      "image_url": "https://ekt.kz/upload/fixture.jpg",
      "product_url": "https://ekt.kz/catalog/fixture/",
      "certificate_url": "https://ekt.kz/upload/certificate.pdf",
      "stock_location": "Склад А",
      "stock_checked_at": "2026-01-02T03:04:05+05:00",
      "stores": [{"id": 7, "name": "Склад А", "quantity": 1.5}]
    }
  ],
  "cart_proposal": null
}
```

## Product card

Required HTTP fields: positive safe integer `id`, nullable string `article` (at most 128 units), nonblank `name` (at most 512 units), nullable finite nonnegative JSON numbers `price` and `available_quantity`, literal `currency: "KZT"`, and nullable strings `image_url` and `product_url`. Price zero and stock zero are known numeric facts; null means unknown. Fractional stock is valid. Optional `certificate_url`, `stock_location` (nonblank, at most 120 units), timezone ISO `stock_checked_at`, and `stores` (at most 100 records of positive safe integer ID, nonblank name and nullable finite nonnegative quantity) normalize to null or an empty list when absent. No warehouse or freshness value is inferred.

`request_id` is a nonblank backend trace ID of at most 128 units and need not equal the extension's `X-Request-ID`. `message` is nonblank plain text of at most 32,000 UTF-16 units. `products` is required and has at most 20 items; an empty list is valid. `cart_proposal` is required as null or a JSON object. The extension treats a non-null proposal only as a boolean notice; this draft defines no cart action in the chat UI.

The HTTP boundary rejects malformed known fields and discards unknown fields. Unsafe string URLs normalize to null while preserving valid product facts. Product links must be absolute HTTPS EKT URLs at `/catalog` or `/catalog/...`; media/certificate links must be absolute HTTPS EKT URLs under `/upload/...`. No credentials or nonstandard ports. The stricter internal runtime `ChatReply` contains only `request_id`, `message`, normalized `products` (all optional presentation fields resolved), and `cart_proposal_received`. It never contains arbitrary backend metadata or the proposal object.

The extension POSTs JSON to exactly `/api/v1/chat` at its configured backend origin with no credentials, no automatic retry and a 15-second deadline. Empty `attachment_ids` only. Successful HTTP 200 requires JSON and the valid response above; error envelopes, HTML and oversized bodies fail safely. Status 400/422 maps to request rejected, 401/403 access denied, 429 rate limited, 5xx/network unavailable, other statuses HTTP error. A timeout may follow server processing.

## Cart proposal

Example:

```json
{
  "action_id": "cart_action_123",
  "status": "pending_confirmation",
  "product_id": 515291,
  "product_name": "027228 АВ DRX250 MT 3ф 160А 18ka Legrand",
  "quantity": 2,
  "kratnost": 1,
  "available_quantity": 8,
  "expires_at": "2026-09-23T16:00:00+05:00"
}
```

## POST /api/v1/cart-actions/{action_id}/validate

Example response:

```json
{
  "action_id": "cart_action_123",
  "status": "validated",
  "product_id": 515291,
  "quantity": 2,
  "kratnost": 1,
  "available_quantity": 8
}
```

## POST /api/v1/cart-actions/{action_id}/result

Example request:

```json
{
  "success": true,
  "cart_url": "https://nursultan.ekt.kz/personal/cart/"
}
```

## Error envelope

Example:

```json
{
  "error": {
    "code": "CART_ACTION_EXPIRED",
    "message": "The cart action has expired.",
    "retryable": false
  }
}
```
