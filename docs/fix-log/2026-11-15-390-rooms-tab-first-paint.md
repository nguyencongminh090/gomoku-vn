# 2026-11-15 22:10 — #390 Rooms tab snapshot paints its cards at once (no staggered fadeUp)
## Prompt
"Do #390" (from user 2026-11-15 "User mới/cũ có thể nhìn thấy tất cả bàn đang chơi một cách nhanh chóng").
## Root cause
`renderRoomList` (every `lobby:update`: first paint, each re-subscribe on tab switch / visible tab / reconnect, and
langchange) built every card with `animate-fade-up` + inline `animation-delay: 0.04·i s`, fill `backwards` → card i
invisible until its delay ended. Reduced-motion zeroes the duration but not the inline delay, so cards still hid.
## Fix
`renderRoomList` builds cards without the entrance (scope 1, option "none"). The list DOM already stays across tab
switches (nothing blanks it), so a re-subscribe snapshot now just swaps cards in place (scope 2). Patch path untouched:
a card a patch creates keeps its undelayed entrance. Scope 3 (seed without the socket) not done: the measured cost was
the stagger; seeding needs a new endpoint/payload + snapshot-wins merge — record separately if wanted.
## Verification
`client/tests/lobby-snapshot-no-stagger.test.js` (3): first snapshot and second snapshot carry no entrance/delay;
patch card keeps entrance with delay 0 (2 failed before the fix). `npm test` green; cache-bust OK.
Browser (isolated server, fresh DB, 24 open rooms, headless Chromium 390×844; MutationObserver on #room-list, a card
counts as shown when opacity 1 and no running animation):

| | before f1 | after f1 | before all shown | after all shown |
|---|---|---|---|---|
| first paint | 0/24 | 24/24 | 1664 ms | 19 ms |
| home → rooms re-subscribe | 0/24 | 24/24 | 1678 ms | 14 ms |
| reduced-motion, first / again | 0/24 | 24/24 | 960 / 951 ms | 21 / 21 ms |

0 page errors. Not verified: real phone over the Cloudflare tunnel (socket handshake time is unchanged by this fix).
