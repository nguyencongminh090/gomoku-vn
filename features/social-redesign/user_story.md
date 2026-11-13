# Bạn bè page redesign — User story

Status: **decided 2026-11-13**: S3 "Trò chuyện" (see [planning.md](planning.md)); build = #370. Diagrams: [page states](diagram/page-states.md).

## Actors
Member (guests see the "đăng nhập" note only), their friends, server (FriendService, DmService, ChallengeService, notifications).

## Stories
1. Opening Bạn bè, I see at once who is online and what they are doing, and can challenge, watch or message them in one tap.
2. Anything waiting for me (challenge, friend request, unread message) is the most visible thing until I answer it.
3. With 0 friends I get a clear way to make one: my name#code to share, a search, people online now.
4. A chat on a phone opens full screen with the challenge button next to send.
5. Long names never push the layout: one line, ellipsis, full name on hover/long-press.

## Rules / hard constraints
- Keep all six functions: notifications, challenges (send/receive), requests (in/out), add friend (search + my code), friends, DMs.
- Board/stones lock (decorative SVG only); no server change until a direction + backend items are decided.
- Tokens from `client/css/tokens.css`, Nunito, dark/light, WCAG AA; photos only with a scrim.
