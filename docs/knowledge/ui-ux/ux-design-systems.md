---
name: ux-design-systems
description: What a web design system contains (tokens, components, patterns, guidance), how tokens are layered and exchanged, and when a system is worth building
domain: web-development
tags: design-system,design-tokens,components,patterns,consistency
apply_when: "several pages or teams need consistent UI; deciding whether to build or adopt a component library; naming and structuring colors, spacing and type; syncing design tools with code"
sources: "Frost - Atomic Design, 2016 (read); W3C Design Tokens Community Group - Format Module 2025.10, draft (read); GOV.UK Design System (seen via Service Manual pages); GOV.UK Service Manual - beta phase, design pattern contributions (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-design-systems.md
copied: 2026-10-09
---

# Design systems for the web

A design system is a shared set of decisions and parts so that many screens look and behave
consistently and teams do not redo the same work. Typical layers:

1. **Design tokens**: named values for color, spacing, typography, shadow, motion.
2. **Components**: coded, tested UI parts (button, form field, error summary) with usage guidance.
3. **Patterns**: solutions to whole tasks built from components (validation, address entry, search).
4. **Guidance**: when to use each, accessibility notes, content rules.

Atomic design (Brad Frost, 2016) is a mental model for the component layer: atoms (button,
input, label), molecules (a search form), organisms (a header), templates (layout with
structure, no final content) and pages (a template with real content that tests the system).
The stages are not a linear process; you move between parts and whole. Use it as vocabulary,
not as a folder structure you must follow.

## Tokens

Common practice is layers: primitive tokens (raw values), semantic tokens (meaning, such as
"text-error" referencing a primitive), and component tokens. Aliasing lets one change flow to
many places. The W3C Design Tokens Community Group is drafting a JSON exchange format
(types such as color, dimension, font family, duration; composite types such as shadow and
typography; aliases by reference, no circular references) so design tools and code can share
tokens. As of the draft read here it is a non-normative preview and says not to implement that
version; treat it as a direction, and use your tooling's current format meanwhile.

## Component rules

- Build accessibility into the component (labels, focus, keyboard, contrast) so every use inherits it.
- Document states: default, hover, focus, disabled, error, loading, empty.
- Prefer native HTML elements; extend them progressively.
- Version the library and publish a change log; breakage in a shared component hits every page.

GOV.UK's live model shows the value of sharing: teams contribute new patterns back to the
common Design System after proving them with users.

## Use when

- Two or more products or teams, a site with many templates, or long-lived products where drift costs more than upkeep.

## Do not use when

- Do not build a custom system for a single small site: adopt a proven library or a few CSS variables.
- Do not start with a large component catalog before the core patterns are validated by real use.

## Trade-offs

- Consistency and speed against the ongoing cost of maintaining, documenting and governing the system.
- A shared library reduces variety; allow contribution and exceptions or teams route around it.

## Common mistakes

- Tokens named after values ("blue-500" used as "error color") so a rebrand breaks meaning.
- Components that look right but ignore keyboard and screen reader use.
- No owner: the system decays into unused code.

## Related

- Notes: `ux-prototyping`, `ux-responsive-mobile-first`, `ux-forms-errors`, `principle-information-hiding`
- Skills: `design-system`, `frontend-design`
