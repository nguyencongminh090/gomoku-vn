# B497 — Presence: real-browser pass, 2 players + 1 spectator (PS-12)
**Status:** ✅ DONE 2026-11-27 — isolated server :3101 with GOMOKU_DB_PATH in the scratchpad (real DB checksum unchanged); Chromium 1243, 4 members: An + Binh play rated per_game 10 min, Chi spectates, Dung (An's friend) on social.html. Measured (server knows → screen): tab hidden → A 109 ms / C 116 ms (half amber); back → 111 ms; An hidden → friend label "Đang chơi, tạm rời trang" 7.9 s (10 s poll); network loss → detected 33 s (engine.io ping), game stays ongoing, red gap ring; back online → "Đang chơi" 2.4 s (after fix, see fix-log #497); tab close on Binh's turn → seat red 160 ms, abandonment loss at 60.07 s, rated (+162), abandonment_events + game_presence rows written. Screenshots: scratchpad e2e/shots (01-06). Found + fixed: resume path did not mark the room page. Not verified: real phone (lock screen, call, frozen tab); the hidden tab is simulated (document.hidden override). Noted, not fixed: social profile pane avatar badge does not refresh on the 10 s poll (pre-existing).
**Area:** scripts / Playwright (playwright-e2e-safety)
**From:** features/presence-status (success criteria), 2026-11-27   **Depends:** #489-#496
## Scope
1. Tab switch, tab close, network loss (setOffline); screenshots of every surface showing the same label.
## Done when
- Screenshots + timings vs planning §2h targets; real DB untouched.
