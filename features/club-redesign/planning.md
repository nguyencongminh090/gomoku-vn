# Club redesign — planning (2026-11-24)

Scope: `client/club.html` + `club.js` (`/c/<slug>`) as the main target, with a matching `client/clubs.html` + `clubs.js` (Khám phá) per direction. Big refactor allowed; the user asked for innovative ideas.
Process: `design-workflow` stage 3 (mockups; the user decides) + `ui-brief` / `ui-motion` / `ui-images` (art from Codex). `client/`, `server/`, `DESIGN.md` untouched until a pick. Not committed.
User answers 2026-11-24: both pages; 6 directions; new server data allowed if tagged API.

## Mockups (static; fixture `data.js` mirrors getClubDetail / listClubs / clubsOfUser / messages; shared `common.css`; `icons.js` generated from the sprite)
Open `index.html`. Each mockup's top bar: Trang nhóm ↔ Khám phá, viewer Khách / Thành viên / Quản lý, light/dark. `?need=off` hides API markers.
Reshoot: `node features/club-redesign/shoot.js [ids]` → `shots/<id>-{club-dark-1280,club-light-1280,club-staff-1280,club-dark-375,club-light-375,disc-dark-1280,disc-light-375}[-fold].png`.

| id | idea | structure (club / discover) | style note | needs new API |
|---|---|---|---|---|
| cl1-san-nha | Sân nhà (safe) | banner + crest + 4-stat strip + sticky tabs, 2 columns / card grid with banners, "Nhóm của bạn" row | vstyle-flat-material | online count, avg trend, RSVP count, bannerUrl in list |
| cl2-bang-tin | Bảng tin | cork wall, masonry of pinned do-paper notes (ticket stubs, tally sheet, polaroids) / wall of flyers with tear-off tabs | vstyle-handmade-organic | RSVP |
| cl3-doi-hinh | Đội hình | members as stones on a 15×15 board, strongest at tengen; side card for the picked stone / each club a 9×9 board filled by member count | vstyle-skeuomorphism (board accent) | presence, 7-day delta, last-5 results |
| cl4-hoi-quan | Hội quán | 4-pane app: my-clubs rail, channels, chat stream with system cards, members by presence; visitors see a blurred preview + join card / directory with live "featured" | vstyle-flat-material (messenger) | activity feed, live games of members, presence, RSVP, online per club |
| cl5-co-hieu | Cờ hiệu | club colour floods the head, giant outlined tag, pennant; Swiss sheet: numerals + numbered roster / "Bảng hội nhóm" league table, top 3 as colour slabs | vstyle-minimalism-swiss + one loud zone | avg trend, presence |
| cl6-mua-giai | Mùa giải | match-day countdown + "Tôi sẽ đến", fixtures & results, weekly table with form, squad of numbered shirts, rivals, trophy cabinet / matchmaker: clubs ranked by fit % to MY rating | vstyle-flat-material (sports) | RSVP, club-vs-club results (#236), last-5 form, games/week, season history, weekly active, activity hours |

Every direction runs on today's API alone if the API-tagged parts are dropped; CL3/CL5 lose least, CL4/CL6 lose most.
Also tagged in every direction (checked against `clubTournaments`/`weeklyBoard` 2026-11-24): tournament round/rounds/leader/winner/cap (API sends id, name, format, status, createdAt, startedAt, players), the ranked-club total ("/ 57"), event RSVP counts. `weekly.played` exists.

## Art (Codex, prompts in `prompts/`)
`img/banner-{ink,lantern,bamboo,sea}.webp` 2400×640 (stand-ins for club-uploaded banners), `cork.webp`, `paper.webp`. Clubs without a banner get a generated stone pattern on the club colour (`genBanner`), so no club looks empty. No real marks or logos; crests are tag + `--club-*` colour.

## Rules applied
- One filled primary per screen, by viewer: Khách → Tham gia / Xin vào; member/staff → Mở ván giao hữu (CL6: Tôi sẽ đến). Staff see a pending-requests block with count (badge 3) in every direction.
- Club identity = `color` + `tag` (already in the API): `--cc` tints accents, never body text below AA (`--cc-text` lightened in dark mode).
- No "A · B · C" strings; names one line + ellipsis (24-char no-space name and club name in fixture); Phosphor sprite icons only; Nunito, body 16px.
- Motion (subtle; CL5 hero expressive): load rise 70 ms stagger, banner settle 600 ms, note pin-in (CL2), tag slide 600 ms + pennant sway 1.2 s once (CL5, the one deliberate over-token duration), bar wipes, count-up, hover lift behind `(hover:hover)`; transform/opacity only; `prefers-reduced-motion` → end state (common.css). Stones never move (CL3 animates only the selection ring, 3 pulses then still).
- Shots checked: no horizontal scroll at 375, no tap target < 36 px.

## Open questions (for the pick)
1. Which direction, or a merge (e.g. CL1 shell + CL3 board as the Members tab + CL6 matchmaker for Khám phá)?
2. Which API items are worth building (each becomes its own todo)? Presence and RSVP unlock the most.
3. CL4 shows members' presence to visitors: keep, or members only?
4. Is chat central (CL4) or a tab (others)?

## Side finding
Mojibake "nhÃ³m" in client/*.html fallback text → recorded as #445 (not fixed here).

## Not verified
Real page/data, real phone/Safari, light-mode contrast measured only by eye on the shots, motion seen only as end state (shots use reduced motion), keyboard pass on CL3 stones only by code.

## Decision 2026-11-24
User picked **CL4 "Hội quán"** (source of truth `mockups/cl4-hoi-quan.html`, shots `shots/cl4-hoi-quan-*`). Chat is the centre of the club page (answers open question 4).
DESIGN.md section "Hội nhóm (#446)" added. Implementation = `docs/todo/B446-club-hoi-quan-redesign.md`, later session. Questions 2 (which API items) and 3 (presence shown to visitors) moved there.
