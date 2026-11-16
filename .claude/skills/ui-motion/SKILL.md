---
name: ui-motion
description: "Adds transitions, animations, page transitions, scroll effects and 3D effects to a web UI, using the lightest tool that works, motion tokens from DESIGN.md, and a reduced-motion and no-WebGL fallback for every effect. Use for 'animate this', 'add a page transition', 'scroll reveal', 'micro-interactions', 'parallax', '3D hero', 'three.js', 'make it feel alive', 'ui motion'."
---

# UI Motion

Plan and build motion for an existing web UI. Each effect gets a purpose, the cheapest tool, tokens and a fallback. Notes are read in place, never copied:

- `knowledge/web-development/items/fe-web-animation.md` - tool tiers, timing and easing, View Transitions, scroll-driven animations, libraries
- `knowledge/web-development/items/fe-web-3d.md` - CSS 3D versus three.js or R3F, performance budget, fallbacks
- `knowledge/visual-design/items/vbase-depth-motion.md` and `vstyle-motion-immersive.md` - purpose, accessibility, when immersive motion fits

Note paths are under `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/` (set `SKILLS_TREE` when the tree lives elsewhere). Code recipes: `references/motion-recipes.md` (2D, page, scroll) and `references/3d-recipes.md`.

## Steps

Copy this checklist into your reply and tick it off:

```
- [ ] 1 Baseline read (DESIGN.md Style, Motion, Forbidden)
- [ ] 2 Moments listed with purpose and frequency
- [ ] 3 Tool tier chosen per moment
- [ ] 4 Motion tokens defined or reused
- [ ] 5 Effects built
- [ ] 6 Reduced-motion and fallback per effect
- [ ] 7 Verified
- [ ] 8 Motion table reported
```

1. **Baseline.** Read `DESIGN.md` in the project root: `Style:`, the `- Motion:` line under `## Tokens` (level, durations, easing, reduced-motion behavior) and `## Forbidden`. No `DESIGN.md`: say so, suggest `ui-brief`, and continue with the defaults in `fe-web-animation` "Timing and easing" at level `subtle`. Look at the stack (framework, existing animation library in `package.json`, CSS approach) before choosing tools.
2. **List the moments.** For each requested effect write: element, trigger (hover, open, route change, scroll, load), purpose (feedback, continuity, attention, delight) and how often a user triggers it. Drop or shrink effects by `fe-web-animation` "Decide whether to animate". Respect the level cap:
   - `none`: state feedback only (focus, pressed, loading).
   - `subtle`: plus enter and exit of overlays, short page transitions, one reveal per section.
   - `expressive`: plus staggered reveals, scroll-driven effects, CSS 3D tilt or flip.
   - `immersive`: plus scroll scenes, parallax, WebGL. Only when `Style:` is `vstyle-motion-immersive` or the user confirms after reading its "Do not use when". Never on task pages (forms, checkout, dashboards, docs).
   An effect that hits `## Forbidden` is not built; tell the user.
3. **Choose the tool** per moment, lightest first (`fe-web-animation` "Choose the lightest tool"): CSS transition, `@starting-style`, keyframes, Web Animations API, then a library. For 3D pick the level in `fe-web-3d` "Pick the level". Reuse a library already in the project; add one only when a moment needs springs, layout or exit animation in React, or timelines and scroll scenes, and say which and why. Never add both Motion and GSAP.
4. **Tokens.** Put durations and easing in the project's token file or `:root` (`--dur-fast`, `--dur-base`, `--dur-slow`, `--ease-out`, `--ease-in-out`), taking values from `DESIGN.md` Motion. Effects reference tokens, not literals.
5. **Build.** Adapt the matching recipe from the references to the project's framework. Rules that always hold: animate `transform` and `opacity` (plus `clip-path`, `filter` sparingly); no `transition: all`; interruptible transitions for user-triggered state; content is visible and usable before and without any animation; no animation delays the LCP element.
6. **Fallbacks.** For each effect state what happens under `prefers-reduced-motion: reduce` (movement removed, fades kept, end state shown), without support (`@supports` for scroll-driven and View Transitions), without WebGL (poster image), and for motion over five seconds (pause control). Gate hover-only effects with `@media (hover: hover) and (pointer: fine)`.
7. **Verify.** Run these checks and fix before reporting:
   - grep changed files for `transition: all` and for `transition` or `@keyframes` on `width`, `height`, `top`, `left`, `margin`: none expected.
   - every new `animation`, `transition`, `animate(`, library call or 3D loop has a reduced-motion path.
   - with a browser tool: load the page with reduced motion emulated (Playwright `page.emulateMedia({ reducedMotion: 'reduce' })` or DevTools Rendering panel) and confirm content is visible and nothing moves; keyboard-tab through animated controls; for 3D, block WebGL or test the fallback branch and confirm the poster shows.
   - without a browser tool: say the visual checks were not run.
8. **Report** a motion table in the reply (and in the PR description if one is made):

```
| moment | trigger | tool | duration / easing | reduced motion | fallback | file:line |
|---|---|---|---|---|---|---|
| dialog open | click | @starting-style | --dur-base / --ease-out | fade only | - | src/styles/dialog.css:14 |
```

   Then suggest `ui-audit` to check the result (rules `DEP-*`).

## Not in scope

- Choosing a visual style: `ui-brief`. Images and video assets: `ui-images`.
- One component's animation in depth (dropdown, drawer, toast, gestures): `animate`; a motion-only diff review: `review-animations`; janky motion: `animation-performance`; a whole-app motion roadmap: `improve-animations`. Their stagger and scroll-reveal recipes hide content in base CSS; follow `fe-web-animation` there.
- Deep library work (complex GSAP timelines, shaders, physics): build the basics here, then point to the official GSAP skills (`greensock/gsap-skills`) or a three.js skill set if the user installs one.

## gomoku-vn overrides

Project rules in `CLAUDE.md` win. Never animate the board/stones (use `design-workflow` rules) and do not touch clock code (`TimerManager`, `room-socket`, `game-ui`, `client/js/diag/**`) without `.claude/rules/diagnostic-page-sync.md`. After any `client/` edit run `node scripts/cache-bust.js --write`. A whole-screen redesign request goes to `design-workflow` first.
