# Fix log entry — 2026-08-08 08:48

## Prompt

"Do #65" — TODO.md #65 / instruction.md B65: CSP was fully disabled
(`helmet({ contentSecurityPolicy: false })`) and every shipped page loaded a
non-pinned executable script from `https://unpkg.com/@phosphor-icons/web`.
Both let third-party or injected script run in-origin and read
`localStorage.gvn_token` (a 7-day JWT bearer also accepted at the Socket.IO
handshake).

## Action

Eliminated every source of inline/remote script the app actually had, then
enabled CSP enforce — rather than reaching for `'unsafe-inline'` or a nonce
scheme neither of which the finding's own instruction allowed for script:

- **Self-hosted Phosphor Icons.** `npm pack @phosphor-icons/web@2.1.2`,
  copied only the two weights the codebase actually uses (`class="ph"` /
  `class="ph-bold"` — checked via grep, the other four weights were never
  referenced) into `client/vendor/phosphor/{regular,bold}/`, dropped the
  legacy SVG font format. The `<script src="https://unpkg.com/...">` tag on
  all 6 shipped pages became two local `<link rel="stylesheet">` tags.
- **Externalized every inline `<script>`.** The theme/UI-mode pre-paint IIFEs
  (identical blocks copy-pasted across `index/login/room/history/tournament/
  tournament-match.html`) moved to `client/js/theme-preload.js`,
  `ui-mode-preload.js`, `online-panel-preload.js`.
- **Replaced every inline `onclick="fn(...)"` with delegated dispatch.**
  Helmet's CSP `script-src-attr` (inline event-handler attributes) inherits
  `script-src` when unset, so the 27 `onclick=` call sites across
  `game-ui.js`, `room-ui.js`, `history.js`, `lobby.js`, `login.html`, and
  `room.html` would also have broken under a strict `script-src`. Converted
  them to `data-action`/`data-arg` attributes plus one new delegated click
  listener, `client/js/action-delegate.js`, that calls the same
  already-`window`-exposed handler functions the onclick attributes used to
  call directly — no behavior change, just where the wiring lives. Dropped
  the now-dead `escapeJsString` local aliases in `lobby.js`/`room-ui.js`
  (the JS-string-literal escaping they existed for no longer has a call
  site; the function itself stays in `escape-utils.js`, still tested, as the
  correct tool if an inline-handler pattern is ever reintroduced).
- **Enabled CSP enforce.** `server/index.js` now calls
  `helmet({ contentSecurityPolicy: { directives: cspDirectives } })`, with
  the directives pulled into `server/config/csp.js` so the policy is
  unit-testable without booting the server/DB. `script-src 'self'` only (no
  `unsafe-inline`/`unsafe-eval`, no remote origin), `script-src-attr 'none'`,
  `style-src` keeps `'unsafe-inline'` deliberately (many pre-existing
  `style=""` attributes, no JS-execution risk — documented in the file),
  `font-src`/`media-src` allow-list only Google Fonts and the two audio CDN
  hosts (`cdn.freesound.org`, `raw.githubusercontent.com`) actually used by
  `audio-manager.js`, `object-src 'none'`, `base-uri`/`form-action`/
  `frame-ancestors 'self'`.
- Bumped `?v=77` → `?v=78` across every `client/*.html` and every
  `import '...?v=N'` in `client/js/*.js` (mockups excluded per existing
  convention) — verified with the single-value grep check from CLAUDE.md.

## Decision

`fix/csp-third-party-script` branches off **`dev`**, not `main`: the fix
touches `client/tournament.html`/`tournament-match.html`, which don't exist
on `main` at all (still-unmerged tournament feature work), so the fix
inherently spans dev-only files — same exception CLAUDE.md documents for
`fix/tournament-match-board-size`. `main` does have the same underlying bug
(`contentSecurityPolicy: false`, unpkg script) and will need this same fix
applied in whatever commit next merges `dev` into `main` (or a follow-up
cherry-pick) — not done here to avoid diverging a fix branch's target from
where its files actually live.

No nonce infrastructure was added: `client/*.html` are static files served
by `express.static`, not rendered per-request, so a nonce (which must be
freshly generated and injected into both the header and the markup on every
response) isn't achievable without switching to server-side templating —
out of scope for this finding. Eliminating every inline/remote script
instead made nonces unnecessary.

## Summary output

- `npm test`: 850/850 passed (844 existing + 6 new in `server/tests/csp.test.js`).
- Manual Playwright verification against a real browser, following the
  Playwright/db-safety protocol (moved `gomoku.db` aside before starting
  `node server/index.js`, ran against the fresh throwaway db it created,
  stopped the server, restored the real db afterward — verified by file size
  match, 188416 bytes, and a 3-row `users` count matching pre-move state):
  - `login.html`: guest login, tab switch (Đăng nhập/Đăng ký), password-show
    toggle — all now wired via `data-action`, all worked, 0 console
    errors/warnings, 0 failed requests.
  - `index.html` (lobby): guest session, tab switch (Bàn chơi/Giải đấu),
    create-room modal → `room.html` navigation, sit down at a seat
    (`data-action="sitDown"`) — 0 console errors.
  - `history.html`, `tournament.html`: loaded clean, 0 console errors.
  - `Content-Security-Policy` header present and enforcing on every response
    (verified via `curl -I`); self-hosted Phosphor assets served 200 and
    rendered correctly (screenshot-verified: eye/guest/arrow icons on
    login, grid/trophy/history/plus-circle/gear icons in the lobby).
  - Did not separately stress-test a deliberately-injected/blocked script,
    since eliminating every script source made that scenario untestable in
    the normal app flow — covered instead by the `server/tests/csp.test.js`
    assertions on the policy data itself (no wildcard, no unpkg/jsdelivr, no
    `unsafe-inline`/`unsafe-eval` in `script-src`).
- Branch: `fix/csp-third-party-script` off `dev`, merged back to `dev`.
