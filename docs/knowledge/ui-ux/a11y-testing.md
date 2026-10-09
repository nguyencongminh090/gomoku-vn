---
name: a11y-testing
description: Testing web accessibility in layers - quick manual checks, automated tools in CI, screen-reader and keyboard passes, and involving disabled users - and what each layer can and cannot catch
domain: web-development
tags: accessibility,testing,automated-testing,manual-testing,screen-reader,wcag-em,easy-checks
apply_when: "adding accessibility checks to a project or CI; preparing for an audit; an automated scan passed but users report problems; planning what to test before launch"
sources: "W3C WAI - Easy Checks: A First Review (read); W3C WAI - Evaluating web accessibility (read); W3C WAI-ARIA Authoring Practices - testing note (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/a11y-testing.md
copied: 2026-10-09
---

# Accessibility testing

W3C's position: **no tool alone can determine whether a site meets accessibility standards; knowledgeable human evaluation is required.** Evaluate early and continuously, since problems are cheaper to fix early.
Test in layers.

## Layer 1: quick manual checks (WAI Easy Checks)

Thirteen checks anyone can run in minutes: image alternative text, page title, headings, colour contrast, skip link, visible keyboard focus, language of page, zoom (text and image enlargement); for media, captions, transcripts and audio description; for forms, labels and required-field marking.
W3C is explicit that passing them does not mean the page is accessible: they are "quick and easy, rather than exhaustive".

Add two daily habits: **unplug the mouse** and operate the whole flow by keyboard, and **zoom to 200 percent** or use a narrow viewport (`ux-responsive-mobile-first`).

## Layer 2: automated tools

Linters for markup (in the editor), browser extensions and rule engines that run on rendered pages, and checks in CI against key templates or component stories (`fe-build-tooling`). WAI lists over a hundred tools and advises choosing by type and context. In practice (not from the W3C pages read), automated tools reliably catch things like missing alt text, missing labels, some contrast failures and invalid ARIA attributes; they cannot judge whether alt text is meaningful, whether focus order makes sense, or whether a widget is usable. Use them to prevent regressions cheaply, not as proof of conformance.

## Layer 3: assistive-technology passes

Test critical journeys with a screen reader on the browser combinations your audience uses, with voice control or switch input where relevant, and with high-contrast and reduced-motion settings. Check that dynamic changes are announced and focus is managed (`a11y-aria-keyboard-focus`). The APG says to test real browser and assistive technology combinations before production.

## Layer 4: people

Involve users with disabilities in usability testing and in review; W3C offers guidance on involving users and on combining expertise across roles (`ux-research-usability`). For a formal conformance assessment, the W3C **WCAG-EM** methodology (with a report tool) gives a standard approach for experienced evaluators, sampling pages and documenting findings.

## Where in the lifecycle

- Design: check contrast, focus states and target sizes in the design system (`ux-design-systems`).
- Build: linters and component-level tests; keyboard check per pull request.
- Verify: full manual audit with sampled pages before launch (`lifecycle-launch-readiness`).
- Live: re-check after major changes; publish and maintain an accessibility statement if required; provide a way for users to report barriers.

## Use when

- Setting the quality gates of a project, or when an audit is due.

## Do not use when

- Do not use automated scores as the accessibility acceptance criterion.
- Do not defer all testing to a single audit at the end.

## Trade-offs

- Manual and user testing find real problems and cost time; automation is cheap and covers only part of the criteria.
- A formal WCAG-EM audit is thorough and heavy; use it for launch or legal needs and rely on lighter layers between releases.

## Common mistakes

- Treating a green scan as compliance.
- Testing only the home page.
- Only sighted developers testing.
- Fixing issues in the page but not in the shared component that caused them.

## Related

- Notes: `a11y-wcag-essentials`, `a11y-aria-keyboard-focus`, `ux-research-usability`,
  `lifecycle-launch-readiness`, `fe-build-tooling`, `ux-design-systems`
- Skills: `ux-audit`
