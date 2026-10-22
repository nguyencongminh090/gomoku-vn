# DESIGN.md template

Copy to the project root as `DESIGN.md`. Keep the six `##` headings, in this order. `ui-audit`, `ui-fix` and the hooks read `Style:`, `## Tokens` and `## Forbidden`, so keep those machine-readable.

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
- Why: <fit to facts and brand words>
- Risk: <main risk and how it is handled>
### B. <on-brand direction>
- Style note: <vstyle-* name>
- Why:
- Risk:
### C. <bold direction, optional>
- Style note: <vstyle-* name>
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
- Motion: <durations, easing, reduced-motion behavior>

## Layout
- Sections (top to bottom): <list>
- Eye-flow note: <where the eye enters, the path, the primary action>

## Forbidden
- <from the chosen style's "Do not use when">
- <the user's anti-goals>
```
