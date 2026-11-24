# Rooms tab v4: user stories

Links: [planning.md](planning.md) · [diagram/table-states.md](diagram/table-states.md) ·
[diagram/uml_diagram/rule-rank-sequence.md](diagram/uml_diagram/rule-rank-sequence.md)

## Actors
- **Member**: logged in, rated in 0–4 rules (`freestyle`, `caro`, `standard`, `renju` = `WINNING_RULES`).
- **Guest**: no rating, plays unranked, can watch.
- **Server**: RoomManager (tables), socket state (online set, lobby stats), rankings DB.

## Stories
1. I see how many people are online and how many are playing, so I know whether a game is likely now.
2. I pick the rule I play once (a tab); every rank on the page, tables and online list, is my rank world for that rule.
3. Each tab shows how many tables it has, so I don't click into empty rules.
4. I scan a table's ID, both players' names and ranks, the time control and its state, and press "Vào".
5. I narrow tables to those with a free seat, my time control, or players near my level.
6. I see who is online, top of the rule's ranking first; people with no rank in this rule are grouped, not blank.
7. With hundreds online or dozens of tables the page stays fast: paging/"Xem thêm", search, no live boards.
8. When a rule has no table I can open one in that rule from the empty state.
9. I read how each rule works in the "Luật chơi" tab, opened on the rule I selected.
10. On a phone the tables are on the first screen; the online list is one tap away (collapsed panel or sheet).

## Rules
- Rank = 1-based leaderboard position in that rule. Provisional (`rd > PROVISIONAL_RD`) shows `#N?`.
  No games in that rule: "Chưa có hạng". Guests: "Khách". Always text, never colour only.
- Table state: waiting (one seat free) "Chờ đối thủ"; ready (two seated, not started) "Đủ người"; playing "Đang đấu".
- "Luật chơi" keeps the last rule tab: the roster still ranks by it, the guide opens on it.
- Hidden-online players are not listed or counted (as today). Counts update with `lobby:patch` / `online_patch`.

## Hard constraints
- No `server/` change in the UI pass; gaps S1–S6 (planning.md) are a separate backend todo.
- No board on the lobby. Board/stones code untouched.
- Avatars via `PlatformShell.avatar()` only. No "a · b · c" joins. Phosphor Regular icons that exist in the sprite.
