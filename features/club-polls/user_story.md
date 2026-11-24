# Club polls (Bình chọn) — User story

Status: **recorded 2026-11-24**, not authorized to build. See [planning.md](planning.md), [state](diagram/state.md), [sequence](diagram/uml_diagram/sequence.md). Todo: [B449](../../docs/todo/B449-club-polls.md).

User, during #447: "Có thể là tạo bình chọn (cho phép thành viên tạo vote)".

## Current state (verified in code)
- Club chat = `club_messages` (kind text | pin | challenge, `meta` JSON), REST-polled every 8 s; commands parsed in `server/managers/ClubChatCommands.js`, toggled per club (`clubs.chat_settings`).

## Actors
Member (creates / votes), staff (toggle, delete), server.

## Stories
1. As a member I type `/binhchon <question> | <option> | <option>` and a poll card appears in trò-chuyện.
2. As a member I vote by tapping an option; I see the tally update on the next poll.
3. As staff I can switch polls off in cài-đặt-nhóm and delete a poll.

## Hard constraints
- No new socket on the club page; votes validated server-side; one vote per member per poll.
