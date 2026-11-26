# 2026-11-27 01:59 — #497 follow-ups: three mismatches seen in the browser-pass screenshots
## Prompt
features/presence-status success criterion 2 ("same user, same state, same label and colour on every page"),
checked against the #497 screenshots.
## Root cause
1. social.html profile pane: its avatar badge was drawn once on open (renderWho); the 10 s friends poll redrew the
   header and story strip only → the pane kept "playing" while the header said "playing, away".
2. Lobby DM window: #490 gave every DM window the public projection, and `checkPartners` only asked the server when
   the online list was truncated → an away FRIEND read "Ngoại tuyến" there while the challenge picker said
   "Đang chơi, tạm rời trang" (planning §2d: public only for a non-friend).
3. Toast/system text for an abortable absence said "before the game began" while both clocks were running;
   abortable means "before both players have acted".
## Fix
1. social.js `refreshWhoBadge()` after each poll (badge only, a half-armed unfriend button is kept).
2. FriendService.friendIdsAmong (one query); LobbyHandler `lobby:online_query {ids}` adds `st` (friend audience)
   for friends; private-chat.js always checks partners outside the page and renders a friend's `st`. Pull-only.
3. room.absent_abortable / sys.game_aborted_absent (vi, en) + DisconnectHandler fallback text reworded.
## Verification
social-bell (pane follows the poll; mutation: drop the call → fails), private-chat-online-paging (friend away →
presence.playing_away; changed: a complete list now makes one {ids} lookup on openChat), LobbyHandler (#497 st),
friends-route (friendIdsAmong SQL). npm test 296/5285. Browser rerun: see B497.
