# Sequence — Sending a Message from the Mobile Quick Chat Bar

Shows that the send path is unchanged from today — only where `#chat-input-wrapper` lives in the DOM
changes. `sendChat()` and the server-side handler are reused as-is.

```mermaid
sequenceDiagram
    actor Player as Mobile Player
    participant Bar as #chat-input-wrapper (pinned bar)
    participant RoomJS as room.js (sendChat)
    participant Client as RoomClient (socket)
    participant Handler as ChatHandler.handleMessage
    participant UI as ChatUI (chat-ui.js)

    Note over Bar: On mobile, #chat-input-wrapper is re-parented to a<br/>fixed bottom pill (reusing room.js:166-184's<br/>Focus-mode mechanism) instead of living inside<br/>the collapsed #tab-chat sheet.

    Player->>Bar: type message, tap "Gửi" (or Enter)
    Bar->>RoomJS: sendChat()
    RoomJS->>RoomJS: ProfanityFilter.filterMessage(text) (cosmetic pass)
    RoomJS->>Client: emit chat:message {text}
    Client->>Handler: chat:message
    Handler->>Handler: filterMessage(text) (authoritative)
    Handler-->>Client: broadcast chat:message to room

    alt Chat tab currently open
        Client->>UI: appendChatMessage(msg)
        UI->>UI: append to #chat-messages, scroll to bottom
    else Chat tab closed (sheet collapsed)
        Client->>UI: showFloatMessage(msg)
        UI->>UI: render floating toast (.float-messages, existing mechanism)
    end

    RoomJS->>Bar: clear #chat-input value
```

## Notes

- No new socket event, no server-side change — `ChatHandler.handleMessage` and the `chat:message`
  contract are untouched.
- The only behavioral delta from today is *where the input sits* and *when its containing tab is
  active*; message delivery/rendering reuses the existing dual path (`appendChatMessage` vs.
  `showFloatMessage`) that already handles "tab open" vs. "tab not open."
