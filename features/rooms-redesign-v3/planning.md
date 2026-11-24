# `index.html#rooms` redesign v3: planning

Scope: the Phòng tab (`#panel-tables`, `client/js/lobby.js`). Not `room.html`, not the board. Mockups only;
nothing under `client/` or `server/` changed. Links: [user_story.md](user_story.md) ·
[diagram/table-player-states.md](diagram/table-player-states.md) ·
[diagram/uml_diagram/lobby-roster-sequence.md](diagram/uml_diagram/lobby-roster-sequence.md) · gallery [index.html](index.html).

Ask (2026-11-24): online + playing counts, tables, a vertical online-players panel with each player's rank in
their main rule, and the Rules tab. "All ideas welcome."

## Already explored (don't repeat)
- v1 `features/rooms-redesign/` R1–R8. R1 photo hall + mini-board cards is live (#364).
- v2 `features/rooms-redesign-v2/` A tickets + right roster, B Lichess ledger + right roster, C left rail + 2-col cards.

## v3 directions: one structural idea each
| ID | File | Idea | What differs from v1/v2 |
|---|---|---|---|
| D | [d-truc-luat.html](d-truc-luat.html) | **Trục luật** (rule spine) | A 5-way rule selector (Tất cả, Luật 1, Luật 2, Tiêu chuẩn, Renju) with per-rule counts drives the whole page: it filters tables, re-ranks the roster by **that rule's** Elo, shows the rule's one-line lead, opens the Rules tab on that rule and pre-selects it in Tạo bàn. |
| E | [e-xem-truoc.html](e-xem-truoc.html) | **Xem trước** (master–detail) | Three panes: table list, a preview of the selected table (board, both players' rank in *this table's* rule, every setting explained with the guide's lead text, viewers, one CTA), and the roster. Clicking a player previews the table they are at. Phone: list, then the preview as a bottom sheet. |
| F | [f-ky-thu.html](f-ky-thu.html) | **Kỳ thủ trước** (people first) | The roster is the main column, grouped by activity (chờ đối thủ, rảnh, đang đấu, đang xem), one action per person (Ngồi vào, Thách đấu, Xem). Each row shows **every** rule the player is rated in, main rule highlighted. Tables become the side column. |

Shared across D/E/F: Online, Đang chơi (and a third count) in the header. A compact `#` code entry stays (see Q4).
Presence is shown by a dot plus a text label, never colour alone. Ranks and Elo use tabular numerals. Meta facts are
separate pills (`ticket-rows`). Screenshots are gitignored (`*.png`): rerun `shoot.js`. Icons are Phosphor Regular 16/20/24 (`iconography`). The real `RoomRulesGuide`
renders the Rules tab. Below 860px the roster becomes a tab, never hidden or pushed below the tables
(`ux-responsive-mobile-first`). Light and dark use `tokens.css`.

Screenshots: `node features/rooms-redesign-v3/shoot.js` (static server, no app server, no DB) → `shots/`.
URL params: `?mode=light`, `?n=0|1`, `?rule=caro`, `?sel=K7B`, `?tab=rules|people|tables`, `?sheet=1`.
Items marked `cần backend` show data the server does not send today.

## Data map
| Need | Today | Gap |
|---|---|---|
| Tables (players, rating, rule flags, timer, ranked, state, userCount) | `lobby:update`/`lobby:patch` (`RoomManager.lobbyEntry`) | none |
| Online count | `lobby:online_users` / `online_patch` `total` | none |
| Playing count | `lobbyStats.live` = live games | **A**: UI can show `2 × live`. That count misses ready tables and bot games. An exact `playing` in `lobbyStats` is better. |
| Roster rank + Elo per rule | `_onlineEntry` = `{userId, displayName, isGuest, avatarUrl}` only | **B**: add `{ratings: {cat: [rating, games, rank]}, main}` per entry. `getUserRanking` runs one COUNT per user/category, so N online × 4 needs a cache refreshed on rating change, not per patch. |
| Roster activity (playing / waiting / watching / free + table code) | not sent | **B2**: derive server-side from RoomManager seats/viewers. Respect `hide online status`. |
| Mini board (E preview, F tiles), elapsed time, seat `provisional` | `lobbyEntry` already sends `moves`, `startedAt`, `players[].rating/provisional` (#364) | none |
| Waiting time ("chờ 5 phút") | not sent | **C**: a seat/open timestamp in `lobbyEntry` (small; optional) |

## Open questions
1. **What is a player's "main rule"?** Mockups use *most rated games*. Alternatives: highest rating, or a
   profile setting the player picks. This decides which rank the roster shows.
2. Which direction (or a mix, e.g. D's rule rail + E's preview)?
3. Backend items: B and B2 are required by every direction (rank + activity on the roster). Is C in scope?
4. Keep join-by-code on `#rooms`? v2 dropped it. v3 keeps a compact field. e2e specs use `#join-code-1` and `#btn-join-code`.
5. The label for `standard`: the room says "Tiêu chuẩn", the rankings page says "Standard" (consistency rule 9). Pick one.
6. Guests: v3 lists them as "Khách" without a rank. Should they appear at all?
7. In the Rules tab, `RoomRulesGuide` marks the selected rule "Đang dùng". In the lobby that should read "Đang chọn" (new i18n key).
8. F's "Thách đấu" reuses the friend-challenge flow (`features/friend-challenge`). Is it allowed for non-friends?

## Next step
User picks a direction and answers Q1/Q3/Q4. Then formalize as `docs/todo/<CODE>` (+ backend todo for B) and build
on a `ui/<slug>` branch via `design-workflow` stage 4.
