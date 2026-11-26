# presence-status — sequences

Back: [planning.md](../../planning.md) · [state + class](../state-model.md) · [user_story.md](../../user_story.md).
"Today" = current code on `dev` @ c1a2c3af; "Target" = the recommended options in planning.md §6.

## 1. Tab switch on the room page (today: double report, F1)

```mermaid
sequenceDiagram
    participant RP as room.html (P1 room-socket, P2 socket-client)
    participant S as Server (RoomHandler.onPresence)
    participant R as Room members
    participant L as Lobby subscribers
    RP->>S: room:presence {away}
    S->>S: setUserPresence(away), setPresence(member away) changed
    S-->>R: room:updated (80 ms debounce)
    S-->>L: lobby:online_patch left (1.5 s debounce)
    RP->>S: presence:set {away}  (duplicate, P2)
    S->>S: changed=false, no fan-out
    Note over RP,S: Target: one report per edge (PS-7)
```

## 2. Tab close in a rated game (today vs target)

```mermaid
sequenceDiagram
    participant A as Player A (closes tab)
    participant S as Server
    participant B as Player B
    A--xS: socket closes
    S->>S: handleDisconnect: startDisconnectGrace
    alt Today
        S->>S: timer.stop() both clocks, room interrupted
        S-->>B: game:interrupted {secondsLeft 60}
        Note over S: 60 s later
        S-->>B: game:ended {winner null, reason disconnect}, noScore
    else Target (Q1 A, Q2 A)
        S->>S: clock keeps running, W counts on A's turn
        S-->>B: game:interrupted {graceUntil, clockRunning}
        Note over S: A's clock or W reaches 0
        S-->>B: game:ended {winner B, reason abandon}, rated
    end
```

## 3. Back mid-game (#422, kept)

```mermaid
sequenceDiagram
    participant RP as room.html
    participant LP as index.html (auth.roomPage=false)
    participant S as Server
    RP--xS: socket closes (Back)
    S->>S: grace starts (deadline D)
    LP->>S: connect
    S->>S: awayFromGame: do not resume, member stays gone
    S-->>LP: room:joined
    LP->>LP: redirect to room.html
    LP--xS: socket closes (page bounce)
    S->>S: pending grace for this room: keep D (no restart)
    RP->>S: connect (auth.roomId)
    S->>S: cancelDisconnectGrace, resume
    S-->>RP: game:init
```

## 4. Reconnect inside vs outside the grace

```mermaid
sequenceDiagram
    participant P as Seated player
    participant S as Server
    participant O as Others in room
    P--xS: socket lost (detected after 0-45 s)
    S-->>O: room:updated (member gone, graceUntil)
    alt back before graceUntil
        P->>S: connect (auth.roomId, reconnect)
        S->>S: cancel grace, member active
        S-->>O: game:resumed / room:updated
    else back after graceUntil
        S->>S: result per policy, releaseSeat (stays viewer, #367)
        P->>S: connect (auth.roomId, reconnect)
        S->>S: existingRoom: member active as viewer
        S-->>P: room:joined (viewer)
    end
```

## 5. Server restart

```mermaid
sequenceDiagram
    participant C as Clients
    participant S as Server
    S-->>C: server:shutdown {SERVER_RESTARTING}
    S--xC: disconnectSockets
    Note over S: all rooms, games, presence, grace timers lost
    C->>S: reconnect (backoff, auth.reconnect + roomId)
    S-->>C: ROOM_GONE (room page) / online again (others)
    Note over S: live games void, never counted as abandon or abort
    C->>S: beat pages: next 20 s tick restores their presence
```

## 6. Friend views a player in an interrupted game (problem 3, target)

```mermaid
sequenceDiagram
    participant F as Friend (social.html, 10 s poll)
    participant S as Server
    F->>S: GET /api/friends
    S->>S: presence-core.statusOf(B, friend)
    Note over S: B is the waiting opponent, room interrupted
    S-->>F: {online:true, activity:'playing', st:{c:'on',k:'play',r}}
    Note over F: today: activity 'free' (room.state != playing)
```
