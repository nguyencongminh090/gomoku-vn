# 2026-11-22 14:02 — #435 Silently dead socket: liveness probe + chat ack/retry
## Prompt
"sau một thời gian, tôi bị lag (thời gian của người đang chơi về 0:00 + nhắn tin nhưng ko thấy tin nhắn của mình). Sau đó, tôi refresh … nhắn tin và hiện ngay lập tức."
## Root cause
Transport layer: a silently dead TCP path keeps the socket `connected`; engine.io notices only at
pingInterval + pingTimeout (~39–45 s). Chat was fire-and-forget `emit` → written into the dead transport, never
buffered/resent. Trap found on the way: SocketHandler `wrappedOn` coerces a non-object FIRST arg to {} — a bare
ack fn included — so an event sent as `emit(ev, cb)` never gets its ack (left alone; probe sends `{}`).
## Fix
- client/js/socket-client.js `_bindLiveness/_probeLiveness`: acked `net:ping` every 4 s (visible tab, one in
  flight), 6 s deadline; miss → `engine.close()` so the SAME Manager reconnects (no 2nd socket); visible → probe now.
- server/socket/SocketHandler.js: `net:ping` ack-only handler.
- client/js/room.js `sendChatReliably`: `emitAck` with cid, resend same cid when (re)connected, 3 misses →
  "⚠ room.chat_not_sent" line. server/socket/handlers/ChatHandler.js: ack every chat, drop repeated cid per user
  (20/user, 5000 users LRU). i18n `room.chat_not_sent` vi/en. Server ping settings and /diag untouched.
- Branch fix/435-dead-socket-liveness (uncommitted). `?v=` via cache-bust --write.
## Verification
- Tests: client/tests/socket-client-liveness.test.js (10), client/tests/room-chat-ack-retry.test.js (6),
  server/tests/chat-ack-dedupe.test.js (10), SocketHandler.test.js +2 (net:ping ack; bare-ack trap);
  room-profanity-lazy updated to emitAck. Full `npm test` 268 suites green.
- Lab (bhproxy blackhole, viewer page, Chromium): before ping timeout 38.8 s → reconnect 39.9 s, own chat lost;
  after forced close 7.8 s → connect 8.7–9.3 s, own chat delivered once at 9.3 s; no false reconnects over 30 s.
- NOT verified: prod share of `ping timeout` disconnects (SSH log read was not permitted this session); real
  phone; others' chat broadcast during the dead window (~8 s) is still lost (not in scope).
