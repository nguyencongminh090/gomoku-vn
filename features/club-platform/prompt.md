You are a senior full-stack engineer and community-product designer working in the gomoku-vn repository. Your job is to turn the Club feature into a professional community platform, on both backend and frontend. Read AGENTS.md first and follow it and every rule file it points to; those rules override anything below if they conflict.

GOAL
Clubs should feel like a real online community (in the spirit of Discord servers, Slack workspaces, Discourse groups, Lichess Teams, Chess.com Clubs): members can talk, organize, compete and get notified; club staff can run and moderate their club; site admins can oversee every club. You have full authority to make product, design and technical decisions during this work. Do not stop to ask questions. When a choice is non-obvious, pick the option best supported by research and the existing code, and record the decision and its reason in the plan.

WHAT ALREADY EXISTS (extend it, do not rewrite it)
- Server: server/managers/ClubService.js, server/managers/ClubChatCommands.js, server/routes/clubs.js, club tables in the SQLite schema, club_log audit trail, NotificationService.
- Client: client/clubs.html + client/js/clubs.js (directory), client/club.html + client/js/club.js (club page), client/js/club-kit.js.
- Features already shipped: create/edit/delete club, avatar and banner, join/leave, approve requests, kick, role change (owner/officer/member), invites, events with RSVP, club chat with polling, slash commands /ghim (pin), /giaohuu (challenge), /binhchon (poll), /lich (calendar), @all with a cooldown, polls with vote/close/voters.
- Design folders: features/club-redesign/ (the locked UI: layout, tokens, mockups), features/club-calendar/, features/club-polls/, features/club-team-tournament/ (planning + user stories, not built).
Map this precisely with codegraph_explore before planning.

LOCKED UI
The club UI in features/club-redesign/ is final. New screens, panels, forms and components must extend that same visual language (tokens, spacing, components, icon set). Do not restyle what exists. Each new UI piece still needs a real-browser pass and screenshots.

SCOPE: two permission tiers
1. Club staff (owner and officers) manage their own club.
2. Site admins (the existing /admin area) oversee all clubs.

SCOPE: feature areas (all in scope; order and split them yourself)
A. Moderation and management
   - Club staff: mute (timed) and ban (blocks rejoin) members, transfer ownership, member list with search/filter/sort and bulk actions, delete any message, a filterable club audit log (who did what, when), member reports of messages.
   - Site admin: a Clubs section in /admin to list/search clubs, view details and log, hide/lock/delete a club, handle reported messages, and remove abusive content. Every admin action is logged.
B. Chat commands
   - Keep every Vietnamese command and add English aliases for each (for example /pin, /challenge, /poll, /calendar), so the command system is ready for internationalization. Put the alias table in one place.
   - Add commands that fit the moderation and community features you build (for example /help, /mute, /kick, /announce), each with permission checks on the server.
   - Add command autocomplete in the chat input: typing "/" shows the available commands for the user's role, each with a one-line description.
C. Mentions
   - Support @username for one member, @officers (or a similar staff group) and the existing @all, with autocomplete of member names when "@" is typed.
   - A mention creates a notification for the target(s), highlights the message for them, and respects rate limits and mute/ban state. Follow how established group chats handle this.
D. Forms instead of hand-typed syntax
   - Creating a calendar event and creating a poll must happen through a proper form (modal or panel in the locked style): validated fields, date/time pickers, add/remove poll options, preview. The slash commands stay as shortcuts that open the form prefilled from whatever text was typed.
E. Community and stats
   - Club stats: internal leaderboard, member activity, recent games between members, club rating summary.
   - Club team tournament: build it from features/club-team-tournament/ planning and user stories.
   - You may add further community features you find valuable during research (for example announcements channel, member profiles/badges, onboarding/rules page, activity feed). List each in the plan with its reason before building it.

STEPS
1. Research. Study how professional community products and open-source projects handle these areas (Discord, Slack, Discourse, Zulip, Mattermost, Rocket.Chat, Lichess Teams, Chess.com Clubs). Look at roles and permissions, moderation, mentions, slash commands, forms, and community layouts. Record the findings as a knowledge note following .claude/rules/knowledge.md, and cite it in your decisions.
2. Plan. Create features/club-platform/ following .claude/rules/design-intake.md: planning.md with the gap list (what exists vs. what is missing), the permission matrix (member / officer / owner / site admin by action), data model and migration changes, API and socket/polling changes, and an ordered list of vertical slices, each independently shippable. Add one docs/todo/<CODE> file per slice and one TODO.md line each, per .claude/rules/tracking-files.md.
3. Build each slice in order on its own feature/* branch off dev, following the git-workflow skill. For each slice: server logic with permission checks and input validation, idempotent DB migration, routes, client UI, Vietnamese UI copy, then tests.
4. Verify each slice: backend jest tests, client jsdom tests, `node scripts/cache-bust.js --write` then `node scripts/cache-bust.js` printing OK after any client/ edit, and a real-browser pass with screenshots done under the playwright-e2e-safety skill. Run the full `npm test` before each commit.
5. Commit one slice per branch, merge each finished slice into dev with a merge commit, update its todo status, then start the next slice.
6. If a slice hits a blocker you cannot resolve, record it in that slice's todo file with what you tried, then continue with the next independent slice.

CONSTRAINTS
- Security first: every staff/admin action is checked on the server, not only hidden in the UI. Bans, mutes and mentions must not leak private club data to non-members. Rate-limit mentions, reports and command spam.
- Keep the stack: Node/Express + SQLite on the server, vanilla ES modules on the client. No new frameworks. Add a dependency only when it clearly earns its place, and justify it in the plan.
- One source per entity (rule 9): roles, permissions and the command/alias table each live in one module that both server and client read from.
- Never touch the real database, never deploy to production (play3cr.win), and never push to or merge into main.
- Keep existing club behaviour and tests passing. Changes to existing APIs must stay backward compatible or migrate every caller in the same slice.

DONE WHEN
Every slice in planning.md is merged into dev with passing tests and real-browser screenshots, or is recorded as blocked with a reason. Finish with a short report: the slices shipped (branch and commit), the decisions you made and why, anything blocked or unverified, and the follow-up ideas you parked.
