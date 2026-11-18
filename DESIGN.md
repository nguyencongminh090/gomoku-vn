# DESIGN

Scope: home page (`#screen-home`, #358). Other pages keep the Arena tokens in `client/css/tokens.css`.

## Facts
- Site type and main goal: online Caro/Gomoku game platform (Play3CR); home goal = start a game fast (Chơi nhanh) or join a friend's room (Vào phòng).
- Audience: Vietnamese players, casual to club level; ~half on phones; returning users.
- Brand words: nhanh, rõ ràng, thân thiện, bàn cờ giấy (paper-board), tự tin.
- Constraints: existing Arena tokens + green brand, dark/light modes, WCAG AA, Nunito only (self-hosted, CSP blocks external fonts), Vietnamese diacritics, vanilla JS, no server change, BoardRenderer locked.
- Longevity: product (years).
- Hard filters applied: task-critical (both main actions visible in the first screen at 375×812), language coverage (Nunito covers vi), performance (no WebGL, no photo hero).

## Directions
### A. Hai cửa (M1)
- Style note: vstyle-flat-material
- Why: two equal cards, lowest risk.
- Risk: little character; the user wanted something more striking.
### B. Câu lệnh (M4)
- Style note: vstyle-minimalism-swiss
- Why: big type fills the empty space with meaning; the options are the headline.
- Risk: novel pattern; mitigated by visible dropdown affordance (chevron + underline) and a plain big button.
### C. Sân khấu quân cờ (M3) / Sơn mài (M7)
- Style note: vstyle-skeuomorphism-neumorphism / vstyle-handmade-organic
- Why: strongest identity.
- Risk: round buttons hold little text; lacquer leaves the brand green.

## Chosen
Style: vstyle-minimalism-swiss
Reason: user picked M4 (2026-11-12) from 8 mockups in `features/home-redesign/`.

## Tokens
- Color roles: reuse tokens.css (dark default / light): background --c-bg, surface --c-surface, text --c-ink, muted --c-ink-2, primary --c-brand (#4f7d1c / #4d7c1f), brand text --c-brand-text (#8bc34a / #3d6418), blank fill --c-brand-light, main button --c-ink on --c-on-ink with a --c-brand play disc, danger --c-error.
- Skins: zen/bento set `--c-brand` to neutral ink (deliberate, ui-audit F7); success/playing stay green.
- Type scale: Nunito 200–1000; body 16px; sentence h1 clamp(34px, 3.3vw + 8px, 60px) w900, 30px on ≤860px; code boxes 38px (30px phone) w1000; card numbers 40px w1000; labels 12–14px w800 uppercase +.08em. Max three sizes per section.
- Spacing unit: 4px base; scale 8/12/16/24/32/44.
- Radius: blanks .22em, cards 16px, code boxes 16px, main button 999px.
- Motion: subtle; fast 140ms / base 240ms / slow 600ms, ease cubic-bezier(.2,.7,.2,1); one load reveal (rise 14px + fade, staggered 80ms), popover fade+scale 140ms, spinner while searching; prefers-reduced-motion → no movement, spinner replaced by static text.
- Imagery: none (no photos); background = paper grid only, leaves removed, faded out below the hero. Decorative stones/boards CSS only. Exception: phone Home (≤860px) hero photo, #418 (user-approved 2026-11-18; self-hosted webp + dark scrim, white text ≥4.5:1).

## Layout
- Sections (top to bottom): greeting row (Chào name · online tag · 4 icon-only links right) → resume strip (only when the user has a game) → sentence composer h1 with 3 blanks → Chơi nhanh button (swaps to searching state in place) → "hoặc vào phòng bằng mã" + 3-box code input + Vào phòng + "Xem N phòng đang mở"; right column (desktop): Đang tìm trận card (queue, ETA, sparkline), Đang chơi card (count + one live game).
- Eye-flow note: eye enters at the sentence (largest, top-left), reads the chosen options, drops to the Chơi nhanh button; Vào phòng code input is the second stop directly below; stats sit right (secondary, F-pattern). Phone: sentence → button → code input, all above the tab bar.

## Forbidden
- Removing signifiers: blanks must look clickable (fill + underline + chevron); primary action never a ghost button.
- Thin content hidden by empty space (keep the right-column cards; empty state text when 0).
- Emoji as icons; text labels on the 4 secondary links (user chose icon-only + tooltip + aria-label).
- Photos/stock imagery (except the #418 phone Home hero photo), leaf background on home, animating stones/board.

## Phòng tab (#364, R1 "Sảnh gỗ")
- Chosen 2026-11-13 from 8 mockups (`features/rooms-redesign/`). Style: vstyle-flat-material with one photographic hero.
- Imagery: ONE photo, the hero band only (Pixabay 3339748, low-angle wooden board, credited in the hero); dark scrim (left→right + bottom) so white text passes AA on any crop; no photo behind the list. Home stays photo-free.
- Layout: hero (eyebrow + h1 + 4 counts left; code boxes right) → "Đang chơi · N" + online avatars (each = PM) → card grid (auto-fill ≥268px) starting with the "Mở bàn mới" card, the only create entry. No filter tabs, no names line (user 2026-11-13). Phone: hero ≈ title + counts + code row, horizontal cards with a 112px board.
- Cards: live = mini board (lobby SVG, wood token), flag "Đang đấu · mm:ss", watchers; open = faded empty board + "Ngồi vào" primary; ready = empty board, "Sắp bắt đầu".
- Motion: card hover lift 3px (240ms), live dot pulse; none under reduced motion.
- Forbidden: BoardRenderer in the lobby, per-move lobby traffic, photo behind text without scrim.

## Bạn bè page (#370, S3 "Trò chuyện")
- Chosen 2026-11-13 from 8 mockups (`features/social-redesign/`). Style: vstyle-flat-material, messenger layout; no photo.
- Layout (desktop): one card, 3 panes — left 320px (title + search/add, online story strip 48px avatars with presence dot/ring, conversation list with challenges + requests pinned on a warning tint), centre thread (header with status + Xem ván / Thách đấu primary; bubbles; challenge + result cards inline; composer with sword icon + Gửi), right 280px profile (72px avatar, Elo / Đối đầu / Thắng tiles, last-5 chips). ≤1100px drops the profile pane; ≤860px list only, thread full screen above the tab bar.
- Presence colours: free --on #43a047, playing --busy #e08a1e (+ ring on the story avatar), watching --watch #3b82c4, offline = no dot.
- Names: one line, ellipsis, full name in `title`; every flex/grid ancestor `min-width:0`. Applies to every name on the page.
- Eye-flow: pinned items (what needs me) top-left → open thread centre → profile right (secondary).
- Forbidden: names wrapping to 2 lines, equal-weight boxes, emoji as icons, a separate challenge list outside the conversation list.

## Xếp hạng (#374, RK17 "Bục + Bảng điện tử")
- Style: vstyle-maximalism-expressive (one loud zone: the LED arena) + vstyle-motion-immersive (opening only). Picked 2026-11-14 from 13 mockups (RK1–8, RK10–13, merged RK17) in `features/rankings-redesign/`.
- Tokens: own `--led-*` / `--flap-*` / medal tokens in `client/css/rankings.css` (`.rk-page`), following Light/Dark (user 2026-11-14). Dark: night LED #0b0d0a, rank green #8bc34a (≥ 9:1), flaps #f4ffe0 on dark. Light: cream board #f3efe4/#fbf8f1, rank green #3d6418, white flaps with ink #1d2116.
- Type: Nunito 1000 digits (tabular), step numerals 48px (30px phone), row names 18px (16px phone).
- Motion: level `immersive` on first load only — 5 s choreography of ≤ 420 ms transform/opacity steps; 1×/session, skip on any input or "Bỏ qua", prefers-reduced-motion → final state; ticker marquee stops under reduced-motion.
- Layout: ticker → h1 + skip → chips/scope/search → arena (podium 2·1·3, then table rank ≥ 4) → pager → fixed "your rank" dock above the tab bar. Phone keeps # · name · rating (#330).
- Forbidden: delaying data for the animation; re-playing the intro on tab/page switches; motion on the board/stones.

## Hồ sơ (#403, PF7 "Sơ yếu kỳ thủ")
- Chosen 2026-11-16 from 7 mockups (`features/profile-redesign/`, source of truth `mockups/pf7-cv.html`). Style: vstyle-minimalism-swiss (editorial CV sheet); no photo.
- Layout (desktop): one sheet max 1040px, 2 columns. Side 300px inverted (`--c-ink` bg, `--c-on-ink` text): avatar 148px, Liên hệ (@user, place, joined), Rating (3 variants: name left, number right, level bar, rank left + games right), Giải đố, Hội nhóm (name, role below, member count right). Main: name h1 uppercase, fact strip (Thể loại chính / Hạng / Rating / 7 ngày qua, labels above values, vertical rules), actions, 3px ink rule, then sections Giới thiệu → Số liệu (5 numbers + W/D/L bar) → Quá trình thi đấu → Thành tích → Ván gần đây (table).
- Phone (≤860px): side column becomes the top block (avatar 76px + name + rank tag, Liên hệ, 3 ratings in a row); Giải đố/Hội nhóm move below or hide per todo; table keeps Ngày, Đối thủ, Kết quả, ±.
- Tokens: reuse tokens.css; section headings 12–13px w900 uppercase +.2em with a hairline to the right; numbers Nunito 1000 tabular.
- Motion: subtle; sheet rise 600ms, level bars wipe 600ms (80ms stagger), W/D/L bar wipe; reduced motion → end state.
- Forbidden: the "A · B · C" pattern (middle-dot joined facts) anywhere on the page (user 2026-11-16) — use label/value pairs, two-sided rows, pills or separate lines; colour-only win/loss; more than one filled button; game history as tiles.

## Cài đặt › Hồ sơ (ui/settings-profile-bento)
- Chosen 2026-11-16 from 3 mockups (`features/settings-profile-redesign/`): SB "Ô xếp". Style: vstyle-bento-modular (tiles hold different kinds of settings; same-kind rows stay lists).
- Layout: avatar tile (span 4, brand tint) + Giới thiệu + Nơi ở; Riêng tư (3 switch rows) + Ai được liên hệ (3 radio groups: everyone/friends/nobody; friend = everyone/nobody); sticky save bar. Panel max 1040px; ≤860px single column, save bar above the tab bar.
- Rules from the user: no `A · B · C` strings; every button/div fill opaque (tints via color-mix on a solid surface; test in settings-page.test.js).
- Motion: subtle; tile rise 240ms staggered 70ms, switch knob 240ms, segment colour 140ms; reduced motion → none.

## Bàn chơi phone clocks (#413, K1 "Bảng tỉ số trên")
- Chosen 2026-11-17 from 4 mockups (`features/room-clock-mobile/`, K0 = current). Problem: on phones my clock sat bottom-right under the thumb (user report: the hand covers the clock).
- Layout (≤768px): one scoreboard row right under the nav, 2 equal cells: opponent left (avatar 32px, name, "Đối thủ", time), me right mirrored (time, name, "Bạn", avatar). Bottom seat card removed on phones; board gains its height. Nothing time-critical below the board.
- Turn: the running cell is filled `--c-brand` + white text (not colour alone: also the filled shape); low time → `--c-error` fill, as now. Time 26px Nunito 800+ tabular.
- Spectators: same row, seat #2 left, seat #1 right (same order as the old top/bottom cards).
- Forbidden: any clock in the lower half on phones; names wrapping (ellipsis, `min-width:0`); the `A · B` pattern in cell labels.

## Home phone: Tạo phòng button (B "Chip lên trên")
- Chosen 2026-11-18 from 3 options (A literal under Chơi nhanh, B chips above, C 2:1 row). Scope: phone Home hero (#418, `body.zen-lobby`, ≤860px); desktop unchanged. Style: inherits #418 hero (vstyle-flat-material + photo).
- Hard filters applied: task-critical (Chơi nhanh stays the one primary action), WCAG AA, no new tokens outside `--hh-*`.
- Structure: hero = title → slogan → 3 chips (`.hh-chips`, moved up) → Chơi nhanh (amber, 64px) → **Tạo phòng** (new, full width) → stats. Chips stay touching the button they configure; Tạo phòng is the second stop, directly under Chơi nhanh.
- Button: secondary "glass" — background rgba(255,255,255,.12) + blur(8px), 1.5px border `--hh-on-photo-2`, text/icon `--hh-on-photo` (white on ≥.6 dark scrim, ≥ 7:1), radius 999px, min-height 52px (< 64px of the primary), 16px w800, Phosphor `ph-regular-plus-circle`, gap 8px under Chơi nhanh. Focus: 3px white outline, offset 3px. Copy: "Tạo phòng" (sentence case, vi, reuse an existing i18n key if one fits).
- Action: `[data-create-room]` → existing `openModal()` (lobby.js; guests forced friendly — already handled). Not `id="btn-create"` (e2e specs target the Phòng tab card).
- Searching state: while Chơi nhanh shows `.hq-search`, Tạo phòng stays visible but disabled (opacity .55) — no create during a queue.
- Motion: none new; press = existing button active state; reduced motion unaffected.
- Defaults kept: full-width stacked buttons (thumb reach, one column on 360px).
- Forbidden: amber/brand fill on Tạo phòng (two primaries); ghost text-link only (too weak on a photo); putting it between Chơi nhanh and the chips; emoji "+".
