# `index.html#rooms` redesign v4: planning

Scope: the Phòng panel (`#screen-rooms` in `client/index.html`: `.rh` hero counts, `#rooms-tabs`, `#room-list`,
`#rooms-rules`; `client/js/lobby.js`). Not `room.html`, not the board. Mockups only, nothing under `client/` or
`server/` changed. Links: [user_story.md](user_story.md) · [diagram/table-states.md](diagram/table-states.md) ·
[diagram/uml_diagram/rule-rank-sequence.md](diagram/uml_diagram/rule-rank-sequence.md) · gallery [index.html](index.html).

Ask (2026-11-24, second round): stats (online, playing) → vertical online panel with ranks → tables, **one tab per
rule** → Rules tab. Each table: ID, seated players' name + rank, time control, "Vào". No live board.
**Rank everywhere = rank in the selected rule tab**, the online panel included.

## Settled by this ask (closes v3 questions)
- v3 Q1 "main rule": gone. Rank follows the selected tab.
- No "Tất cả" tab: four rule tabs (Luật 1, Luật 2, Tiêu chuẩn, Renju) + "Luật chơi". Count badge = tables in that rule.
- No mini boards (v1 R1 live cards and v3 D/E/F all drew one). `lobbyEntry.moves/startedAt` can be dropped (smaller `lobby:patch`).

## Brief: three directions (same data, same states, different structure)
| ID | File | Idea | Best at | Main weakness |
|---|---|---|---|---|
| G | [g-mot-cot.html](g-mot-cot.html) | **Một cột**: one 920px column. Sticky bar = counts + rule tabs. **Deviation:** the rule tabs (part of item 3) move above the online panel, on purpose: they re-rank both lists. Online panel = accordion (6 rows, "Xem tất cả" expands to 50/page; phones start collapsed to one line of faces and open a sheet). Tables = rows grouped Chờ đối thủ / Đủ người / Đang đấu, 8 per group + "Xem thêm". | Phone-first, single scroll, the least new UI and backend | Desktop wastes width; online panel and tables compete for the same scroll |
| H | [h-hai-cot.html](h-hai-cot.html) | **Hai cột**: sticky counts bar; desktop roster = sticky left rail (read first), own scroll, collapses to a column of faces; main = rule tabs + "đối đầu" seat cards (empty seat is a dashed "Ghế trống, vào để ngồi" slot) + sort select. Phones: "Xem người online" in the bar opens the roster sheet. **Deviation:** roster beside the tables on desktop, not above. New vs v2 C: rank follows the tab, no board, collapsible rail, seat-slot cards. | Both lists visible at once; free seats obvious | Two scroll areas on desktop (card density fixed in card v2, see below) |
| I | [i-bang-tra.html](i-bang-tra.html) | **Bảng tra**: the only direction that keeps the order 1 → 2 → 3 → 4 at both widths. Slim sticky counts; online panel = top 18 of the rule's ranking as a vertical list flowing into 3 columns + "Xem tất cả N" sheet; tables = real `<table>` with sortable headers (Bàn, Kỳ thủ theo hạng, Thời gian, Trạng thái), select filters incl. a rank range (top 10/50/200), 10/page pager. Phones: rows become tickets, roster shows top 3. | Density and control at high counts (sort, page, filter) | Spreadsheet feel; least friendly for casual phone players |

