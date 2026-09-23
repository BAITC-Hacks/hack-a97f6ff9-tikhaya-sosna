# EKT AI Assistant extension

## Requirements and install

Node.js 20 or newer, pnpm and a Chromium-based browser. From the repository root: `pnpm --dir apps/extension install`. The extension is self-contained with its own lockfile.

## Backend origin and build

Set only the approved project backend **origin** in your local shell. Do not include `/api` or `/api/v1/chat`; the extension fixes the POST path. Examples:

```powershell
# From repository root, in your own local PowerShell session
$env:WXT_BACKEND_BASE_URL = 'http://localhost:8000'
pnpm --dir apps/extension run build
```

```sh
WXT_BACKEND_BASE_URL=http://localhost:8000 pnpm --dir apps/extension run build
```

Use HTTPS for a nonlocal approved backend. HTTP is allowed only for `localhost` or `127.0.0.1`. A missing or invalid setting disables chat with a safe error and no backend host permission. `.env.example` is documentation only; loading it alone does nothing. Changing the setting requires a rebuild and extension/page reload. The extension contains no shared secret; live authentication and backend authorization must be reviewed before deployment.

## Development and load unpacked

Run `pnpm --dir apps/extension dev` for WXT development mode, with the same shell setting if chat is needed. The production build is at `apps/extension/.output/chrome-mv3`; WXT uses `.output/chrome-mv3-dev` for development. Open `chrome://extensions`, enable Developer Mode, select **Load unpacked**, and choose the relevant generated directory. The task changed-files ZIP is a source handoff, not an installable extension build.

## Scope

EXT-05-06 adds one background-to-backend `/api/v1/chat` POST, runtime/session/context checks, an in-memory conversation view and validated product cards. EXT-05-06F accepts both the preferred canonical response and the current merged FastAPI list response through a boundary normalizer; legacy list stock remains unknown. The content script runs only on EKT pages in Shadow DOM. Compatibility has mocked tests but no live backend or browser verification. The extension does not implement uploads, persistent transcript, real backend authentication, cart confirmation or basket mutation. A cart proposal only yields a static notice. See [backend handoff](../../docs/extension/BACKEND_CHAT.md), [runtime protocol](../../docs/extension/RUNTIME_PROTOCOL.md) and [UI checks](../../docs/extension/UI_SHELL.md).

## Manual verification — not run

- [ ] Configure an approved backend, build/reload the extension and EKT page; confirm the launcher is closed and opening/typing sends no POST.
- [ ] Submit twice and inspect one sanitized `/api/v1/chat` POST per click, same session ID and distinct outbound runtime IDs; distinguish a canonical backend trace ID from the legacy local fallback ID.
- [ ] Verify text, cards, optional links, unknown stock/price, image fallback and no guessed city/warehouse.
- [ ] Stop or misconfigure the backend; confirm safe error, draft retention and manual retry only. Check close/reopen while pending and rapid clicks.
- [ ] Check focus, IME, multiline input, narrow/short viewport, inner scroll and no page CSS/scroll interference.
- [ ] Check separate tabs/origins, deliberate session reset, reload loss of visible history and no basket/action request even with a proposal.
