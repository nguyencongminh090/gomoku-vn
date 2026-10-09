---
name: ux-research-usability
description: Learning user needs and testing a web design with real users - methods, how many participants, Nielsen's ten heuristics as a review checklist
domain: web-development
tags: ux,user-research,usability-testing,heuristics,nielsen
apply_when: "starting discovery; deciding how to test a prototype; reviewing a design with no users available; asked how many test participants are enough"
sources: "GOV.UK Service Manual - Start by learning user needs (read); Nielsen Norman Group - 10 Usability Heuristics, Nielsen 1994 (read); Nielsen Norman Group - Usability Testing 101 (read); NN/g - Card Sorting (read); Nielsen - Why you only need to test with 5 users, 2000 (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-research-usability.md
copied: 2026-10-09
---

# User research and usability testing

## Learning needs

Use three sources together: existing evidence (analytics, support and call data, earlier
research), interviews and observation of real users, and staff who work with users (support
agents, caseworkers). Include people who struggle with the current service, not only typical
users. Record needs in the form in `lifecycle-requirements-nfr`. Treat opinions that do not
come from users as assumptions to test.

## Usability testing

Ask a participant to perform realistic tasks on a prototype or live page while thinking
aloud; observe where they hesitate or fail. Nielsen's 2000 argument: the first user reveals
about a third of the problems, and by the fifth you mostly see repeats, so run several small
rounds (for example three rounds of five) and fix problems between them rather than one large study.

Caveats from the same article:

- Several distinct user groups: test 3-4 people per group (3 per group when there are three or more).
- Metric-based (quantitative) studies need about 20 users.
- Card sorting needs about 15.

These are the author's guidance; they assume the tested tasks are meaningful and users are
representative.

A session has three parts: a facilitator who guides without influencing, realistic tasks
worded so they are not misread, and participants who represent real users. The think-aloud
method has them narrate intent while working. Sessions can be moderated (live, in person or
remote, with follow-up questions) or unmoderated (platform-run, scalable, no probing). Record
observations, quotes, task success and, if the goal needs it, time on task. NN/g repeats the
five-participant rule for qualitative studies. For structuring content, card sorting reveals
users' mental models (see `ux-information-architecture`).

## Heuristic review (when no users are available)

The ten heuristics are broad rules of thumb, not specific guidelines: visibility of system
status; match with the real world; user control and freedom; consistency and standards; error
prevention; recognition rather than recall; flexibility and efficiency; aesthetic and
minimalist design; help users recognise, diagnose and recover from errors; help and
documentation. Use them to structure an expert walkthrough and to name issues found in
testing. A heuristic review finds likely problems; it does not replace watching real users.

## Use when

- Discovery, alpha (test prototypes), and before every major redesign; after launch to find friction.

## Do not use when

- Do not use a usability test to choose between visual taste options; use it to find task failure.
- Do not report a heuristic review as user evidence.

## Trade-offs

- Small rounds are cheap and fast but cannot estimate rates; use larger studies for numbers.
- Remote unmoderated tests scale but lose the chance to probe why.

## Common mistakes

- Testing with colleagues instead of target users.
- Leading questions ("Do you like this menu?") instead of task observation.
- Collecting findings and never scheduling the fixes.

## Related

- Notes: `lifecycle-phases`, `lifecycle-requirements-nfr`, `ux-prototyping`, `ux-forms-errors`
- Skills: `ux-audit`, `ui-ux-review`
