# 2026-11-15 19:44 — #383 findSocketsByUserId reads a userId index instead of scanning every socket
## Prompt
Perf review item (ghi todo, làm tiếp từ #380): "disconnect / kick scans all sockets" — owner later: "Hoàn thiện bench test của 383 và 384."
## Root cause
`findSocketsByUserId` (`server/socket/state.js`) iterated `io.sockets.sockets` on every disconnect / kick: O(connected sockets) per call, O(n²) in a mass drop. `sessions` is not a substitute — it holds only the newest socket, and DisconnectHandler asks "any OTHER live socket?" (the draining old one counts, #367).
## Fix
- `state.js`: `_userSockets` Map<userId, Set<socket>>; `trackSocket` / `untrackSocket`; `findSocketsByUserId(_io, userId, excludeId)` reads the set (fresh array, signature unchanged, call sites untouched).
- `SocketHandler.js`: `trackSocket(socket)` after auth, `untrackSocket` in the socket's own `disconnect`. Eviction / grace semantics untouched.
- `server/scripts/bench-socket-index.js`: scan vs index bench. Branch `fix/383-socket-user-index` (off dev). No `client/` edit, no `?v=` bump.
## Verification
- `state-socket-index.test.js` (lookup never touches `io.sockets.sockets`; two-socket case; exclude id; untrack) + 1 case in `SocketHandler.test.js`.
- `npm test`: 228 suites / 4000 tests pass (with #384 working tree).
- Bench, 1 000 lookups over 10 000 sockets: scan 146–197 ms (150–200 µs/call) → index 0.4–0.5 ms (0.4 µs/call), ×300–440. 100 over 1 000 sockets: 91.5 → 1.2 µs, ×78.
- NOT verified: real-server reconnect storm (`tools/perf`), real-browser reconnect pass.
