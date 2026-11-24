# Table states and the "Vào" button (v4)

Links: [../planning.md](../planning.md) · [../user_story.md](../user_story.md) · [uml_diagram/rule-rank-sequence.md](uml_diagram/rule-rank-sequence.md)

```mermaid
stateDiagram-v2
  [*] --> waiting: host opens a table (one seat taken)
  waiting --> ready: second player sits
  ready --> waiting: a player stands up
  ready --> playing: both press Start
  playing --> ready: game ends, both stay
  playing --> waiting: game ends, one leaves
  waiting --> [*]: last player leaves
  note right of waiting
    label "Chờ đối thủ", Vào = primary (take the seat)
    listed first, counts toward "Còn ghế"
  end note
  note right of ready
    label "Đủ người", Vào = outlined (watch)
  end note
  note right of playing
    label "Đang đấu", Vào = outlined (watch)
    players count toward "đang chơi" (S6)
  end note
```

Rank chip of a seated player (per selected rule):

```mermaid
stateDiagram-v2
  [*] --> guest: isGuest
  [*] --> unrated: no games in this rule
  [*] --> provisional: rd above PROVISIONAL_RD
  [*] --> ranked
  guest: "Khách"
  unrated: "Chưa có hạng"
  provisional: "#N?"
  ranked: "#N" (gold/silver/bronze for 1–3)
```
