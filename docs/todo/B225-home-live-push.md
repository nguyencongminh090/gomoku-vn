# B225 — Dashboard realtime: pub/sub push replaces the 20 s poll (part 1 of the socket-transfer work)
**Area:** client/js/lobby-home.js, server/socket/state.js, server/socket/handlers/MatchHandler.js, room-state transitions (RoomManager/handlers), server/routes/home.js
**From:** user 2026-10-12 — "số người online, ván chơi có vẻ không realtime và phụ thuộc vào refresh" · "server phát đi một event… chỉ cho những người đang ở dashboard? theo kiểu delta broadcast"   **Depends:** #223 (stats strip + text rows)
**Design:** approved by user 2026-10-12, to be reviewed in detail when implementing.
**Status:** ✅ DONE 2026-10-12 — `server/socket/home-feed.js` (room `home`, 1.5 s coalesced absolute `home:stats`, `home:live` only when the set of playing rooms changes); poll 60 s; resubscribe+refetch on reconnect / tab visible; `?v=307`. Real browser, 2 users + raw-socket guest: every change on A in 1.2–1.6 s, 0 refetches; SIGKILL restart → resync 2.2 s. Origin: socket handshake already refuses cross-site (`AUTH_ORIGIN`), payload is public anyway. Not run live: `home:live` on a real game start (unit-tested). Found: #227.

## Problem
`#screen-home` polls `/api/home` every 20 s and skips while the tab is hidden → other clients see a new online user / game 0–20 s late (avg ~10 s). Part 2 is B226 (whole-codebase audit).
## Scope
1. Pub/sub on a socket.io room `home`: client emits `home:subscribe` on entering the home screen, `home:unsubscribe` on leaving; server replies to subscribe with the full snapshot.
2. `home:stats` carries the whole `{online, playing, searching}` snapshot (3 ints, absolute values — not +1/-1), coalesced to ≤ 1 per ~1.5 s (same debounce idea as `broadcastOnlineUsers`) and only when a value changed. Compute once, emit to the room.
3. Live list: push add/remove only on game start/end; move count and viewers stay on the slow poll.
4. Poll becomes a ~60 s fallback; refetch `/api/home` on socket reconnect.
5. Tests: backend (subscribe → snapshot, change → one coalesced emit, unsubscribe/disconnect → no emit) + jsdom + real-browser with 2 clients.
## Don't
- No delta counters (a missed event would drift forever). No per-move broadcasts to `home`. No user ids in payloads (names only, as `/api/home`).
- Don't touch board.js / room clock code.
## Traps
- Forgotten unsubscribe leaks subscribers: also leave the room on disconnect and when the screen hides.
- Check `Origin`/CORS on the socket handshake — unverified for the current config.
- In-process only: multi-instance would need the socket.io Redis adapter (out of scope).
## Why this way
Observer/pub-sub with absolute snapshots: `SKILLS_TREE/knowledge/software-design/items/pattern-observer.md`, `software-architecture/items/style-event-driven.md`, `dist-messaging-patterns.md`, `web-development/items/be-realtime.md` (SSE rejected: socket.io + rooms already in the stack). Coalescing/Redis adapter: no library note.
## Done when
- Second browser sees the count change in ≤ 2 s without refresh; reconnect resyncs; `?v=` bumped; tests above green.
