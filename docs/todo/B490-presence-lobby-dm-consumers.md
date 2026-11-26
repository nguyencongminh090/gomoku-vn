# B490 — Presence consumer: lobby list, rooms roster, home counts, DM window (PS-5)
**Status:** ✅ DONE 2026-11-27 — DM window label + dot via presence-view (`presence.online/offline`; old English-only `private_chat.user_*` keys removed); public projection now reads away as offline (#372 for strangers, Q4 A nuance stays friend-only). Lobby list / rooms-h roster list only present users (no per-row status) and home counts already read presence-core through state.js — no change needed. Emit counts unchanged (#486 suite green).
**Area:** client/js/{lobby,rooms-h,lobby-home,private-chat}.js, server/socket/home-feed.js
**From:** features/presence-status (planning §1e R3-R5, R9), 2026-11-27   **Depends:** #488
## Scope
1. Labels through presence-view; lobby list keeps #372 rule (away not listed, Q4 A).
2. DM window label = the same i18n keys as friends.
## Done when
- jsdom tests; emit counts ≤ #486 baseline.
