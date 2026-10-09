---
name: vbase-depth-motion
description: How depth (shadow, elevation, borders, layers) and small motion (transitions, micro-interactions) signal interactivity and hierarchy across styles, with the accessibility and performance limits
domain: visual-design
tags: depth,elevation,shadow,borders,signifiers,motion,micro-interactions,transitions,reduced-motion,hover,buttons,clickable,focus,states
apply_when: "deciding how buttons, cards and overlays look raised or flat; a style needs shadows, borders or blur; adding hover, focus and state transitions; making interactive elements recognisable; checking motion accessibility"
sources: "NN/g - Flat Design (Moran 2015), Flat UI Elements Attract Less Attention (Moran 2017), Skeuomorphism (Chan 2024), Interaction Branding (Moran 2016), Parallax (Sherwin 2019); Material Design 2 - Dark theme; MDN - prefers-reduced-motion, backdrop-filter; W3C Understanding WCAG 2.2 SC 1.4.11, 2.3.3"
last_reviewed: 2026-09-26
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vbase-depth-motion.md
copied: 2026-10-09
---

# Depth and small motion

Depth and motion answer two user questions: "what can I click?" and "what just happened?"
Every style answers them differently, but the questions stay the same.

## Depth tools by style

| Tool | Used in | Note |
|---|---|---|
| Soft shadow and elevation | flat 2.0, Material, cards | says "above" or "interactive"; keep one shadow recipe per level |
| Hard offset shadow and thick border | neobrutalism | strong signifier, high contrast |
| Blur and translucency | glass | depth without shadow; needs contrast backup |
| Inner and outer shadow pairs | neumorphism, clay | soft; contrast risk for neumorphism |
| Lighter surfaces | dark themes | shadows barely show on dark; higher = lighter |
| Textures and gradients | skeuomorphism, retro | decoration; costs weight |

## Signifiers (the key rule)

NN/g's eyetracking work on 71 users found weak signifiers cost 22% more time and 25% more
fixations, with failures such as text links styled like body text and ghost buttons. Whatever
depth style is used:

- Primary actions look like buttons: filled color or clear border, not just text.
- Links in text are underlined or clearly colored (3:1 against the text around them).
- Controls have a visible boundary or fill with 3:1 contrast (WCAG 2.2 SC 1.4.11), and a
  visible focus style.
- Hover, active, focus, disabled and loading states differ in more than a subtle shadow shift.
- Use the same treatment for all interactive elements and never for non-interactive ones;
  NN/g criticises neumorphism for the opposite.

## Motion rules

- Purpose first: feedback (button pressed), continuity (element moves where it came from),
  attention (new content). Decoration alone is a candidate for removal.
- Keep it short and consistent; NN/g links consistent, expected interaction behavior with
  perceived competence, while surprising behavior can cause frustration (Moran 2016).
- Animate `transform` and `opacity`; avoid animating layout properties.
- Honor `prefers-reduced-motion: reduce` (widely available since 2020): remove movement such
  as sliding, scaling and parallax, keep simple fades or instant changes. WCAG 2.2 SC 2.3.3
  (AAA) asks that non-essential interaction-triggered motion can be disabled.
- Motion that runs by itself for more than five seconds needs a pause control (SC 2.2.2).
- No flashing more than three times per second.
- Large blur and many shadows cost GPU time; `backdrop-filter` is GPU-intensive (MDN), so use it
  on few, small surfaces and never animate it.

```css
.btn { transition: transform 120ms ease, box-shadow 120ms ease; }
.btn:hover { transform: translateY(-1px); }
.btn:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:hover { transform: none; } }
```

## Use when

- Defining component states and elevation levels after style and color are chosen.
- Auditing "why do users not see this is clickable".

## Do not use when

- Immersive, animation-led pages need the deeper rules of `vstyle-motion-immersive`.
- A component library already defines elevation and motion tokens; extend them only for
  documented needs.

## Trade-offs

- Rich depth and motion feel polished and give feedback, against performance cost, dated look
  and accessibility risk; flat surfaces are cheap and timeless but need stronger signifiers.

## Common mistakes

- Shadow direction as the only difference between pressed and unpressed.
- Hover-only cues on touch devices.
- Animations that block interaction until they finish.

## Related

- Notes: `vbase-visual-principles`, `vbase-color`, `vstyle-flat-material`,
  `vstyle-glassmorphism`, `vstyle-skeuomorphism-neumorphism`, `vstyle-motion-immersive`,
  `a11y-aria-keyboard-focus`, `perf-core-web-vitals`
- Skills: `ui-ux-pro-max`, `design-system`
