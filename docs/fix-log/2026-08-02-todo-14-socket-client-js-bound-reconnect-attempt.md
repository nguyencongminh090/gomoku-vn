# Fix log entry — 2026-08-02 04:17

## Prompt

TODO #14: `socket-client.js` bound `reconnect_attempt` (status banner) and `reconnect` on `this.socket`, but Socket.io v4 emits those events on the Manager (`this.socket.io`), not on the Socket — so both listeners never fired. Visible effect: the status banner got stuck on "Mất kết nối. Đang thử kết nối lại..." forever instead of advancing to "Kết nối lại... (lần N)", and never showed the reconnect-success clear either, since `reconnect` also never fired (though `connect` re-firing on reconnection happened to hide the banner anyway, masking half the bug). Found while working the item after #13; the same file already had one correctly-targeted `this.socket.io.on('reconnect_attempt', ...)` listener from the restart-hang fix's correction, added right next to the two broken ones — that contrast is what the item flags.

## Action

Moved both listeners onto `this.socket.io` in [client/js/socket-client.js](client/js/socket-client.js#L57-L69), and merged the status-banner update and the reconnect auth-flag set into the single `reconnect_attempt` handler on the Manager (they were duplicate listeners for the same event, one broken and one working). Bumped `?v=32` → `?v=33`.

## Decision

No behavior change to the auth-flag half (it already worked); only the status-banner half moves. Kept both concerns in one handler rather than two separate `socket.io.on('reconnect_attempt', ...)` registrations, since they now target the same object for the same event and there is no reason to split them.

## Summary output

`npm test`: 280/280 passing, unaffected (this file has no Jest coverage — client-side wiring). **New Playwright e2e test** [e2e/reconnect-banner.spec.ts](e2e/reconnect-banner.spec.ts): logs in as a guest, forces `context.setOffline(true)` on a real browser tab against the real server, and asserts the banner text advances from "Mất kết nối..." to "Kết nối lại... (lần N)", then clears once `setOffline(false)` lets it reconnect. **Mutation-checked by construction**: ran this test against the pre-fix source first — it failed exactly as predicted (banner stuck on "Mất kết nối...", the "Kết nối lại... (lần N)" assertion times out), then passed once the fix was restored. Also fixed a pre-existing, unrelated bug this test exposed: [playwright.config.ts](playwright.config.ts) had `baseURL` commented out, so every e2e test using a relative `page.goto()` — including the already-committed `e2e/homepage.spec.ts` — failed with "Cannot navigate to invalid URL"; set it to `http://localhost:3000` (overridable via `PLAYWRIGHT_BASE_URL`). Confirmed `homepage.spec.ts` now passes too. Full run takes ~50s, dominated by Socket.io's default 25s ping-interval + 20s ping-timeout before a dropped connection is detected client-side — not the fix itself.
