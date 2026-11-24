# `index.html#rooms` Redesign v2 — Minimalist Competitive Hall + Vertical Online Roster

- **Scope:** `client/index.html#rooms` (`#panel-tables`) only. `client/room.html`, `client/js/board.js`, `client/css/game.css`, and `server/` are untouched.
- **Goal:** Replace the R1 "Sảnh gỗ" photo hero + tiny avatar strip with a **minimalist, dense competitive board-game lobby** (PlayOK / Lichess / KGS inspired) featuring:
  1. Live **online players** & **playing players** counts.
  2. Fast-scanning **Tables** display (compact rows / tickets).
  3. A dedicated **vertical Online players panel** showing each player and their **main-rule rank + rating**.
  4. The **Rules instruction tab** (`Luật chơi`, powered by `RoomRulesGuide`).
  - **Join-by-code (`#join-code-form`)** is dropped from `#rooms` per user preference.
- **Knowledge citations:**
  - `docs/knowledge/ui-ux/vstyle-minimalism-swiss.md` — clean grid, 3-size type hierarchy, restrained accent, strong primary signifier.
  - `docs/knowledge/ui-ux/vstyle-flat-material.md` — dense app ledger, clear interactive states, no ghost primary.
  - `docs/knowledge/ui-ux/vbase-layout-spacing.md` & `vbase-typography.md` — 4px scale, tabular numerals (`tabular-nums`), Vietnamese diacritic line-height.
  - `docs/knowledge/ui-ux/ticket-rows.md` — separate meta spans (no `a · b · c` joined strings), real padding, title > meta > action hierarchy.
  - `docs/knowledge/ui-ux/iconography.md` — Phosphor Regular only (16/20/24px), visible labels, ≥24px (≥44px mobile) targets.
  - `docs/knowledge/ui-ux/ux-responsive-mobile-first.md` — responsive single-column mobile (`≤860px`) where Online moves to a 3rd tab instead of hiding or pushing tables below the fold.

## Directions (Stage 3 Mockups)

| ID | File | Name | Layout & Tables | Vertical Online Panel |
|---|---|---|---|---|
| **A** | [a-sanh-ban.html](a-sanh-ban.html) | **Sảnh bàn** (Swiss Ticket Hall) | Top bar (`Bàn chơi` / `Luật chơi` tabs, `Online` + `Đang chơi` counters, `Tạo bàn`) → grouped padded ticket rows (`Chờ đối thủ` above `Đang thi đấu`). | **Right** sticky `292px` panel: search, avatar + non-color-only presence badge, main-rule label, tabular `#rank` & Elo. |
| **B** | [b-bang-dau.html](b-bang-dau.html) | **Bảng đấu** (Lichess Tabular Ledger) | Utility strip (`Online` / `Đang chơi` KPI pills + `Tạo bàn`) → tabs + status filter chips (`Tất cả` / `Chờ người` / `Đang đấu`) → true columnar lobby ledger. | **Right** `308px` ranked roster card: `Hạng / Tên` sort toggle, search, fixed-width `#rank` badge, main-rule tag, Elo, quick DM action. |
| **C** | [c-ky-vien.html](c-ky-vien.html) | **Kỳ viện** (Left Club Rail + Split-Seat Cards) | **Right** `1fr` stage: tabs + `Tạo bàn` → compact 2-column (1-column narrow) split-seat tickets with black/white stone indicators. | **Left** sticky `276px` club rail: top `Online` / `Đang chơi` stat header, search + `Tất cả / Rảnh / Đang đấu` filter, dense player + main-rule rank rows. |

Comparison gallery: [index.html](index.html)

## Data Map & Backend-Lock Flags

| Requirement | Current backend (`server/`) | Gap / Follow-up needed for real `ui/*` build |
|---|---|---|
| Tables list (`roomName`, seats, player `rating`, `provisional`, `boardSize`, `winningRule`, `ruleWall`, `rulePortal`, `ruleSwap2`, `openingRule`, `timerMode`, `timerSeconds`, `timerIncrementSeconds`, `ranked`, `state`, `startedAt`, `userCount`, `playerCount`) | Already sent by `lobby:update` / `lobby:patch` (`RoomManager.lobbyEntry`). | Ready as-is. |
| Online players count | Already sent (`lobby:online_users` / `lobby:online_patch` `total`). | Ready as-is. |
| **Playing players count** | `lobbyStats` sends `{ rooms, open, live, watch }` where `live` = live games. | Frontend can derive `2 × live` on a pure `ui/*` pass, or add exact `playingPlayers` to `tally.sum` in `server/socket/state.js`. |
| **Online players' main-rule rank & rating + live status** | `server/socket/state.js` `_onlineEntry(u)` sends only `{ userId, displayName, isGuest, avatarUrl }`. | **Needs backend follow-up:** extend `_onlineEntry(u)` with main-rule `{ mainCategory, mainRank, mainRating, mainProvisional }` (cached/lightweight per user) and optional `activity` (`'playing' | 'waiting' | 'watching' | 'free'`). |
| Rules instruction tab | Already live (`client/js/room-rules-guide.js` + `client/css/rules-guide.css`). | Ready as-is; reused directly in all 3 mockups. |
| Removing Join-by-code from `#rooms` | `#join-code-form` currently lives in `#panel-tables`. | Verify e2e specs referencing `#join-code-1` / `#btn-join-code` before removing in production (`#home-code` remains on mobile Home). |
