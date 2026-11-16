# Profile redesign — planning

Scope: `client/profile.html` + `client/js/profile.js` (page at `/u/<name>`), desktop + phone. Big refactor allowed (user 2026-11-16).
Process: `design-workflow` (stage 3 = mockups, user decides) + `ui-brief` / `ui-motion`. No `server/` change without a todo.

## Mockups (static, fixture in `data.js`, shared `common.css`; `icons.js` is generated from the sprite)
Open `index.html`. Top bar of each mockup: "Đang xem…" switches other ↔ own profile, ◐ switches dark/light. `?need=off` hides the API markers.
Reshoot: `node features/profile-redesign/shoot.js [ids]` → `shots/<id>-{dark,light}-{1280,375}[-fold].png`, `self-*`.

| id | name | style note | needs new API |
|---|---|---|---|
| pf1-poster | Áp phích: hero + stat strip + tabs, phone action dock | vstyle-flat-material (safe) | per-game rule/moves/delta, badge dates |
| pf2-bento | Bento tiles | vstyle-bento-modular | activity heatmap |
| pf3-scoresheet | Sổ kỳ phổ: paper score book, seals, ledger | vstyle-handmade-organic (accent only) | per-game rule/moves/delta |
| pf4-gallery | Phòng trưng bày: mini boards per game | vstyle-skeuomorphism (board accent) | final position per game, "memorable game" |
| pf5-versus | Đối đầu: them vs you / own goals | vstyle-flat-material + one loud zone | head-to-head, rating gain preview, rank neighbour, ranked-win count |
| pf6-journey | Hành trình: rating road + timeline | vstyle-minimalism-swiss + timeline | badge dates, streak dates, weekly groups, >90-day history |
| pf7-cv | Sơ yếu kỳ thủ: CV sheet, inverted side column, CV sections (added on request 2026-11-16) | vstyle-minimalism-swiss (editorial) | dated career entries, badge dates, per-game rule/moves/delta |

Available today (GET /api/profile/:username, /games, /rating-history): name, username, joined, avatar, bio, city/country,
ratings (rating, rank, games, provisional, delta7), stats (games/wins/draws), streak (current/best), badges (ids only),
puzzles (solved, level, threshold), recent games (id, opponent, result, endedAt), clubs, friendship, can.*, 90-day points + peak.

## Rules applied (SKILLS_TREE notes)
- One filled primary action (Thách đấu / Chỉnh sửa), top-left of the first screen (vbase-visual-principles, vbase-eye-flow-scanning).
- Game history stays a list/table; tiles only for mixed blocks (vstyle-bento-modular). PF4 breaks this on purpose — its risk.
- Win/loss never colour alone: letter chip T/B/H or the word, deltas with arrow (WCAG 1.4.1).
- Motion level `subtle`: load reveal (rise, 70 ms stagger), chart wipe 900 ms, rating count-up 700 ms, seal/pin pop, card hover lift behind `(hover:hover)`; transform/opacity/clip-path only; reduced motion → end state (fe-web-animation).
- Names one line + ellipsis; tested with a 24-char no-space name.

## Decision 2026-11-16
User picked **PF7 (CV)**; rule added: no "A · B · C" middle-dot pattern (mockup revised). Implementation = `docs/todo/B403-profile-cv-redesign.md`, later session. Remaining questions moved there.

## Open questions (superseded)
1. Which direction (or merge)? e.g. PF1 base + PF5 tape on others' profiles + PF4 boards in the Ván đấu tab.
2. Is a server change allowed for the picked direction's API items (each becomes its own todo)?
3. Letter chips T/B/H ("B" = bại) or full words only?
4. Keep "Sao chép liên kết" (new, own profile) or drop?

## Not verified
Real page, real data, real phone/Safari; motion seen only as end state (screenshots use reduced motion); light-mode contrast not measured.
