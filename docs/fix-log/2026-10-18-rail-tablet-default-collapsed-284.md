# #284 — Rail defaults to collapsed at 769–1024px
**Root cause:** rail default was "open" at every desktop-layout width; 364px rail left ~501px board at 900px wide.
**Fix:** `room.js` — with no stored choice, start collapsed when `(min-width:769px) and (max-width:1024px)`; the default is not persisted (resizing to wide still opens); stored choice always wins. Chose default-collapse over narrower `--rail-w` (todo's cheapest option; B283 keeps clocks/controls visible while seated).
**Test:** `client/tests/room-rail-dock.test.js` "tablet default (B284)" ×3. Full suite 3368 pass; ?v= bumped.
**Unverified:** real-browser board size at 769/900/1024 (expect ≥ ~560 at 900×700).
