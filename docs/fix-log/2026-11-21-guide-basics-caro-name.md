# 2026-11-21 — untracked Rules guide Vietnamese title said "Gomoku"
## Prompt
index#room -> Luật: use Caro instead of Gomoku (Vietnamese version).
## Root cause
`guide.basics_name` (vi) in client/js/i18n.js was "Cách chơi Gomoku".
## Fix
vi string -> "Cách chơi Caro"; EN unchanged. Cache-bust rewritten.
## Verification
Regression test in client/tests/room-rules-guide.test.js; cache-bust OK.
