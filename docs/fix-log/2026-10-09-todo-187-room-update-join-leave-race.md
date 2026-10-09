# 2026-10-09 15:54 — #187 two host badges: removal lost when a user leaves inside a joiner's debounce window
## Prompt
"okay #187"
## Root cause
App bug in the room:updated delta (`server/socket/state.js`), not a spec race. A joiner's user list comes from
`room:joined` (full state), and later changes arrive as deltas diffed against the last *broadcast* snapshot.
The join's broadcast is debounced 80 ms. If the host leaves inside that window, the snapshot never contained the
host, so the flush sent `upserts:[joiner as host]`, `removed:[]`. The joiner kept the host's stale entry
(`role:'host'`), which showed as two "CP" badges. The test hit it when its leave click followed the join quickly enough (~1 in 5 full runs).
## Fix
`broadcastRoomUpdate` records every userId in `room.users` at each call in the debounce window
(`seenUserIds`). `_diffRoomUsers` treats `previous ∪ seen − current` as `removed`. Removing an id a client
never held is already a no-op on the client. Upserts, debounce and payload shape are unchanged. Server-only, no `?v`.
Branch `fix/187-two-host-badges` off dev.
## Verification
`room-update-delta.test.js`: +2 cases (the first fails on the old code: removed [] vs ['host-1']). `npm test` 1932 green.
New `e2e/room-update-join-leave-race.spec.ts` forces the timing (host emits room:leave on the join chat message).
Old code: 3/3 failed with two hosts in B's list. Fixed: 5/5 green. `room-lifecycle.spec.ts` x10: 20/20.
Real DB restored, checksum OK. Not verified: full e2e suite; other full-state paths (reconnect `room:joined`)
reasoned about but not tested for the same race.
