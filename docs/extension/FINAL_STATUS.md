# EXT-FINAL demo status

## Working

- Chat opens on EKT pages in Shadow DOM and sends sanitized requests through the background service to the configured FastAPI origin.
- Catalog replies, product cards, safe links, unknown stock, and session handling remain available with both the merged legacy chat response and the preferred canonical response.
- The latest-message control occupies its own row in the message area, appears only after scrolling meaningfully away, and scrolls back to the newest message. The composer remains outside the scrolling area. The panel retains its narrow viewport width rule.
- Loading, safe backend errors, draft retention after failure, duplicate submit prevention, empty state, accessible button labels, and image fallback remain implemented.

## Cart: blocked by backend contract

The merged `/api/v1/chat` currently always returns `cart_proposal: null`. `POST /api/v1/cart-actions` and `/{action_id}/validate` exist, but validation returns `action_id`, `product_id`, `quantity`, and `status` without backend-approved `kratnost`. There is no `/{action_id}/result` endpoint. The extension cannot infer the missing `kratnost` or safely send `add2basket`, so it shows only the existing unavailable notice when a non-null proposal is received. No EKT basket request or cart confirmation UI is enabled.

## Files: blocked by backend endpoint

`backend/app/api/files.py` is empty and `backend/app/main.py` does not mount a files router. The attachment UI remains hidden, and chat sends an empty `attachment_ids` array. The extension does not fake upload IDs or send files to EKT.

## Remaining backend blockers

- Connect a reviewed chat proposal contract to `/api/v1/chat` and return backend-approved mutation data, including `kratnost`, from immediate validation before enabling the cart flow. Define a result-reporting endpoint as required by the extension cart safety rules.
- Implement and mount a file upload endpoint with an attachment ID contract before enabling PDF, DOCX, XLSX, JPEG, or PNG selection and upload.
- Review live backend access control and authentication before deployment. No live backend or browser verification has been performed for this task.
