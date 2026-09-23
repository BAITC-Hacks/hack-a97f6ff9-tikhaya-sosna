# EXT-04 session and page context

## Background session record

The background derives a scope from a verified top-level content-script sender's `tab.id` and canonical EKT URL origin. Neither value comes from a request payload. A namespaced key `ekt-ai:session:v1:<tabId>:<encodedOrigin>` indexes one `browser.storage.session` record with exactly `schema_version: 1`, a `crypto.randomUUID()` session ID, origin and tab ID. The public descriptor contains only `session_id` and `origin`. Strict Zod validation rejects malformed, extra-key, unsupported-version and scope-mismatched stored records before reuse; GET replaces them. RESET rotates only the requested scope. It does not remove other scopes or clear all storage.

The background creates one store and synchronously registers one existing callback-style listener. PING and the deliberately unimplemented CHAT_REQUEST never access session storage. Missing storage, rejected reads/writes or invalid ID generation return fixed `SESSION_UNAVAILABLE` failures. Success follows the resolved write. Same-key GET/RESET operations are sequenced in a transient per-key Promise queue; different keys can proceed independently. The queue is not the authoritative record, a cross-process lock or an exactly-once guarantee. An interrupted write may have succeeded; an unacknowledged RESET is not automatically retried.

The `storage` permission supports `browser.storage.session`. Its default trusted-context access is retained. The content script receives only its descriptor through the validated runtime protocol, not access to all records. Browser session storage survives worker idling but clears on extension disable/reload/update and browser restart. It stores no transcript, draft, files, page path or credentials. There is no tab-close cleanup yet; a closed tab's small record may remain until storage clears. There is no account-change detection or incognito-specific guarantee. IDs do not bind an EKT account and are not authentication, consent, cart identity or idempotency keys. Future backend work must enforce its own session authorization.

## On-demand page context

The pure builder first rejects URLs outside the existing HTTPS EKT URL policy, including credentials, unsupported ports and deceptive hosts. It removes all query and fragment data. It retains only exact `/catalog` or `/catalog/…` paths; homepage and all other paths become the origin root `/`. A catalog URL longer than 2048 units also becomes the root rather than a truncated path. The outward URL is deliberately sanitized, not `location.href`. Catalog paths can still contain personal information; this allowlist is a project data-minimization decision, not a universal privacy guarantee.

`region` is only a hostname hint: `ekt.kz` and `www.ekt.kz` map to null; a single valid DNS label such as `nursultan` maps to that lowercase label; nested/unrecognized hosts map to null. It is not a verified city, warehouse or fulfillment mapping. The HTML `lang` hint maps `ru`, `kk` or `en` primary tags to those values; absent, invalid and unsupported tags fall back to `ru`. No navigator language list or page text is read. `current_product_id` is always null, even on catalog pages. No reviewed EKT extraction fixture exists for this task, so numeric URL segments are not treated as product IDs. The final object is checked against the existing page-context schema.

The thin reader accesses `window.location.href` and `document.documentElement.lang` only when called. `prepareChatContext()` reads a fresh context, performs one runtime SESSION_GET, then reads and validates context again. A change in sanitized URL, origin, region, locale or product ID returns `PAGE_CONTEXT_CHANGED` without retry or reset. Query/fragment changes that leave the sanitized fields equal do not count as change. Unavailable context returns `PAGE_CONTEXT_UNAVAILABLE`; unexpected runtime failure becomes the existing safe `RUNTIME_UNAVAILABLE`; mismatched session origin becomes `INVALID_RESPONSE`. No result is cached. This detects changes during preparation only and does not monitor later navigation. The EXT-03 UI does not call it.

EXT-05/06 must consume this service for chat, revalidate sender and context at transport time and define backend session ownership. There is no backend registration, real chat, message history or basket mutation here. Future cart work must keep explicit confirmation separate. RESET does not delete backend data, cancel outstanding requests or revoke cart actions.

## Manual checks — pending

No live browser verification was performed. When a suitable content-script caller is connected:

- [ ] Compare GET across page reload, worker idle restart, extension reload and browser restart.
- [ ] Compare same-origin scopes across tabs and different regional origins within one tab, including return to a prior origin.
- [ ] Verify RESET rotates only one scope and observe GET after an unacknowledged RESET.
- [ ] Inspect storage records for only the four allowed fields and confirm no sensitive page data is present.
- [ ] Check sanitized URL/locale behavior on real EKT pages and a verified product fixture before adding an extractor.
