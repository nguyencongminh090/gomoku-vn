# Fix log entry — 2026-08-10 12:35

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #97.

## Action

`server/routes/auth.js`'s new-account branch used
`isValidDisplayName(payload.name) ? payload.name.trim() : generateGuestName()`.
`isValidDisplayName()` rejects a name outright if it contains any of
`<>&"'` or a control character — right for the register form, where a human
typed the name and can fix it, but Google profile names are not something the
user can "fix": common real names (`O'Brien`, `Marks & Co`) were silently
replaced with an unrelated random guest name on first login, with no
indication why.

Added `sanitizeOAuthDisplayName(name)`, used only in the OAuth branch: strips
`DISPLAY_NAME_FORBIDDEN` characters instead of rejecting on their presence,
trims, then re-validates the remaining length (2-24 chars); only falls back
to `generateGuestName()` if nothing usable survives the strip.
`isValidDisplayName()` itself is untouched — the register form keeps its
reject-and-tell-the-user behavior, which is still correct there.

## Decision

Followed `docs/instruction/B97-*.md`: read every call site of
`isValidDisplayName()` first (only `/register` and the OAuth branch) before
deciding to add a separate function rather than changing the shared one's
behavior, so the register form's validation semantics are unaffected. Did
not loosen what characters can reach the DB/UI — strip, not allow-through;
XSS defense-in-depth is unchanged.

**Test coverage:** 4 new tests in `server/tests/auth-google-oauth.test.js` —
`O'Brien`, `Marks & Co`, `"Quoted" Name` (data-driven via `test.each`) each
sanitized and kept, plus a name that is ONLY forbidden characters still
falling back to a generated name. `npm test`: 46 suites / 1043 tests passing.

## Summary output

- `server/routes/auth.js`: added `sanitizeOAuthDisplayName()`; the OAuth
  new-account branch calls it instead of `isValidDisplayName()`.
- `server/tests/auth-google-oauth.test.js`: +4 tests.
- `docs/todo/B97-*.md` marked done; `TODO.md` #97 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-display-name-sanitize`, off `dev` and merging back to
  `dev` (OAuth code only exists on `dev`).
