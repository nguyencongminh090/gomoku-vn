# 2026-11-16 09:30 — #397 Move-ack tail under load: closed as noise (storm-second only), no code change
## Prompt
"đánh giá #397 có đáng làm không" → "đóng 397 commit to dev".
## Root cause
No regression. The 18–32 ms p99 in B397 came from single runs; same code spreads 5.5–19.6 ms run to run. Slow acks cluster
in the storm second (29.9–30.3 s into the window) plus a few at ~1 s warm-up; outside it acks are sub-ms (p90 0.3–1.1 ms).
Storm-second cost = ws writes (`writevGeneric`) + socket.io encode for 1 000 simultaneous reconnects (profile, fix-log 396/398);
app per-socket work already cut by #396/#398.
## Fix
None. Remaining lever = client reconnect jitter (UX trade-off: slower rejoin; #398 "Don't") — not recorded, owner did not ask.
## Verification
Reused the six `mixed.sh` runs from #398 (2 500 rooms, 500 watchers, 1k storm, LOG_LEVEL=warn), all post-#396:

| code | ack p99 (3 runs) | median | ack max (3 runs) | median |
|---|---|---|---|---|
| dev 384f946 | 19.6 / 5.5 / 13.3 | 13.3 | 229 / 161 / 202 | 202 |
| after #398 | 11.8 / 5.5 / 6.1 | 6.1 | 196 / 137 / 186 | 186 |

Medians at or below #386's 9.9 ms p99. Not run: LOG_LEVEL=info variant (B397 trap) — owner closed without it.
