# B361 — Home: "Thách đấu" replaces "Thách bạn bè" (online players + friends)
**Status:** ✅ DONE 2026-11-12 — T2 built on ui/home-challenge-tiles (uncommitted)
**Area:** client/index.html (#qm-friend), client/js/lobby-home.js, client/js/challenge-modal.js (load on index), client/css/shell.css, i18n; server only if a gap is found
**From:** user 2026-11-12 after #358 review: "Ẩn Thách bạn bè hoặc thay thế bằng Thách đấu (thiết kế giống chơi nhanh). Cho phép thách đấu những người đang online hoặc bạn bè."   **Depends:** #358, #222 (ChallengeModal, series)

## Problem
The grey "Thách bạn bè" link only jumps to /social.html#challenge (friends). User wants a first-class Thách đấu on Home, styled like Chơi nhanh, targeting online players or friends.

## Scope
1. DECIDED 2026-11-12: **T2** (followups/shots/t2-*) — [Chơi nhanh] [Thách đấu] side by side (stacked full-width on phone); Thách đấu = outline pill + accent sword disc; replaces #qm-friend. Picker = popover under the button (desktop) / bottom sheet (phone); shows the sentence's rule/time/mode.
   Single game only (no series/Elo-swap UI on Home); small "Tuỳ chọn khác" link opens the full #222 ChallengeModal.
2. Opponent picker: friends (/api/friends, online flag) + online players (lobby:online_users snapshot — Home is not in the `lobby` room today, B229) with search; members only.
3. Send via existing ChallengeService/ChallengeModal (rule/time/rated/series); privacy gate errors shown (CHALLENGE_NOT_ALLOWED).

## Don't
- No new challenge rules/server logic unless a real gap is found (server already allows non-friends via who_can_challenge).

## Traps
- Subscribing Home to `lobby` re-adds room-list traffic (B229) — prefer a one-shot snapshot.
- Guests cannot challenge (members only); bots/self excluded.

## Done when
- jsdom: picker lists friends + online, sends challenge, guest hidden; browser pass 1280/375 with 2 users.

## Result (2026-11-12)
- Server gap filled: `GET /api/challenges/online` → `ChallengeService.onlineCandidates` (hook `onlineUsers` = visible presence; guests/self/privacy-refused excluded, cap 50). One-shot, Home not in `lobby` (B229).
- Client: `#qm-challenge` (replaces `#qm-friend`) + `js/home-challenge.js` picker (search, Tất cả/Bạn bè/Đang online, merge by username). Sends full #222 settings = what quick match would seat (board 17, wall/portal from the pick, auto→m60), games 1. "Tuỳ chọn khác" → ChallengeModal (now loaded on index). Sent notice in `#qm-line`. Hidden while searching / for guests.
- Deviation from T2: popover only when ≥460px is free under the button; else a bottom sheet (centered, ≤480px) with a scrim that swallows the closing tap. Home doesn't scroll and the button sits ~540px down, so on usual desktop heights (720–1000) it is the sheet.
- Traps: POST reply (`ChallengeService.view`) has no `to` → name-less notice `home.ch_sent_any`; focus the button before `ChallengeModal.open` (it restores focus to the opener).
- No Elo in rows (not in either payload). Tests: challenges-route `GET /online` (4), lobby-home `#361` (15). Browser 1280×860/720, 1440×1000, 375×812 (shots followups/shots/built-*, scripts followups/pass-built*.js): send → stranger accepts → both seated in `#ZKT`; 0 console errors.
