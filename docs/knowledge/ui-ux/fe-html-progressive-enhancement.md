---
name: fe-html-progressive-enhancement
description: Building the web frontend from semantic HTML upward - native elements first, CSS and JavaScript as enhancement layers, so the page works when scripts fail
domain: web-development
tags: html,semantic-html,progressive-enhancement,accessibility,javascript-failure
apply_when: "starting a page or component; a div is being turned into a button; the page is blank when JavaScript fails; reviewing markup for accessibility and robustness"
sources: "GOV.UK Service Manual - Using progressive enhancement (read); MDN - HTML: a good basis for accessibility (read); MDN - Basic HTML syntax (read); WHATWG HTML Living Standard (not read)"
last_reviewed: 2026-09-25
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-html-progressive-enhancement.md
copied: 2026-10-09
---

# Semantic HTML and progressive enhancement

## Layers

GOV.UK's guidance builds in three layers and treats each as more fragile than the one below:

1. **HTML** is the foundation. A user should be able to complete the journey using only HTML. Browsers ignore markup they do not understand and keep parsing, so it is fault-tolerant.
2. **CSS** is fairly fault-tolerant (unknown declarations are skipped). Avoid styling that only exists if JavaScript runs, such as CSS-in-JS for essential layout.
3. **JavaScript** adds interactivity but is not fault-tolerant: an unsupported syntax or API call throws and the rest of the script does not run.

JavaScript can fail for many reasons besides old browsers: network errors, extensions,
corporate firewalls, DNS problems, third-party script conflicts, and users' own settings.
GOV.UK therefore says to design so core functionality works without it, to justify any
framework with evidence, and to avoid single-page apps by default (`lifecycle-stack-selection`).

## Semantic HTML rules (MDN accessibility guidance)

- Use "the right element for the right job": native `button`, `a`, `input`, `label` give keyboard operation, focus and screen-reader roles for free. A styled `div` needs `tabindex`, a role and key handlers to imitate a button, and still falls short.
- `button` performs an action; `a` with a real `href` navigates. Do not use `href="javascript:void(0)"` links.
- Headings form an outline (h1, then h2, ...); use them for structure, not for size. Landmarks (`header`, `nav`, `main`, `footer`, `aside`) let assistive technology jump between regions.
- Associate every form control with a `label` (`for` and `id`).
- Provide `alt` text that conveys meaning; use `alt=""` for decorative images.
- Tables: `caption` and `th` with `scope`.
- Give links meaningful text (not "click here"); never remove focus indicators; do not rely on color alone.
- Basic document hygiene: `<!doctype html>`, `lang` on the root element, `meta charset="utf-8"`, a unique `title`, properly nested elements.

## Working method

Write the HTML first and check it in a browser with CSS and JS off. Add CSS. Add JavaScript
only for behavior HTML cannot express, and check that failure leaves a usable page (a link
that still navigates, a form that still submits and is validated on the server;
`ux-forms-errors`).

## Use when

- Every page and component; especially public, government, e-commerce and content pages.

## Do not use when

- Pure canvas or WebGL apps, and tools that cannot work without scripts, cannot offer a non-JS path; still keep the surrounding page semantic and state the requirement clearly.
- Do not confuse this with "no JavaScript ever": enhancement is expected, dependency for basic function is the problem.

## Trade-offs

- More upfront thought and server-side handling, in return for resilience, accessibility and better search and performance baselines.
- Server-rendered flows may feel less fluid than client-only ones; enhance selectively.

## Common mistakes

- `div` and `span` soup with click handlers.
- Content injected only by script, invisible to crawlers and to users when the script fails.
- Client-side routing that forgets focus and title updates (see `fe-framework-choice`).
- Heading levels chosen by font size.

## Related

- Notes: `fe-framework-choice`, `fe-css-architecture`, `ux-forms-errors`, `lifecycle-stack-selection`,
  `apptype-web-frontend`, `appsec-xss-csrf`
- Skills: `google-style-html-css`
