---
name: vbase-typography
description: Web typography rules behind any style - body size, line length, line height, type scale, font pairing and count, fluid sizing with clamp(), and the accessibility limits for zoom and text spacing
domain: visual-design
tags: typography,fonts,type-scale,line-height,measure,font-pairing,variable-fonts,clamp,readability
apply_when: "choosing fonts for a site; a style note says editorial, geometric or expressive type; text feels hard to read; setting sizes and spacing for headings and body; adding fluid type"
sources: "Butterick - Practical Typography, summary of key rules; web.dev Learn Design - Typography; MDN - clamp(), font-variant-numeric; NN/g - Good Visual Design (Gordon 2025); W3C Understanding WCAG 2.2 SC 1.4.4 and 1.4.12"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vbase-typography.md
copied: 2026-10-09
---

# Typography for websites

Type is most of the page. A style sets its character; these rules keep it readable.

## Numbers to start from

| Setting | Guidance | Source |
|---|---|---|
| Body size | 15-25 px on the web (16-18 px is a common default) | Butterick |
| Line length (measure) | 45-90 characters per line including spaces; 45-75 satisfactory, about 66 ideal for a single column; use `max-inline-size: 66ch` | Butterick; web.dev |
| Line height | 120-145% of font size (Butterick); unitless `1.5` on body text is a safe default; shorter lines can take more, longer lines less | Butterick; web.dev |
| Type sizes | about three sizes per layout to make hierarchy (NN/g); a modular scale in the design system | NN/g; web.dev |
| Typefaces | one or two families; hierarchy through size and weight rather than more fonts | NN/g; Butterick |

## Choosing type by style

- Minimal and Swiss: neo-grotesque sans, tight weight scale; or a refined serif for editorial.
- Flat and Material: system or geometric sans for speed and familiarity.
- Brutalist and neobrutalist: monospace or quirky display for headings, neutral sans for body.
- Retro and expressive: distinctive display faces for headings only.
- Handmade: script or hand-lettering for short headings, plain text face for body.
- Luxury: high-contrast serif or light sans with generous tracking, large sizes.

## Pairing

- Pair by contrast of role, not decoration: a display face with a plain text face, or a serif
  with a sans. Two families is usually enough; a single family with several weights is safest.
- Match x-height and width so the pair looks even at body size.
- Butterick advises against system defaults like Times New Roman and Arial as a quick way to
  look more considered, but system UI fonts (`system-ui`) are a legitimate performance choice
  for apps.

## Mechanics

- A single variable font file is usually smaller than several static weight files (web.dev);
  subset it and use `font-display` plus size-matched fallbacks to avoid layout shift
  (`fe-media-assets`).
- Fluid sizing: `font-size: clamp(1rem, 0.75rem + 1.5vw, 2rem)`. Use `rem` for the bounds and
  keep the maximum at least twice the minimum so 200% zoom still works (MDN, WCAG 1.4.4).
- Content must survive user text spacing overrides: line height 1.5, paragraph spacing 2x,
  letter spacing 0.12 em and word spacing 0.16 em with no loss of content or function (WCAG
  2.2 SC 1.4.12, AA). Do not fix heights on text containers.

## Language and numbers

- Vietnamese and other scripts with stacked marks need a font that covers the full character
  set and a line height with room for the marks (1.5 is a safe start); test real text such as
  "Nguyễn Thị Hồng Ánh", not Latin lorem ipsum (`webx-i18n-l10n`).
- For tables, prices and dashboards use tabular (equal-width) numerals so columns line up;
  in CSS this is `font-variant-numeric: tabular-nums` (OpenType `tnum`; widely available since
  2020, MDN), and the font must provide them.

## Use when

- Selecting fonts and a scale after the style is chosen; reviewing readability.

## Do not use when

- The brand supplies fonts and rules: follow them, then apply only the readability and zoom checks.
- Long-form print typography decisions (hyphenation, kerning of book text) are out of scope.

## Trade-offs

- Custom fonts give identity but cost bytes, load time and layout risk; system fonts are
  instant but generic.
- Large expressive type sells a style but shrinks how much fits above the fold on mobile.

## Common mistakes

- Body text under 16 px on mobile, light grey on white.
- Three or more display fonts.
- Fixed pixel sizes with `vw` only, which ignore user zoom.
- Full-width paragraphs on large monitors (no `max-width`).

## Related

- Notes: `vbase-visual-principles`, `vbase-layout-spacing`, `vstyle-minimalism-swiss`,
  `fe-media-assets`, `perf-core-web-vitals`, `a11y-wcag-essentials`
- Skills: `ui-ux-pro-max` (typography.csv has font pairings), `frontend-design`
