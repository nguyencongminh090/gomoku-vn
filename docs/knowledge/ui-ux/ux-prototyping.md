---
name: ux-prototyping
description: Using low- to high-fidelity prototypes and technical spikes to test the riskiest assumptions of a website before building it for real
domain: web-development
tags: ux,prototype,wireframe,alpha,spike,fidelity
apply_when: "the design or a technical integration is unproven; deciding how detailed a mockup should be; stakeholders want to see something; moving from alpha to build"
sources: "GOV.UK Service Manual - How the alpha phase works (read); Design Council - The Double Diamond (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-prototyping.md
copied: 2026-10-09
---

# Prototyping

Prototypes exist to learn cheaply. GOV.UK's alpha guidance: build them "just complex enough
to let you test different ideas, not production quality code", and you need not prototype the
user's whole wider journey; focus on the hardest areas to validate the **riskiest
assumptions**. In Double Diamond terms this is the Develop step: generate several solutions,
then test at small scale in Deliver.

## Fidelity ladder

| Level | Form | Use to test |
|---|---|---|
| Sketch or paper | hand drawings, screen flow | structure, page purpose, task flow |
| Wireframe | grey boxes with real content and labels | layout, hierarchy, navigation |
| Clickable mock | linked screens in a design tool | journey and wording |
| Coded prototype | real HTML/CSS/JS, fake or stubbed data | real interaction, responsive behavior, form handling |
| Technical spike | code against the real integration | feasibility, latency, data quality, cost |

Pick the lowest fidelity that can answer the question. Use real content, not lorem ipsum:
layout and wording problems only show with real text. If the assumption is technical (an
integration works, a third-party API limit fits), a design mock proves nothing; run a spike.

## Working rules

1. Write the question the prototype answers and the result that would change the plan.
2. Test with target users (`ux-research-usability`) or the integration owner.
3. Keep or discard on purpose; production code should not grow from a prototype by accident.
4. The alpha output is a decision and a tested approach, not a half-built product.

## Use when

- Alpha, or any feature whose value or feasibility is uncertain.

## Do not use when

- Do not prototype well-understood, standard patterns; use the design system's component (`ux-design-systems`).
- Do not polish a prototype visually when the question is about task flow.

## Trade-offs

- Coded prototypes are more realistic but tempt teams to keep them; paper is fast but hides interaction problems.

## Common mistakes

- Testing the easy screens while the risky integration stays unproven.
- A high-fidelity mock that stakeholders treat as approved scope.
- Shipping the prototype code because deadlines arrived.

## Related

- Notes: `lifecycle-phases`, `ux-research-usability`, `ux-information-architecture`, `ux-design-systems`
- Skills: `design-workflow`, `ui-ux-pro-max`
