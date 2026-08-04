# UX audit fix log

| Timestamp | Summary | Detail |
|---|---|---|
| 2026-08-01 22:30 | Backend fix #1 (security review 2026-08-01): JWT dev secret still usable outside production — the gu… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-1-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #2 (security review 2026-08-01): games involving a guest player were not being saved at … | [chi tiết](docs/fix-log/2026-08-01-backend-fix-2-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #3 (security review 2026-08-01): handleGameEnd persisted a game row to SQLite even when … | [chi tiết](docs/fix-log/2026-08-01-backend-fix-3-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #4 (security review 2026-08-01): a player disconnecting mid-game could be scored a timeo… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-4-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #6 (security review 2026-08-01): kicking a mid-game player during their disconnect grace… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-6-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #7 (security review 2026-08-01): the socket flood-protection middleware in SocketHandler… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-7-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #8 (security review 2026-08-01): the server shipped with zero HTTP security headers — me… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-8-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #9 (security review 2026-08-01): npm test was red on main — DisconnectHandler.test.js's … | [chi tiết](docs/fix-log/2026-08-01-backend-fix-9-security-review-2026-08-01.md) |
| 2026-08-01 22:30 | Backend fix #12-partial (security review 2026-08-01): broadcastLobbyUpdate in state.js:54-56 sent th… | [chi tiết](docs/fix-log/2026-08-01-backend-fix-12-partial-security-review-2026-08.md) |
| 2026-08-01 22:30 | Fix #1: lobby room list is over-dense on desktop and breaks down on mobile — 6-column .room-table wr… | [chi tiết](docs/fix-log/2026-08-01-fix-1-lobby-room-list-is-over-dense.md) |
| 2026-08-01 22:30 | Fix #2: room settings tab mixes three audiences with no visual separation — as host, 9 field-groups … | [chi tiết](docs/fix-log/2026-08-01-fix-2-room-settings-tab-mixes-three-audiences.md) |
| 2026-08-01 22:30 | Fix #5 (M4): dead space above the board before a game starts — the pre-game turn bar is hidden with … | [chi tiết](docs/fix-log/2026-08-01-fix-5-m4-dead-space-above-the-board.md) |
| 2026-08-01 22:30 | Fix #6 (M3): on mobile the whole right panel — including both player slots — sits below a full-viewp… | [chi tiết](docs/fix-log/2026-08-01-fix-6-m3-on-mobile-the-whole-right.md) |
| 2026-08-01 22:30 | Fix #7 (M5): room name disappears from the mobile top bar — .topnav__title is dropped at ≤768px, lea… | [chi tiết](docs/fix-log/2026-08-01-fix-7-m5-room-name-disappears-from-the.md) |
| 2026-08-01 22:30 | Phase 2 infrastructure: Lite/Default/Pro UI-mode system — data-ui-mode attribute on <html>, gvn_ui_m… | [chi tiết](docs/fix-log/2026-08-01-phase-2-infrastructure-lite-default-pro-ui-mode.md) |
| 2026-08-01 22:30 | Surface 1: lobby room cards — Lite identical to Default (phase-1 card+chip already is the Lite treat… | [chi tiết](docs/fix-log/2026-08-01-surface-1-lobby-room-cards-lite-identical-to.md) |
| 2026-08-01 22:30 | Surface 2: create-room modal — Lite gets room name + "Quick match" with everything else behind a clo… | [chi tiết](docs/fix-log/2026-08-01-surface-2-create-room-modal-lite-gets-room.md) |
| 2026-08-01 22:30 | Surface 6: lobby online panel — Lite collapses it to a bare "N online" count with the click-to-expan… | [chi tiết](docs/fix-log/2026-08-01-surface-6-lobby-online-panel-lite-collapses-it.md) |
| 2026-08-01 22:30 | Surface 3: room right panel — Lite hides the score table until a game has actually finished, and hid… | [chi tiết](docs/fix-log/2026-08-01-surface-3-room-right-panel-lite-hides-the.md) |
| 2026-08-01 22:30 | Surface 4: room settings tab, guest branch only — Lite replaces the three read-only label/value rows… | [chi tiết](docs/fix-log/2026-08-01-surface-4-room-settings-tab-guest-branch-only.md) |
| 2026-08-01 22:30 | Surface 5: history replay — Lite hides #btn-analysis and #tree-panel entirely; Default unchanged (bu… | [chi tiết](docs/fix-log/2026-08-01-surface-5-history-replay-lite-hides-btn-analysis.md) |
| 2026-08-01 22:30 | Fix #8: user reported the board canvas color palette is too light and uncomfortable to look at for e… | [chi tiết](docs/fix-log/2026-08-01-fix-8-user-reported-the-board-canvas-color.md) |
| 2026-08-01 22:30 | Fix #9: after Fix #8's theme-aware repaint, the user asked to try a different board palette entirely… | [chi tiết](docs/fix-log/2026-08-01-fix-9-after-fix-8-s-theme-aware.md) |
| 2026-08-01 22:30 | Fix #10: user gave a fully specified replacement "Paper Style" palette after seeing Fix #9's wood th… | [chi tiết](docs/fix-log/2026-08-01-fix-10-user-gave-a-fully-specified-replacement.md) |
| 2026-08-01 22:30 | Fix #11: user asked to lighten the Fix #10 palette further — same light-gray background, but "Light … | [chi tiết](docs/fix-log/2026-08-01-fix-11-user-asked-to-lighten-the-fix.md) |
| 2026-08-01 22:30 | Fix #12: user gave a third light-theme spec — near-white cyan-tinted background #DBFDFF, saturated b… | [chi tiết](docs/fix-log/2026-08-01-fix-12-user-gave-a-third-light-theme.md) |
| 2026-08-01 22:30 | Fix #13: user confirmed Fix #12's blue cross and red circle but said the #DBFDFF background read as … | [chi tiết](docs/fix-log/2026-08-01-fix-13-user-confirmed-fix-12-s-blue.md) |
| 2026-08-01 22:30 | Fix #14: with the board background, cross/circle symbols, and wall tiles locked (Fix #8–#13), user r… | [chi tiết](docs/fix-log/2026-08-01-fix-14-with-the-board-background-cross-circle.md) |
| 2026-08-01 22:30 | Fix #15: small usability request — on hover, highlight the corresponding row/column coordinate label… | [chi tiết](docs/fix-log/2026-08-01-fix-15-small-usability-request-on-hover-highlight.md) |
| 2026-08-01 22:30 | Fix #16: user asked to drop the solid border Fix #14 added to the last-move highlight, keeping fill … | [chi tiết](docs/fix-log/2026-08-01-fix-16-user-asked-to-drop-the-solid.md) |
| 2026-08-01 22:30 | Fix #17: user flagged that the amber/gold highlight from Fix #14 reads too close to the circle's red… | [chi tiết](docs/fix-log/2026-08-01-fix-17-user-flagged-that-the-amber-gold.md) |
| 2026-08-01 22:30 | Fix #18: user reported Fix #17's dark forest-green highlight still read as low-contrast/murky in a s… | [chi tiết](docs/fix-log/2026-08-01-fix-18-user-reported-fix-17-s-dark.md) |
| 2026-08-01 22:30 | Fix #19: user asked to try a vivid, fully-saturated green — #00FF44 — as the highlight, flat across … | [chi tiết](docs/fix-log/2026-08-01-fix-19-user-asked-to-try-a-vivid.md) |
| 2026-08-01 22:30 | Fix #20: user asked to try a saturated yellow — #FFEA00 — as the highlight, flat across both themes. | [chi tiết](docs/fix-log/2026-08-01-fix-20-user-asked-to-try-a-saturated.md) |
| 2026-08-01 22:48 | Backend TODO Phần B #1 (review 5.1): restart-hang — on connection, SocketHandler.js had if (existing… | [chi tiết](docs/fix-log/2026-08-01-backend-todo-phan-b-1-review-5-1.md) |
| 2026-08-01 22:54 | Backend TODO Phần B #2 (review 3.5): chat sanitization used replace(/<[^>]>/g, '') in server/manager… | [chi tiết](docs/fix-log/2026-08-01-backend-todo-phan-b-2-review-3-5.md) |
| 2026-08-01 23:04 | Backend TODO Phần B #3 (review 3.7): escapeAttr in client/js/lobby.js:474 and client/js/room-ui.js:6… | [chi tiết](docs/fix-log/2026-08-01-backend-todo-phan-b-3-review-3-7.md) |
| 2026-08-02 00:30 | Correction to the fix logged at 2026-08-01 22:48 (TODO Phần B #1, restart-hang). Browser-verifying T… | [chi tiết](docs/fix-log/2026-08-02-correction-to-the-fix-logged-at-2026-08.md) |
| 2026-08-02 01:44 | Backend TODO Phần B #4 (review 6.4): two independent problems on the public game-history API. (a) ge… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-4-review-6-4.md) |
| 2026-08-02 01:51 | Backend TODO Phần B #5 (review 5.5): the idle-room cleanup interval in server/managers/RoomManager.j… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-5-review-5-5.md) |
| 2026-08-02 02:01 | Backend TODO Phần B #6 (review 3.6): POST /api/auth/login in server/routes/auth.js returned 401 imme… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-6-review-3-6.md) |
| 2026-08-02 02:37 | Backend TODO Phần B #7 (review 3.2): RoomManager.createRoom() enforced only a global MAX_ROOMS cap a… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-7-review-3-2.md) |
| 2026-08-02 02:45 | Backend TODO Phần B #8 (review 4.2): room:updated re-sent the full room snapshot — users[] + setting… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-8-review-4-2.md) |
| 2026-08-02 02:55 | Backend TODO Phần B #9 (review 4.1 + verification report on 3da53dd): broadcastLobbyUpdate re-sent t… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-9-review-4-1.md) |
| 2026-08-02 03:35 | Backend TODO Phần B #10 (review 4.3): TimerManager broadcast timer:tick to every member of a room on… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-10-review-4-3.md) |
| 2026-08-02 03:44 | Backend TODO Phần B #11 (verification report on 3da53dd): six shipped fixes had no test protecting t… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-11-verification-report-on.md) |
| 2026-08-02 03:49 | Backend TODO Phần B #12 (verification report on 3da53dd): in cancelDisconnectGrace (DisconnectHandle… | [chi tiết](docs/fix-log/2026-08-02-backend-todo-phan-b-12-verification-report-on.md) |
| 2026-08-02 03:54 | User report: ./start.sh could not start the server at all — Error: JWT_SECRET must be set (no defaul… | [chi tiết](docs/fix-log/2026-08-02-user-report-start-sh-could-not-start-the.md) |
| 2026-08-02 04:09 | TODO #15 (follow-up carved out of the #13 decision): after Phần B #2 switched chat sanitization to e… | [chi tiết](docs/fix-log/2026-08-02-todo-15-follow-up-carved-out-of-the.md) |
| 2026-08-02 04:17 | TODO #14: socket-client.js bound reconnect_attempt (status banner) and reconnect on this.socket, but… | [chi tiết](docs/fix-log/2026-08-02-todo-14-socket-client-js-bound-reconnect-attempt.md) |
| 2026-08-02 04:29 | TODO #16 + #17 (found while doing Phần B #4, done together per that item's own constraint): getGameB… | [chi tiết](docs/fix-log/2026-08-02-todo-16-17-found-while-doing-phan-b.md) |
| 2026-08-02 17:57 | Capacity stress-testing (docs/stress-test-report.md §9-10, requested by the user to find a real veri… | [chi tiết](docs/fix-log/2026-08-02-capacity-stress-testing-docs-stress-test-report-md.md) |
| 2026-08-02 20:45 | Fix #18 second pass — user reported that on the real deployment (play3cr.dpdns.org) room creation fa… | [chi tiết](docs/fix-log/2026-08-02-fix-18-second-pass-user-reported-that-on.md) |
| 2026-08-02 21:05 | Same test run surfaced a second, distinct crash unrelated to #18: ValidationError: ERR_ERL_UNEXPECTE… | [chi tiết](docs/fix-log/2026-08-02-same-test-run-surfaced-a-second-distinct-crash.md) |
| 2026-08-02 21:20 | TODO.md #30 (flagged in the previous entry, not yet fixed): under Cloudflare Tunnel, socket.handshak… | [chi tiết](docs/fix-log/2026-08-02-todo-md-30-flagged-in-the-previous-entry.md) |
| 2026-08-02 22:41 | TODO.md #29 (unexplained >6000-player ceiling, backlog fix already shipped): re-ran scripts/capacity… | [chi tiết](docs/fix-log/2026-08-02-todo-md-29-unexplained-6000-player-ceiling-backlog.md) |
| 2026-08-02 22:45 | TODO.md #28 (transport order, "measured, deliberately not applied" pending re-evaluation once the ba… | [chi tiết](docs/fix-log/2026-08-02-todo-md-28-transport-order-measured-deliberately.md) |
| 2026-08-03 00:26 | User request: finish the "further" delta step for room:updated that TODO.md #8 deliberately deferred… | [chi tiết](docs/fix-log/2026-08-03-user-request-finish-the-further-delta-step-for.md) |
| 2026-08-03 00:55 | User asked directly whether MAX_ROOMS/MAX_USERS_PER_ROOM could be raised, after being told the 200-t… | [chi tiết](docs/fix-log/2026-08-03-user-asked-directly-whether-max-rooms-max-users.md) |
| 2026-08-03 01:03 | User request: default theme should be light, not dark — the pre-first-paint theme-init IIFE in clien… | [chi tiết](docs/fix-log/2026-08-03-user-request-default-theme-should-be-light-not.md) |
| 2026-08-03 01:14 | Feature request (History tab): allow search/query by player, date, results, plus count-by-date and c… | [chi tiết](docs/fix-log/2026-08-03-feature-request-history-tab-allow-search-query-by.md) |
| 2026-08-03 01:52 | TODO.md Phần B #32 (from the 2026-08-03 whole-codebase security review): isValidDisplayName in serve… | [chi tiết](docs/fix-log/2026-08-03-todo-md-phan-b-32-from-the-2026.md) |
| 2026-08-03 02:33 | TODO.md #35: #start-modal and #game-overlay (win/loss/rematch notification) visually overlapping aft… | [chi tiết](docs/fix-log/2026-08-03-todo-md-35-start-modal-and-game-overlay.md) |
| 2026-08-04 09:00 | TODO.md Phần B #33 (from the 2026-08-03 security-review recheck): acceptDraw()/declineDraw() in serv… | [chi tiết](docs/fix-log/2026-08-04-todo-md-phan-b-33-from-the-2026.md) |
| 2026-08-04 09:20 | TODO.md Phần B #34 (from the 2026-08-03 security-review recheck): game:time_accept/game:time_decline… | [chi tiết](docs/fix-log/2026-08-04-todo-md-phan-b-34-from-the-2026.md) |
| 2026-08-04 09:52 | TODO.md Phần B #37 / instruction.md §B37 (user manual-test report): the timer never ran during Swap2… | [chi tiết](docs/fix-log/2026-08-04-todo-md-phan-b-37-instruction-md-b37.md) |
| 2026-08-04 04:23 | TODO.md #36 / instruction.md §B36 (user-proposed redesign after reviewing the current start-game flo… | [chi tiết](docs/fix-log/2026-08-04-todo-md-36-instruction-md-b36-user-proposed.md) |
| 2026-08-04 04:56 | TODO.md #39 (báo cáo người dùng "Reconnect Logic is not very well"): guest/spectator, hoặc player kh… | [chi tiết](docs/fix-log/2026-08-04-todo-md-39-bao-cao-nguoi-dung-reconnect.md) |
| 2026-08-04 08:00 | TODO.md #44 / instruction.md §44 (review 12.6, xác nhận qua Cloudflare API 2026-08-04): getClientIp(… | [chi tiết](docs/fix-log/2026-08-04-todo-md-44-instruction-md-44-review-12.md) |
| 2026-08-04 05:00 | TODO.md #40 (báo cáo người dùng test thủ công): dán link room.html trần — không ?id= và không phải v… | [chi tiết](docs/fix-log/2026-08-04-todo-md-40-bao-cao-nguoi-dung-test.md) |
| 2026-08-04 08:06 | TODO.md #42 / instruction.md §42 (review 12.5, kiểm chứng 2026-08-02): review nêu cancelEmptyRoomGra… | [chi tiết](docs/fix-log/2026-08-04-todo-md-42-instruction-md-42-review-12.md) |
| 2026-08-04 08:16 | TODO.md #43 / instruction.md §43 (review 12.5, kiểm chứng 2026-08-02): MAX_ROOMS_PER_IP đếm quota bằ… | [chi tiết](docs/fix-log/2026-08-04-todo-md-43-instruction-md-43-review-12.md) |
| 2026-08-04 09:00 | TODO.md #41 / instruction.md §41 (review 12.5, kiểm chứng 2026-08-02): ONLINE_USERS_DEBOUNCE_MS 300ms gần vô dụ… | [chi tiết](docs/fix-log/2026-08-04-todo-md-41-debounce-lobby-online-users.md) |
| 2026-08-04 09:18 | TODO.md #29 (follow-up to TODO #41 debounce fix): re-ran scripts/capacity-test at 6000/8000 players, … | [chi tiết](docs/fix-log/2026-08-04-todo-md-29-unexplained-8000-player-ceiling.md) |
| 2026-08-04 09:45 | User report "time plus not work": timer-increment ("Cộng thêm") field only applies server-side in Bl… | [chi tiết](docs/fix-log/2026-08-04-time-plus-not-working-outside-blitz-mode.md) |
