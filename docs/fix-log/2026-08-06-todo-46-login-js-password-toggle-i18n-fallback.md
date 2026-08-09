# Fix log entry — 2026-08-06 15:42

## Prompt
User: "do #46" — referring to `TODO.md` Phần B #46 (`docs/todo/B46-login-js-nut-an-hien-mat-khau-fallback-hardcode-tieng.md`).

## Action
`client/js/login.js`'s `togglePassword()` set `aria-label` via
`t('login.hide_password') || 'Ẩn mật khẩu'` / `t('login.show_password') || 'Hiện mật khẩu'`.
The keys `login.hide_password`/`login.show_password` did not exist in
`TRANSLATIONS.vi`/`TRANSLATIONS.en` in `client/js/i18n.js`. `t(key)` returns the raw key
string for a missing key, which is truthy, so the `|| '...'` fallback never ran — the
`aria-label` was always the literal string `"login.hide_password"`/`"login.show_password"`
in both languages, not the intended Vietnamese fallback.

Fix:
- Added real `login.hide_password`/`login.show_password` keys to both `vi` ("Ẩn mật khẩu"/
  "Hiện mật khẩu") and `en` ("Hide password"/"Show password") blocks in `client/js/i18n.js`.
- Removed the dead `|| '...'` hardcode fallback in `client/js/login.js`, now `t('login.hide_password')`
  and `t('login.show_password')` directly.
- Bumped the shared `?v=` cache-busting version from 62 to 63 across all `client/*.html` and
  `client/js/*-entry.js`/`tournaments.js` import references, per the CLAUDE.md cache-busting rule
  (touched `client/js/i18n.js` and `client/js/login.js`).

## Decision
No matching `instruction.md` entry exists for #46 (checked via grep) — per the "Bug-fix workflow"
rule, that's expected when a task has no extra reviewer guidance beyond `TODO.md`.

No unit test written: this is client-side (`client/js/`), which per CLAUDE.md's "Bug-fix workflow"
rule has no test infrastructure runnable via `npm test` (Jest covers `server/tests/**` only) — stated
explicitly rather than skipped silently.

## Summary output
Fixed `login.js`'s password-toggle button `aria-label` always rendering the raw i18n key
(`"login.hide_password"`/`"login.show_password"`) instead of translated text, by adding the missing
i18n keys and removing the now-dead hardcoded-Vietnamese fallback. `?v=` cache version bumped 62 → 63.
