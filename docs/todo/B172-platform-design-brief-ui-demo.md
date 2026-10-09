# B172 — Platform design brief + UI demo (no implementation)
**Status:** ✅ DONE 2026-10-09 — user chose C Arena as default skin (dark + light); A Zen and D Bento kept as optional skins; B Sumie dropped. Mockups: client/platform-{zen,sumie,arena,bento}-mockup.html. Not verified: a11y contrast measured by tool, light mode on every screen.
**Area:** `features/platform/`, new `client/platform-*-mockup.html` (standalone, no server)
**From:** user 2026-10-09 "ask about demo UI first (not start direct to implement)"; `features/platform`   **Depends:** —

## Problem
Site becomes a platform (Profile, Rankings, Clubs). Style and IA must be agreed visually before any code.

## Scope
1. Load `design-workflow`; run Stage 1–2 (context + brief) with ONE structured question set; save brief in `features/platform/design-brief.md`.
2. Stage 3: mockup candidates (2–3 style directions) of: app shell/nav, profile page, rankings page, club page, mobile bottom-tab variant. Reuse existing `lobby-bw-*-mockup.html` styles as candidates.
3. Present; record user's pick + answers to planning Q1/Q4/Q5/Q6 in `planning.md`.

## Don't
- No server/DB/route changes; no `?v=` bump (mockups are standalone, not linked from the app).
- Don't redesign board/stones.

## Why this way
`design-workflow` Stage 3 convention; `docs/knowledge/ui-ux/INDEX.md` (ux-information-architecture, ux-design-systems, ux-responsive-mobile-first).

## Done when
- User approved one direction in writing; B173–B178 unblocked.

## Progress 2026-10-09
Brief: `features/platform/design-brief.md`. Mockups (static, 11 screens, desktop + mobile tab bar): `client/platform-{zen,sumie,arena,bento}-mockup.html` (A/B/C/D). Awaiting user pick + planning Q1/Q4/Q5/Q6.
