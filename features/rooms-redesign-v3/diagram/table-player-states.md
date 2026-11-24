# Table state and player activity

Links: [../planning.md](../planning.md) · [../user_story.md](../user_story.md) · [uml_diagram/lobby-roster-sequence.md](uml_diagram/lobby-roster-sequence.md)

Table state as the lobby shows it (label + dot, never colour alone):

```mermaid
stateDiagram-v2
  [*] --> waiting: host creates table ("Chờ đối thủ")
  waiting --> ready: 2nd player sits ("Sắp bắt đầu")
  ready --> waiting: a player stands up
  ready --> live: game starts ("Đang đấu")
  live --> ready: game ends, both stay (rematch)
  live --> waiting: game ends, one leaves
  waiting --> [*]: host leaves / table closed
```

Player activity on the roster (derived server-side, backend item B2):

```mermaid
stateDiagram-v2
  [*] --> free: comes online ("Rảnh")
  free --> waiting: creates or sits at an open table ("Chờ đối thủ")
  waiting --> playing: opponent sits and game starts ("Đang đấu")
  playing --> free: leaves table after game
  playing --> waiting: opponent leaves, stays seated
  free --> watching: opens a live table as viewer ("Đang xem")
  watching --> free: leaves
  free --> [*]: goes offline / hides status
```

Roster entry shape (proposal, backend item B):

```mermaid
classDiagram
  class OnlineEntry {
    userId
    displayName
    isGuest
    avatarUrl
    main : category or null
    ratings : map category to rating, games, rank
    activity : free, waiting, playing, watching
    table : room code or null
  }
```
