# 2026-11-27 00:22 — #487 presence core + per-tab heartbeats (F2 flicker)
## Prompt
features/presence-status phase 2, approved 2026-11-27: "Approve at all." — PS-2 server model with tests.
## Root cause
F2: `state.heartbeats` kept ONE beat per user; the shell posts from every socket-less tab, so a hidden tab's
single 'away' edge overwrote a visible tab's 'active' until its next 20 s tick → user listed offline ≤ 20 s.
Status was also derived in 11 places (planning §1c).
## Fix
- `server/presence/presence-core.js` (pure): userConn/isPresent/hasPresentSocket/isVisiblyOnline, memberAt/
  isGhostViewer/isConnectedMember, activityOf (playing incl. interrupted, tournament, searching), project(audience).
- `server/presence/index.js` adapter: statusOf/graceUntil/hasSocket/canPushLive; hooks for queue + tournament.
- state.js predicates delegate to the core; heartbeats = userId → {user, tabs: Map}; legacy {at,away} still read;
  ≤ 16 tab slots per member. routes/presence.js accepts `tab` (/^[A-Za-z0-9_-]{1,32}$/), else shared slot.
- platform-shell.js sends a per-tab id (sessionStorage); cache-bust --write (18 files).
- D6/D7 hooks, D10 ghost-viewer checks (RoomManager, DisconnectHandler, routes/home.js) read the core.
- Grace entries carry `until` (countdown source). Wire payloads unchanged (that is #488).
- Branch feature/486-presence-status.
## Verification
New: presence-core.test.js (pure rows), presence-transitions.test.js (U/M rows through real stores),
presence-route tab test, platform-shell beat tab assertion. Mutation: single-slot beat → F2 test fails.
npm test 292 suites / 5184+ pass. NOT verified: real browser (PS-12, #497).
