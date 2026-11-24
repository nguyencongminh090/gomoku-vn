# Selecting a rule tab: where the ranks come from (target, after backend S1–S5)

Links: [../../planning.md](../../planning.md) · [../../user_story.md](../../user_story.md) · [../table-states.md](../table-states.md)

```mermaid
sequenceDiagram
  participant P as Player (lobby)
  participant C as lobby.js
  participant S as socket state.js
  participant R as RoomManager
  participant K as rank cache (per rule)

  P->>C: open #rooms
  C->>S: lobby:subscribe
  S->>R: lobbyEntry() for page 1
  R->>K: seat rank in room's rule (S1)
  S-->>C: lobby:update (tables) + stats {live, playing, byRule} (S4, S6)
  S-->>C: lobby:online_users, each with ratings for all 4 rules (S2)
  P->>C: tap tab "Luật 2"
  Note over C: no refetch for ranks: roster re-sorts from S2 data
  C->>S: lobby:rooms_query {rule: caro, offset 0, filters} (S5)
  S-->>C: tables of Luật 2 + total
  alt online > one page (50)
    C->>S: lobby:online_query {rule: caro, q, offset} (S3)
    S->>K: page sorted by rank in caro
    S-->>C: next 50
  end
  K-->>S: rating changed after a rated game
  S-->>C: online_patch / lobby:patch with new rank
```
