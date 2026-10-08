---
name: vbase-visual-principles
description: The visual principles under every style - scale, visual hierarchy, balance, contrast, gestalt grouping - with the numeric limits NN/g gives and the squint test to check a layout
domain: visual-design
tags: visual-design,hierarchy,scale,contrast,balance,gestalt,proximity,squint-test
apply_when: "any layout or restyle where the eye has no clear path; reviewing a mockup or page; a style has been chosen and needs to be executed well; explaining why a page feels cluttered or flat"
sources: "NN/g - 5 Principles of Visual Design in UX (Gordon 2020), Visual Hierarchy in UX (Gordon 2021), Good Visual Design, Explained (Gordon 2025); W3C Understanding WCAG 2.2 SC 1.4.1 and 1.4.3"
last_reviewed: 2026-09-26
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vbase-visual-principles.md
copied: 2026-10-09
---

# Visual principles under every style

A style changes the surface; these principles decide whether the page can be read. Any style
that breaks them fails in the same way: users cannot tell what matters or what to do.

## The five principles (NN/g)

1. **Scale**: relative size signals importance. Use at most about three sizes (small, medium,
   large) for headings, subheadings and body text; keep the number of "biggest" elements to two
   or fewer.
2. **Visual hierarchy**: the eye is guided in the intended order of importance. Levers are
   scale, contrast (visual weight comes from contrast against surroundings, not from a color
   itself), grouping and whitespace. Two primary and two secondary colors are enough.
3. **Balance**: elements are distributed around an axis; symmetric for calm and formality,
   asymmetric for energy (Swiss grids), radial for focus on a center.
4. **Contrast**: dissimilar things must look dissimilar. Never lower text contrast to make a
   design look softer; body text needs 4.5:1 (WCAG 2.2 SC 1.4.3).
5. **Gestalt**: people group by proximity, similarity, alignment and enclosure. Proximity is
   the strongest for UI: items close together read as one group, so use spacing between
   groups larger than spacing inside groups.

Also from NN/g's later summary (Gordon 2025): use a grid with consistent columns and gutters,
build hierarchy with size rather than many typefaces, keep imagery purposeful, and apply every
decision consistently.

## Squint test

Blur the mockup (roughly a 5-20 px blur, or squint) and see which elements still stand out.
If an unimportant element dominates, or nothing dominates, fix the hierarchy before touching
color or decoration.

## Use when

- After the style direction is chosen and before building components.
- When a page "feels busy": count the sizes, colors and emphasis levels first.
- When translating a style note's traits into concrete rules.

## Do not use when

- As a substitute for user testing; a page can follow every principle and still fail tasks.
- As a reason to flatten deliberately expressive work: maximalist or brutalist styles break
  balance and restraint on purpose, but still need one clear entry point and legible text
  (`vstyle-maximalism-expressive`, `vstyle-brutalism-neobrutalism`).

## Checklist

- One primary action per screen with the strongest weight.
- Three or fewer type sizes in a section; heading levels follow content structure.
- Groups separated by more space than their internals; alignment on a shared grid.
- Emphasis by more than color alone (size, weight, position, icon): WCAG 2.2 SC 1.4.1 says
  color must not be the only means of conveying information.
- Every text and control pair meets contrast; muted text is checked first.

## Trade-offs

- Fewer sizes and colors give clarity and speed to build, against less room for expression.
- Strict symmetry feels formal and static; asymmetry adds energy but needs a grid to stay ordered.

## Common mistakes

- Making everything bold or big so nothing is emphasised.
- Using color alone for state (red text with no icon or label).
- Decorative borders around every group when spacing would group them.

## Related

- Notes: `vpick-choosing-style`, `vbase-color`, `vbase-typography`, `vbase-layout-spacing`,
  `a11y-wcag-essentials`, `ux-design-systems`
- Skills: `ui-ux-pro-max`, `frontend-design`
