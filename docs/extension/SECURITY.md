# Extension security

## Secrets

No EKT BasicAuth credentials or OpenAI API key in the extension. Do not commit tokens or `.env` files. Do not include secrets in artifacts.

## Browser permissions

Request minimum permissions, never `<all_urls>` without explicit approval, and inject only on EKT sites.

## Cart safety

AI cannot directly mutate a cart. Require explicit user confirmation, guard against duplicate clicks, and validate the action and stock with the backend immediately before mutation. Send a cart request only after user action.

## Privacy

Do not send or log cookies, payment data, Authorization headers, or unrelated page content.

## Testing safety

Automated tests must never modify a real EKT cart.
