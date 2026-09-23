# EKT AI Assistant extension

## Requirements

- Node.js 20 or newer
- pnpm
- A Chromium-based browser

## Install

From the repository root, run `pnpm --dir apps/extension install`. This extension is self-contained and has its own lockfile.

## Development

Run `pnpm --dir apps/extension dev` for WXT development mode.

## Build

Run `pnpm --dir apps/extension build` to create the Chromium Manifest V3 extension.

## Load unpacked

Open `chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3` after a production build. WXT uses `.output/chrome-mv3-dev` for its development build.

## Scope

EXT-03 provides a closed-by-default launcher and a non-modal chat shell inside the existing Shadow Root. Opening focuses the textarea; closing preserves the exact draft in memory and restores launcher focus. Enter submits locally, Shift+Enter permits a newline, and Escape inside the widget closes it when composition is inactive. Focus can leave the panel. Drafts disappear when the widget unmounts or the page reloads.

The UI accepts nonblank drafts up to 8000 JavaScript string code units. Longer input is retained with an error. A valid submit only shows a preview notice and leaves the text in place; editing clears that notice. EXT-02 runtime messaging exists, but this UI does not call it. Backend communication, product search, message history, cart integration, persistence and file uploads are not included.

EXT-04 adds background-owned conversation IDs in `browser.storage.session`, scoped by verified tab ID and EKT origin, plus an on-demand sanitized page-context preparation service. It adds only the Chrome `storage` permission. The content-script UI still does not call these services; there is no backend session registration or chat transport. IDs are local correlation values, not authentication. They can survive worker idling but are cleared with extension reload/disable/update or browser restart. A closed tab's small record can remain until storage clears. See [session and context details](../../docs/extension/SESSION_CONTEXT.md).

See [UI shell details and manual checklist](../../docs/extension/UI_SHELL.md) for component boundaries, the current runtime/UI length distinction, and outstanding browser checks. Automated jsdom checks do not verify CSS layout, native keyboard editing, Tab traversal, or screen readers.

## Manual UI checks

- [ ] Load the production build through `chrome://extensions`; check the main and a regional EKT page and an unrelated site.
- [ ] Open, type, close/reopen, submit locally, and confirm the draft and honest preview feedback.
- [ ] Check focus restoration, Shift+Enter, IME, Escape and Tab back to the website.
- [ ] Check over-limit paste, narrow/short viewports, zoom, page interaction and absence of application API traffic using the full linked checklist.
