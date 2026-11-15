# B381 — Online list: full snapshot to every lobby subscriber
**Status:** ✅ FIXED 2026-11-15 — first page (50) + total + on-demand query; 1 088 KB → 5.5 KB at 10 000 online; browser pass done (Chromium). Uncommitted on fix/381-online-list-paging. OPEN FOLLOW-UP: friends listed first (needs per-friend presence push) — not built.
**Area:** `server/socket/state.js` (`sendOnlineSnapshot`, `getOnlineUsersList`, `_diffOnlineUsers`), `server/socket/handlers/LobbyHandler.js`, `client/js/lobby*.js`
**From:** perf review 2026-11-15   **Depends:** —

## Problem
`lobby:subscribe` sends every visibly-online user (id, name, guest flag, avatar URL; one DB get each, `localeCompare` sort).
Measured: 1.1 MB / 7 ms at 10 000 online, 11 MB / 65 ms at 100 000 — per lobby open. The debounced diff re-builds the same list every 1.5 s.

## Scope
1. Decide the lobby contract (design choice, ask user): count + friends + first page, rest on demand (search / scroll).
2. Server: paged/filtered snapshot, patch only for what a client was sent.
3. Client lobby list + DM/challenge pickers that read the online list.

## Don't
- Don't change presence rules (#372) or hidden-online (#199).

## Traps
- #187/#230: a user who joins and leaves inside one debounce window must still be removed for sockets that saw them.
- Pickers (#222, #361) read the same list — one source (consistency rule).

## Why this way
Payload is O(online) per subscriber → O(n²) bytes site-wide. Note: `docs/knowledge/broadcast-fanout-perf.md` rule 7.

## Done when
- Snapshot bytes at 10 000 online ≤ a fixed page size; jsdom + server tests; browser pass on lobby.
