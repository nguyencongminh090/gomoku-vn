# B466 — Verify: team tournament page in English locale
**Status:** ✅ VERIFIED 2026-11-25 — English team page OK, no raw keys or Vietnamese UI strings
**Area:** client/js i18n (tdetail.team_*), tournament page
**From:** club-platform handoff (memory), 2026-11-25   **Depends:** B460

## Scope
1. Real-browser pass with English locale on a team tournament: no raw keys, no Vietnamese leftovers.
2. Record result here. A real bug → own todo, not fixed in this session.

## Done when
- Screenshots checked and result recorded.

## Result (2026-11-25, dev fc980764, `verify.cjs en`, temp DB)
- Static: 43 `tdetail.team_*` keys in vi, same 43 in en.
- Browser (`play3cr_lang=en`): roster, boards and standings after 1 played board. Page text scan: 0 raw
  `tdetail.|tournaments.|err.` keys, 0 Vietnamese UI words (weak: JS `\b` is ASCII-only, so words starting/ending
  on a Vietnamese letter could not match — see static check below); club/user names stay as entered.
  Labels read "Club Team Match", "Live", "2/2 clubs", "2 boards per team", "Board 1", "Rank #1",
  "1 won 0 drawn 0 lost", tabs "Pairings / Standings / Games History", nav "Events".
- Shots: `features/club-platform/screenshots/verify/en-team-{roster,boards,standings}-{desktop,mobile}.png`.
- Static check (covers end states not rendered in English: finished, champion/runner-up, time agreed,
  confirm/dispute): 69 `tdetail.*`/`tournaments.*` team/champion/finish/agreed keys — every `en` value
  present, none contains Vietnamese diacritics. Not rendered in English: the finished event screen.
