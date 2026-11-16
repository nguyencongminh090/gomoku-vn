# 2026-10-23 13:30 — #327 Phone room: expanded panel input below the fold + small touch targets
## Prompt
"do #327" (ux-audit room M2 + L1).
## Root cause
Expanded `.rpanel` is `min-height: 100dvh − nav` and sits *after* the sticky-released stack (cards, board, tiles); `.room` is the only scroller (body is `overflow:hidden`) and nothing scrolled it, so `#chat-input` stayed at y≈1308. Targets were 28–36 px (toggle, input, send) / 32 px (leave) from base styles.
## Fix
- `room.js setPanelMinimized`: on expand at ≤768 px, `panel.scrollIntoView({block:'end'})` (after PANEL_ANIM_MS when animated) — scrolls `.room`, not window.
- `room-arena.css` phone: toggle `min-height:44px`, `#btn-leave` 44×44, chat input/send `min-height:44px` (send `min-width:44px`), input bar padding 6→2 px; `--minbar-h` 77→93 px so the minimized bar still fits (board ≈24 px smaller on phones; deviation from Scope "padding/min-height only": the board-cap budget had to follow).
- Default minimized state, desktop/tablet untouched.
## Verification
Tests: room-panel-minimize (phone expand scrolls, minimize/desktop don't; CSS targets), mobile-sticky `--minbar-h`; `npm test` 3427 green; cache-bust OK.
Real browser (Chromium, isolated :3101, touch): 375×812 and 320×640 — expanded input bottom 810/638 ≤ viewport, type+send works, collapse returns board to y=100 with `.room` scrollTop 0. Measured: toggle/input/leave 44 px, send 44 px high (36→44 wide after final CSS tweak, not re-measured). Not verified: real iOS/Android.
