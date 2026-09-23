# Shadow DOM chat widget

EXT-05-06 connects the existing Shadow Root shell to a typed chat service and displays validated text and product cards. The content script still mounts through WXT's Shadow Root UI, and no component performs HTTP. The background owns the fixed backend POST. The launcher starts closed; opening alone performs no session or backend request.

## Boundaries and state

`App` composes `ChatWidget`; the launcher and mount helper remain unchanged. `ChatWidget` owns the in-memory draft, open state, reducer and one synchronous in-flight guard. `ChatComposer` validates the shared nonblank/8000 UTF-16-unit policy and preserves exact input. `MessageList` owns the named scrollable log and renders each assistant response with its own cards. `ProductCard` displays only supplied facts and rechecks links at render time. There is no transcript or draft persistence; reload/unmount loses the visible history, although the backend conversation ID may survive in browser session storage.

Submit adds a pending user turn, prepares fresh session/context once, sends one CHAT_REQUEST and displays a validated answer or a safe error. While pending, draft is retained read-only and Send is disabled. Failure keeps the draft for an explicit new submit and marks the user turn as having no confirmed answer. Success clears that submitted draft. Closing/reopening preserves pending work and results without resending; unmount ignores late UI callbacks but does not prove server cancellation. A changed session drops old local turns while retaining the current pending turn and displays `Начат новый диалог.` No automatic retry, reset or cart action occurs.

Assistant text is rendered as React text with line breaks preserved; there is no HTML/Markdown execution or auto-linking. A non-null backend cart proposal produces only `Добавление в корзину здесь пока недоступно.` Cards distinguish unknown price/stock from zero, preserve fractional quantity, and show only supplied warehouse/time data. Product links require HTTPS EKT `/catalog` paths; image/certificate links require HTTPS EKT `/upload/` paths. Unsafe links become inactive. Images are lazy with no referrer and a one-way error fallback.

## Focus and layout

The panel is a named non-modal dialog (`aria-modal=false`) with no backdrop, focus trap or page scroll lock. Opening focuses the textarea; header close, launcher toggle and unhandled Escape inside restore launcher focus. Outside input remains available. Plain Enter uses the native form submit path; Shift+Enter adds a newline; composition suppresses accidental Enter/Escape. Over-limit paste is retained with accessible error text. The counter is not a live region. One restrained status region reports waiting/errors without announcing the entire transcript.

The fixed 56px launcher and panel remain inside WXT's Shadow Root. The log scrolls internally; it follows new turns only when near the bottom or after the user's own submit, with a `К последним сообщениям` control when reading older turns. No unrestricted `scrollIntoView` scrolls the EKT page. The bundled CSS uses system fonts and namespaced selectors. Shadow DOM isolates ordinary styles but is not a privacy boundary against the host page. jsdom does not prove real CSS geometry, native mobile editing, Tab behavior or screen reader output.

## Manual checks — not run

- [ ] Build with an approved backend origin, reload the unpacked extension and EKT page; verify the launcher remains closed and opening/typing makes no POST.
- [ ] Submit twice in one session and confirm continuity, one POST per click and the sanitized payload.
- [ ] Verify text-only answers, per-turn cards, safe product/certificate links and unknown stock/price display.
- [ ] Disable the backend; check safe error, draft retention, manual resubmit, close/reopen while waiting and rapid-click guard.
- [ ] Check focus, IME, Shift+Enter, 320px and short viewport, inner scrolling, image fallback and no page CSS/scroll interference.
- [ ] Check separate tabs/origins, deliberate session reset, reload loss of visible history and absence of basket requests even with a proposal object.
