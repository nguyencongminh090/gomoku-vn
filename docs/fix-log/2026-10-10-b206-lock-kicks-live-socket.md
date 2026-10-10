# 2026-10-10 17:10 — #206 admin lock left the target's live socket connected
## Prompt
"do #Admin" (candidate from the session list: "admin lock doesn't kick live sockets")
## Root cause
`AdminUserService.setLocked` only revoked session rows. A session check runs at connect time, so an already-open socket kept chatting/playing until it dropped by itself. Same layer as the #68 "evicted device just reconnects" lesson, inverted: revoke + disconnect must go together.
## Fix
`AdminUserService.kickLiveSocket` (lazy-requires `socket/state`.sessions, Map<userId, socket>): emit `session:kicked {code:'ACCOUNT_LOCKED'}` then `disconnect(true)`; only on lock (unlock/other users untouched). Client: `socket-client.js` stores `'locked'` vs `'1'` in `gvn_kicked_notice`, `login.js` shows `login.err_account_locked` (was "signed in on another device" — wrong for a lock). Branch `fix/admin-lock-kicks-sockets`, ?v=248. Left alone: room seat/grace handling (normal disconnect path), unlock, avatar/role actions.
## Verification
`admin-users.test.js` (+1: emit-then-disconnect order, others untouched, unlock never kicks, offline target OK; socket/state mocked), `session-kicked-notice.test.js` (3). `npm test` 140 suites / 2698. Real server copy: socket got kicked ACCOUNT_LOCKED + "io server disconnect", other user stayed connected, reconnect with the old cookie → AUTH_INVALID; Chromium tab on /index.html redirected to login.html showing "Tài khoản này đã bị khoá…". Not verified: a locked user mid-game (seat/clock handled by the ordinary disconnect path).
