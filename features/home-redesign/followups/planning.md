# Home M4 follow-ups — #360 (phone secondary links) + #361 (Thách đấu)
Mockups patch the REAL built M4 page (`ui/home-sentence`) in the browser: `shoot.js` → `shots/`. Status: DECIDED 2026-11-12 — #360 = N2, #361 = T2, single game + "Tuỳ chọn khác" → #222 modal. Not built.

## #360 — where Học / Diễn đàn / Giải đấu / Hội nhóm go on phones (desktop unchanged)
- **N1 bottom row**: 4 icon+label links at the end of the page (after the count cards). Top = sentence only. Cost: links need a scroll.
- **N2 tiles after code**: 2×2 labelled tiles right after the room code, before the cards. Most discoverable; pushes cards down.
- **N3 "Khám phá" button**: one pill in the greeting row → bottom sheet with 4 labelled tiles. Top stays light; one extra tap. (Pill wraps to its own line at 375 with the online tag — fix: drop the tag on phones or icon-only pill.)
Open: tab bar already has "Giải" → keep Giải đấu in the list or drop it?

## #361 — Thách đấu (replaces "Thách bạn bè")
- **T1 second sentence**: "Hoặc thách [chọn đối thủ ▾] cùng luật trên." + outline "Thách đấu" button; blank opens the opponent picker. Reuses the first sentence's rule/time/mode.
- **T2 twin buttons**: [Chơi nhanh] [Thách đấu] side by side (stacked on phone); Thách đấu opens the picker with the current rules shown.
Picker (both): search + tabs Tất cả / Bạn bè / Đang online, rows = avatar + online dot + name + Bạn bè tag + Elo, send button "Gửi lời thách tới X". Sends through existing ChallengeService (privacy gate `who_can_challenge`; 2-min TTL).
Open: (1) T1 or T2; (2) series/best-of options from #222 modal — hide on Home (single game) or link "Tuỳ chọn khác"? (3) online list source: one-shot snapshot (preferred, B229) vs joining `lobby`.
