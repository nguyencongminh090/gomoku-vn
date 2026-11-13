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
- Type scale: Nunito 200–1000; body 16px; sentence h1 clamp(34px, 3.3vw + 8px, 60px) w900, 30px on ≤860px; code boxes 38px (30px phone) w1000; card numbers 40px w1000; labels 12–14px w800 uppercase +.08em. Max three sizes per section.
- Spacing unit: 4px base; scale 8/12/16/24/32/44.
- Radius: blanks .22em, cards 16px, code boxes 16px, main button 999px.
- Motion: subtle; fast 140ms / base 240ms / slow 600ms, ease cubic-bezier(.2,.7,.2,1); one load reveal (rise 14px + fade, staggered 80ms), popover fade+scale 140ms, spinner while searching; prefers-reduced-motion → no movement, spinner replaced by static text.
- Imagery: none (no photos); background = paper grid only, leaves removed, faded out below the hero. Decorative stones/boards CSS only.

## Layout
- Sections (top to bottom): greeting row (Chào name · online tag · 4 icon-only links right) → resume strip (only when the user has a game) → sentence composer h1 with 3 blanks → Chơi nhanh button (swaps to searching state in place) → "hoặc vào phòng bằng mã" + 3-box code input + Vào phòng + "Xem N phòng đang mở"; right column (desktop): Đang tìm trận card (queue, ETA, sparkline), Đang chơi card (count + one live game).
- Eye-flow note: eye enters at the sentence (largest, top-left), reads the chosen options, drops to the Chơi nhanh button; Vào phòng code input is the second stop directly below; stats sit right (secondary, F-pattern). Phone: sentence → button → code input, all above the tab bar.

## Forbidden
- Removing signifiers: blanks must look clickable (fill + underline + chevron); primary action never a ghost button.
- Thin content hidden by empty space (keep the right-column cards; empty state text when 0).
- Emoji as icons; text labels on the 4 secondary links (user chose icon-only + tooltip + aria-label).
- Photos/stock imagery, leaf background on home, animating stones/board.

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
