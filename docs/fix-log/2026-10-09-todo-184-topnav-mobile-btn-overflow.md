# 2026-10-09 14:22 — #184 mobile room topnav: leave/gear buttons overflow the 28px bar
## Prompt
"Do #184"
## Root cause
`shell.css` (#173, `137530f`) sets `body.zen-room .topnav__btn { padding: 8px }`. That has the same
specificity as room-zen.css's `padding: 4px` but loads later, so it overrode the 4px that #144 sized the
28px phone bar (`--zen-topnav-h`) around. Measured at 393x851 and 375x667: leave 32px at y=-2.5, gear
36px at y=-4.5, both centred in a 28px bar, so they overflow it and the viewport top. Real overflow,
not a stale tolerance.
## Fix
`client/css/shell.css`: `@media (max-width: 768px) { body.zen-room .topnav__btn { padding: 4px; } }`,
which gives 24/28px boxes. Desktop 8px padding and the lobby are unchanged. Branch `fix/184-topnav-mobile-overflow`
(off dev; shell.css is not on main). `?v=176 -> 177`.
## Verification
`e2e/topnav-minimal-mobile.spec.ts` un-fixme'd (kept regression test); both phone cases are green against
a throwaway DB, and the real DB was restored with a matching checksum. Screenshot checked: icons are centred in the bar.
The gear still sits at y=-0.5 (28px box, 27px content box plus a 1px border), within the spec's 1px tolerance.
Touch target is now 24-28px, the #144 design size (WCAG 2.5.8 minimum is 24). Full e2e suite not re-run.
