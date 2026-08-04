# Fix log entry — 2026-08-02 04:09

## Prompt

TODO #15 (follow-up carved out of the #13 decision): after Phần B #2 switched chat sanitization to entity escaping, the chat UI showed the escaped form verbatim — someone typing `<b>bold</b>` saw `&lt;b&gt;bold&lt;/b&gt;` on screen, confirmed in a browser during that item's verification. The cause is that `client/js/chat-ui.js` renders with `textContent`, which displays its input rather than parsing it. #13 asked whether to fix this by reversing the server-side escaping; the user chose to keep escaping (wire payload stays inert for any future consumer), which leaves this as a display-layer bug.

## Action

Added `decodeChatText()` to [client/js/escape-utils.js](client/js/escape-utils.js) — reverses `&lt;`/`&gt;` only — and applied it at the two places user-authored message text reaches the DOM in [chat-ui.js](client/js/chat-ui.js): the chat bubble's text span and the in-game float message. Bumped `?v=31` → `?v=32`.

## Decision

Decoding immediately before writing to a text node is not a hole in the escaping: `textContent` never parses its input as markup, so the result is displayed, not interpreted — and the value is never handed to `innerHTML` afterwards. `&amp;` is deliberately left encoded, mirroring the server's decision not to escape `&`: since the server never produces `&amp;`, a literal one in a message is something the sender typed and must stay visible as typed. The two system-message branches were left alone — those strings are server-authored and never went through `sanitize()`, so decoding them would be reversing an escape that never happened. Put the function in the existing `escape-utils.js` UMD module rather than inline in `chat-ui.js`, following the precedent from Phần B #3: it makes the logic testable from Node with no jsdom.

## Summary output

`npm test`: 280/280 passing, 15 suites green (was 274). Added 6 tests to [server/tests/escape-utils.test.js](server/tests/escape-utils.test.js), which now assert the **round trip against the real `ChatHandler.sanitize()`** so the two halves cannot drift apart: the review's repro string, ordinary text, `R&D & co`, and text containing bare `<`/`>` all come back byte-identical to what was typed; `&amp;` is not decoded; and the wire format itself still contains no raw `<` (the #13 decision, pinned as a test rather than left as prose). **Browser-verified** (Chromium/Playwright, two guests in a room): the reader now sees `<b>bold</b>`, `<img src=x onerror=alert(1)`, `R&D & co` and `xin chào` exactly as typed, with **0** live `<img>` or `<b>` elements in the chat log. Captured the WebSocket frame at the same time to show both halves at once — on the wire: `"text":"&lt;b&gt;bold&lt;/b&gt;"`; on screen: `<b>bold</b>`.
