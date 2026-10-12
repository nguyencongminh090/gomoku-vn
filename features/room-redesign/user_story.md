# Room redesign (Arena) — user story

Links: [planning.md](planning.md) · [state](diagram/state-room-layout.md) ·
[sequence](diagram/uml_diagram/sequence-friendly-only.md)

Request (2026-10-10, verbatim excerpt): "Re-Design + UI Audit for Room (Phòng) … Reuse Board design from
ref_ui (both stone + paper), in settings support: color palette, WCAG check color (check quietly + notify,
do not show UI with WCAG), Coordinate Mode. ReDesign Room to match the design of ArenaUI."
Reference board: `/run/media/ngmint/Data/Programming/Programming/HTML/GomokuBoardSite/js/{board,settings,contrast,coords}.js`.

## Actors
Seated player (desktop / phone) · spectator · host.

## Stories
1. As a player I see the board as large as the viewport allows (full width; full-size on phones).
2. As a player I read both clocks without searching: my clock next to me, opponent's next to them,
   the running clock visibly distinct (not colour only), low time in warning colour.
3. As a player I find Resign / Draw / (Undo, Extra time in Giao hữu) in one predictable action bar;
   destructive ones need a confirm step; incoming requests never cover the board.
4. As a player I choose board theme paper (X/O) or stone, a colour preset or custom colours, and the
   coordinate mode (edge letters / in-cell numbers); a low-contrast choice triggers a quiet notice
   with a suggested fix — no WCAG panel in the UI.
5. (user, 2026-10-10, mid-task) "Puzzle Board Setup, History View, ... Dùng chung settings về design. Vì chúng ta
   đã dời settings ra profile, tất cả board nên thiết kế design đồng bộ + style đồng bộ." → board design
   settings live ONLY in Settings › Giao diện › Bàn cờ; every board page renders from the same store and
   live-syncs; the room Settings tab keeps room rules + a link.
6. "Chơi thường" is renamed "Giao hữu"; Undo and Extra time exist only there.

## Rules / hard constraints
- Undo + extra time refused by the server in rated games (not only hidden).
- User approved (2026-10-10) breaking two design-workflow locks: board renderer replaced by the ref SVG
  board; server change for the friendly-only rule.
- Arena tokens (`client/css/tokens.css`) + Phosphor icons 16/20/24 (`docs/knowledge/ui-ux/iconography.md`).
- Room clock code is coupled to `/diag` → `.claude/rules/diagnostic-page-sync.md`.
