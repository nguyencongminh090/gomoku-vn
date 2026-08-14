# Quick Chat Bar (mobile) — User Story

## Origin

User report, 2026-08-14 (mobile screenshot of `room.html`, zen skin): on phone, chat lives behind
the bottom tab bar (`#chat #eye #gear` icons, `client/room.html:118-146`). To send a message the
player must tap the "Trò chuyện" tab, which opens the whole bottom sheet (`room-zen.css:947-972`),
just to reach the input. User's ask: a small always-visible input pill pinned to the bottom of the
screen — `(----textbox-----| send)` — so sending a message doesn't require opening the sheet first.
Explicitly filed as a feature, not a bug ("this is feature, not issue").

## Actors

- **Player / Spectator on mobile** (`room.html`, zen skin, viewport ≤768px — `room-zen.css`'s mobile
  breakpoint), mid-match or waiting in the room.

## User stories

- As a **mobile player**, I want to send a chat message without first opening the bottom sheet, so a
  quick reply doesn't cost me a tap-open / tap-close round trip while I'm mid-game.
- As a **mobile player**, I want to still see incoming messages without the sheet open, using the
  existing floating-toast notification (`ChatUI.showFloatMessage`, `client/js/chat-ui.js`) — the
  quick bar is for *sending*, not for reading full history.
- As a **mobile player**, I want the full chat log still reachable the normal way (tab "Trò chuyện")
  when I do want to scroll back through history — the quick bar doesn't replace that.

## Existing precedent in the codebase

The exact visual shape the user drew — a floating pill input + send button, pinned to the bottom of
the viewport — **already exists** for "Focus mode" (`btn-focus`, `room.js:166–184`,
`game.css:495–601`): `#chat-input-wrapper` is re-parented from inside the Chat tab to `document.body`
and repositioned as a `position: fixed; bottom: 20px; border-radius: 20px;` pill. Focus mode currently
only activates when the player explicitly hides the whole board chrome (topnav + side panel) via the
focus button. This feature reuses that same re-parent-and-pin mechanism, but activates it by default
on mobile viewports without requiring focus mode — i.e. decouples "always-visible input" from
"fullscreen board."

## Resolved decisions

None yet — this is a discussion-stage folder. See [planning.md](planning.md) for open questions to
resolve with the user before formalizing into `TODO.md`/`instruction.md`.

## Related files

- [planning.md](planning.md) — current-state findings, implementation sketch, open questions.
- [diagram/uml_diagram/sequence-quick-chat-send.md](diagram/uml_diagram/sequence-quick-chat-send.md)
  — send flow from the pinned mobile bar, reusing the existing `sendChat()`/`chat:message` path.
