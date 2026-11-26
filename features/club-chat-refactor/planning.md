# Club chat refactor — planning (Phase 1, design only)
[Stories](user_story.md) · [Sequences](diagram/uml_diagram/sequence.md) · [States](diagram/state.md) · [Mockups](mockups/) · [Screenshots](shots/) · [Prompt](prompt.md)

Process note: this is a size-L `feature/*` item under `.claude/rules/design-intake.md`. The design-workflow skill's
"backend lock" applies to `ui/*` restyles only. This feature changes the server (migration, routes), and that is in scope.
Nothing here authorizes code: open questions are answered first, then the items below get todo files.

## 0. Mockups
`mockups/chat.html` is clickable from `file://`. It switches with `?scene=actions|edit|slash|delete|report|poll|calendar|event&mode=dark|light&as=member|staff`, or with the tab strip in the bottom-right corner.
It links the real `tokens.css`, `platform.css` and `club.css`. `mockups/mock.css` holds only the new components plus the mockup chrome.
`mockups/build-sprite.js` inlines the real sprite plus the four new icons. `node features/club-chat-refactor/shoot.js` writes `shots/<scene>-{phone,desk}-{dark,light}.png`
(390 × 844 with touch emulation, and 1280 × 860) plus a contact sheet `shots/<scene>.png`. The phone keyboard in the `edit` scene is simulated.
The native date and time inputs render in the browser's locale (en-US in headless Chromium). Vietnamese phones show dd/mm.

## 1. Research: how others do it

| Pattern | Slack | Discord | Telegram | Messenger | Zalo |
|---|---|---|---|---|---|
| Message actions | Hover, then ⋯ menu. Phone: press and hold ([help][slack-edit]) | Hover toolbar, then ⋯ menu ([guide, secondary][drexel]). Phone: long-press sheet ([community][dc-lp]) | Phone: long-press menu | Web: ⋯ beside the message. Phone: long-press ([secondary][fb-edit]) | ⋯ / long-press, then "Thu hồi" ([secondary][zalo-recall]) |
| Edit own message | Any time. Admins can restrict it ([help][slack-edit]) | Any time | 48 h, "edited" label ([blog][tg-edit]) | 15 min, "Edited" tag ([secondary][fb-edit]) | No real edit, only recall and resend ([secondary][zalo-edit]) |
| Delete | Own message any time. Admins delete members' messages. No placeholder ([help][slack-edit]) | Own message any time. Mods delete. No placeholder | Delete for everyone, no limit ([secondary][tg-edit2]) | "Unsend" leaves a placeholder ([secondary][fb-unsend]) | "Thu hồi" leaves a placeholder ([secondary][zalo-recall]) |
| Slash / command popup | Type `/` or the `/` button. Recent commands first. Shows the argument format ([help][slack-sc]) | `/` popup with argument hints | Bot commands menu | — | — |
| Mention popup | `@` then name list | `@` list, plus roles and @everyone, which mods gate ([help][dc-role]) | `@` list | `@` list | `@` list, `@All` |
| Poll creation | Apps / workflows | Composer + → poll sheet, up to 10 answers, duration picker ([FAQ][dc-poll]) | Attach → Poll. Add option rows, quiz and multi-answer ([blog][tg-poll]) | Group → poll | Group → Bình chọn: question, options, deadline ([secondary][zalo-poll]) |
| Event calendar | — | Server events list, "Create event" form with date and time ([help][dc-event]) | — | — | Calendar icon under the composer → title, time, repeat ([secondary][zalo-remind]) |

Standards: [APG combobox][apg-combo] (popup with `aria-activedescendant`; the script must scroll the active option into view), [APG toolbar][apg-toolbar] (roving tabindex),
[APG menu button][apg-toolbar], [APG date-picker dialog][apg-date] (grid with one tab stop, Esc returns focus), and [MDN VisualViewport][mdn-vv]
(the on-screen keyboard shrinks the visual viewport, while `dvh` ignores it).
Source quality: Slack, Discord polls and events, Telegram, APG and MDN are official. The Messenger and Zalo cells come from
secondary sources only, because no official help page turned up. The Discord edit and long-press cells come from its community forum.

