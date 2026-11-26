# presence-status — user stories

Design folder for one canonical player status (presence) and the leave/disconnect policy.
Source prompt: [prompt.md](prompt.md). Design + audit: [planning.md](planning.md).
Diagrams: [state + class](diagram/state-model.md), [sequences](diagram/uml_diagram/sequences.md).
Knowledge: [docs/knowledge/presence-and-abandonment.md](../../docs/knowledge/presence-and-abandonment.md).

## Actors
- **Player**: seated in a room game (casual, rated, quick-match, challenge series) or a tournament match.
- **Opponent**: the other seat of the same game.
- **Spectator**: in the room with no seat (`slot === null`), or subscribed to a tournament match.
- **Friend**: accepted friendship; sees status on social.html, the challenge pickers, the DM window.
- **Lobby visitor / stranger**: sees the online list, counts, room cards.
- **Staff (admin, `rating.integrity`)**: reviews fair-play signals.
- **Guest**: no durable account (24 h session), cannot play rated games (`RatingService.isRatedSetup`).

## Stories
1. As a player, when I switch tabs or lock my phone, my opponent sees "away" or "reconnecting" with a
   countdown, and friends see the same fact, not "free" or "offline".
2. As an opponent, when the other player leaves or stops responding, the game ends within a known time
   with a known result, and I never wait more than the stated window.
3. As a player with a bad connection, a short drop or an incoming call does not cost me the game by
   itself; my clock behaves as it would at a real board.
4. As a friend, I see the same label and colour for a user on every page (social, pickers, DM, lobby),
   within the latency target of that page.
5. As a user who hides my online status, nobody outside my own room sees that I am online.
6. As staff, I can see how often a player disconnected or left the tab during rated games, as evidence
   for a human decision, never an automatic penalty.
7. As a spectator, I can always come back to a live room (#115), and the spectator list shows only people
   actually watching (#373).

## Rules (behaviour that must not change)
- An evicted socket cannot overwrite the live socket's status (`RoomHandler.js:138`).
- Page bounces do not restart the in-game grace (#422, `DisconnectHandler.js:52-56`).
- Room presence follows the room-page socket (#373, `socket.data.roomPageId`).
- Hide-online is respected everywhere outside the user's own room (#199, #370).
- DM push depends on a present socket, not a heartbeat (#372 review, `SocketHandler.js:136`).
- Viewers can return to a live room at any time (#115).
- The server decides status and results; client reports are signals only (forgeable).

## Hard constraints
- Broadcast cost at or below today's (changes only, debounced, measured per transition).
- Colour is never the only cue; every status has an i18n text label.
- Clock or grace changes follow `.claude/rules/diagnostic-page-sync.md`.
- Cached old clients keep working during a deploy (additive wire fields first, removals later).
- Rooms and grace timers live in memory; a server restart must never count against a player.
- Tournament clock: standing user decision "do not touch tournament for now" (2026-08-28) — any change
  there is a question, not a plan.
