# 2026-10-12 — #240 guest tournament entries keep their guest id across restart
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
Guest entries persisted player_id=null and nothing else, so hydrate produced userId null and the guest could not be matched to entry/pairings.
## Fix
Guests DO join (stable guest_xxxx session id). Added tournament_players.guest_id (schema.sql + additive migration), saved on register, hydrated as userId = player_id ?? guest_id. Member entries untouched; legacy guest rows stay unlinked.
## Verification
New reload test (isGuest kept, userTournamentMap, _findEntryIdByUserId); old 'known limitation' test replaced by legacy-row test. npm test before commit. Server-only.
