# 2026-10-10 16:01 — untracked profile page: empty "Câu lạc bộ" card shown to users in no club
## Prompt
"Issue: #pf-clubs-panel — For user who not in any club, hide this div?"
## Root cause
profile.js already set `#pf-clubs-panel.hidden` for zero clubs, but that div was the *content* of an `<aside class="ppanel">`: the card chrome (background, padding) stayed visible as an empty box, and the two-column grid kept a blank right column.
## Fix
client/profile.html: the `ppanel` card is now `#pf-clubs-panel` itself; the grid gets `#pf-split`. client/js/profile.js: toggles `hidden` on the card and `psplit--solo` (one column) on the grid; client/css/platform.css: `.psplit--solo`. Branch fix/profile-hide-empty-clubs (off dev: the panel exists only there), ?v=242. Left alone: club row rendering, other pages' empty cards.
## Verification
Test kept: profile-page (no clubs / field absent → card hidden + solo grid; with clubs → card shown, link, text-only). Real browser (own-DB copy): no clubs → card display none, 0 visible asides, 1 grid column; after creating a club → card visible, 2 columns. Not verified: mobile layout of the solo grid, Firefox/WebKit.
