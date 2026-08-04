# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #7 (M5): room name disappears from the mobile top bar — `.topnav__title` is dropped at ≤768px, leaving a returning player (or someone holding two rooms in two tabs) with no room identifier in the nav.

## Action

`updateUI()` in [client/js/room-ui.js](client/js/room-ui.js) now renders `#room-id-nav` as two spans — `.topnav__room-name` (full room name) and `.topnav__room-code` (short room ID) — and sets a `title` attribute of `"<name> (<id>)"`. [client/css/main.css](client/css/main.css) hides `.topnav__room-code` by default and, inside the existing `≤768px` block, swaps the two so the ID shows and the name hides.

## Decision

Audit note partly overtaken by the current code: `#room-id-nav` *was* already rendering on mobile, but it carried the room **name** under `.topnav__user { max-width: 80px }`, so any real name was ellipsised to an unusable stub. Chose the prompt's room-ID-chip option over widening the name: the ID (`#9NE`) is ~49px and always renders whole, versus a name truncated mid-word. Added the `title` attribute as well — the prompt offered it as an alternative, but it costs nothing and recovers the full name on tap/long-press, so both were taken rather than one. No new nav element and no new row: the ID reuses the existing `#room-id-nav` slot.

## Summary output

Live check with a deliberately long room name ("Ván cờ buổi tối rất vui"). At 375px and 390px: name span hidden, ID chip `#9NE` visible and unclipped, `title="Ván cờ buổi tối rất vui (#9NE)"`, nav still a single row at its existing 48px mobile height with no horizontal overflow. At 1280px the full name shows and the ID chip is hidden — desktop unchanged. Screenshots: [docs/screenshots/fix7-nav-375.png](docs/screenshots/fix7-nav-375.png), [docs/screenshots/fix7-nav-1280.png](docs/screenshots/fix7-nav-1280.png).