Shared by all three: rule-dependent rank chip that is always text (`#12`, `#35?` provisional, `Chưa có hạng`,
`Khách`); the roster splits "Chưa có hạng <luật>" into its own group so sparse rules (Renju) still read clearly;
table state = dot + text (Chờ đối thủ / Đủ người / Đang đấu); "Vào" is primary on waiting tables, outlined on full
ones (enter = watch); filters Còn ghế, Gần trình tôi (±200 Elo; disabled with a reason when you have no rank in the rule), time buckets.
Rank range: I has a real "Hạng" select (a seat in top 10/50/200); G and H rely on "Gần trình tôi" only, to keep the
chip row short on phones; empty state names the rule and offers
"Mở bàn <luật>"; "Luật chơi" renders the real `RoomRulesGuide` on the selected rule. Avatars = real
`PlatformShell.avatar()` (`.pav`). Meta = separate pills. `body` uses `overflow-x: clip` (sticky, #215). Sticky bars
sit under the 56px nav; the sheet covers the phone tab bar. The `room.html` phone invariants do not apply here.

Screenshots: `node features/rooms-redesign-v4/shoot.js [g h i]` (static server, no app server, no DB) → `shots/`
(gitignored). States: default dark/light, `rule=renju` (sparse ranks), `n=many` (312 online, 64 tables), `n=0`
(empty), `tab=rules`, phone sheet. The script fails on console errors, horizontal overflow, any "·" in visible
text, any board outside the Rules guide.

## Rule-dependent rank on the online panel: verdict
Not a mistake, with two guards. Good: one mental model ("I'm on Luật 2, every number is Luật 2"), and it answers
"who here is my level for this rule". Risks: in Renju/Tiêu chuẩn most people have no rank, so the list looks empty
and the order changes on every tab switch. Guards in all mockups: a "Hạng theo <luật>" label on the panel and the
sheet, and a separate "Chưa có hạng <luật>" group instead of blank chips.

## Data map (what the server sends today → gap)
| Need | Today | Gap / backend cost |
|---|---|---|
| Table ID, rule, seats (name, avatar), state, ranked, board size | `lobbyEntry` | none |
| Time control | `timerMode`, `timerSeconds`, `timerIncrementSeconds` | **none**, already sent |
| Seat rank in the table's rule | `players[].rating` + `provisional` only | **S1**: add `rank` (and `userId`) per seat. Rank = leaderboard position; needs a cached rank table per rule |
| Online roster rank per rule | `_onlineEntry` = `{userId, displayName, isGuest, avatarUrl}` | **S2**: add `ratings: {rule: [rating, rank, provisional]}` for all 4 rules, so a tab switch needs no refetch. Same rank cache as S1, refreshed on rating change, not per patch |
| Roster sorted by rank in a rule, search, paging | first 50 by **name** (`ONLINE_PAGE_SIZE`), `queryOnlineUsers` | **S3**: `lobby:online_query {rule, q, offset}` sorted by rank server-side. Required by G/H/I alike once online > 50 |
| Per-rule tab badges | `lobbyStats {rooms, open, live, watch}` totals; client holds one page (#382) | **S4**: `lobbyStats.byRule {rule: {open, total}}` |
| Rule tab, filters (seats, time, rank range), sort over all tables | `lobby:rooms_query {offset}` | **S5**: add `rule`, `open`, `time`, `near`, `sort` to the query. H's sort and I's sortable columns need it most; G needs only `rule` + `open` |
| "Đang chơi" = players | `lobbyStats.live` and `/api/home stats.playing` count **games** | **S6**: `playing` = seated players in live games (exact, incl. bot games?) |
| Waiting time ("chờ 5 phút") | not sent | optional: seat/open timestamp |

Cost by direction: all need S2, S4, S6 (S1 only as `userId`, see card v3). G needs S3 + S5 (rule/open only). H and I need S3 + full S5.

## User decision 2026-11-24
User prefers **H**, with a smaller, more polished card ("gọn và thanh lịch hơn", e.g. no "vs"). Card v2: header =
ID + state + Vào; two seat lines (24px avatar, name, rank chip), no inner boxes; footer = time + mode as plain text,
viewers right; waiting tables keep a 3px left stripe. Grid min 250px → 3 columns beside the rail at 1280px
(~6 tables per screen, was ~4). Phone Vào stays 36px tall.

### Card v3 (user answers 2026-11-24)
- Seat shows **Elo only** in the table's rule (`1890`, `1203?` provisional, `Mới` no rated game, `Khách`). No
  leaderboard rank in cards. The roster keeps rank + Elo (the answer was about cards).
- Button stays **"Vào"** on every state ("đúng nghĩa trong tiếng Việt").
- **Join-by-code dropped** from `#rooms`: the e2e specs using `#join-code-1` / `#btn-join-code` must change with it.
- **No wrapping**: footer = one-line spec strip (time | Tính điểm/Giao hữu; board size not shown, user 2026-11-24) with thin
  CSS dividers, `nowrap`, only the time may ellipsize; viewers moved to the header and hidden first on cards under
  244px (container query). Measured: no wrap/overflow at 360/390/900/1024/1100/1280/1440, 7 and 64 tables.
- **No 3px coloured side stripe** ("trông khá AI"). Waiting tables are told apart by the state label and the filled
  "Vào" only.
- Backend effect: seat **rank (S1) is no longer needed**, Elo is already sent (`players[].rating/provisional`).
  S1 shrinks to `userId` per seat (only if the card links to a profile).

## Open questions
1. Which direction (or a mix, e.g. G's sticky rule bar + I's table on desktop)?
2. ~~Rank chip~~: answered, cards show Elo only.
3. ~~Vào vs Xem~~: answered, always "Vào".
4. ~~Join-by-code~~: answered, dropped.
5. "Tiêu chuẩn" vs "Standard" (consistency rule 9), carried from v3 Q5.
6. Guests in the roster: listed last as "Khách", or hidden?
7. Rules guide marker in the lobby: "Đang chọn" instead of "Đang dùng" (new i18n key), carried from v3 Q7.

## Next step
**H approved 2026-11-24.** Formalized: #439 backend (F439), #440 UI (F440, depends on #439).
Build order: `feature/rooms-h-backend` off dev (#439), then `ui/rooms-h` off dev (#440). Out-of-scope idea: #438 (seat alert).
