# Fix log entry — 2026-08-01 22:54

## Prompt

Backend TODO Phần B #2 (review 3.5): chat sanitization used `replace(/<[^>]*>/g, '')` in [server/managers/ChatHandler.js](server/managers/ChatHandler.js) — a tag-strip that only matches *closed* tags, so the review's repro `<img src=x onerror=alert(1)` (no closing `>`) passed through byte-for-byte unchanged and would be parsed as a live tag by any consumer that ever rendered a message as HTML. `instruction.md` §B2 is explicit that the correct fix is to switch strategy to entity escaping, not to add another regex rule to the strip, and notes there is no open XSS today because [client/js/chat-ui.js](client/js/chat-ui.js) renders every message via `textContent`.

## Action

Rewrote `sanitize()` to `str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()`, and updated the module's header comment plus its manual-test checklist line ("HTML tags are stripped" → "escaped, closed and unclosed alike"). No call-site changes — `sanitize` is used only by `handleMessage` in the same file and is exported for tests. No client file touched, so no `?v=N` bump.

## Decision

Deliberately did **not** escape `&`, though a textbook HTML escape does. Two reasons: (a) all four `chat-ui.js` render paths use `textContent` ([lines 32, 43, 49, 78](client/js/chat-ui.js#L32)), so escaping `&` would visibly mangle ordinary messages — "R&D" would display as "R&amp;D" — a real user-facing regression in exchange for nothing; (b) it costs nothing defensively, because an HTML parser decodes `&lt;` into a literal "<" *text node* and does not re-parse that result as markup, so a user typing "&lt;img …&gt;" cannot construct a tag under a future `innerHTML` consumer either. Two behavior changes worth recording, both consequences of escaping rather than stripping and both improvements: a message consisting solely of markup (`<b></b>`) is now delivered as visible text instead of being silently dropped as empty, and the 500-char truncation now counts escaped length, so a message dense in angle brackets truncates earlier than before. Kept strictly to §B2 — the identical `escapeAttr` weakness in `lobby.js`/`room-ui.js` is a separate item (TODO Phần B #3) and was left untouched.

## Summary output

`npm test`: 159/159 passing, 7 suites green (was 148/6 before this change). New file [server/tests/ChatHandler.test.js](server/tests/ChatHandler.test.js) with 11 kept tests across two describes: `sanitize` (the review's exact unterminated-tag repro, a well-formed tag, an unterminated `<script>` payload, multiple brackets in one message, inner text preservation, `&` left alone, a clean message, and non-string inputs) and `handleMessage` (markup payload broadcast escaped over `chat:message`, a markup-only message now delivered rather than dropped, empty message still ignored). The profanity filter is mocked to pass-through so these assert sanitization alone; it keeps its own coverage in `profanity-filter.test.js`. All tests stay permanently in the suite per the CLAUDE.md no-discard rule.
