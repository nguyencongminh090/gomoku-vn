# Fix log entry — 2026-08-14 20:56

## Prompt

User report (chat, filed to TODO.md #121 first, then "Do #121" in a later turn):
"Scope: Room. Replace room name (default): 'phòng của ...' -> ID (#...)".
When asked to pick between two proposed default formats, the user specified
the exact one: `#<roomID>`, no "Phòng" word.

## Action

`server/managers/RoomManager.js:130`, in `createRoom()` — replaced the
default room-name fallback:

```js
// before
const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `Phòng của ${userInfo.displayName}`;
// after
const roomName = settings.roomName ? settings.roomName.slice(0, 30) : `#${roomId}`;
```

Reused `roomId` (already generated one line above via `_generateRoomId()`,
a 3-char code) instead of computing anything new. The custom-name branch was
left untouched. Checked `client/js/lobby.js:260,304` (the only client
read-sites of `roomName`) — both already run the value through `escapeHtml()`
and needed no change for the new format.

Added a new `describe('RoomManager — default room name', ...)` block to
`server/tests/RoomManager.test.js` with two cases: default name equals
`#<roomId>` when no custom name is given, and a custom name is kept as-is.

## Decision

Branched `fix/room-default-name-id` off `main` (the code being changed exists
on `main`, unlike `dev`-only feature work). TODO.md/instruction.md's #121
entry had only been filed on `dev` in an earlier turn (uncommitted at the
time); brought the same entry onto `main` with this fix, marked done —
matches the repo's existing convention where TODO numbering is global across
branches (see B92/B93 precedent) and doc-only tracking entries can be added
directly on whichever branch a fix lands on.

## Summary output

`server/managers/RoomManager.js:130` — 1-line change, reusing the existing
`roomId` variable. `server/tests/RoomManager.test.js` — 2 new test cases.
`npm test`: 1136/1136 pass (`RoomManager.test.js` 52/52, including the 2 new
cases). No `client/css/`/`client/js/` files touched, so no `?v=N` bump
needed. `fix/room-default-name-id` merged into `main`, then into `dev` to
keep both in sync (per the "a fix merged to main must also land on dev"
rule).
