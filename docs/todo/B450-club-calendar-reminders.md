# B450 — Club calendar + reminders for scheduled events
**Status:** OPEN — idea only; size L, resolve `features/club-calendar/planning.md` open questions before any code
**Area:** `server/managers/ClubService.js` (club_events), a reminder scheduler, `NotificationService` (new type), `client/js/club.js` (sự-kiện channel, composer), tests
**From:** [features/club-calendar](../../features/club-calendar/planning.md) (user answer during #447, 2026-11-24: "Calendar, notify cho lịch hẹn")   **Depends:** B447

## Problem
Club events (sự-kiện) exist but there is no calendar view, no way to schedule from chat, and nobody is reminded when an event starts.
## Scope
1. Ask the user: month/week calendar view vs the current list; `/lich` command (list or create); who gets reminders (all members vs "tham gia" RSVP) and when (e.g. 30 min before); staff toggle in cài-đặt-nhóm.
2. Reminder delivery reuses `NotificationService.push`; the scheduler must survive restarts (derive from `club_events.starts_at`, not in-memory timers only).
## Don't
- New socket on the club page.
## Traps
- In-memory timers are lost on restart / deploy; a sweep on boot + interval is needed.
## Done when
- Decided with the user, then backend + jsdom + real-browser pass.
