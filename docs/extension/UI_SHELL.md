# EXT-03 UI shell

The shell is a local interface preview. It creates no conversation, fake response, queue, runtime message, session, storage entry or application network request. The existing EXT-02 runtime is unchanged and is not called by the UI.

## Boundaries and state

| File/component | Responsibility |
|---|---|
| `App` | Thin composition root for `ChatWidget`. |
| `ChatWidget` | Owns open/closed state, exact draft and local notice; renders header, preview note, static empty state and child controls; coordinates focus. |
| `ChatLauncher` | Native button with the stable name `Чат EKT AI Assistant`, expanded state and controls reference while the panel exists. |
| `ChatComposer` | Controlled textarea, associated label/hint/error, counter and shared validity decision; calls a typed local callback with unchanged text. |
| `services/widget-mount.tsx` | Production adapter creating one React root in its own `ekt-ai-assistant-react-root` wrapper inside WXT's container. Idempotent cleanup unmounts that root and removes only its wrapper. |
| WXT content entrypoint | Keeps the existing EKT matches, host name, body anchor, isolated execution world and bundled Shadow Root CSS. Calls the adapter in `onMount` and its cleanup in `onRemove`. |

Closing conditionally removes the panel, while draft state remains in the mounted widget. Reopening preserves whitespace and line breaks. Reload/unmount discards the draft; there is no persistence or server history. Opening and closing never recreate the React or Shadow root.

## Interaction and focus

Initially only the launcher appears, with no focus change. User opening focuses the textarea once after mount. Header close, launcher toggle and an unhandled Escape within the widget collapse it and restore launcher focus. Outside clicks and outside Escape leave it open. Focus may move to the website and is not recaptured on draft changes.

The panel is a named `role="dialog"` with `aria-modal="false"` because the website must remain usable. There is no backdrop, focus trap, inert page, scroll lock, global shortcut or modal API.

- Plain Enter in the textarea prevents its default and requests native form submission through the same validation handler as the button.
- Shift+Enter retains native newline behavior. Ctrl/Alt/Meta+Enter are not custom shortcuts.
- Native `isComposing` and local composition events suppress Enter submission and Escape closing during IME composition without cancelling the input action.
- Already handled keys are respected. Tab and normal editing/selection/paste are not intercepted.
- Every form submit prevents navigation and stops local bubbling, including invalid direct submits.

## Draft validation and local feedback

The UI permits nonblank text with `draft.length <= 8000`. This is a JavaScript UTF-16 code-unit bound; trimming only determines whether input is blank. Text passed to the callback remains unchanged. Over-limit pastes are retained, associated inline error text and `aria-invalid` appear, and submit is disabled until corrected. The counter is not a live region. Text is never parsed as HTML or Markdown.

EXT-02 embeds `8000` inside `chatPayloadSchema` and exports no pure text-limit constant. Therefore `ChatComposer` has one UI constant duplicating the numeric bound. **Actual mismatch:** installed Zod 4.6.5 `.max(8000)` counts Unicode code points; the requested UI bound counts JavaScript code units. For example, 4001 supplementary-plane emoji occupy 8002 code units but 4001 code points. The UI rejects that draft although the runtime schema permits it. The UI is stricter; contracts remain unchanged and need alignment before future transport integration. This is an extension decision, not an EKT API limit.

The open panel always contains `Предпросмотр интерфейса. Отправка сообщений пока не подключена.` Valid local submission calls the callback once and shows `Отправка пока не подключена. Текст остался в поле ввода.` in an inline polite status region. The draft stays unchanged, repeated submits keep the same notice, and editing clears it. No message bubble or sending/delivery state is added.

## Styling and isolation limits

The namespaced light/teal prototype uses bundled CSS, system fonts and local SVG. The 56px launcher is fixed inside the Shadow Root; the panel above it is at most 376px wide and constrained by viewport width/height and safe-area insets. Height uses `vh` with `dvh` enhancement, a scrolling middle and a panel overflow fallback for unusually short viewports. Controls remain native with visible focus and disabled states. Empty wrapper space has no pointer target. The closed widget has only the launcher footprint. No animation, page stylesheet, page variable mutation or page scrolling mutation is added.

WXT resets the host with `all: initial !important`, so fixed positioning and the explicit base font belong to the inner widget. Styles avoid `rem`, which depends on the page's root font size. Shadow DOM does not isolate every inherited custom property, host styling or font definition. WXT's supported `isolateEvents: true` stops bubbling keydown/keyup/keypress events at its boundary while retaining native defaults and React handlers. This does not guarantee privacy or block host capture-phase observation; Shadow DOM is not a security boundary. WXT may load its own packaged CSS resource, which is separate from application backend traffic.

## Deferred work

| Task | Remaining work |
|---|---|
| EXT-04 | Session storage and EKT page context. |
| EXT-05 | Background/backend transport. |
| EXT-06 | Actual chat flow and product cards. |
| EXT-07 | Explicit cart confirmation state machine. |
| EXT-08 | EKT basket adapter. |
| EXT-09 | Upload UI and transport. |
| EXT-10 | Further responsive, accessibility and localization work. |

## Human browser checklist — not performed

jsdom covers DOM behavior, callback counts, focus inside a real DOM Shadow Root and cleanup. It does not verify CSS geometry, native Tab traversal or editing, real IME/mobile keyboards, screen-reader output or visual isolation. Narrow layout support does not establish mobile-browser extension support.

- [ ] After building, load `apps/extension/.output/chrome-mv3` through `chrome://extensions` with Developer Mode enabled.
- [ ] Visit `https://ekt.kz/` and `https://nursultan.ekt.kz/`; only the launcher appears initially.
- [ ] Open, type, close/reopen and confirm exact draft preservation.
- [ ] Check textarea focus on open, launcher focus on close, Shift+Enter, IME, Escape and Tab moving back into the website.
- [ ] Paste over-limit text; confirm no truncation, no submission and no fake delivery.
- [ ] Confirm the preview note remains visible and local submit feedback leaves text in the field; editing clears feedback.
- [ ] Check 320px, 375px and desktop widths, a short viewport and browser zoom.
- [ ] Confirm the closed footprint leaves other page controls usable and page styling/scrolling unchanged.
- [ ] Visit an unrelated site and confirm no widget is injected.
- [ ] Confirm widget interactions cause no application chat/API/basket traffic.
