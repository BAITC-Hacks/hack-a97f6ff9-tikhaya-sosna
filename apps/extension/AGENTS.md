# Extension instructions

These rules apply under `apps/extension`.

## Stack and boundaries

The planned stack is WXT, React, strict TypeScript, Manifest V3, pnpm, Vitest, React Testing Library, and Zod. Do not replace it without a future task explicitly requesting that change.

The React UI runs in a content script and must use Shadow DOM. The background service worker communicates with the FastAPI backend. Components must not contain raw backend networking logic: use typed runtime messages and a dedicated backend transport service. Keep EKT basket mutation in a dedicated adapter, isolated from AI orchestration. Use the current page origin for regional EKT basket calls; do not hardcode only `nursultan.ekt.kz`. EKT BasicAuth credentials and OpenAI API keys must never exist in the extension.

## Permissions and TypeScript

Request minimum Chrome permissions. Never use `<all_urls>` without explicit approval. Restrict content scripts to EKT domains. Do not add `tabs`, `scripting`, `webRequest`, `cookies`, `history`, or `downloads` unless a later task explicitly requires them.

Keep strict TypeScript enabled and do not introduce `any`. Prefer discriminated unions for runtime messages. Validate untrusted external responses. Keep API contracts in `contracts/` and side effects in services, storage, or entrypoints.

## UI and cart safety

Provide accessible buttons and keyboard support, and support desktop and mobile use. Page CSS must not leak into the widget; widget CSS must not affect the EKT page. Do not use remote executable code or inject remote JavaScript.

Cart action flow: `idle → proposal → validating → confirmed → adding → completed`, with `cancelled`, `expired`, and `failed` as alternative terminal states. Never skip proposal. Model output alone must never call the EKT basket endpoint. Require explicit user confirmation, disable confirmation during processing, prevent duplicate requests, revalidate action and stock through the backend immediately before mutation, and report the mutation result to the backend.

## Testing

Run only tests listed in the task; run TypeScript checks or builds only when explicitly requested. Mock browser APIs, fetch, backend responses, and EKT basket requests. Automated tests must never mutate a real EKT cart.
