# 2026-11-15 19:55 — Admin console loading, keyboard access and user selection

## Prompt

Fix the Admin manager UI from `dev` on a review branch.

## Root cause

- The shell assumed every response outside 401/403 contained a complete permission payload. The tabs also lacked keyboard navigation and panel associations.
- Earlier Users requests could replace a newer search or selected account. Network errors could leave controls disabled or hidden and a failed detail reload could overwrite its error with a success message.

## Fix

- Show loading and error states for `/api/admin/me`. Associate each tab with its panel and keep keyboard navigation within permitted tabs while preserving hash links.
- Keep the latest search and user detail, disable mutations while loading or saving, and show actionable results outside the hidden detail panel. A saved change followed by a failed reload clears the stale detail and displays both outcomes.

## Verification

Six targeted Admin client suites passed (62 tests). Regression coverage includes invalid permission responses, keyboard navigation, out-of-order responses, network failures, and a failed refresh after a successful mutation.
