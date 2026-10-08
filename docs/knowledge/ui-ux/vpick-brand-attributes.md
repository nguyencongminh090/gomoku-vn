---
name: vpick-brand-attributes
description: Turning brand words (trustworthy, playful, premium) into visual levers, and checking that a chosen style really conveys them with 5-second, preference and desirability tests
domain: visual-design
tags: brand,brand-attributes,desirability,5-second-test,visual-testing,perception,credibility
apply_when: "the user gives adjectives or a vague mood; two style directions must be compared; a stakeholder disputes a look; validating that a design conveys the intended brand personality"
sources: "NN/g - Testing Visual Design, A Comprehensive Guide (Chan 2024); NN/g - Using the Microsoft Desirability Toolkit to Test Visual Appeal (Benedek and Miner 2002 method); NN/g - Impact of Interaction Design on Brand Perception (Moran 2016); NN/g - Trustworthiness in Web Design (Harley 2016); NN/g - Aesthetic-Usability Effect (Moran 2024)"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vpick-brand-attributes.md
copied: 2026-10-09
---

# Brand attributes to visual choices, and how to test them

A style is not chosen because it is pretty but because it makes people perceive the brand
correctly. NN/g's method: fix 3-5 target brand attributes first, then test whether users
pick them.

## Step 1: fix 3-5 attribute words

- Ask the user for adjectives; if none, propose a list and let them cut it. Include the
  opposite of each (for example "premium" versus "cheap") so tests can show failure.
- Keep them about perception, not function ("fast" is a performance target, not a look).

## Step 2: map words to visual levers (starting hypotheses)

| Attribute | Levers that usually push toward it | Levers that push against it |
|---|---|---|
| Trustworthy, professional | conventional layout, calm palette, strong contrast, clear signifiers, no typos or broken links | novelty effects, low contrast, playful type |
| Premium, elegant | generous space, restrained palette, refined type, quality imagery | loud color, dense layout, stock clutter |
| Playful, friendly | rounded shapes, warm bright color, illustration, soft motion | strict grids, grey palette |
| Bold, rebellious | thick borders, saturated color, oversized type, asymmetry | conventional corporate look |
| Human, authentic | hand-drawn art, real photos, warm neutrals, natural language | polished generic 3D, template hero images |
| Innovative, techy | dark or gradient surfaces, glass, crisp mono accents, motion | skeuomorphic or retro decoration |
| Calm, caring | soft color, space, slow motion, organic shapes | sharp contrast blocks, flashing |

These are common-practice hypotheses; confirm with the audience.

Interaction is part of the brand too: clear labels and feedback build perceptions of
sincerity and competence, consistent behavior builds trust, and surprising behavior should be
rare and tested (Moran 2016). Credibility also depends on design quality, upfront disclosure of
prices and contact details, accurate current content, and being connected to the wider web
(Harley 2016).

## Step 3: test

- **5-second test**: show a mockup for 5 seconds and ask what they remember and feel; do not
  warn about the time limit.
- **Preference test**: compare 2-3 clearly different directions (subtle differences confuse).
  Randomise the order.
- **Desirability test (Microsoft Desirability Toolkit)**: users pick words that describe the
  design from a list of about 25 words, about 40% negative, including the brand attributes and
  their opposites, in random order. Count how many users pick at least one target word in their
  top five; compare directions by percentage. The method dates from Benedek and Miner (2002).
- **Behavior first**: in combined studies do task-based checks before aesthetic questions;
  aesthetics can mask usability problems (aesthetic-usability effect).

## Use when

- Turning a mood request into evidence; choosing between two directions.

## Do not use when

- There is no access to target users and no time: state the assumptions and ask the user to
  accept them instead of running a fake test with colleagues.
- The audience is fixed by a mandate (government design system): follow the mandated look.

## Trade-offs

- Testing costs a few days and a small panel, but avoids a rebuild; word lists are quick yet
  only measure perception, not task success.
- A test on static mockups cannot show motion or interaction feel.

## Common mistakes

- Asking "do you like it" instead of "which words describe it".
- Testing tiny variations (two shades of blue).
- Treating a high preference score as proof of usability.

## Related

- Notes: `vpick-choosing-style`, `vpick-style-by-site-type`, `vpick-trends-longevity`,
  `ux-research-usability`, `ux-prototyping`
- Skills: `ux-audit`, `ui-ux-pro-max`
