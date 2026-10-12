# 2026-10-12 09:56 — #241 tournament drop/forfeit + replay cap
## Prompt
"do #241" (planning answered via AskUserQuestion: cap 2 → higher seed; organizer + self-withdraw; Swiss/RR forfeit, keep points; DE walkover in every pending match). See features/tournament-drop-forfeit/planning.md.
## Root cause
Deadline with nobody ready voided + replayed with no counter, so two absent players looped forever. `entry.withdrawn` was read from DB but nothing set it. Also `_checkDoubleElimComplete` only accepted a `Completed` final, so a walkover final never completed the tournament.
## Fix
- `noShowCount` on pairings (new `tournament_pairings.noshow_count`, additive migration); at `NO_SHOW_REPLAY_CAP`=2 the 3rd void becomes a walkover (`noshow_cap`) for the higher seed.
- `TournamentManager.withdrawPlayer` + socket `tournament:withdraw {tournamentId, entryId?}`: forfeits pending pairings (`withdrawn`), cancels a live match, later matches auto-forfeit on creation; Swiss excludes withdrawn from next-round pairing; points stay in standings.
- DE completion accepts a `Walkover` final.
- Client: withdraw / drop-player controls, "withdrawn" tag, new reasons render as walkover. `?v=336` (header actions restyled: joined drop picker, consistent danger buttons, mobile full-width).
## Verification
10 new tests in TournamentManager.test.js (3 formats, cap, reload, auth). `npm test`: 3149 pass. jsdom: client/tests/tournament-detail-withdraw.test.js (5). Real-browser pass (isolated copy, swiss, 4 users): drop + self-withdraw OK, live updates, 0 console errors. Second pass: Swiss standings "đã rút" tag, RR cross-table forfeits, DE drop, mid-match cancel redirect (alert + back to tournament page), 390px no overflow, 0 console errors. Cosmetic: drop picker is an unstyled select.
