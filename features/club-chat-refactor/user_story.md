# Club chat refactor — user stories
[Planning](planning.md) · [Sequences](diagram/uml_diagram/sequence.md) · [States](diagram/state.md) · [Mockups](mockups/) · [Prompt](prompt.md)

Scope: the club chat (`client/club.html`, `client/js/club.js`, `client/js/club-policy.js`, `ClubService`,
`ClubChatCommands`, `routes/clubs.js`). Room chat, DMs and tournament-match chat are out of scope.

## Actors
- **Member**: a confirmed member, mostly on a phone. They chat, mention people, vote, create polls and report messages.
- **Officer / owner (staff)**: everything a member can do, plus pin announcements, create and delete events,
  delete other members' messages (subject to the rank rule, see Q1) and moderate.
- **Site admin**: reads report evidence in the admin queue (B457) and is not a club role.
- **Other open tab**: a second member's page, which learns about changes only through the 8 s REST poll.

## Stories
1. As a member, I want to fix a typo in my message, so that I don't have to send a second "*sửa: …" message.
2. As a member, I want to delete a message I sent by mistake, at any time, so that it disappears for everyone.
3. As a reader, I want to see "đã sửa" on a changed message, so that I know the text is not what was first sent.
4. As staff, I want to delete an abusive message from a lower-ranked member, so that the chat stays clean. The deletion is recorded in nhật-ký.
5. As a phone user, I want to long-press a message to get its actions, with the chosen message visibly marked,
   so that the actions don't clutter every row.
6. As a keyboard or screen-reader user, I want every message action to be reachable without a gesture.
7. As a member, I want to type `@` and pick a person by the name I know them by, such as "Hoa Mai", and not only their username.
8. As a member, I want to build a poll in a sheet where I add, remove and reorder options and see the card before I post.
9. As a member, I want a month calendar of club events, so that I can see what's on this week and RSVP.
10. As staff, I want to create an event by picking a day and a time, so that I don't have to type a date format.
11. As a member, I want the slash list to show only commands that still make sense. A removed command should tell me where it moved.

## Rules
- Authors edit **their own `text` messages only**, with no time limit. Nobody edits someone else's message. Pin, challenge and poll rows are never editable.
- Authors delete their own messages of any kind. Staff delete others' messages under the rank rule (Q1).
- Deleting a pin row also clears the announcement when it still shows that text. This rule already exists in `removeContent`.
- An edit is plain text. It is never parsed as a slash command, so editing a message into `/ghim …` does not pin.
- An edit or delete made in one tab reaches every other open tab within one poll tick (8 s).
- Edits never move the unread dot.
- Event times are shown and entered in **Vietnam time (GMT+7)** and are labelled that way everywhere on the calendar.
- All new UI text goes through i18n, in sentence case, using the `.cl-hq` tokens and the Phosphor sprite, in light and dark.

## Hard constraints
- Club chat stays on REST polling. No socket on the club page, because one would evict the lobby socket (B447 Don't).
- Every permission is enforced on the server and covered by a refusal test.
- No `club_messages` table rebuild. Use only `ALTER TABLE … ADD COLUMN` (see [planning § Schema](planning.md#schema)).
- Long-press must not break scrolling, must not block the native text menu where text selection is expected, and must have a non-gesture equivalent.
