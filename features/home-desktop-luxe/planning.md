# Home desktop luxe: planning

Status 2026-11-19: three mockups built, waiting for the user's pick. Nothing in `client/`, `server/` or `DESIGN.md` changed.

## Decisions already made by the user
- Explore all three: C1 "Chữ sau quân cờ", C2 "Năm quân thắng", C3 "Bình phong sơn mài".
- Self-hosted serif for display text. Tested: Playfair Display (OFL, has a Vietnamese subset). Stacked marks touch the line above at line-height 1, so multi-line titles need at least 1.12.
- Hero stays dark in light mode.
- Shell nav is transparent over the image, Home desktop only.

## How to run
`PORT=3101 CORS_ORIGIN=http://localhost:3101 GOMOKU_DB_PATH=<scratch>.db node server/index.js`, then `node features/home-desktop-luxe/shoot.js c1,c2,c3`.
`lx.js` moves the real Home nodes into each layout at ≥861px; `/api/home` is sample data; home pushes are ignored during shots. Phone: `lx.js` exits, CSS is under `min-width: 861px`.

## Measured (1024, 1280, 1440, 1920)
- No horizontal overflow, no console errors, text over art at least 6.98:1 (95th-percentile background).
- Reduced motion: 0 running animations, Chơi nhanh visible.
- Art weight: C1 197 KB, C2 197 KB, C3 203 KB. Font: 58 KB for 4 files.
- Contrast covers nav, titles, greeting, labels, count labels and link labels; not chips, `#qm-line`, live rows, news or the resume strip.
- Not checked: 861-1023px, guest state, English, keyboard order (C2 stage comes before the option chips in the DOM), LCP on a real connection, display-font swap reflow, real pointer feel of parallax/panel motion, Safari/Firefox.
- All three replace the desktop M4 sentence (#358) with chips; C1 also hides `#home-live-one` and "Xem phòng đang mở".

## Motion
| moment | trigger | tool | duration / easing | reduced motion |
|---|---|---|---|---|
| headline/console reveal | load, once | CSS keyframes | 500-900 ms, `cubic-bezier(.23,1,.32,1)` | none, end state |
| C1 stone + table parallax | pointer, fine pointer only | rAF + `translate` | 500 ms settle | off |
| C2 link stone | hover | `scale` | 140 ms | off |
| C3 panel opens | hover/focus | `flex-grow` in mock | 480 ms | instant |

Before production C3 should replace `flex-grow` with a transform/clip-path approach. Stones never move relative to their board.

## After the pick
1. Update `DESIGN.md` (ask first: photos on desktop Home and a second font change its rules).
2. `docs/todo/<CODE>` + `TODO.md` line, then `ui/<slug>` off `dev`.
3. Move i18n strings out of `lx.js`, self-host the font under `client/vendor/fonts/` (preload it or use `font-display: optional`, so the giant headline does not reflow), add art to `client/assets/` with `?v=`, preload the hero image.
4. Replace the DOM moves with real markup; keep every id and the phone layout unchanged. jsdom + real-browser pass.
