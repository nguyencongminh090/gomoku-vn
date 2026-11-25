# 2026-11-25 13:18 — untracked club platform review polish (middle-dot joins, team UI i18n, activity spacing)
## Prompt
"okay, fix first" — fix the 4 findings from the review of the Gemini/Codex club platform slices.
## Root cause
- club.js built previews, alias hints and sanction rows as one string joined with " · " (B454/B455/B459), bypassing PlatformShell.meta (one span per fact, ticket-rows rule).
- B460 team UI wrote ~45 Vietnamese strings straight into tournament-detail.js template literals instead of i18n.js; the per-board record was abbreviated "1T / 0H / 0B".
- Activity card stacks two .cl-h3 headings; .cl-h3 has 6px top margin, so the second heading sat on the list above.
## Fix
- client/js/club.js: previewPoll/previewEvent and roster sanctions use PlatformShell.meta (+ prow__t for the name); alias hint reads "Hoặc /pin, /ghim".
- client/js/tournament-detail.js + i18n.js: 43 tdetail.team_* keys (vi + en); record spelled out as 3 spans ("1 thắng", "0 hòa", "0 thua"), points as "N điểm".
- client/css/club.css: .cl-card > .prows + .cl-h3 margin-top 20px. Locked styles otherwise untouched.
- Branch fix/club-platform-polish off dev (code only on dev). ?v= rewritten by cache-bust --write.
## Verification
- tournament-detail-team.test.js now evals real i18n.js; asserts record spans, no hardcoded Vietnamese, every key in vi + en. clubs-pages.test.js: preview/sanction spans + no " · " join in club.js.
- npm test full suite; cache-bust OK.
- Real browser (temp DB, browser.cjs activity/team/forms/moderation/commands), desktop + mobile screenshots refreshed in features/club-platform/screenshots/. Real DB md5 unchanged.
- Not verified: English locale rendering of the team page in a browser.
