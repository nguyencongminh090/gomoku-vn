---
name: ux-forms-errors
description: Designing web forms and validation - server-side validation first, error summary plus inline messages, when to validate, keeping user input, and where not to trust the browser
domain: web-development
tags: forms,validation,error-messages,ux,accessibility
apply_when: "building or reviewing a form (sign-up, checkout, contact); users abandon a form; deciding client-side versus server-side validation; writing error messages"
sources: "GOV.UK Design System - Validation pattern (read); W3C WAI - Forms tutorial (read); MDN - Client-side form validation (read); Nielsen Norman Group - 10 Usability Heuristics, error prevention and recovery (read); MDN - Learn web development, web forms (read)"
last_reviewed: 2026-09-25
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-forms-errors.md
copied: 2026-10-09
---

# Forms and error messages

Forms are where most web tasks succeed or fail. Two separate concerns: usability of the
form, and correctness and safety of the data.

## Validation behavior (GOV.UK pattern)

- **Always validate on the server.** Client-side checks are a convenience only; security and
  correctness cannot depend on them (`appsec-input-validation-injection`). Add client-side
  validation only if research shows it helps users.
- Validate when the user submits (GOV.UK's default), not on every field exit; real-time feedback needs research
  evidence that it helps.
- Refuse invalid, ambiguous or missing required data, but ignore harmless characters (spaces in
  a postcode, hyphens in a card number) instead of rejecting them.
- Show an **error summary** at the top of the page, move keyboard focus to it, link each item to
  its field, and put an error message next to each field with a problem.
- Prefix the page `<title>` with "Error:" so screen readers announce it at once.
- **Keep the user's input** so they edit rather than retype.
- The pattern advises against relying on HTML5 native validation and against marking required
  fields that way; write the rules and messages yourself so they are consistent and accessible.

## Independent cross-check

- **MDN** agrees server-side validation is mandatory: client checks can be bypassed and the
  request altered, so client validation is only a convenience. Where GOV.UK avoids native HTML5
  validation, MDN starts from the built-in attributes (`required`, `type`, `minlength`,
  `pattern`) and enhances with the Constraint Validation API, using a polite live region
  (`aria-live`) for error text. Both are defensible: pick one approach per project, keep
  messages under your own control, and test with a screen reader.
- **W3C WAI** adds: associate every control with a `<label>`, group related controls with
  `fieldset` and `legend`, give instructions up front, tell users when they finish or fail, use
  progress indicators in multi-page forms, avoid time limits unless necessary, and "only ask users to enter what is required" since excess questions raise abandonment.

## Error messages

Nielsen's heuristics: prevent errors where possible; when they occur, use plain language,
state the problem precisely and suggest a fix. Say what to do ("Enter your date of birth as
day, month, year"), not only what is wrong; avoid codes and blame.

## Design habits

- One question per row, visible labels (not placeholder-only), sensible input types and autocomplete attributes.
- Ask only for data you need (`appsec-data-protection-privacy`).
- Do not decide eligibility inside validation; use separate pages for that.
- Protect state-changing forms from cross-site request forgery (`appsec-xss-csrf`).

## Use when

- Designing any input flow, and reviewing forms in usability tests.

## Do not use when

- Do not apply on-submit-only validation to a live availability check such as a username field where instant feedback is the point and is tested to help.
- The GOV.UK pattern is one organisation's evidence-based default; adapt with your own research.

## Trade-offs

- Server-only validation costs a round trip but is simpler and always correct; client checks add speed and duplicate logic.
- Strict input rules reduce bad data and increase failures; accept variants and normalise.

## Common mistakes

- Client-side validation without server-side validation.
- Red-text-only errors, no focus management, unclear wording.
- Clearing the form after an error.
- Password rules that contradict current guidance (`authn-passwords`).

## Related

- Notes: `ux-research-usability`, `appsec-input-validation-injection`, `appsec-xss-csrf`,
  `appsec-data-protection-privacy`, `authn-passwords`
- Skills: `ux-audit`
