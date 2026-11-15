# 2026-11-15 21:06 — #386 Verify #380–#385 together: 2 500 rooms + 500 lobby watchers + reconnect storm + DB routes
## Prompt
"do #386" — N chosen by the owner: 2 500 playing rooms + 500 lobby watchers; slow-routes on both a live-DB copy and vncaro-sim.db.
## Root cause
Verification item, no fix. Each of #380–#384 had only been benched alone.
## Fix
Harness only: `tools/perf/load.js` gained `STORM_AT/STORM_N` (disconnect + reconnect N seated players in one tick; their own
acks counted apart, a stormed socket's move waits client-side), `ROUTES_EVERY_MS` (heavy GETs during play), `GUESTS` (skip
bcrypt), `RTT_OUT`, `WAIT_SIGNAL`. New `tools/perf/mixed.sh` + `mixed-summary.sh` (before/after on a sim-DB copy, 5 shards)
and `lobby-browser-pass.{sh,js}`. Server code untouched.
## Verification
Same machine (8 cores), server on a fresh copy of exports/vncaro-sim.db, 5 000 playing sockets, think 1 s, 60 s window,
1 000-socket storm at 30 s. before = fc19033 (`5aa0468^`), after = dev 29bddf0.

| metric | before | after |
|---|---|---|
| move acks (n) | 133 541 | 134 544 |
| ack p50 / p90 ms | 0.3 / 2.5 | 0.2 / 0.6 |
| ack p99 / p99.9 / max ms | 106 / 404 / 470 | 9.9 / 133 / 158 |
| server ELD max p99 / max ms (window) | 60.8 / 538 | 36.6 / 122 |
| server CPU (one core) / RSS | 46 % / 843 MB | 35 % / 942 MB |
| lobby bytes per watcher | 108 KB/s, max frame 1.2 MB | 1.1 KB/s, max frame 5.3 KB |
| storm: 1 000 sockets all back in (per shard) | 1.1–2.5 s | 0.7–1.8 s |
| errors / connect_errors | 0 / 0 | 0 / 0 |

Polled routes under load (after, max wall): ≤ 60 ms except clubs 232 ms and forum/threads 1 552 ms, each one sample at
the storm (avg 18 / 77 ms); before: friends 1 935, forum 2 136. Alone (`slow-routes.js`, 5 runs) every route stalls the loop
≤ 7.1 ms on the sim DB (91 MB) and ≤ 3.2 ms on a `.backup` copy of the live DB (3 MB, 69 users) — so the outliers are the storm,
not the queries. Residual: the storm still holds the loop 122 ms (ack p99.9 133 ms) → #388.
Browser (Chromium, isolated :3117, page sizes 5/4, 12 seeded rooms, desktop 1280 + phone 390): "Xem thêm (8 bàn nữa)" →
cards 4→8, label "(4 bàn nữa)"; online "13", modal 5 rows + "Đang hiện 5/13 người", search finds a guest off-page;
reconnect mid-game: engine closed → back in 0.8 s, opponent sees it, next move accepted, no overlay, 0 console errors.
Found: the reconnecting player is told "Đối thủ đã kết nối lại" about themselves → #387.
Not verified: real phone / Safari, multi-host network latency (load client on the same machine), prod-sized real DB (none exists).
