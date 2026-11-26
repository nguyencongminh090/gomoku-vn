# B475 — Club chat: edit and delete own messages (server)
**Status:** OPEN
**Area:** migration 026, `ClubService` (postMessage/listMessages/deleteMessage/reportMessage/removeContent), `routes/clubs.js`, `ClubOversight` (report detail), tests
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §5–§7, decided 2026-11-26   **Depends:** —

## Scope
1. Migration 026 (next free number), using `ADD COLUMN` only:
   - `club_messages.edited_at`, `club_messages.edit_rev`, and `clubs.chat_rev INTEGER NOT NULL DEFAULT 0`;
   - table `club_message_edits(message_id FK cascade, body, edited_at)`, keeping the last 5 rows per message;
   - `club_reports.prior`, `club_reports.later`, both JSON.
2. `PATCH /api/clubs/:slug/messages/:id {text}`:
   - Refuse unless the caller is the author. Refuse unless `kind = 'text'`.
   - Refuse a muted author, a member who has left, a locked club, an empty cleaned body, and anything over the rate limit.
   - Never parse the text as a command.
   - An unchanged cleaned body is a no-op.
   - In one transaction: write the prior body to the history table, `chat_rev += 1`, stamp the row, recompute `meta.recipients`, grow `meta.pinged`, and set `later` on reports for this message.
3. Mentions added by an edit:
   - Notify only individual names that are not yet in `meta.pinged` (once per message), through the same eligible-members query as posting.
   - Group words (`@all`, `@tatca`, `@officers`) added by an edit never notify.
4. `DELETE /messages/:id`: allowed for the author (any kind, even while muted), or for staff when `canModerate(actor, senderRole)` (Q1).
   - Pin rows keep clearing the announcement through `removeContent`.
   - Log `delete_message` only when the actor is not the author.
   - Set `later = {deleted, at}` on the message's reports.
5. `GET /messages` returns `rev = clubs.chat_rev`. With `&rev=n`, it also returns `edited: [{id, text, editedAt, mentioned}]` for visible ids where `edit_rev > n`.
6. Reports snapshot the current body plus prior bodies into `prior`. The admin report detail shows `prior` and `later`.

## Don't
- Add a `kind` such as `deleted`: it forces a third `club_messages` rebuild (see 020).
- Use `max(edit_rev)` as the cursor: it is not monotonic after trim or delete.
- Call `NotificationService.drop()` to un-mention. It wipes every row from that actor.
## Traps
- Compare cleaned bodies: `DmText.clean` escapes and truncates at 500 with `…`.
- `CHAT_KEEP` trim cascades the history table; reports keep their snapshot.
- Removed toggle keys must stay accepted by `mergeSettings` as no-ops (none are removed here).
## Done when
- Backend tests cover each refusal: another member's message, a system kind, muted, left, locked, empty text, a command-looking edit, and an officer deleting the owner's message.
- Backend tests cover: rev monotonic after a trim, one ping per message, `later` and `prior` on reports, and the pin delete clearing the announcement.
- Full `npm test` passes.
