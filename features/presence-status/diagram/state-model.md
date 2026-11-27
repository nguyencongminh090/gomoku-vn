# presence-status — state and class diagrams

Back: [planning.md](../planning.md) · [user_story.md](../user_story.md) · [sequences](uml_diagram/sequences.md).
Row ids (U*, M*) refer to the transition tables in planning.md §2e/§2f.

## User scope (per account)

```mermaid
stateDiagram-v2
    [*] --> Offline
    Offline --> Online_Active: socket connects / first beat (U1)
    Online_Active --> Online_Away: all surfaces away (U2)
    Online_Away --> Online_Active: any surface active (U3, U10, U11)
    Online_Active --> Offline: last socket closes, no grace (U5) / beat expires (U9) / logout (U13)
    Online_Away --> Offline: same
    Online_Active --> Reconnecting: last socket closes while seated (U6)
    Online_Away --> Reconnecting: same
    Reconnecting --> Online_Active: reconnects inside grace (U7)
    Reconnecting --> Offline: grace expires (U8)
    Offline --> [*]: server restart (U14) — rebuilt on reconnect
    note right of Online_Active
      activity is an independent axis:
      idle | searching | playing (incl. interrupted)
      | watching | tournament
      hidden flag filters every non-self, non-room audience
    end note
```

## Room-member scope (per room user, wire field `presence`)

```mermaid
stateDiagram-v2
    [*] --> Active: room:join from room page (M1)
    Active --> Away: room page hidden / unfocused (M2)
    Away --> Active: room page visible (M3)
    Active --> Away: socket is another page (M4, #373)
    Active --> Gone: last socket drops (M5)
    Away --> Gone: last socket drops (M5)
    Gone --> Gone: page bounce keeps deadline (M6, #422) / late report ignored (M9)
    Gone --> Active: room page back inside grace (M7) / viewer any time (M10, #115)
    Gone --> Viewer_Gone: grace expires, seat released (M8, #367)
    Viewer_Gone --> Active: room page returns (M10)
    Active --> [*]: room:leave (M11, resign if in game)
    Away --> [*]: room:leave
```

## Rated game absence (proposal, Q1/Q2 recommended options)

```mermaid
stateDiagram-v2
    [*] --> Playing
    Playing --> Absent_OppTurn: absent player's socket gone, opponent to move
    Playing --> Absent_OwnTurn: absent player's socket gone, own turn
    Absent_OppTurn --> Absent_OwnTurn: opponent moves (clock ran for opponent)
    Absent_OwnTurn --> Playing: returns (W left unrefilled)
    Absent_OppTurn --> Playing: returns
    Absent_OwnTurn --> Ended_Timeout: own clock reaches 0
    Absent_OwnTurn --> Ended_Abandon: W reaches 0 (result per Q1)
    Playing --> Aborted: abortable and absent 30 s (Q12)
    Absent_OppTurn --> Void: both gone 15 s (Q11)
    Absent_OwnTurn --> Void: both gone 15 s
    Playing --> Void: server restart
```

## Class view (target)

```mermaid
classDiagram
    class PresenceCore {
      +statusOf(userId, audience) Status
      +memberOf(room, userId) Member
      +activityOf(userId) Activity
      +onSocketUp(socket, auth)
      +onSocketDown(socket)
      +onReport(socket, presence)
      +onBeat(user, tabId, presence)
    }
    class UserPresence {
      conn: online|reconnecting|offline
      attn: active|away
      activity: idle|searching|playing|watching|tournament
      hidden: bool
    }
    class MemberPresence {
      at: active|away|gone
      graceUntil: ms|null
    }
    class Status {
      c: on|re|off
      a: 1?
      k: idle|search|play|watch|tour
      r: roomId?
      t: sinceMs?
    }
    class PresenceView {
      +describe(st, ctx) Label
      +dot(st, ctx) html
    }
    class FairPlayCounters {
      disconnects
      disconnect_ms
      away_count
      away_ms
      away_ms_own_turn
      longest_away_ms
    }
    PresenceCore --> UserPresence
    PresenceCore --> MemberPresence
    PresenceCore ..> Status : projects per audience
    PresenceView ..> Status : renders (client)
    PresenceCore ..> FairPlayCounters : feeds (rated games)
```
