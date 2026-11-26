<context>
Repository gomoku-vn. This is a size-L refactor of the CLUB chat (client/club.html, client/js/club.js, client/js/club-policy.js, server/managers/ClubService.js, server/managers/ClubChatCommands.js, server/routes/clubs.js). Room chat, private chat and tournament-match chat are out of scope.

Much of it already exists, so improve and reuse rather than rebuild:
- Slash commands are listed in club-policy.js: pin, challenge, poll, calendar, mute, kick, help, some with per-club toggles.
- Mentions work (#456): @user (max 5), @all/@tatca, @officers, with a combobox popup (#cb-chat-hints).
- Polls have an editor dialog (#cb-poll-editor, #454).
- Events are created by staff through a form in the events channel with a bare datetime-local input; the calendar slash command opens a prefilled draft.
- Message editing does not exist. Deleting is staff-only. Reporting uses window.prompt.

Before designing, read CLAUDE.md, docs/knowledge/club-community.md, docs/knowledge/ui-ux/INDEX.md, features/club-platform/planning.md, and the todo files for #447, #449, #450, #454, #456 (use scripts/track.js).
</context>

<requirements>
1. Slash commands: review each existing command and propose keep, merge or remove, with a one-line reason for each. Poll and event are the core ones. I approve the final list before anything is removed. Cover what removal means for the club settings toggles and for people who still type the old command.
2. Mentions: @ a person or a group. Audit the current behaviour and popup (keyboard, touch, phone keyboard covering the list, highlighting, notifications) and propose only the gaps worth fixing.
3. Builder UIs that help people compose structured content:
   - Poll: a setup sheet that makes creating a poll easy (add, remove and reorder options, live preview, clear validation).
   - Event: a month-grid calendar showing club events, plus a create form with date and time picking. Only staff create events, as today.
4. Edit and delete messages:
   - A member can edit and delete their own messages, with no time limit. Edited messages show "đã sửa".
   - Staff keep the ability to delete others' messages under the current rank rules. Nobody edits someone else's message.
   - Desktop: an action toolbar on hover and on keyboard focus. Phone: long-press opens an action sheet and visibly marks the selected message.
5. The request ended with "...". List any other chat improvements you think are worth it as proposals only; build none of them unless I pick them.
</requirements>

<constraints>
- Club chat is REST polling only, because a socket there would evict the lobby socket. Polling fetches "after the last id", so edits to older messages need their own refresh path; follow the pattern already used for removed messages and poll refresh, and make edits and deletes reach other open clients.
- Enforce every permission on the server; hiding a button is not enforcement.
- Editing needs a schema migration. club_messages has a CHECK on kind and was rebuilt once (migration 020), so check that history first.
- System rows (pin, challenge, poll) stay non-editable unless you show why not; deleting a pin must still clear the club announcement.
- Decide and justify: whether a mention added by an edit notifies (NotificationService.push dedupes), what happens to reports on an edited or deleted message (moderation evidence must survive), and whether deletion leaves a placeholder.
- Long-press must coexist with scrolling, text selection and the native iOS/Android menu. Every action also needs a non-gesture path reachable by keyboard and screen reader.
- The slash event parser uses Vietnam time while the form uses the viewer's local time. Make the calendar consistent and state which zone is shown.
- All UI text goes through i18n, in sentence case, using the existing club design tokens and icon sprite, in light and dark themes.
</constraints>

<research>
Search the web for how Slack, Discord, Telegram, Messenger and Zalo lay out the message list, composer, slash and mention popups, message actions, poll creation and event calendars. Prefer official help pages, design guidelines and WAI-ARIA patterns over forum posts. Give a short comparison table with source links, then say which pattern you adopt for each requirement and why it fits a small Vietnamese board-game club used mostly on phones. Borrow interaction patterns, not branding.
</research>

<process>
Phase 1, design only. Follow the design-workflow skill and the design-intake rule: create user story, planning, diagrams and clickable mockups in features/club-chat-refactor/ (this prompt lives there as prompt.md), at 390px and desktop, covering the message actions, poll sheet, event calendar and the slash/mention popups. Include the command keep/remove table, the answers to the "decide and justify" points, any open questions, and a split into small tracked items with dependencies and a model tier each. Show me screenshots, then stop and wait for my approval. Do not edit application code in this phase.

Phase 2, after I approve. Implement one item at a time on feature/* branches off dev, following git-workflow. Commit and merge only when I ask.
</process>

<done_when>
Per item: backend tests (including permission refusals such as editing another member's message), jsdom tests, full npm test, node scripts/cache-bust.js prints OK, and a real-browser pass at 390px and desktop in both themes on an isolated database (playwright-e2e-safety). The browser pass uses two members to confirm that an edit and a delete made by one appear for the other. Report what you verified and what you could not; long-press on a real iOS or Android device counts as unverified unless it was actually tried.
</done_when>

Reply to me in Vietnamese; keep code and tracking files in English. Start with Phase 1.
