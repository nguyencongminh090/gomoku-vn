# Club calendar + reminders — Planning

Links: [user_story.md](user_story.md), [diagram/state.md](diagram/state.md), [diagram/uml_diagram/sequence.md](diagram/uml_diagram/sequence.md).

## Decisions (user, 2026-11-25 — all recommended options)
1. Keep the list (no month/week grid), grouped by local day: Hôm nay / Ngày mai / weekday dd/mm.
2. `/lich` both: no arg = upcoming list for the caller (opens sự-kiện, nothing stored in chat); staff `/lich dd/mm[/yyyy] HH:MM Tên` creates, Vietnam time (UTC+7) whatever the server TZ.
3. Reminders only to members who tapped **Tham gia** (RSVP), once, 30 min before.
4. Toggles `cmdCalendar` and `remindEvents`, both default **on** (overrides the old "default off" below: reminders reach RSVPs only, not the whole club).

## Open questions (answered above)
1. Calendar view (month / week) or keep the list and add reminders only?
2. `/lich`: list upcoming, create, or both? Time format typed in chat?
3. Reminder audience: all members, or only those who RSVP "tham gia"? Lead time (15 / 30 / 60 min)?
4. Staff toggle(s) in cài-đặt-nhóm; default off (fans out to the whole club).

## Sequencing (after answers)
1. Reminder sweep: on boot + interval, select events starting within the lead window and not yet reminded (`reminded_at` column) — restart-safe.
2. Notification type `club_event` → `/c/<slug>#ch=events`.
3. Calendar UI + `/lich`, jsdom + real-browser pass.
