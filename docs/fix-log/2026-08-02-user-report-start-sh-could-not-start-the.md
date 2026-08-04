# Fix log entry — 2026-08-02 03:54

## Prompt

User report: `./start.sh` could not start the server at all — `Error: JWT_SECRET must be set (no default secret allowed outside test)` from [server/config.js:51](server/config.js#L51). Not a regression: this is backend fix #1 (2026-08-01) doing exactly what it was written to do — it rejects the old fallback secret `gomokuvn-dev-secret-change-in-production` in every environment except `test`, because anyone reading the repo could otherwise forge a token for any userId. What that fix never came with was a supported way to supply a real secret locally, so `npm start`, `npm run dev` and `start.sh` all died on the guard unless the variable was exported by hand every session. TODO Phần A #2 flags the same gap for real deployments.

## Action

Two parts. (a) New [server/utils/load-env.js](server/utils/load-env.js) — a ~20-line `.env` reader, called at the top of `server/config.js` before anything reads `process.env`. (b) [start.sh](start.sh) now generates a 48-byte random secret into `.env` on first run (`crypto.randomBytes(48).toString('base64url')`) and reuses it afterwards; `.env` was already in `.gitignore`. Also expanded the error message itself to name both routes out, so anyone hitting it without reading this log knows what to do.

## Decision

Hand-rolled instead of adding `dotenv`: this needs twenty lines, and a dependency that runs at startup and can inject environment variables is a supply-chain surface not worth taking on for that. Three deliberate rules, all of them about not weakening fix #1: a variable already present in the real environment **always wins**, so a production process manager's secret can never be silently overridden by a stray file on disk; the loader is a **no-op under `NODE_ENV=test`**, so the suite stays hermetic and does not start depending on a developer's local file; and a malformed line is skipped rather than thrown on, so a typo in `.env` cannot stop the server booting. The guard itself is untouched — a `.env` containing the old default secret still throws. The generated secret is per-machine and random, never a shared constant, so it is not the thing fix #1 was protecting against.

## Summary output

`npm test`: 274/274 passing, 15 suites green (was 264/14). New file [server/tests/load-env.test.js](server/tests/load-env.test.js), 10 tests: parsing (plain pairs, comments, blank lines, quotes, `export` prefix, `=` inside base64 values, malformed lines skipped) and the three safety rules (no-op under `NODE_ENV=test`, applies when not testing, **never** overrides a real environment variable, missing file is not an error). **Verified by actually running it:** from a clean tree with no `.env`, `./start.sh` generated the secret, wrote one line to `.env`, and the server came up on port 3000 — `GET /login.html` → 200 and `POST /api/auth/guest` returned a signed JWT. A second run reused the same secret (file hash unchanged, still one line) rather than appending another. `git status` confirms `.env` stays untracked.
