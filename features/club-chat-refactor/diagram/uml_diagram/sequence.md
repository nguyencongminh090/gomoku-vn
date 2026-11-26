# Sequences
[Stories](../../user_story.md) · [Planning](../../planning.md) · [States](../state.md)

## Edit reaches another open tab (REST polling, no socket)
```mermaid
sequenceDiagram
  autonumber
  participant A as Member A (author tab)
  participant S as Server (routes/clubs → ClubService)
  participant DB as SQLite
  participant B as Member B (other tab)
  A->>A: long-press / toolbar → Sửa → composer edit mode
  A->>A: row.dataset.v++ (guards against an older in-flight tick)
  A->>S: PATCH /api/clubs/:slug/messages/42 {text}
  S->>S: requireMember · checkMute · rateLimit · sender = A · kind = text · clean(text) non-empty · not a command
  alt unchanged after clean
    S-->>A: 200 {message} (no edited_at change)
  else changed
    S->>DB: BEGIN
    S->>DB: INSERT club_message_edits(prev body) · keep last 5
    S->>DB: UPDATE clubs SET chat_rev = chat_rev + 1 RETURNING chat_rev
    S->>DB: UPDATE club_messages SET body, edited_at, edit_rev = chat_rev, meta.recipients, meta.pinged
    S->>DB: UPDATE club_reports SET later = {edited, body, at} WHERE message_id = 42
    S->>DB: push club_mention to individual names not yet in meta.pinged (once per message)
    S->>DB: COMMIT
    S-->>A: 200 {message: {id, text, editedAt, mentioned}}
  end
  A->>A: re-render row 42 in place, "đã sửa" (cursor NOT advanced from this response)
  loop every 8 s while trò-chuyện is open
    B->>S: GET /messages?after=lastId&visible=…&rev=n&polls=…
    S-->>B: {messages, removed, polls, edited:[{id:42,…}], rev}
    B->>B: replace row 42 in place (no scroll jump, unread dot untouched)
  end
```

## Delete (own, or staff by rank) reaches another tab
```mermaid
sequenceDiagram
  autonumber
  participant A as Actor
  participant S as Server
  participant DB as SQLite
  participant B as Other tab
  A->>A: confirm dialog (names the author; staff: "ghi vào nhật-ký")
  A->>S: DELETE /api/clubs/:slug/messages/42
  S->>S: requireMember · sender = actor OR (isStaff AND canModerate(actor, senderRole)) [Q1]
  S->>DB: removeContent → DELETE row (cascades poll/votes/edits) · pin row clears announcement
  S->>DB: UPDATE club_reports SET later = {deleted, at} WHERE message_id = 42
  opt actor ≠ sender
    S->>DB: club_log delete_message
  end
  S-->>A: 200
  A->>A: remove row 42 locally
  B->>S: GET /messages?after=…&visible=…,42,…
  S-->>B: {removed:[42], …}
  B->>B: remove row 42 · rebuild day separators
```

## Phone long-press vs scroll
```mermaid
sequenceDiagram
  participant U as Finger
  participant R as Message row
  participant Sh as Action sheet (dialog)
  U->>R: pointerdown (pointerType = touch)
  R->>R: start 450 ms timer, remember x/y
  alt moves > 8 px, scroll, or pointercancel
    R->>R: clear timer (normal scroll)
  else timer fires (or contextmenu event first)
    R->>R: preventDefault on contextmenu · add .is-selected · navigator.vibrate?(10)
    R->>Sh: showModal() with preview + Sửa / Sao chép / Xoá / Báo cáo
    Sh-->>R: close → remove .is-selected, focus returns to the row's ⋯ button
  end
```
