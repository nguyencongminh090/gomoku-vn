# B361 — Home: "Thách đấu" replaces "Thách bạn bè" (online players + friends)
**Status:** OPEN
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
