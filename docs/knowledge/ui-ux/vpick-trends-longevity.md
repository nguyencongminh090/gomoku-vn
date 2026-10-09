---
name: vpick-trends-longevity
description: How visual trends rise and fall (flat, neumorphism, glassmorphism, neobrutalism), how the aesthetic-usability effect can mislead, and when following a trend is worth it or not
domain: visual-design
tags: trends,design-trends,longevity,aesthetic-usability,redesign,style-cycle,fashion
apply_when: "a user asks for the latest or trending style; deciding between a timeless and a trendy look; judging whether a style will date; planning how often to restyle; a stakeholder wants to copy a competitor's look"
sources: "NN/g - Why 90's Designs Are Coming Back (video, 2024), Skeuomorphism (Chan 2024), Flat Design (Moran 2015), Aesthetic-Usability Effect (Moran 2024); Wikipedia - Flat design, Neumorphism, Liquid Glass, Corporate Memphis, Frutiger Aero"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vpick-trends-longevity.md
copied: 2026-10-09
---

# Trends and how long they last

## The cycle

NN/g compares design trends to fashion: wait long enough and they return, changed to meet new
needs, and each trend responds to the limits of the previous one.

| Step | Trend | Rise | What went wrong next |
|---|---|---|---|
| 1 | Skeuomorphism | early interfaces, peak early 2010s | clutter, heavy, dated |
| 2 | Flat design | Zune 2006, Metro 2010, iOS 7 in 2013 | weak signifiers; flat 2.0 added cues |
| 3 | Neumorphism | named 2019 | low contrast, unclear clickability; sharp decline by 2021 |
| 4 | Glassmorphism | early 2020s; Apple Liquid Glass June 2025 | legibility over busy backgrounds; Apple adjusted opacity and added controls |
| 5 | Neobrutalism | early 2020s | overwhelming if unbalanced |
| 6 | Handmade and organic | 2024-2026 (NN/g 2026) | cost of real illustration; trend, not a proven effect |

Retro looks return on a 20-30 year cycle (Memphis in the 1980s, Y2K in the late 1990s, then
Frutiger Aero, both revived in the 2020s) and Corporate Memphis showed how fast oversaturation
turns a style into a joke (backlash by 2022-2023).

## Attractive is not the same as usable

The aesthetic-usability effect (Kurosu and Kashimura 1995 study, reported by NN/g) says users
rate attractive interfaces as easier to use and forgive small problems. Two consequences: a
trendy style can hide real problems in testing, and it cannot save a design with severe
usability issues. Always pair aesthetic checks with task-based tests.

## Should you follow the trend?

Follow it when all are true:

1. The trend matches the brand words and audience (`vpick-brand-attributes`).
2. Its known risks are handled (contrast, signifiers, performance, reduced motion).
3. The site can be restyled cheaply: colors, radius and shadows live in tokens.
4. You can afford to refresh in 2-3 years.

Skip or limit it (accent only) when the site is task-critical, long-lived, low-budget, or
serves audiences that value familiarity.

## How to make a look last

- Base the system on timeless structure (grid, hierarchy, type, generous contrast) and
  express the trend in swappable layers: illustration, one accent effect, a hero treatment.
- Prefer a base of minimal or flat 2.0 (`vstyle-minimalism-swiss`, `vstyle-flat-material`)
  with one trend detail.
- Use semantic design tokens so a restyle changes values, not components (`ux-design-systems`).
- Do not copy a competitor's look; copy their tested patterns only where users expect them.

## Use when

- Someone asks for "modern" or "latest" and you must judge what that should mean.
- Advising when to redesign.

## Do not use when

- The decision is already made by a brand guideline or legal requirement.
- As a prediction tool: the dates above describe the past; future trends are not knowable
  from this note.

## Trade-offs

- Trendy looks give quick perceived freshness and attention, at the price of dated look and
  extra rework later; timeless looks age slowly but risk looking generic.

## Common mistakes

- Redesigning because the look is old, not because users struggle.
- Adopting a trend from a design showcase site without testing on the real audience.
- Believing high visual polish means the interface works.

## Related

- Notes: `vpick-choosing-style`, `vpick-brand-attributes`, `vstyle-retro-nostalgia`,
  `vstyle-handmade-organic`, `vstyle-glassmorphism`, `vstyle-skeuomorphism-neumorphism`,
  `ux-design-systems`
- Skills: `ui-ux-pro-max`, `ux-audit`
