# DESIGN.md template

Copy to the project root as `DESIGN.md`. Keep the six `##` headings, in this order. `ui-audit`, `ui-fix` and the hooks read `Style:`, `## Tokens` (including `- Copy:`), `## Layout` and `## Forbidden`, so keep those machine-readable.

```markdown
# DESIGN

## Facts
- Site type and main goal: <e.g. SaaS marketing site, goal: sign-ups>
- Audience: <age, expertise, devices, context of use>
- Brand words: <3-5 adjectives>
- Constraints: <existing brand, accessibility target, performance budget, content density, framework, languages>
- Longevity: <campaign (months) | product (years)>
- Hard filters applied: <which of accessibility, task-critical, audience, language coverage, performance removed or limited styles, and which>

## Directions
### A. <safe direction>
- Style note: <vstyle-* name>
- Structure: <vpick-page-structure catalog name>
- Why: <fit to facts and brand words>
- Risk: <main risk and how it is handled>
### B. <on-brand direction>
- Style note: <vstyle-* name>
- Structure: <vpick-page-structure catalog name>
- Why:
- Risk:
### C. <bold direction, optional>
- Style note: <vstyle-* name>
- Structure: <vpick-page-structure catalog name>
- Why:
- Risk:

## Chosen
Style: <exact vstyle-* note name, e.g. vstyle-minimalism-swiss>
Reason: <one line>

## Tokens
- Color roles: <background, surface, text, muted text, primary, accent, success, warning, danger = hex values>
- Type scale: <body size >= 16px, ratio, heading sizes, font families, line heights>
- Spacing unit: <base unit, e.g. 8px, and the scale>
- Radius: <values>
- Motion: <level none | subtle | expressive | immersive; durations fast/base/slow, e.g. 120/200/320ms; easing; reduced-motion behavior>
- Imagery: <source: own photos | stock (Pexels, Pixabay) | illustration | none; subjects; mood; people yes/no; color treatment; aspect ratios>
- Copy: <locale, e.g. en-US | en-GB | vi-VN>; <sentence | title> case for headings and buttons; <tone in 2-3 words>

## Layout
- Structure: <one concept from vpick-page-structure "Structure catalog", e.g. sticky split; one per page>
- Sections (top to bottom): <list>
- Eye-flow note: <where the eye enters, the path, the primary action>
- Defaults kept: <items from vpick-page-structure "Defaults to justify" kept on purpose, each with its reason; or none>

## Forbidden
- <from the chosen style's "Do not use when">
- <the user's anti-goals>
```
