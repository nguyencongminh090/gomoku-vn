# 2026-11-21 15:28 — #432 Lobby Rules tab polish

## Prompt
"Compose and design Rule tab in index#room"

## Root cause
The draft guide reused selectors scoped to the match room, which hid white stones and move markers in the lobby. Several diagrams or captions omitted required moves or described a different position. The lobby router recognised only the plural hash, and the tablist handled clicks without arrow-key navigation.

## Fix
Use lobby-scoped guide styles with responsive diagrams, concise winning conditions and bilingual explanations checked against the engine. Accept the singular hash as an alias, add tab keyboard navigation, preserve expanded rules on language changes and refresh asset hashes.

## Verification
Kept jsdom coverage for the alias, keyboard navigation, expanded state and opening diagrams. Chromium passed at 1280, 390 and 320 px on an isolated SQLite database. Cache verification passed.
