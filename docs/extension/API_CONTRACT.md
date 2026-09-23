# Extension and backend API contract

Status: Draft

This contract must stay synchronized with the backend team.

These schemas are drafts and may be refined in later tasks.

## POST /api/v1/chat

Example request:

```json
{
  "session_id": "session_123",
  "message": "Есть этот товар в Астане?",
  "attachment_ids": [],
  "page_context": {
    "url": "https://nursultan.ekt.kz/catalog/example/",
    "origin": "https://nursultan.ekt.kz",
    "region": "nursultan",
    "locale": "ru",
    "current_product_id": 515291
  }
}
```

Example response:

```json
{
  "request_id": "req_123",
  "message": "В Нур-Султане доступно 8 штук.",
  "products": [
    {
      "id": 515291,
      "article": "200300285_",
      "name": "027228 АВ DRX250 MT 3ф 160А 18ka Legrand",
      "price": 64920,
      "currency": "KZT",
      "available_quantity": 8,
      "image_url": "https://example.com/image.jpg",
      "product_url": "https://nursultan.ekt.kz/catalog/example/"
    }
  ],
  "cart_proposal": null
}
```

## Product card

Expected fields: `id`, `article`, `name`, `price`, `currency`, `available_quantity`, `image_url`, `product_url`, and optional `certificate_url`.

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
