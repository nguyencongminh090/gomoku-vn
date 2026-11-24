# B450 — Club calendar + reminders for scheduled events
**Status:** BUILT, merged to `dev` 2026-11-25 — tests + real-browser pass (incl. 020+021 on a copy of the PC DB, en locale, bell); decided 2026-11-25 (see [planning](../../features/club-calendar/planning.md#decisions-user-2026-11-25--all-recommended-options)); not deployed
**Area:** migration 021, `ClubChatCommands` (`/lich`, `parseEventArg`), `ClubService` (RSVP, `remindDueEvents`), `routes/clubs`, `NotificationService` (`club_event`), `server/index.js` sweep, `client/js/club.js` + `club.html`, `platform-shell.js`, i18n, tests
**From:** [features/club-calendar](../../features/club-calendar/planning.md)   **Depends:** B447

## Approach
- 021: `club_events.reminded_at` + partial index on `starts_at WHERE reminded_at IS NULL`; `club_event_rsvps` (PK event,user; cascades).
- Sweep on boot + every 60 s: events with `now < starts_at <= now+30 min`, claimed by conditional UPDATE (never twice, restart-safe); started events are never reminded late; `remindEvents` off = skip without claiming.
- Notify confirmed members who RSVP'd; `actorId` null (push de-dupes by type+actor). `/c/<slug>#ch=events`.
- `/lich` stores no chat row (avoids another club_messages rebuild). Enter on a fully typed `/lich` sends (hint doesn't swallow it).
## Don't
- New socket on the club page; in-memory timers.
## Traps
- `push()` drops older rows with the same (type, actor) → reminders must pass a null actor.
- Event created < 30 min before start is claimed on the next tick; RSVPs after that get no reminder (they just acted).
## Done when
- Backend + jsdom + real-browser pass ✅ (2026-11-25); user review → commit/merge.
