# F421 — Phone: swipe left/right to move between tab-bar pages
**Status:** ✅ DONE 2026-11-18 — jsdom tests + headless Chromium touch pass; real-phone check open
**Area:** client/js/platform-shell.js (wireSwipe, swipeTarget, slideIn, arrivalSlide), client/css/platform-shell.css (motion tokens)
**From:** user 2026-11-18 "/ui-motion Cho phép vuốt để chuyển trang trên Mobile."

## Scope
1. While the mobile tab bar is shown and the active page is one of its tabs (Trang chủ, Phòng, Xếp hạng, Giải, Tôi): swipe left = next tab, right = previous; no wrap. Goes through the tab link's own click (lobby screens switch by hash, others navigate).
2. Threshold: ≥72 px, or ≥40 px at ≥0.5 px/ms; |dx| ≥ 2|dy|; ≤700 ms; vertical move >12 px first cancels.
3. Arrival: content (`main > *`) slides in 24 px from the swipe side, 240 ms, WAAPI on `translate`; reduced motion → none.
## Don't
- Start a swipe from inputs, `.gboard`, canvas, dialogs, `[data-no-swipe]`, horizontal scrollers, the 24 px screen edges (OS back gesture), a zoomed viewport, or with text selected.
- Animate `<main>` itself (would re-anchor fixed docks) or with CSS animations on children (would replay their own animations).
## Traps
- Lobby modals stay in the DOM with `aria-modal="true"` hidden by CSS: only a modal with client rects blocks.
- Tôi tab href is `#` until /me answers → not a swipe target.
