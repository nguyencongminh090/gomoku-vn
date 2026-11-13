# B369 — Room desktop: "Sân khấu" 3-column stage (follows #368)
**Status:** OPEN
**Area:** client/room.html, client/css/room-arena.css (≥769px), client/js/room-stage.js, client/js/room.js (rail dock removed), i18n
**From:** user 2026-11-13 "UI on Phone have updated. Now I need to update UI on Desktop" → picked **B** (mockup
`features/room-desktop-stage/mockups/index.html`, shots in `shots/`)   **Depends:** #368

## Problem
Desktop room still has the pre-#368 rail: tabs Nước đi/Chat/Khán giả/Cài đặt, no bubbles, reactions, score hero.

## Scope
1. ≥1100px: 3 columns — left: opponent card · score card (hero + dots + per-game rows) · action tiles · my card;
   centre: board + stage overlay (spectator pills bottom-left, 👏 burst right); right: audience stack · pill tabs
   Chat · Nước đi · ⚙ · input + 👏 (send only while typing).
2. 769–1099px (user choice): seat cards + compact score in a top row over the board, tiles under it, right column kept.
3. Player chat → speech bubble beside the card pointing at the board (below the card in the top-row layout).
4. Tỉ số tab hidden on desktop (score lives in the left card); moves as the 3-col grid; chat faces + "· người chơi".
5. Rail collapse (‹ toggle, `rail-collapsed`, B284 tablet default) removed — the stage has no docked rail.
6. Request toasts stay in the right column, below the audience bar, clickable.

## Don't
- No server changes (room:react + gameLog exist). Don't touch board.js / board rules in game.css / game-ui.js.
- Phone (≤768px) must stay pixel-identical to #368.

## Traps
- Moving shared rules out of the phone media query widens their scope: re-run the phone pass and compare.
- `#score-hero` moves between `#scorecard` (desktop) and `#tab-users` (phone); empty state via sibling `.scorecard__empty`.
- Score "đang chơi · N nước" row must refresh on moves (observer on #moves-grid), the card is always visible.
- Desktop audience popover lacks the old list's host badge + presence dot (same as phone #368) — accepted.

## Done when
- jsdom: desktop routing (bubble/pill/react), score placement, no unread badge on desktop; phone tests unchanged.
- Real browser 1440×900, 1024×700, 820×1180 light/dark + phone 390×844 regression.

## Progress 2026-11-13 (branch ui/room-desktop-stage, uncommitted)
Built per Scope; npm test 3720 green, cache-bust OK. Deviation: top-row also when aspect ≤ 3:2 (1100×900 3-col board was
430px vs 729px at 1099 — cliff); narrow top row (<960) puts the clock under the name. Board px: 769 449 · 820 486 · 1024×700
486 · 1100×900 692 · 1180×820 598 · 1280×800 617 · 1440×900 785. Review 1: side panels docked to the edges ("dính vào cạnh"). Real browser :3101 temp DB, 0 console errors, toast
clickable, board click reaches canvas; phone pass re-run = #368 baseline. Not verified: WebKit, very long names.
