# Extension architecture

Planned components:

```text
EKT page
   │
   ▼
Content Script
   ├── Shadow DOM
   ├── React widget
   ├── page context
   └── basket adapter ── EKT regional origin
   │
   │ typed runtime message
   ▼
Background Service Worker ── FastAPI backend
```

## Content script

Mounts the UI in Shadow DOM; captures the current page URL, origin, EKT region, and optional current product context; displays responses; and handles user-driven basket mutation. It does not handle BasicAuth, OpenAI calls, catalog backend access, or database access.

## Background service worker

Owns runtime messaging, backend transport, request timeouts, network error mapping, and future file uploads. It does not access the DOM or render UI. The extension communicates only with the project backend for AI and catalog logic.

## Basket boundary

Basket mutation remains isolated from AI orchestration:

```text
AI/backend creates proposal
→ user sees proposal
→ user explicitly clicks confirm
→ backend validates action and stock
→ extension calls EKT basket endpoint
→ extension reports result
```

No EKT BasicAuth credentials in extension. No OpenAI API key in extension.
