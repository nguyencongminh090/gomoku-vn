# Platform — User Story

Status: **brainstorm approved 2026-10-09; UI demo first, no implementation.**
Goal: turn gomoku-vn from a multi-player playing site into a Gomoku **platform** (variants kept), public scale (thousands of users).
Related: [planning](planning.md) · [domain model](diagram/domain-model.md) · [rating sequence](diagram/uml_diagram/sequence-ranked-game-rating.md)

## Actors
Guest · Member · Club owner/officer · Tournament organizer · Moderator/Admin.

## Release-1 domains (user-chosen: Profile, Rankings, Clubs)
| Domain | Stories |
|---|---|
| Profile | As a member I have a public page `/u/:name` (avatar, display name, bio, country, join date, per-variant ratings, recent games, clubs, badges); I edit it and set privacy. |
| Rankings | As anyone I can see leaderboards per variant × speed (and club/country filters); my rank is shown on my profile and after a ranked game. |
| Clubs | As a member I can create/join/leave a club; officers manage members/roles; a club has a home page, member list, leaderboard and (later) club tournaments/chat. |

## Later domains (recorded, not in release 1)
Matchmaking/challenges · friends/follow/DMs/notifications · replay & analysis · puzzles · moderation/anti-cheat · i18n.

## Rules / constraints
- Variants kept; rating is kept **per variant × time control**; ranked vs casual flag per game.
- Guests may still play casual games; ranked play and profile need login.
- Board/stones design and backend locks stay untouched (CLAUDE.md rule 7).
- Public scale ⇒ revisit storage (`docs/knowledge/` `data-storage-selection`) before building rating history/feeds.
- One visual style for the whole platform, chosen from mockups via `design-workflow`.
