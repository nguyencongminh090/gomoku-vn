# B104 — Mobile: chatbox activates & page scrolls on board tap

**Trạng thái:** ✅ ĐÃ XONG (2026-08-11) — cả 2 fix (di chuyển `e.preventDefault()` lên trước guard
trong `_onTouchEnd`, thêm `touch-action: none` cho `.board-canvas-wrap canvas`) áp dụng đúng như mô
tả trong mục Solution bên dưới. Unit test mới (`client/tests/board-touch-scroll-prevention.test.js`,
4 case) xác nhận `preventDefault()` được gọi ở mọi trạng thái (không tương tác, không phải lượt,
chưa gắn `onCellClick`, và lượt chính mình — không hồi quy); test được xác minh có bắt được lỗi
bằng cách chạy lại trên bản code cũ (3/4 case fail đúng như dự đoán) trước khi áp fix. Toàn bộ suite
1068/1068 pass. Không viết test cho `touch-action: none` (thuộc tính CSS, không thể assert ý nghĩa
qua jsdom) — xác minh bằng đọc lại giá trị `getComputedStyle` là đủ, đã kiểm tra thủ công khớp file.

**Severity:** Medium  
**Platform:** Mobile (phone browsers)  
**Pages affected:** `room.html`, potentially `tournament-match.html`  
**Reported by:** User (phone, intermittent)

---

## Symptom

On mobile, when the user taps the game board, one or both of the following happen intermittently:

- The chat input field (`#chat-input`) becomes focused / active (keyboard pops up).
- The page scrolls downward unexpectedly.

The bug is intermittent because it only manifests under specific game-state conditions (see Root Cause below).

---

## Root Cause Analysis

Two separate, compounding defects produce this symptom together.

---

### Defect 1 — `e.preventDefault()` is gated behind the interactive guard in `_onTouchEnd`

**File:** `client/js/board.js`, lines 327–341

```js
_onTouchEnd(e) {
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return; // ← early return
    e.preventDefault();   // ← NEVER reached when the guard fires
    const touch = e.changedTouches[0];
    ...
}
```

`e.preventDefault()` is placed **after** the early-return guard. When it is **not the player's turn** (opponent's turn, waiting for game to start, spectating, swap2 phase, etc.) the function exits before calling `preventDefault()`.

When `preventDefault()` is not called on `touchend`, the browser fires its default post-touch behaviors:

1. **Synthetic `click` event** — the browser synthesizes a `click` at the same screen coordinate, ~300ms after `touchend`. On mobile's single-column layout, the board canvas sits above the sidebar, but due to `position` stacking or the focus-mode layout where `#chat-input-wrapper` is appended directly to `document.body`, the synthesized click's hit-testing can land on the chat input or its wrapper, focusing it.

2. **Page scroll** — if the user's finger moved slightly during the tap, the browser interprets it as a pan gesture and scrolls the page.

**Why intermittent:** The guard only exits early when `!this.interactive || !this.isMyTurn || !this.onCellClick`. When it IS the player's turn and the board is interactive, `preventDefault()` runs and both side-effects are suppressed. So the bug only appears during the opponent's turn, pre-game, or spectator view.

---

### Defect 2 — Missing `touch-action: none` on the room game canvas

**File:** `client/css/game.css`, lines 151–156

```css
.board-canvas-wrap canvas {
  display: block;
  max-width: 100%;
  height: auto;
  cursor: crosshair;
  /* ← NO touch-action: none */
}
```

Without `touch-action: none`, the browser's touch handling system does **not** defer pan/scroll decisions to JavaScript. Even when `e.preventDefault()` does run (player's turn), the browser may have already begun a scroll gesture before the JS handler fires, because the default `touch-action` value (`auto`) allows panning.

For comparison, the tournament match canvas already has this rule:

```css
/* client/css/tournament.css — line 236 */
#match-canvas { touch-action: none; }
```

`#game-canvas` (room page) has no equivalent, leaving it unprotected.

---

### Combined effect

| Scenario | `preventDefault` called? | Scroll? | Ghost click on chat? |
|---|---|---|---|
| Player's turn, tap board cell | ✅ Yes | Unlikely (but not impossible — Defect 2) | No |
| Not player's turn / spectator, tap board | ❌ No | ✅ Yes | ✅ Yes (intermittent) |
| Any tap — no `touch-action: none` | — | ✅ Browser may scroll before JS runs | — |

---

## Files Involved

| File | Lines | Issue |
|---|---|---|
| `client/js/board.js` | 327–341 (`_onTouchEnd`) | `e.preventDefault()` placed after early-return guard — not called when not the player's turn |
| `client/css/game.css` | 151–156 (`.board-canvas-wrap canvas`) | Missing `touch-action: none` — room canvas not protected against browser pan gestures |

---

## Solution

### Fix 1 — `client/js/board.js` · `_onTouchEnd`

Move `e.preventDefault()` to **before** the interactive guard so it always suppresses the synthetic click and scroll, regardless of game state.

**What to modify:**  
In `_onTouchEnd`, move `e.preventDefault()` to the very first line of the function body, before the `if (!this.interactive || ...)` guard.

**Before:**
```js
_onTouchEnd(e) {
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
    e.preventDefault();
    ...
}
```

**After:**
```js
_onTouchEnd(e) {
    e.preventDefault();
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
    ...
}
```

**Why safe:** `preventDefault()` on `touchend` only suppresses the browser's synthesized `click` and the scroll gesture. It does not prevent the JS handler from executing normally. The guard still exits early for non-interactive states — only now the browser side-effects are also suppressed in those cases.

---

### Fix 2 — `client/css/game.css` · `.board-canvas-wrap canvas`

Add `touch-action: none` to the room game canvas, matching what `tournament.css` already does for `#match-canvas`.

**What to add:**  
In the `.board-canvas-wrap canvas` rule block, add `touch-action: none;`.

**Before:**
```css
.board-canvas-wrap canvas {
  display: block;
  max-width: 100%;
  height: auto;
  cursor: crosshair;
}
```

**After:**
```css
.board-canvas-wrap canvas {
  display: block;
  max-width: 100%;
  height: auto;
  cursor: crosshair;
  touch-action: none;
}
```

**Why needed:** `touch-action: none` tells the browser to hand all touch events to JavaScript and not attempt any native panning/zooming on the canvas element. This ensures the browser commits to the JS touch handler immediately on `touchstart` rather than waiting to see if the gesture is a scroll — removing the race condition that allows scroll to begin even when `preventDefault` would later be called.

---

## Verification

After applying both fixes:

1. **Opponent's turn test:** As a player, when it is NOT your turn, tap the board multiple times rapidly → page must not scroll, chat input must not focus.
2. **Spectator test:** Join a room as a guest/spectator, tap the board → same result as above.
3. **Pre-game test:** Tap the board before a game starts → no scroll, no chat activation.
4. **Normal play test:** During your turn, tap a cell → normal single/double-tap behavior still works correctly.
5. **Focus mode test:** Enable focus mode, tap the board outside your turn → chat input (now in `document.body`) must not be activated.

---

## Related Issues

- **B90** — `tournament-match` board auto-scrolls on click (similar symptom, different page — tournament canvas has `touch-action: none` in tournament.css but room canvas does not).
- **B71** — Chat input in focus mode not visible (`display: none`). Note: even hidden, an `input` can receive programmatic focus from a ghost click event, which would trigger the mobile keyboard.
