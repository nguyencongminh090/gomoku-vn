# 2026-11-25 21:56 — #474 Club page controls, sentence case, poll button, chat row gap
## Prompt
"Improve Front-end of Club page. 1. Button/...Widget are old design and no fit style with UI. 2. Use uppercase indiscriminately. 3. "cb-poll-new" is on chat bar. Trigger UI/UX audit. I need modrn button/widget to fit my UI. Fix issues."
## Root cause
- Controls: club.html kept the platform-wide `.pbtn`/`.pchip`/`.psearch` (5px, opacity hover) while the CL4 redesign (#446) only restyled the shell; no club-scoped component layer existed.
- Caps: platform.css `.pform label`, `.ptbl th` and club.css `.cl-grp` set `text-transform: uppercase` + .1–.12em tracking.
- Chat gap (found by the audit): `.cb-chat__msg` is a 3-column grid; for staff, flag + delete were two separate grid items → 4 children → delete wrapped into an implicit 2nd row (36px + gap) under every message by others.
## Fix
- club.css: `.cl-hq`-scoped pill buttons (ring, w800, hover fill, press scale, 36/40/44px), pressed tint, danger ring, pill chips (ink selected), pill badge, 12px fields, `.psearch` ring, 20px custom row checkbox, card dialog; sentence case for labels/table heads/`.cl-grp`.
- club.html: `#cb-poll-new` → `cl-ib` check-square icon after the input; nhật-ký filter → `.psearch`.
- club.js: row actions wrapped in `.cb-chat__acts`; poll remove-option = `iconBtn('x')`; event RSVP no longer `pbtn--primary` (aria-pressed styles it).
## Verification
- 2 new tests in client/tests/clubs-pages.test.js: fail on old code, pass now. npm test 4966/4966; cache-bust OK.
- Real server + throwaway DB, Chromium 1365×900 / 390×844, dark + light: 0 console errors; one-line message rows 62px (message tops 112px apart → 64px); Tab from input focuses the poll button with a visible outline.
- Not run: axe-core (not installed), full ux-audit sweep, real touch device.
