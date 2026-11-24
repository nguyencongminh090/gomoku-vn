# Club event reminder — sequence

```mermaid
sequenceDiagram
  participant T as Sweep (boot + interval)
  participant DB as SQLite
  participant N as NotificationService
  participant U as Member (bell)
  T->>DB: events with now < starts_at <= now+30 min AND reminded_at IS NULL (club remindEvents on)
  T->>DB: UPDATE reminded_at WHERE reminded_at IS NULL (claim; 0 rows = already done)
  T->>N: push club_event (actor null) to each confirmed member who RSVP'd "tham gia"
  N-->>U: notify:new (live) or next bell fetch
```
