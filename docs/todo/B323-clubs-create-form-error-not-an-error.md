# B323 — Create-club form: duplicate-name error looks like a note and is not tied to the field
**Status:** ✅ FIXED 2026-10-22 (real-browser pass 414/375/320 + jsdom; rank-badge wrap case unseen)
**Area:** client/clubs.html:51 (`#cl-form-msg`), client/js/clubs.js:99-100 (`create`), client/css/platform.css `.pnote`
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
409 "Tên CLB đã được dùng." appears as grey `.pnote` text beside the submit button; `#cl-name` is not marked invalid, focus stays on the button, region is `role=status` (`clubs-mobile-B8-duplicate.png`).
## Scope
1. On error: `#cl-name` gets `aria-invalid="true"` and `aria-describedby="cl-form-msg"`, focus moves to it; clear both on next input/submit.
2. Style the message with `--c-error` plus a leading icon (not colour alone); use `role="alert"` for this message.
3. jsdom test: error code → attributes + focus; success path untouched.
## Don't
- Do not change server error codes/texts; keep native `required` validation.
## Traps
- `.pnote` is shared by many pages: add a modifier class for the error, do not recolour `.pnote`.
## Why this way
Standard inline-error pattern (field-adjacent, programmatic association). Knowledge: `docs/knowledge/ui-ux/INDEX.md` (forms/a11y).
## Done when
- Duplicate name: message red + icon, field marked, focus on it (screenshot).
- New jsdom test + `npm test` green; cache-bust OK.
