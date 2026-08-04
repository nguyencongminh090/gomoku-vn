# Fix log entry — 2026-08-01 22:30

## Prompt

Surface 6: lobby online panel — Lite collapses it to a bare "N online" count with the click-to-expand affordance removed; Default/Pro unchanged.

## Action

`applyOnlinePanelMode()` in [client/js/lobby.js](client/js/lobby.js) toggles an `online-panel--lite` class and clears any open state; the existing header click handler early-returns in Lite. `.online-panel--lite` rules in [client/css/lobby.css](client/css/lobby.css) zero the body height, drop the chevron, and revert the header's pointer/hover affordances.

## Decision

Suppressed the behaviour in *both* the handler and CSS rather than removing the listener, so switching back to Default via `uimodechange` restores expandability without re-binding anything. The Lite selectors are deliberately over-specific (`.online-panel.online-panel--lite …`) because the base stylesheet sets an unconditional `max-height` on `.lobby-sidebar .online-panel__body` for the desktop-open fallback, and the ≤900px media block overrides it again later in source order — equal-specificity rules would have lost to both.

## Summary output

9 assertions passed. Default and Pro: list expanded on desktop (285px) with the chevron present. Lite: body collapsed to 0px, chevron `display:none`, header `cursor: default`, the count still rendering ("7"), and a real click on the header leaves the body at 0px. Screenshot: [docs/screenshots/mode-online-lite-1280.png](docs/screenshots/mode-online-lite-1280.png).
