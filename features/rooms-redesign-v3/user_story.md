# Rooms tab v3: user stories

Links: [planning.md](planning.md) · [diagram/table-player-states.md](diagram/table-player-states.md) ·
[diagram/uml_diagram/lobby-roster-sequence.md](diagram/uml_diagram/lobby-roster-sequence.md)

## Actors
- **Member**: logged in, has ratings in 0–4 categories (`freestyle`, `caro`, `standard`, `renju`).
- **Guest**: no rating, can play unranked and watch.
- **Server**: RoomManager (tables), socket state (online set, lobby stats), rankings DB.

## Stories
1. As a member I see how many people are online and how many are playing, so I know whether a game is likely now.
2. As a member I see open tables first and can sit down with one click. Live tables are a click away from watching.
3. As a member I see a vertical list of who is online, each with their rank and Elo in their main rule, so I can
   pick an opponent of my level.
4. As a member I can tell what each online player is doing (playing, waiting, watching, free) without colour alone.
5. As a member I can read the rules from the lobby (Rules tab), and jump straight to the rule a table uses.
6. (D) As a member who plays one rule, I pick it once and the tables, roster ranking and rules all follow it.
7. (E) As a member I can check a table's players, position and settings before entering it.
8. (F) As a member I start from a person: sit at their table, challenge them, or watch them.
9. On a phone I reach tables, players and rules as three tabs, none hidden below the fold.

## Rules
- Rank = 1-based leaderboard position in that category (`getUserRanking`). A provisional rating (`rd > PROVISIONAL_RD`, seat-rating.js) shows `#N?` and "Elo tạm".
  No rating in that category shows "Mới". Guests show "Khách".
- Main rule = open question 1 in planning.md (mockup: the category with the most rated games).
- Players with `hide online status` are not in the roster or counts (as today).
- Counts update live with `lobby:patch` / `online_patch`. No polling.

## Hard constraints
- No `server/` change in the UI pass. Backend items A/B/B2/C (planning.md) are separate todos.
- Board/stones rendering in `room.html` untouched. Lobby mini boards are a separate lightweight SVG.
- `#rooms` stays one panel in `index.html`. Join-by-code ids stay unless Q4 decides otherwise.
