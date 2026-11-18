# B422 — Back pressed mid-game: auto-return the player to the room
**Status:** ✅ DONE 2026-11-18 — server + jsdom tests, real-browser pass (Chromium); real-phone check open
**Area:** server/socket/SocketHandler.js, server/socket/handlers/DisconnectHandler.js, client/js/socket-client.js
**From:** user 2026-11-18 "User press Back while playing could move out room… auto reconnect them to room"

## Problem
Back on room.html mid-game → room socket drops (in-game grace starts) → index.html connects →
`cancelDisconnectGrace` resumed the game on that socket (clock running, opponent told "reconnected"),
so the `existingRoom` branch never sent `room:joined` → lobby.js never redirected. Player stuck on home.
## Scope
1. Handshake `auth.roomPage` (true only on /room.html) from socket-client.js.
2. Server: `roomPage === false` + pending in-game grace → don't resume; fall through to `room:joined`
   (lobby.js redirects); presence stays `disconnected`.
3. handleDisconnect: a socket closing while its user is already in this room's grace keeps the running
   window (no restart / re-interrupt / grace extension).
## Don't
- Don't change behaviour for clients without the flag (undefined → old resume path).
## Traps
- A fresh room.html load has no `auth.roomId` at handshake — page identity must come from the URL path.
- Pages without a socket (social.html, profile…) can't be told: Back from a room entered via a
  challenge/notification link to such a page still loses the game after the grace. Open follow-up.
## Done when
- Back → index.html → room.html automatically, game resumes; tests kept.
