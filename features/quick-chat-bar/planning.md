# Quick Chat Bar (mobile) — Planning

Status: **discussion stage** — not yet formalized into `TODO.md`/`instruction.md`. Do not implement
from this file alone (per `CLAUDE.md`'s "stack, don't perform directly" rule).

## Current-state findings (research, 2026-08-14)

- Mobile zen room (`room-zen.css` mobile breakpoint, ~line 949) turns the right panel into a bottom
  sheet; `.sidebar-tabs` (`room.html:118-135`) rotates into an icon-only tab bar (chat / score /
  spectators / settings). Opening the sheet costs board height, not width, on mobile — the sheet is
  collapsed by default once `game:init` arrives (comment at `room.js:109-114`).
- `#chat-input-wrapper` (`room.html:140-144`) is a single DOM node reused in two places today:
  normally nested inside `#tab-chat .chat-panel`, and re-parented to `document.body` when Focus mode
  is toggled (`room.js:166-184`). The toggle is driven by `st.focusMode` + `.room--focus` on `body`.
  Focus-mode CSS for the floating pill: `game.css:553-601` (`position: fixed; bottom: 20px; left: 50%;
  transform: translateX(-50%); border-radius: 20px;` — 400px wide, `max-width: 90vw`).
  This is functionally the same widget the user's drawing asks for; the difference is purely *when*
  it activates (only in Focus mode today, vs. wanted by default on mobile).
- Sending logic (`sendChat()`, `room.js:219-229`) doesn't touch which parent `#chat-input-wrapper` is
  in — it reads `#chat-input`'s value and emits `chat:message` over `window.RoomClient`. No change
  needed there regardless of where the input node lives in the DOM.
- Incoming-message feedback while the tab is closed already exists: `ChatUI.showFloatMessage`
  (`client/js/chat-ui.js`) renders a floating toast — `.float-messages`, positioned
  `bottom: calc(var(--zen-bar-h) + 14px)` on mobile (`room-zen.css:1013`). This can likely be reused
  as-is; the quick bar doesn't need a new "new message" indicator built from scratch.
- Recent regression precedent to respect: `3471deb` ("fix: prevent mobile board resize distortion,
  100vh -> dvh, throttle resize listener") — any new fixed-position bottom element competing for
  mobile viewport height must be re-tested against that fix, not just visually eyeballed in devtools
  (devtools mobile emulation doesn't reproduce real on-screen-keyboard viewport resize behavior).

## Implementation sketch (not yet resolved with user — sequencing only)

1. Decide activation condition: replace the mobile chat-tab's input with the pinned bar always
   (quick bar becomes the *only* way to type on mobile, `.chat-messages` stays inside the tab for
   history), vs. an *additional* bar layered on top of the existing tab-based input (two send paths
   to keep in sync). Leaning toward "replace" — matches the user's ask and avoids duplicate DOM/ARIA
   focus targets. **Open question — needs user confirmation.**
2. `room.js`: extract the re-parent logic in `166-184` into a shared helper (e.g.
   `moveChatInput(target)`), call it from both the Focus-mode toggle and a new mobile-default branch
   (`matchMedia('(max-width: 768px)')`, mirroring `room-zen.css`'s own breakpoint) so there is one
   code path for "where does `#chat-input-wrapper` currently live," not two.
3. `room-zen.css` mobile section (~949-1013): position the bar above `.sidebar-tabs` (the icon tab
   row), respecting `env(safe-area-inset-bottom)` and the existing `--zen-bar-h` variable so it
   doesn't collide with the tab icons or `.btn-focus`/`.float-messages` (both already keyed off
   `--zen-bar-h`, `room-zen.css:1012-1013`).
4. Verify on-screen-keyboard behavior on a real device (or real mobile emulation, not just devtools
   width resize) — confirm the pinned bar doesn't get pushed off-screen or double-fire the dvh-resize
   throttle from `3471deb` when the keyboard opens/closes.
5. Cache-busting: any `client/css/`/`client/js/` edit requires bumping `?v=N` everywhere per
   `CLAUDE.md`.
6. Unit tests: none applicable — this is client-only DOM/CSS, and `client/js/` currently has no test
   infrastructure (per `CLAUDE.md`, say so explicitly rather than skip silently).
7. Before marking done: mobile UX walkthrough (`ux-audit` skill or equivalent) sending/receiving a
   message via the new bar with the sheet closed, per `CLAUDE.md`'s feature-completion checklist.

## Open questions (blocking — need user decision before formalizing)

1. **Replace vs. add** the tab-based input on mobile (see sketch step 1).
2. **Visual style**: keep the current "Gửi" text button, or switch to an icon-only send button (paper
   plane) to save horizontal space in a slim pinned bar — user's drawing shows a text-only pill with
   a short label divider, closer to the current button than an icon.
3. **Placement**: bar sits *above* the icon tab row (tab row stays visible), or *replaces* the chat
   tab icon's row entirely on mobile (freeing more vertical space but removing the visual tab
   affordance)?

## Sequencing

1. Resolve the three open questions above with the user.
2. Formalize into `docs/todo/<CODE>-quick-chat-bar.md` + `TODO.md` and
   `docs/instruction/<CODE>-quick-chat-bar.md` + `instruction.md`.
3. Implement on a `feature/quick-chat-bar` branch off `dev`, per the `git-workflow` skill.
4. Mobile UX walkthrough before marking `docs/todo/<CODE>-quick-chat-bar.md` "đã xong".

## Related files

- [user_story.md](user_story.md) — actors, stories, existing-precedent notes.
- [diagram/uml_diagram/sequence-quick-chat-send.md](diagram/uml_diagram/sequence-quick-chat-send.md)
