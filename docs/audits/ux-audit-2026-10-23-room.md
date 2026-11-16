# UX audit — room.html (2026-10-23)

**Persona:** casual Vietnamese player, phone-first, plays a friendly game ("Giao hữu") with a friend; never read the rules; low patience.
**Setup:** isolated server `:3101`, `GOMOKU_DB_PATH` temp, `CORS_ORIGIN=http://localhost:3101`, `MAX_ROOMS_PER_IP=60`; Chromium 1243 via Playwright; two guest contexts (host + joiner). Real DB untouched.
Evidence: `docs/audits/2026-10-23-room/` (5 key shots; ~35 taken in total).

## Verdict: INCOMPLETE (findings: High 1, Medium 2, Low 3)
Not Pass/Fail-able: scenario battery only partly run (not run: heavy data, 2nd role/spectator, lifecycle, seasoning, offline, slow 3G, reduced-motion, i18n, print, forced-colors, round-trip). Self-critique pass was done inline, **not** by an independent sub-agent.

Hard gates: console errors 0, warnings 0, 5xx 0, 4xx 0, axe Critical 0 / Serious 0 (1 Moderate), layout collapse 0 (1024 rail hidden by design, see H1). Perf (1440, reload): LCP 44 ms*, CLS 0.02, INP-proxy click→tab 52–68 ms. (*LCP is the entry overlay; not a content LCP.)

Coverage: tested 375×812, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080 (1920 only via a failed-then-retried run; its layout numbers: board 991², rail 364 right, no h-scroll). Walked: create→join→sit→start→move→chat (typed, sent, cleared, escaped on both sides)→tabs→draw arm→resign arm+confirm→opponent disconnect→leave confirm. Not exercised: undo accept (opening phase refuses it — rule, not bug), swap2, time request, spectator, replay.

## Findings
**H1 (High, Layout/Architecture) — Tablet width: a new player cannot sit, chat or see clocks.**
Surface: `room.html?id=…` at 1024×768 (any 769–1024 px), nothing saved in localStorage, before sitting. Persona: first-time player on a tablet / small laptop.
Repro: open lobby at 1024×768 as guest → Create → quick match → look at the room.
Observed: only an empty board; `#rail` is `visibility:hidden`, so `.seatcard__sit` ("Ngồi vào · #1") is not visible/clickable (Playwright: "element is not visible"). The only way in is a 20×80 px unlabeled chevron at the far right edge (`#rail-dock-toggle`). Evidence: `2026-10-23-room/40-1024-presit.png`.
Expected: the seat buttons must be reachable without discovering a chevron; at 1280 the same room shows them.
Suspected location: `client/css/room-arena.css:~273` (`.rail-collapsed .rail {visibility:hidden}`), default set by `client/js/room.js:257-269` (B284 "start collapsed at tablet widths").
Smallest patch: extend the existing seated exemption selector `.rail:has(#game-controls:not(:empty))` to `.rail:has(#game-controls:not(:empty), .seatcard__sit)` (and the matching `.room`/`.rail-dock-toggle` rules). Needs a browser re-check at 1024 — not applied (rule 1).
Note: B284 is a deliberate decision; the finding is its side effect before seating.

**M1 (Medium, Interaction) — Keyboard-only users cannot place a stone.** Board SVG is `role="img"` `aria-label="17×17"`, no `tabindex` (probe of `#board-area svg`). Tab order reaches dock toggle, tabs, chat, 4 action buttons, nav — never the board. Location: `client/js/board.js:376`. Patch: needs a design (roving-tabindex grid with Enter to place) → record as a `docs/todo` item, not a one-liner.

**M2 (Medium, Interaction) — Phone: expanding the panel leaves the input below the fold.** 375×812, tap the 28 px triangle `#rpanel-toggle`: tabs appear at y≈600, chat area blank, `#chat-input` at y=1308 (viewport 812); only scrolling `.room` (scrollHeight 1302) reaches it, and then board/clock/actions are off-screen. Evidence: `31b-375-panel-open.png`. Location: `client/css/room-arena.css` phone block (`.room` overflow auto). Smallest patch: on expand, `scrollIntoView` the chat input / `.rpanel` (in `setPanelMinimized(false)`, `client/js/room.js:~228`, where `chatMessages.scrollTop` is already set).

**L1 (Low, Visual) — Touch targets < 44 px on phone:** `#btn-leave` 32×32, `#btn-send` 36×32, `#chat-input` 36 h, `#rpanel-toggle` 28 h, brand link 19 h, `#btn-settings` 40×40.
**L2 (Low, a11y, axe Moderate) — `page-has-heading-one`:** room has no `<h1>` (`client/room.html`; add a visually-hidden `<h1>`).
**L3 (Low, Feedback) — Resign shows no result:** only an italic chat line "guestX đã đầu hàng", then the "Sẵn sàng vào trận?" modal covers the board (`21-resign-300ms-guest.png`). This is documented design (B36 removed the result modal, `room-socket.js:816-850`), so record as an observation, not a regression; a first-time player may not know who won.

**Observations (not findings):** draw/resign both need a second tap within 3 s with a visible "Bấm lần nữa…" countdown — consistent and clear. Chat escapes `<b>` and renders CJK/emoji/apostrophe correctly on both sides; empty send is ignored. Opponent disconnect posts "mất kết nối. Chờ kết nối lại (60s)…" in chat only (no toast).

## Perfection roadmap
- Quick wins: H1 selector, L2 `<h1>`, M2 scroll-into-view, L1 padding.
- Structural: M1 keyboard board.
- Next audit: rerun with spectator + swap2 + time request + a real five-in-a-row ending.

## Hold this in your hands
On a phone, a desktop and a laptop the room feels calm and deliberate: the board is the whole screen, the clocks and four action tiles sit exactly where a thumb expects them, and nothing jitters or throws a console warning. On the tablet-sized middle it betrays that calm: you arrive, see a bare board and no way to start, and the one door in is a hairline chevron. I would hand the phone version to a friend without a word; the tablet version I would have to explain.
