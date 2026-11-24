# Club calendar + event reminders — User story

Status: **recorded 2026-11-24**, not authorized to build. See [planning.md](planning.md), [state](diagram/state.md), [sequence](diagram/uml_diagram/sequence.md). Todo: [B450](../../docs/todo/B450-club-calendar-reminders.md).

User, during #447: "Calendar, notify cho lịch hẹn".

## Current state (verified in code)
- `club_events` (title, starts_at) listed in the sự-kiện channel (`ClubService.upcomingEvents`, max 20 upcoming); staff create/delete. No reminders, no calendar view, no chat command.

## Actors
Staff (schedule), member (see, RSVP?), server scheduler.

## Stories
1. As a member I see the club's events on a calendar (month/week) in sự-kiện.
2. As staff I can schedule from chat (`/lich <time> <title>`) as well as the form.
3. As a member I get a bell notification shortly before an event starts.

## Hard constraints
- Reminders must survive server restarts; no new socket on the club page.
