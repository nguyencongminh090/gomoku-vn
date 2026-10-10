# Club team tournament (CLB vs CLB) — user stories
Raised 2026-10-10 while answering B200 Q4 (user, verbatim): "Giải CLB vs CLB? Mỗi CLB cho phép đăng ký N người và xếp thi đấu, kết quả tính theo số thành tích cá nhân, tổng lại thành thành tích đội?"
Status: **idea recorded, not authorized to implement** (size L). Planning: [planning.md](planning.md).

## Actors
Club owner/officer (captain) · Club member · Tournament organizer · Spectator.

## Stories
- As an organizer I create a team tournament: N players per club, rule set, rounds.
- As a club captain I enter my club and pick up to N members as its roster.
- As an organizer/system I pair players of different clubs and play them with the existing game/clock flow.
- As anyone I see individual results and a team score (sum of members' points) and the club standings.

## Rules / constraints (to confirm)
- Builds on the tournament module (`features/tournament/`), not on rooms; members only; one socket per user.
- Team score = sum of individual points (win 1 / draw ½ / loss 0 — confirm).
- Depends on B200 slice 4 (`tournaments.club_id` link) only loosely; this needs a new `team` format.
