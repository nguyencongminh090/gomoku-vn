# B449 — Club chat: member polls (bình chọn)
**Status:** BUILT, uncommitted — tests + real-browser pass 2026-11-24; decided 2026-11-24 (see [planning](../../features/club-polls/planning.md#decisions-user-2026-11-24--all-recommended-options)), branch `feature/449-club-polls`
**Area:** `server/` (migration 020, ClubChatCommands, ClubService, routes/clubs), `client/js/club.js` + `club.html`, i18n, tests
**From:** [features/club-polls](../../features/club-polls/planning.md)   **Depends:** B447

## Rules (decided)
Any member, `cmdPoll` on by default; `/binhchon Câu hỏi | A | B [| …]` 2–6 options, single choice, change/remove vote;
closes 24 h after creation or early by creator/staff; tallies public; voter names on tap; `notifyPoll` off by default; ≤ 3 open polls per creator.
## Approach
- Migration 020 `-- rebuild` club_messages (kind CHECK + 'poll'), keep ids + `sqlite_sequence`; `club_polls` (message_id PK, cascade) + `club_poll_votes` (PK message_id,user_id; cascade from poll and user).
- Close is lazy: closed = `closed_at` set or now ≥ `closes_at`; no timer.
- Tallies: per-viewer state computed server-side; the 8 s chat poll sends `&polls=<open card ids>` (≤ 20) and gets fresh state; vote/close return the same shape. Voter names only via `GET …/messages/:id/voters`.
## Don't
- New socket on the club page; client-side vote counting; voter names in the 8 s payload.
## Traps
- Rebuild must copy `sqlite_sequence` (else ids reused after staff deletes → unread cursor stuck above new ids).
- Length caps on raw text before `DmText.clean` (it escapes + truncates with `…`).
- CHAT_KEEP trim / staff delete / club delete must cascade to poll + votes.
## Done when
- Backend + jsdom tests, real-browser pass (isolated DB), cache-bust OK.
