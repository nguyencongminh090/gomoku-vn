# Fix log entry — 2026-08-02 21:20

## Prompt

TODO.md #30 (flagged in the previous entry, not yet fixed): under Cloudflare Tunnel, `socket.handshake.address` (used for `MAX_ROOMS_PER_IP`'s `creatorIp`) always resolves to loopback since engine.io reads `req.connection.remoteAddress` directly and never `X-Forwarded-For` — meaning the 3-room-per-IP quota was effectively a 3-room-per-site quota for every real user behind the tunnel. Previously left unfixed pending confirmation of the deployment topology (this was originally TODO Phần A #1, "cannot fix by code" — the exact proxy and hop count were unknown). The user has since confirmed Cloudflare Tunnel, one hop, over loopback.

## Action

Added `getClientIp(socket)` to [server/socket/state.js](server/socket/state.js), mirroring the `trust proxy: 'loopback'` semantics already applied on the Express side: only reads `X-Forwarded-For` when `socket.handshake.address` is itself a loopback address, otherwise falls back to the raw address unchanged. [LobbyHandler.js](server/socket/handlers/LobbyHandler.js) now calls this instead of reading `socket.handshake.address` directly for `room:create`'s `creatorIp`.

## Decision

Implemented as a socket-layer counterpart to the trust-proxy fix rather than trying to make engine.io itself proxy-aware (no such option exists) — kept the loopback-only trust condition from that fix for the same reason: it prevents a client that could reach the port directly (bypassing the tunnel) from spoofing `X-Forwarded-For` to dodge the quota.

## Summary output

`npm test`: 298/298 passing (3 new tests in `server/tests/LobbyHandler.test.js`, mocking `state`'s `getClientIp` via `jest.requireActual` rather than reimplementing its logic, so the tests exercise the real function). Mutation-checked: reverting `state.js` alone failed all 3 new tests plus 3 pre-existing ones that assert on the `ip` field, restoring it passed all 6 again.
