# 2026-11-13 — #373 Khán giả showed viewers who were not on the table page
## Prompt
"Khán giả": people not present (left the page without leaving the room) still shown as watching. Want only
people actually on the table page.
## Root cause
Room-member presence was "has any socket": (1) connecting from ANY page (lobby/home) while still a room
member ran SocketHandler's existingRoom path, which reset 'disconnected' → 'active'; (2) every page's
`presence:set` was written onto the room entry, so a visible lobby tab reported 'active'. (3) The client
listed every unseated user and only drew a dot for 'away'/'disconnected' (#157), so even correctly marked
viewers (closed tab → 'disconnected', kept forever per #115) stayed in the list.
## Fix
- `socket.data.roomPageId` marks the room page (room:create/room:join, #367 rejoin, reconnect whose
  `auth.roomId` is that room). RoomHandler onPresence writes the report to the room only from that socket;
  otherwise 'away'. Connect path: non-room page → 'away' (not 'disconnected', which drives host transfer /
  grace / reap). room:join sets the returning member 'active'.
- room-ui `renderUsersList`: guests = unseated && presence 'active' (feeds list, tab, audience stack).
  #157 dots for guests removed (they are no longer listed).
## Verification
Tests: SocketHandler (6-row connect table), room-handler-presence (4 rows), LobbyHandler room:join, client
room-ui-viewer-presence-dot rewritten. No real-browser pass yet.
