# UX audit — Lobby, mobile (375 × 812, touch) — 2026-10-22

Persona: first-time guest on a phone, wants a quick game with a friend, one hand, no account.
Server: isolated `:3102`, temp DB, `CORS_ORIGIN=http://localhost:3102` (`.env` pins the prod origin → socket `AUTH_ORIGIN` otherwise). Real DB untouched.
Evidence: `docs/audits/2026-10-22/*.png`.

```
VERDICT: Incomplete  (walkthrough done; self-critique sub-agent, INP, keyboard-only, heavy-data, 2nd-user scenarios NOT run)
Hard gates: console err 0 / warn 0, 5xx 0, 403/404 0, layout collapse 0 (320/375/414/768 no h-scroll), axe Critical 0 / Serious 0 (1 Moderate)
Perf (/index.html): LCP 0.17 s, CLS 0, INP not measured
Findings: Critical 0  High 0  Medium 2  Low 2
```

## Exercised
guest login → lobby inventory (all targets ≥ 44 px) → chips Standard + 5+3 (summary line updates) → **Giao hữu** (WS `match:join`, UI → "Đang tìm đối thủ… 0:03" + "Huỷ tìm", stats 1 searching) → "Xem phòng đang mở" → tabs Phòng/Bàn/Quan sát → join-by-code with `ZZZZ9` (inline error shown) → create room with `Phòng Tý's <b>x</b> Ếch` (no markup injected) → room → Back.

## Findings
**M1 · Back from the room bounces straight back into it** — Interaction. 375 px, lobby → Tạo phòng → Tạo nhanh → room → browser Back.
Observed: nav `index.html#rooms` then immediately `room.html?id=…` (trace in a8). Expected: lobby stays. A phone user's Back button cannot leave a room they created. Suspected: `client/js/lobby.js:289` (`room:joined` → `location.replace`, fired on lobby subscribe while still seated). May be intended auto-resume; then the room needs a visible leave control (none found by text search `rời|thoát|sảnh`). Patch: skip the redirect when arriving via history (`performance.getEntriesByType('navigation')[0].type==='back_forward'`) or show a "Quay lại phòng #XXX" banner instead of redirecting.

**M2 · Rooms are 3 screens down the lobby home** — first-time lens. "Xem phòng đang mở" sits at y≈1148 (viewport 812) inside "Ván đang chơi", below the whole quick-match customiser; bottom nav has no Rooms entry. Someone who wants to join a friend's room scrolls past ~12 chips. Suspected: `client/index.html` home order. Patch: move "Xem phòng / Vào bằng mã" row directly under the quick-match card (or into the `Chơi` tab header).

**L1 · axe `landmark-complementary-is-top-level` (moderate)** — an `aside` nested in another landmark on `/index.html`. Patch: change the nested `<aside>` to `<div>`/`<section>`.

**L2 · Create modal defaults to "Xếp hạng" for a guest** (09-modal-filled.png) — guests cannot play ranked; hint text below explains but the selected card contradicts. Patch: preselect "Giao hữu" when `isGuest`.

## Not a bug (ruled out)
Mid-page bottom nav in `01-lobby-375-full.png` = Playwright full-page stitching of a fixed element. First `Giao hữu` "no feedback" run = wrong test origin, not the app.

## Roadmap
Quick wins: L1, L2. Structural: M2, M1 (decide intended behaviour first).

Hold-this: the lobby feels calm and quick — the one-tap Giao hữu with a live timer is the right hero — but the page behaves like a settings screen after that, and the room it drops you in won't let go.
