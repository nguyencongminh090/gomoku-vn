# Club platform delivery plan
[Stories](user_story.md) · [Request flow](diagram/uml_diagram/sequence.md) · [States](diagram/state.md) · [Research](../../docs/knowledge/club-community.md)

## Existing paths and gaps
Codegraph traced clubs.js routes to ClubService, ClubChatCommands, NotificationService and TournamentManager. The directory and ClubKit serve the rail, search and creation. The club page has a keyboard-operated command list, chat polling with before/after cursors, RSVP controls and a staff event form. Reuse setRole's transfer transaction, remove, deleteMessage, clubHistory and existing notification types. Individual mentions already resolve club members. The weekly win board excludes winless players. Category boards and average rating already exist. Club-hosted individual tournaments do not assign players to teams.

## Authority

| Action | Member | Officer | Owner | Site admin |
|---|---|---|---|---|
| Chat, mention, vote, report, create poll | yes | yes | yes | by membership |
| Schedule, pin, announce, review club history, delete message | — | own club | own club | content oversight |
| Kick, mute, ban, bulk actions | — | members | members/officers | separate oversight |
| Transfer or change staff roles | — | — | yes | — |
| Hide, lock, delete across clubs, dispose reports | — | — | — | yes |
| Choose team roster | — | own club | own club | by membership |

## Ordered slices and contracts
1. B459 command directory. Shared browser/CommonJS catalog and role checks, bilingual aliases, private help and staff announcement. Preserve existing POST messages API. Reuse the combobox and private responses to avoid chat noise. No migration.
2. B454 creation forms. Staff event panel and member poll form, editable options and live previews. Slash text opens a populated draft. Keep existing clients working and validate structured option arrays independently of command delimiters.
3. B455 club moderation. Persistent sanctions keyed by club and user, expiry for mutes. Transactional bulk endpoint reuses the same rank check for every target. Apply bans to join, request approval and invitations. Mute survives leave/rejoin. Audit deletions and sanctions. Staff filter retained log by action and actor.
4. B456 mentions. Confirmed roster autocomplete, staff group and personal highlighting. Resolve recipients on send, deduplicate groups, exclude sender and cap fan-out. Reuse private polling and notification types. No new socket.
5. B457 site oversight and reporting. Member-only report POST, unique reporter/message, rate budget, admin queue and disposition. Admin-only list/detail and state operations. Store hide/lock flags and permanent admin actions outside the club cascade. Hidden clubs leave public discovery, locked clubs reject ordinary mutations.
6. B458 club activity. Query existing games for both confirmed members, show recent games and seven-day member activity alongside category leaderboard and rating summary. Authenticated member detail only, bounded rows, no counter migration.
7. B236 / B460 team tournaments (split into two shippable slices). B236: rebuild migration adding `team` format plus `tournament_teams` and `tournament_team_roster` tables, captain roster validation/ordering, multi-round alternating-color board pairing, board/walkover scoring, shared rank-1 ties, hydration and club tournament queries. B460: organizer create controls, captain roster selector, team standings and individual boards on `tournament.html`, and club page `giải-đấu` integration.

## Decisions
Use additive SQLite migrations with FK constraints, guarded alters where needed, and one transaction per multi-row action. Replacing polling with a new socket subscription would add a second membership lifecycle. Each new panel uses the existing club card, form, buttons and Phosphor sprite. No dependency needed. Check stale role/club state, legacy clients, duplicate submission and failed bulk validation during verification.

For B236 choose two clubs, equal board counts, captains selected from club staff, ordered by rating at registration with username as tie-break. Freeze the roster at start to make reconnects deterministic. Alternate colors across rounds. Score each completed board once (1/½/0), including a single-board forfeit. Equal totals share first place. Play unrated to allow unevenly matched clubs to participate. Reuse the existing organizer workflow for creating an event. These decisions resolve the six questions in the team planning folder.

Park badges, separate announcement channels and customizable onboarding. The pinned announcement and existing member profiles cover their immediate uses.

Each slice requires server and jsdom tests, cache hash verification, desktop/mobile browser evidence against a disposable database, full Jest, a feature commit and a merge commit on dev.

Advisory review identified deletion reconciliation for existing polling tabs, the cascade on club_log during deletion, and the tournament format CHECK in migration 011. Retain admin dispositions outside that cascade, reconcile displayed IDs, and test team hydration and walkovers before shipping. Permission decisions also draw on the SKILLS_TREE authz-least-privilege and authz-broken-access-control notes.

Locking leaves reporting and leaving available. Hiding removes a club from public discovery, profile badges and hosted-club labels, and limits direct reads to its confirmed members. Admin report evidence retains the message excerpt when chat retention removes its source. The admin ledger records successful reads and mutations, including the club identity on deletion.