### What I adopt, and why it fits a small Vietnamese club on phones
| Requirement | Pattern adopted | Why |
|---|---|---|
| Message actions | **Phone:** long-press → bottom sheet that previews the message and marks the selected row, as Messenger and Zalo do. **Desktop:** hover/focus toolbar plus a ⋯ menu, as Slack and Discord do. | Members already know the Zalo/Messenger gesture. A permanent flag on every row (today's touch layout) is clutter. |
| Edit | Edit **in the composer** with a "Đang sửa" bar above it, as Telegram and Messenger do on phones. Up-arrow in an empty composer edits your last message, as in Slack and Discord. | One input on both viewports. The phone keyboard is already open, and the mention popup works unchanged. |
| Edit window | No limit (requested). Label "đã sửa". | Matches Slack and Discord. The label provides the transparency that Telegram's 48 h window was meant to give. |
| Delete | Hard delete with no placeholder, as in Slack and Discord (see §6). | No replies or threads exist here, so nothing is orphaned. Reuses the `removed` poll path. |
| Slash popup | Keep the `/` popup, now with icons, arguments and descriptions (Slack). Drop the separate `/trogiup` result. | The popup already serves as the help. |
| Mentions | `@` list matching the display name *and* the username, ignoring diacritics, with avatars. Group entries stay staff-gated (Discord). | Vietnamese members know "Hoa Mai", not `hoamai_92`. |
| Poll builder | Composer → sheet with option rows, add, remove and **move up/down**, a live preview of the real card, and inline errors (Telegram/Discord). | Buttons work on touch, keyboard and screen readers, with no drag library. |
| Event calendar | Events channel = month grid plus the selected day's agenda. Staff "Tạo sự kiện" opens a sheet with date and time (Discord events, Zalo nhắc hẹn). | A month view answers "what's on this week". Day plus time chips beat typing `25/12 20:00`. |

## 2. Slash commands: keep, merge or remove (needs your approval before anything is removed)

| Command (aliases) | Today | Proposal | Reason |
|---|---|---|---|
| `/ghim` (`/pin`, `/announce`) | Staff set the pinned announcement | **Keep** | It is the only fast way to change the announcement. The `cmdPin` toggle is unchanged. |
| `/giaohuu` (`/challenge`) | Unrated challenge `@name [rule] [time]` | **Keep** | It is core to a game club and a one-liner. The `cmdChallenge` toggle is unchanged. |
| `/binhchon` (`/poll`) | Opens the poll editor, prefilled | **Keep (core)** | It always opens the new poll sheet, prefilled from `q \| a \| b`. The `cmdPoll` toggle also hides the composer poll button. |
| `/lich` (`/calendar`) | Member: server returns the list. Staff + args: prefilled form | **Keep (core), merge into the calendar** | `/lich` just opens the calendar on the client, with no server call. For staff, `/lich 25/12 20:00 Tên` opens the create sheet prefilled. The `cmdCalendar` toggle is unchanged. |
| `/tattieng` (`/mute`) | Staff mute `@name minutes` | **Remove** | It duplicates thành-viên moderation (B455). A typo silences the wrong person with no confirmation. |
| `/duoi` (`/kick`) | Staff kick `@name` | **Remove** | Same reason, and a kick cannot be undone. Kicking should always go through a confirmation. |
| `/trogiup` (`/help`) | Server returns the list, client re-opens `/` | **Merge into the `/` popup** | Typing `/` already shows every command with its arguments. The word stays as a client alias that opens the popup, and it leaves the list. |

What removal means:
- **Settings toggles:** `mute` and `kick` never had toggles, so cài-đặt-nhóm is unchanged. If a toggle is ever retired,
  `mergeSettings` must keep accepting its key as a no-op. Today it returns a 400 on unknown keys, which would break an older open tab.
- **Someone who still types the old word:** the policy entry stays with `retired: 'members'`. `find()` still resolves it,
  but `available()` drops it from the popup. The server answers `400 CLUB_COMMAND_MOVED` with "Dùng kênh thành-viên để tắt tiếng hoặc mời ra" plus a link,
  never `CLUB_COMMAND_UNKNOWN`. The text stays in the composer. Remove the alias entirely one release later (tracked in the todo).
- **API clients:** `POST /messages` with `/binhchon …` or `/lich dd/mm …` keeps working on the server. Only the web client routes them to the sheets.

## 3. Mentions: audit and the gaps worth fixing
Audited in `club.js` `renderHints`/`pickHint`/`hintKeys`/`textWithMentions` and `ClubChatCommands.parseMentions`. Working today:
member-only roster (the full confirmed list from `leaderboard`), max 5 names, staff-gated `@all`, `@officers` with a per-sender
cooldown, highlighting from the server's delivered list, and IME-safe keys.

| # | Gap | Fix |
|---|---|---|
| M1 | Matches only the **username prefix**. Typing `@hoa` doesn't find "Hoa Mai" (`maihoa92`), and `@Đức` never matches | Match the display name and username by word prefix, folding case and diacritics (NFD, strip marks, đ→d). Rows show the avatar, the display name and `@username`. Mockup: [edit + mention](shots/) |
| M2 | **Phone keyboard:** the list sits above the composer with up to 8 × 56 px rows and no max-height. On a 390 × 844 screen with the keyboard open, about 490 px is left, and the club chrome (rail, banner, channel strip) takes about 190 of it. The mockup showed the input itself pushed under the keyboard | When `visualViewport.height < 0.75 × innerHeight`, set `.is-kbd` on `.cl-hq`, which folds the rail, banner and strip. Popup `max-height` = the room between the channel header and the input, minus 96 px of messages, with at most 4 rows on a phone and internal scroll. `scrollIntoView({block:'nearest'})` on the active option, which APG requires |
| M3 | Picking uses `mousedown` plus a 150 ms blur timer | Use `pointerdown` + `preventDefault` (keeps focus and the keyboard open) and drop the timer race. Verify in touch emulation |
| M4 | Hard-coded strings: "Hoặc", "Ban quản trị", "Tất cả thành viên". The listbox is labelled "Lệnh" even when it shows people | Move them to i18n. Set `aria-label` to "Gợi ý thành viên" or "Lệnh" depending on mode. Add a polite count: "5 gợi ý" |
| M5 | A 6th `@name` is silently not notified. `@typo` gets no feedback | Composer hint "Chỉ 5 người đầu được báo" once the cap is hit. Non-member names stay plain text, with no extra UI |
Not worth changing: notification dedupe on (type, actor) (accepted in B447), Tab-to-pick (allowed by APG), the group cooldowns.

## 4. Builders
- **Poll sheet** (`#cb-poll-editor` rebuilt). Phone: a full-width bottom sheet. Desktop: a 560 px dialog.
  - Question field with a 0/140 counter.
  - Option rows: a number badge, an input with a 0/50 counter on focus, **↑ ↓** buttons (disabled at the ends) and **×** (disabled at 2 options). Enter in the last option adds the next one, up to 6.
  - Live preview renders the **real poll card** (`renderPoll` with zero votes). "Đóng sau 24 giờ" is static text (duration is P6).
  - Inline errors map to `validatePoll` codes: `usage` (an empty field), `duplicate` (both rows outlined), `too_long`, `too_many`. An error summary shows above the buttons after a failed submit, and focus moves to the first bad field.
- **Event calendar** (sự-kiện channel).
  - Month grid: Monday first (T2…CN), a VN-time label in the header, today ringed, dots on days with events, ‹ › for month and year.
  - It follows the APG grid: one tab stop, arrows, Home/End, PageUp/Down.
  - Selecting a day lists that day's events under the grid as ticket rows: title, time, "N tham gia" and the RSVP toggle.
  - Staff see "Tạo sự kiện", which opens a sheet with title, **date** (prefilled from the selected day, native `type=date` as the fallback), **time** (chips 19:00 / 20:00 / 21:00 plus `type=time step=900`) and a live preview card.
  - Data: `GET /events?month=YYYY-MM` returns past and future events of that VN month (≤ 31 days, ≤ 100 rows), because `upcomingEvents` is upcoming-only and capped at 20.

## 5. Edit and delete
- **Desktop:** a floating toolbar at the row's top-right on hover **and** on `:focus-within`, with `role="toolbar"` and roving tabindex (one tab stop per row).
  - Own message: Sửa, Xoá, ⋯.
  - Others' message: Báo cáo, ⋯, plus Xoá for staff who outrank the author.
  - ⋯ adds Sao chép.
- **Phone:** long-press at 450 ms opens a bottom sheet.
  - The sheet shows the message preview, then Sửa / Sao chép / Xoá / Báo cáo.
  - The row gets `.is-selected`: a tint and a 2 px ring, until the sheet closes.
  - Movement over 8 px, `scroll` or `pointercancel` cancels the hold. `contextmenu` on the row opens the same sheet, which covers Android's native long-press and desktop right-click.
  - Text selection (this is Q5, not settled):
    - Recommended: on coarse pointers, rows get `user-select: none` and `-webkit-touch-callout: none`, so the long-press is ours. The sheet then offers **"Sao chép"** (the whole text) and **"Chọn văn bản"**, as Telegram does.
    - "Chọn văn bản" re-enables selection and the native iOS/Android callout on that one row until the next tap elsewhere. Partial selection and the native menu thus still exist, one deliberate step away.
    - The alternative, copy-only, is simpler but drops partial selection on phones. Desktop selection is untouched either way.
- **Non-gesture path:** every row keeps a real "Tác vụ tin nhắn" button (⋯). It is always in the accessibility tree and is visually hidden on touch until focused. Screen-reader swipe and Tab reach it.
- **Editing:** the composer bar reads "Đang sửa tin nhắn" with ×, the input is prefilled, and the send icon becomes ✓. Esc or × cancels. Saving an unchanged text is a no-op. Up-arrow in an empty composer edits your last text message.
- **Delete:** a confirm dialog (not `window.confirm`) names whose message it is. A staff deletion adds "Việc này được ghi vào nhật-ký".
- **Report:** a dialog replaces `window.prompt`. It offers reasons as radios (Spam, Quấy rối, Nội dung không phù hợp, Khác + text ≤ 200). The server contract is unchanged.
- **Focus rules found while building the mockup:**
  - A sheet opened by touch focuses the sheet itself, so no ring appears. When opened by keyboard, it focuses the first item (APG menu).
  - Delete focuses "Huỷ" first. Report focuses the selected reason.
  - Closing returns focus to the row's ⋯ button.
  - The desktop ⋯ menu flips upward when the stream would clip it.
- **Placement:** all new dialogs live inside `.cl-hq`, as `#cb-poll-editor` does today, so `--cc*` and `.cl-hq .pbtn` apply. Rendering uses DOM building through `el()`, never `innerHTML`. The mockup uses `innerHTML` only on static data.

## 6. Decided and justified (the prompt's "decide and justify" points)
1. **Does a mention added by an edit notify?** Only **newly added individual `@username`s** notify, computed as new recipients minus the stored `meta.recipients`.
   - `@all`, `@tatca` and `@officers` added by an edit never notify. Otherwise an edit would bypass the staff check and the cooldowns. Staff can post a new message instead.
   - Removed mentions are never retracted. `NotificationService.drop()` would wipe every `club_mention` from that author.
   - `meta.recipients` is recomputed as (still-present previously delivered words) ∪ (newly notified names), so highlighting always equals what was delivered.
   - Re-ping guard: `meta.pinged` is a per-message set that only grows. A name is notified **at most once per message**, so adding, removing and re-adding `@x` does not ping x again. New pings go through the same eligible-members query as posting, which applies `notifyMention` and the mute/ban exclusion.
   - `push()` dedupes on (type, actor), so a second mention from the same author replaces the first bell row. This was accepted in B447.
2. **Reports on an edited or deleted message.**
   - `club_reports` has no FK and stores an `excerpt` snapshot. Evidence already survives deletion, retention trimming and later edits.
   - The real gap: someone posts abuse, edits it away *before* anyone reports, and the evidence is gone. To close it, store prior bodies in `club_message_edits` (last 5 per message, cascading with the message). A report then snapshots the current text plus those prior bodies into `club_reports.prior`.
   - A message that already has reports and is later edited or deleted gets a `club_reports.later` note: "sửa thành …" or "đã xoá lúc …". The admin queue shows both.
   - Privacy: prior bodies are visible to site admins **only through a report**. They are never shown to members and are deleted with the message.
   - Unreported deleted text is not kept. Once nobody can see it, it can do no further harm, and keeping it would contradict "delete".
3. **Does deletion leave a placeholder? No.**
   - Club chat has no replies, quotes or threads, so a gap orphans nothing.
   - Hard delete reuses `removedMessages`, which every open tab already polls.
   - A placeholder would need either a new `kind` (a CHECK change, so a third table rebuild with the `sqlite_sequence` trap from migration 020) or tombstones on the edit path.
   - Staff deletions of others' messages stay visible in nhật-ký (`delete_message`, which already exists).
   - Q2 asks whether you still want a "Đã bị ban quản trị xoá" line for staff removals.
4. **System rows.** Pin, challenge and poll rows are **not editable**.
   - A poll's votes are option indexes, so changing the text after votes changes what people voted for.
   - A pin row mirrors the announcement, and staff re-pin with `/ghim`.
   - A challenge row describes a real challenge object.
   - Authors may **delete** them: a poll creator's delete cascades its votes, and the challenge itself is unaffected. A pin delete clears the announcement through the shared `removeContent`. Both paths get tests.
5. **Other refusals** (each one is a server test):
   - Editing someone else's message → 403 `CLUB_FORBIDDEN`.
   - Editing a non-text kind → 400 `CLUB_EDIT_KIND`.
   - Edited text that is empty after `DmText.clean` → 400.
   - Muted users cannot edit (403 `CLUB_MUTED`, or it would bypass the mute) but **can delete their own** messages.
   - Someone who has left can do neither.
   - A locked club → 403 (the existing `write` middleware).
   - Edits count toward the chat rate limit.
6. **Time zone.** The calendar shows and accepts **Vietnam time (`Asia/Ho_Chi_Minh`, GMT+7)** and says so in the grid header and the form. One helper pair in `club-policy.js`, `vnParts(iso)` and `vnToIso({y,m,d,hh,mi})`, is shared by the slash parser, the form, the grid's day keys and the agenda.
   - Today's bug: `new Date(datetime-local)` reads the input in the *viewer's* zone, while `/lich` reads it as VN time.
   - `type=date` and `type=time` values carry no zone, so they are read as VN wall time.
   - The jsdom test runs with `TZ=America/New_York`.
   - Chat timestamps stay viewer-local (they are relative "now" times), which is out of scope.

## 7. Schema
Migration **026** (next free number at pickup). Plain `ADD COLUMN` only, with no rebuild, because the kind CHECK is unchanged:
```sql
ALTER TABLE club_messages ADD COLUMN edited_at TEXT;      -- shown as "đã sửa"
ALTER TABLE club_messages ADD COLUMN edit_rev INTEGER;    -- = clubs.chat_rev at the time of the edit
ALTER TABLE clubs ADD COLUMN chat_rev INTEGER NOT NULL DEFAULT 0;  -- per-club counter, +1 inside every edit transaction
CREATE INDEX idx_club_messages_rev ON club_messages(club_id, edit_rev) WHERE edit_rev IS NOT NULL;
CREATE TABLE club_message_edits (message_id INTEGER NOT NULL REFERENCES club_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL, edited_at TEXT NOT NULL);           -- last 5 prior bodies, evidence for reports only
ALTER TABLE club_reports ADD COLUMN prior TEXT;           -- JSON [{body, editedAt}] snapshotted at report time
ALTER TABLE club_reports ADD COLUMN later TEXT;           -- JSON {action:'edited'|'deleted', body?, at}
```
**Edit refresh path:**
- Every `GET /messages` response carries `rev = clubs.chat_rev`, a server-issued integer, so no client clock is involved.
  The counter lives on `clubs`, **not** in `max(edit_rev)`. If the row holding the max were trimmed by `CHAT_KEEP` or deleted, the next edit would reuse a rev that tabs already passed. This is the same trap as `sqlite_sequence` in 020.
- The client advances its cursor **only from `GET /messages`**, never from a PATCH response. Otherwise, after B edits at n+1 and you edit at n+2, your tab would skip B's edit.
- The next tick sends `&rev=<n>` alongside the existing `&visible=`. The response adds `edited: [{id, text, editedAt, mentioned}]` for visible ids with `edit_rev > n`.
- The client re-renders those rows in place and keeps a per-row `data-rev`. Before PATCH it bumps the row's `data-v` (the same `bumpPoll` guard), so an older in-flight tick can't repaint your edit.
- Deletes keep using `removed`. Neither path touches `latestOther` or the unread dot.

## 8. Decisions (user, 2026-11-26: "Q1-Q5 theo đề xuất")
- **Q1:** staff delete others' messages only with `ClubPolicy.canModerate(actor, senderRole)`. Anyone deletes their own.
- **Q2:** no placeholder. Hard delete, logged in nhật-ký when staff remove someone else's message.
- **Q3:** command table §2 approved. Retire `/tattieng` and `/duoi` (`CLUB_COMMAND_MOVED`), merge `/trogiup` into the `/` popup, keep the rest.
- **Q4:** "đã sửa" label only. Prior bodies are visible to site admins through reports only.
- **Q5:** the sheet offers "Sao chép" + "Chọn văn bản", which restores native selection on that row.
Formalized as `docs/todo/B475`–`B480` (see §10). P1–P10 are not approved.

## 9. More chat improvements: proposals only, none built unless you pick them
| # | Proposal | Value | Cost |
|---|---|---|---|
| P1 | Reply to a message (quote line, tap jumps to the original) | High: group chats lose context without it | M (meta + render) |
| P2 | Quick reactions (👍 ❤️ 😂 + 3), shown as counts | High engagement, low noise | M (new table, poll-like refresh) |
| P3 | "N tin mới ↓" pill when scrolled up, instead of a silent append | Medium | S |
| P4 | Staff action sheet: "Tắt tiếng người này…" from a message | Replaces `/tattieng` at the point of need | S, after #476 |
| P5 | Post an event card in chat when staff create one, with RSVP from chat | High for turnout | M (a new kind means a table rebuild, see the trap) |
| P6 | Poll duration (1 h, 24 h, 3 days, 1 week) and multiple choice | Medium | S/M |
| P7 | Multi-line composer (Shift+Enter, auto-grow textarea) | Medium | S |
| P8 | Per-club draft kept in localStorage | Low/medium | S |
| P9 | Group consecutive messages by one author (one header within 5 min) | Saves about 30% of height on phones | S |
| P10 | Staff edit of events (title and time) | Medium | S |
Rejected: a typing indicator and read receipts, because they need a socket.

## 10. Items (one `feature/*` branch each, off `dev`)
| # | Item | Depends | Model |
|---|---|---|---|
| #475 | Edit/delete own messages, server side: migration 026 (incl. `clubs.chat_rev`), `PATCH /messages/:id`, own delete + rank rule (Q1), `rev`/`edited` refresh path, mention diff + `meta.pinged`, report `prior`/`later` | Q1, Q4 | Opus |
| #476 | Message actions UI: desktop toolbar, phone long-press sheet (+ Q5 selection mode), composer edit mode, "đã sửa", delete-confirm and report dialogs, sprite `dots-three` | #475, Q5 | Sonnet |
| #477 | Command cleanup: retire `/tattieng` and `/duoi` (`CLUB_COMMAND_MOVED`), `/trogiup` → popup, `/lich` client-side, popup with icons | Q3 | Sonnet |
| #478 | Mention gaps M1–M5 (folding match, avatars, keyboard-safe height, `pointerdown`, i18n, cap hint) | — | Sonnet |
| #479 | Poll sheet: reorder, counters, inline errors, real-card preview, sprite `arrow-up`/`arrow-down` | — | Sonnet |
| #480 | Event calendar: VN-time helpers, `GET /events?month=`, month grid (APG), agenda, create sheet, sprite `caret-left` | — | Opus |
The item numbers are provisional. Other sessions share this checkout, so re-check the next free number when the todo files are written.
Suggested order: #475 → #476. #478, #479 and #480 can go in parallel. #477 comes after your approval of §2.
Done per item, as in prompt.md: backend tests including refusals, jsdom, full `npm test`, cache-bust OK, and a real-browser pass at 390 px and desktop in both themes on an isolated DB.
For #475/#476 the browser pass uses two members, checking that an edit and a delete by one appear for the other.
Long-press on a real iOS or Android device stays **unverified** unless it is actually tried.

Icons to add to the sprite and the registry (`docs/knowledge/ui-ux/iconography.md`): `dots-three` (Message actions), `arrow-up`/`arrow-down` (Move option),
`caret-left` (Previous month). `caret-right` already exists for next.

## 11. Traps
- `push()` dedupes on (type, actor). Never call `drop()` to "un-mention".
- `DmText.clean` escapes and truncates at 500 with `…`, so compare *cleaned* bodies when detecting "unchanged".
- Do not add a `kind` (for example `deleted` or `event`) without accepting a third `club_messages` rebuild and copying `sqlite_sequence` (see migration 020).
- `CHAT_KEEP` trim deletes rows through `insertMessage`. `club_message_edits` cascades, and reports keep their snapshot.
- The hover toolbar must not cover the timestamp. Touch layouts today show the flag and trash buttons permanently (`@media (hover: hover)` only hides them on pointer devices). #476 replaces that.
- `mergeSettings` returns a 400 on unknown keys. Keep retired toggle keys as accepted no-ops.

[slack-edit]: https://slack.com/help/articles/202395258-Edit-or-delete-messages
[slack-sc]: https://slack.com/help/articles/201259356
[drexel]: https://support.cci.drexel.edu/getting-connected/discord/discord-main-section-messages/
[dc-lp]: https://support.discord.com/hc/en-us/community/posts/360050269371--Mobile-Ease-of-Access-suggestion
[dc-poll]: https://support.discord.com/hc/en-us/articles/22163184112407
[dc-event]: https://support.discord.com/hc/hi-in/articles/4409494125719-Scheduled-Events
[dc-role]: https://support.discord.com/hc/sv/articles/360039176412-Role-Mention-Permissions-Suppression
[tg-edit]: https://telegram.org/blog/edit
[tg-edit2]: https://nerdschalk.com/?p=293588
[tg-poll]: https://telegram.org/blog/polls-2-0-vmq
[fb-edit]: https://social.techjunkie.com/facebook-messenger-how-to-edit-sent-messages
[fb-unsend]: https://techcrunch.com/2019/02/05/facebook-messenger-remove/amp
[zalo-recall]: https://hoanghamobile.com/tin-tuc/thu-hoi-tin-nhan-zalo/
[zalo-edit]: https://fptshop.com.vn/tin-tuc/thu-thuat/cach-sua-tin-nhan-tren-zalo-khong-can-thu-hoi-187393
[zalo-poll]: https://cellphones.com.vn/sforum/cach-tao-binh-chon-tren-zalo
[zalo-remind]: https://quantrimang.com/cong-nghe/cach-tao-lich-hen-tren-nhom-chat-zalo-pc-156529
[apg-combo]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
[apg-toolbar]: https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
[apg-date]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/
[mdn-vv]: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
