# 2026-11-24 — #448 `/api/clubs/mine` lacked color/tag
## Prompt
Do #448.
## Root cause
`clubsOfUser` SELECTed/returned only slug/name/role/members/avatar, while `listClubs` returns color+tag; the rail (fed by `/mine`) fell back to grey initials for clubs without an avatar (rule 9: one entity, one source).
## Fix
`server/managers/ClubService.js` `clubsOfUser`: select + return `color`, `tag`. Also reaches `/api/profile` clubs (additive). Scope item 3 (listClubs bannerUrl) not done: needs asking first.
## Verification
`clubs-route.test.js`: `/mine` row color/tag == DB == `/api/clubs` row; `profile-route.test.js` expectation updated. `npm test` 273/273 green. Real-browser crest check not run.
