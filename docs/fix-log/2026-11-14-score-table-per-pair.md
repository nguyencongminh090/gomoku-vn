# 2026-11-14 13:31 — untracked Score table (Tỉ số) per pair, no accumulation
## Prompt
"Scores (Tỉ số) of players should display correctly for their pair, no accumulate (even when 1 keep sit and other player change)" → "Tỉ số (current) hiện lên chính, lịch sử từng cặp vẫn giữ lại."
## Root cause
`room.scoreTable` was keyed by userId and incremented forever in `handleGameEnd`, so a player who kept the seat carried wins/losses earned against previous opponents into the new pair's table.
## Fix
- `GameHandler.handleGameEnd`: pair key = sorted userIds; on pair change `archiveScorePair` moves the old tally into `room.scoreHistory` (cap 20, `{key, players[]}`) and starts a fresh `scoreTable`; a returning pair resumes its old tally.
- `scoreHistory` shipped with `scoreTable` everywhere (serializeRoom, room:updated diff in state.js, game:ended in Game/Room/Disconnect handlers); client stores it in `room-socket.js`.
- `room-ui.js` shows current pair table on top + "Các cặp trước" list (`#score-history`, i18n `room.score_history`, CSS in room.css); phone Tỉ số rows (`room-stage.js`) limited to the current pair.
- Cache-bust written (`?v=`).
## Verification
`server/tests/score-table-pair.test.js` (reset on new opponent, history, resume). Full `npm test` 3808 pass. No browser pass of the history block.
