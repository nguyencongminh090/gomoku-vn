# 2026-10-17 05:46 — #264 Page weight: lazy profanity filter; i18n split + room defer/CSS merge declined
## Prompt
"Do #264"
## Root cause / re-baseline
- The todo's "~90 KB profanity" was wrong: `profanity-classifier-model.js` is only `require()`d by Node; no page
  loads it. Room loaded only `profanity-filter.js` (39 KB raw / 12.3 KB gzip) at startup, used solely by the
  cosmetic pre-send pass in `room.js` (server `ChatHandler` is authoritative; sender sees the server echo).
  Lobby never loads it (`private-chat.js` guard is always false there — unchanged).
- Bottleneck is round trips, not bytes (#262/#263): static HITs ~150 ms each, cached immutable after first visit.
## Fix
- `room.html`: startup `<script src="js/profanity-filter.js">` removed. `room.js` injects it as a classic
  script (UMD global, see `room-entry.js` header) on chat-input focus, once; URL carries the digit `?v=N`.
  Sending before it arrives emits raw text (unchanged fallback, server filters).
## Declined (deviations from todo scope, why)
- i18n split: user chose "don't split" (2026-10-17). vi/en keys identical (1454/1454); split saves ~20 KB gzip on a
  vi user's first visit only, but makes vi→en switching cost 1 RTT (`setLanguage` returns early on a missing
  dict) and touches ~15 tests that read/eval `i18n.js`.
- Room `defer`: the classic scripts already sit at the end of `<body>` right before the module → no gain;
  `timer-sync-core.js` is clock work (rule 7). CSS merge: splits the shared cross-page CSS cache and nears the
  "no bundler" ban.
## Verification
- `client/tests/room-profanity-lazy.test.js` 6 tests (6 fail before); `npm test` 180/3297 green; `?v=389` single.
- Real server (GOMOKU_DB_PATH temp DB), Chromium: room load 32 resources, 0 profanity requests; after chat focus
  1× `200 /js/profanity-filter.js?v=389`, `ProfanityFilter.filterMessage` defined; "đụ má mày" → "***** mày" in
  chat; console errors/warnings 0 (CSP `script-src 'self'` allows it).
- Result: room startup −1 request, −39 KB raw / −12.3 KB gzip (lobby unchanged).
