# 2026-11-27 00:47 — #492 room page: one presence report per edge, no away flash on load (F1, F3)
## Prompt
features/presence-status phase 2 (approved 2026-11-27), PS-7; F3 confirmed by #486.
## Root cause
F1: room.html ran two reporters — room-socket.js (room:presence) and socket-client.js (presence:set) — so every
visibility/focus edge sent 2 events (the 2nd a server no-op). F3: socket-client.js forced presence:set on connect,
before room:join; the handshake carried no room id on a fresh load, so the existingRoom branch and that report
marked a returning member 'away' until room:join → a false away + an extra room:updated.
## Fix
- socket-client.js: room page puts the URL `?id` in the first handshake (`auth.roomId`); `_reportPresence` is a
  no-op on the room page (room-socket.js stays the one reporter, forced after room:joined).
- Server unchanged: its existing `auth.roomId === existingRoom.roomId` check now applies to fresh loads; both
  events still accepted (old cached clients). cache-bust --write.
## Verification
socket-client-connect-options (+3: URL roomId, no roomId elsewhere, no reporter on room page); SocketHandler
#373 table (+3 fresh-load rows); presence-emit-baseline: room-page switch 1 inbound, F3 flipped (0 room:updated),
old-client path kept. npm test 293/5227. NOT verified: real browser (#497).
