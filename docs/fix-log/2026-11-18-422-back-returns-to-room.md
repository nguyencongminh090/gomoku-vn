# 2026-11-18 — #422 Back mid-game returns to the room
## Prompt
"User press Back (from browser) while playing could move out room. I would like to auto reconnect them to room."
## Root cause
On connect, `cancelDisconnectGrace` ran for every socket regardless of page. The lobby page that Back
landed on resumed the game (opponent's clock running, `game:resumed` sent) and skipped the
`existingRoom` branch — the only one emitting `room:joined`, which lobby.js uses to redirect. Repro'd on
the old server in Chromium: A stuck on /index.html for 15 s while B got `game:resumed`.
## Fix
- socket-client.js: `auth.roomPage = SocketClient.isRoomPage(location.pathname)`.
- SocketHandler: `roomPage === false` + pending grace → skip resume, fall through to `room:joined`;
  presence left `disconnected`.
- DisconnectHandler.handleDisconnect: same-room grace already pending → keep it (old test "replaces the
  stale timer" rewritten: a page bounce must not restart/extend the grace or re-interrupt).
## Verification
- SocketHandler.test.js (+5: lobby fresh/reconnect bounced; room page fresh/reconnect + old client resume),
  DisconnectHandler.test.js (1 rewritten), socket-client tests (+8 isRoomPage, 3 auth asserts updated).
  New tests fail on the old server code. Full npm test 4401 green.
- Real Chromium, own DB on :3101: Back → /index.html → /room.html in ~80 ms; B saw interrupted → resumed.
- Unverified: real phone (iOS Safari bfcache), pages without a socket (see B422 Traps).
