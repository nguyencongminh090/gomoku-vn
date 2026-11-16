# ui-motion

Authored in this tree on 2026-11-12 (not copied from another project). Redirect only the notes root: note paths use `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}`, so set `SKILLS_TREE` when the tree lives elsewhere.

Plans and builds transitions, animation, page transitions, scroll effects and 3D for an existing web UI. Reads, in place: `fe-web-animation`, `fe-web-3d` (`knowledge/web-development/items/`), `vbase-depth-motion` and `vstyle-motion-immersive` (`knowledge/visual-design/items/`). Code recipes are in `references/`.

Uses the `- Motion:` line of `DESIGN.md` (level none, subtle, expressive or immersive, plus durations, easing and reduced-motion behavior) written by `ui-brief`; works without it at level `subtle`.

Needs in the target project: nothing required. Libraries (Motion, GSAP, three.js, React Three Fiber) are added only when a moment needs them. Recipes were written against the APIs as of 2026-11 and were not run in a browser here; check the installed versions.

Naming: `ui-*` noun names are kept across the kit instead of gerunds (allowed by Anthropic's guidance when consistent).

Community skills consulted (MIT, not copied; install them for deeper library work):
- `emilkowalski/skills` (animate, review-animations): frequency rule, tool order, durations and easing.
- `greensock/gsap-skills`: GSAP core, timelines, ScrollTrigger, React cleanup.
- `CloudAI-X/threejs-skills`: three.js performance, disposal, asset pipeline.
- `vercel-labs/web-interface-guidelines`: motion rules (no `transition: all`, interruptible, reduced motion).
