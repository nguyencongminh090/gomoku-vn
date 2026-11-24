# Lobby join → online snapshot/patch → roster render

Links: [../../planning.md](../../planning.md) · [../../user_story.md](../../user_story.md) · [../table-player-states.md](../table-player-states.md)

```mermaid
sequenceDiagram
  participant C as Client (lobby.js)
  participant S as Socket state (state.js)
  participant R as RoomManager
  participant DB as rankings cache
  C->>S: connect, join lobby
  S->>R: listRooms()
  R-->>C: lobby:update {rooms[], lobbyStats {rooms, open, live, watch, playing*}}
  S->>DB: ratings/rank for online userIds (cached, item B)
  DB-->>S: {userId: {cat: [rating, games, rank]}, main}
  S-->>C: lobby:online_users {total, page[] of OnlineEntry*}
  C->>C: render counts, tables, roster (rank in main rule or selected rule)
  Note over R,C: a seat/viewer/game change
  R-->>C: lobby:patch {room, lobbyStats}
  S-->>C: lobby:online_patch {total, changed entries (activity*, table*)}
  Note over DB,S: a rated game ends
  DB-->>S: refresh the two players' rank cache
  S-->>C: lobby:online_patch {changed entries (ratings*)}
  C->>C: re-sort roster, no full re-render
```

`*` = field not sent today (planning.md items A/B/B2). `moves`/`startedAt` for the mini board are already in `lobbyEntry` (#364).
