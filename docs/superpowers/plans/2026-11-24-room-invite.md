# Room Invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The host of a room can pick an online player from the ≡ menu and invite them; the invitee accepts (lands in the room as a spectator, not seated) or declines.

**Architecture:** In-memory pending invites + a persisted `room_invite` notification, mirroring `ChallengeService` (REST + `NotificationService` push). Invitee answers from the bell panel / notifications view; accept returns `{roomId}` and the client navigates to `room.html?id=` so the existing `room:join` makes them a spectator. No change to seating or `room:join`.

**Tech Stack:** Node/Express, better-sqlite3 notifications table, socket.io push (`notify:new`), vanilla client, Jest (node + jsdom).

**Spec:** `docs/todo/F443-room-invite.md` (branch `feature/443-room-invite`).

## Global Constraints
- Spectator only on accept; never auto-seat (user decision).
- Only the room's host (`room.host === fromId`) may invite; menu item shown to the host only (re-evaluated when host changes).
- Members only on both sides (`rejectGuests`); privacy reuses `PrivacyGate.allowed(from, to, 'challenge')` — no new column/migration.
- TTL 5 min; max 5 pending outgoing per sender; same sender→target re-send replaces (one pending, one notification).
- No `server/` changes to `room:join`/RoomHandler; no `client/js/board.js` / board CSS.
- Client DOM text via `textContent` only (room names are user input). New strings in **both** vi and en blocks of `client/js/i18n.js`.
- Any `client/` edit → `node scripts/cache-bust.js --write`, verified by `node scripts/cache-bust.js` printing OK.
- **No git commits in this plan**: the user commits/merges only when asked (project memory). Stop at green tests.

## Review Focus
- Invitee already in another room presses Accept → 409, no navigation, buttons re-enabled, message shown (Task 3).
- Stale notification (server restarted / TTL passed) → `INVITE_GONE` 404 → row removed, no navigation (Tasks 1, 3).
- Sender posts a `roomId` they are not in → 403 `NOT_IN_ROOM`; a non-host member → 403 `NOT_HOST` (Task 1).
- Room destroyed or full between send and accept → 404 / 409 `ROOM_FULL` (Task 1).
- Double-click Accept → second call is 404; client disables both buttons on first click (Task 3).
- Room name containing `<img onerror>` renders as text in bell and notifications view (Task 3).
- Guests, self, hidden-online, players already in a room, privacy-blocked users never appear in the picker (Task 1).

---

### Task 1: RoomInviteService + notification type

**Files:**
- Create: `server/managers/RoomInviteService.js`
- Modify: `server/managers/NotificationService.js:15` (add `'room_invite'` to `TYPES`)
- Test: `server/tests/room-invites-service.test.js` (same in-memory DB / mocks header as `server/tests/challenges-route.test.js` lines 1-45; real `RoomManager`, real `NotificationService`)

**Interfaces:**
- Produces (`module.exports`): `RoomInviteError(code, status, message)`, `TTL_MS = 300000`, `MAX_OUTGOING = 5`, `setHooks({ onlineUsers: () => Array<{userId, isGuest}> })`, `send(fromId: string, username: string, roomId: string) → { id, roomId, to: PublicUser, expiresAt }`, `accept(userId, id) → { roomId }`, `close(userId, id) → void`, `onlineCandidates(fromId) → PublicUser[]`, `_reset()`.
  `PublicUser = { userId, username, displayName, avatarUrl }` (same shape as ChallengeService's `publicUser`).
- Notification pushed on send: `notifications.push(target.id, 'room_invite', fromId, { from: {username, displayName}, inviteId, roomId, roomName })`; `remove()` calls `notifications.drop(to, 'room_invite', from)`.
- Error codes (status): `BAD_REQUEST` 400 (non-string `username`/`roomId`), `USER_NOT_FOUND` 404, `CANNOT_INVITE_SELF` 400, `NOT_IN_ROOM` 403, `NOT_HOST` 403, `INVITE_NOT_ALLOWED` 403, `TARGET_IN_ROOM` 409, `ROOM_FULL` 409, `TOO_MANY_INVITES` 429, `INVITE_GONE` 404, `NOT_YOUR_INVITE` 403, `ALREADY_IN_ANOTHER_ROOM` 409. Messages Vietnamese, like ChallengeService.

- [ ] **Step 1: Write failing tests** in `room-invites-service.test.js` (create users alice/bob/carol via `INSERT INTO users`; alice creates a room with `roomManager.createRoom`; use the same helpers as challenges-route test). One `test` each, asserting the code in parentheses:
  - send ok → returns `{id, roomId, to:{username:'bob'}}`; `notif.list(bob).items[0]` is `{type:'room_invite', payload:{roomId, roomName, inviteId:id, from:{username:'alice'}}}`.
  - self (`CANNOT_INVITE_SELF`), non-host member of the room (`NOT_HOST`), unknown username (`USER_NOT_FOUND`), sender not in `roomId` incl. a real other room's id (`NOT_IN_ROOM`), privacy `who_can_challenge='nobody'` on bob (`INVITE_NOT_ALLOWED`), bob already in any room (`TARGET_IN_ROOM`), room at `config.MAX_USERS_PER_ROOM` (`ROOM_FULL`, fill `room.users` directly), 6th distinct target (`TOO_MANY_INVITES`).
  - re-send alice→bob: `notif.list(bob).items` has exactly one `room_invite`; accepting the old id → `INVITE_GONE`.
  - accept by bob → `{roomId}`; pending gone (second accept → `INVITE_GONE`); bob's notification dropped; **bob is not in `room.users`** (service never joins) and `room.users.get(alice).slot` unchanged.
  - accept: by carol (`NOT_YOUR_INVITE`); bob now in another room (`ALREADY_IN_ANOTHER_ROOM`); room destroyed via `roomManager.rooms.delete` (`INVITE_GONE`); room full (`ROOM_FULL`); bob already in this room (returns `{roomId}`, no error).
  - close: bob declines → pending + notification gone; again → no throw; carol closing → `NOT_YOUR_INVITE`; alice cancelling → ok.
  - expiry: `jest.advanceTimersByTime(TTL_MS + 1)` → accept → `INVITE_GONE`, notification dropped.
  - `onlineCandidates('alice-id')` with hook returning alice, bob, carol, a guest, a user in a room, a `nobody`-privacy user, unknown id → only bob/carol, as PublicUser, **no cap** (test with 120 eligible users → 120 returned).

- [ ] **Step 2: Run** `npx jest server/tests/room-invites-service.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** `RoomInviteService.js` per the Interfaces block. Mirror ChallengeService structure (`pending` Map keyed by id, `timer` with `unref`, `remove(c)` clears timer + drops notification, `mustGet`). Room checks use `roomManager.getRoomByUser(fromId)` (must equal `getRoom(roomId)`), `getRoomByUser(target.id)`, `room.users.size >= config.MAX_USERS_PER_ROOM`. Room label = `room.roomName`. Re-send replaces by removing any pending with same `from`+`to` before the outgoing-count check. Add `'room_invite'` to `NotificationService.TYPES`; update the type comment in `server/db/schema.sql:367` is NOT needed (comment only).

- [ ] **Step 4: Run** `npx jest server/tests/room-invites-service.test.js server/tests/notifications-route.test.js` → PASS.

### Task 2: REST route + wiring

**Files:**
- Create: `server/routes/room-invites.js`
- Modify: `server/index.js` (next to `const challengesRouter` at :42 and `app.use('/api/challenges', …)` at :204), `server/socket/SocketHandler.js` (after the ChallengeService `setHooks` block ending ~:106)
- Test: `server/tests/room-invites-route.test.js` (copy the harness of `challenges-route.test.js`: `call(method, path, as, body)`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `GET /api/room-invites/online → {players}`; `POST /api/room-invites` body `{to: username, roomId}` → 201 `{id, roomId, to, expiresAt}`; `POST /:id/accept → {roomId}`; `DELETE /:id → {ok:true}`. Errors → `{error, code}` with the service's status. 401 without cookie, 403 for guests. `GET` sends `Cache-Control: no-store`.

- [ ] **Step 1: Write failing tests**: 401 anonymous; guest → 403 on all four; POST happy path 201 + bob's `GET /api/notifications`-equivalent via `notif.list`; POST body `{}` → 400 `BAD_REQUEST`; POST for a room the caller isn't in → 403 `NOT_IN_ROOM`; accept as bob → 200 `{roomId}`; accept unknown id → 404 `INVITE_GONE`; DELETE twice → 200 both; `GET /online` returns only hook-listed members (set via `svc.setHooks`).
- [ ] **Step 2: Run** `npx jest server/tests/room-invites-route.test.js` → FAIL.
- [ ] **Step 3: Implement** the router exactly like `server/routes/challenges.js` (rate limiters, `verifyToken`, `rejectGuests('Khách không mời được người chơi.')`, `h()` error translator for `RoomInviteError`, `express.json({limit:'1kb'})` on POST). Mount at `/api/room-invites`. In SocketHandler add `require('../managers/RoomInviteService').setHooks({ onlineUsers: () => getOnlineUsersSorted() })`.
- [ ] **Step 4: Run** `npx jest server/tests/room-invites-route.test.js server/tests/room-invites-service.test.js` → PASS.

### Task 3: Invitee side — bell + notifications view

**Files:**
- Modify: `client/js/platform-shell.js` (`notifications` object ~:112, `renderBell` ~:140), `client/js/social.js:669-684` (`renderNotifs`), `client/js/i18n.js` (vi block near `notif.club_invite` :1523, en block near :2800s — mirror existing en `notif.*` keys), `client/css/shell.css` (bell action row)
- Test: `client/tests/platform-shell.test.js` (extend; read its helpers first), `client/tests/social-notifs-room-invite.test.js` only if social.js has no existing jsdom harness to extend

**Interfaces:**
- Produces: `PlatformShell.notifications.actions(n: Notification, done: () => void) → HTMLElement | null` — for `n.type === 'room_invite'` a `div.pbell__acts` with two buttons (`data-act="accept"`, `data-act="decline"`), else `null`.
  Behaviour: Accept → `POST /api/room-invites/${encodeURIComponent(n.payload.inviteId)}/accept` (credentials same-origin); 200 → `location.assign('/room.html?id=' + encodeURIComponent(roomId))`. Non-200 → both buttons re-enabled for 409 (message `body.error` in a `span.pbell__err`), for 404 `INVITE_GONE` → `markRead(n.id)` + `done()` + `refresh()` (row disappears since the server dropped it / it is stale). Decline → `DELETE` same path → `refresh()`. Both buttons `disabled` while a request is in flight.
- `notifications.text(n)` gains `vars.room = n.payload.roomName`; bell uses `notifications.text(n)` instead of its own `t('notif.' + type, {name})`.
- i18n keys (vi / en): `notif.room_invite` "{name} mời bạn vào bàn {room}" / "{name} invited you to table {room}"; `notif.room_accept` "Chấp nhận" / "Accept"; `notif.room_decline` "Từ chối" / "Decline"; `notif.room_gone` "Lời mời đã hết hạn." / "This invite has expired."

- [ ] **Step 1: Write failing jsdom tests** (mock `fetch`, `location.assign`): bell renders a `room_invite` item as a non-link row with two buttons and text `"ALICE mời bạn vào bàn #ABC"`; Accept 200 → `location.assign('/room.html?id=%23ABC')` and buttons disabled during the call; accept 409 → error text shown, buttons enabled, no navigation; accept 404 → `fetch('/api/notifications/read')` called and row removed after refresh; Decline → `DELETE` called; room name `<img src=x onerror=1>` yields no `img` element (text only); non-invite notifications still render as `<a>` unchanged (regression, incl. club text now showing the club name).
- [ ] **Step 2: Run** `npx jest client/tests/platform-shell.test.js` → new tests FAIL.
- [ ] **Step 3: Implement** `actions()` + bell/social wiring: `renderBell` builds a `div.pbell__item` (not `<a>`) for room_invite with text + `actions(...)`; `renderNotifs` appends the same actions block inside `.prow__body` and the row is a `div` (not `<a>`) for this type. Add i18n keys to both blocks and minimal `.pbell__acts` / `.pbell__err` styles using existing tokens.
- [ ] **Step 4: Run** `npx jest client/tests` → PASS (includes the i18n key-parity test if one exists).

### Task 4: Inviter side — ≡ menu item + picker

**Files:**
- Create: `client/js/room-invite.js`
- Modify: `client/room.html` (new `#btn-room-invite-player` `.rmenu__item` after `#btn-room-invite` :106-109, icon `ph-regular-user-plus`), `client/js/room-entry.js` (`import './room-invite.js?v=…'` before `room-ui.js`), `client/js/room-ui.js` (click handler next to `qrBtn` :149: `closeNavPops(); global.RoomInvite && global.RoomInvite.open();`; show the item only to the host, re-evaluated in `updateUI`), `client/js/i18n.js` (vi+en), `client/css/room.css` (`.rinv*` rows, list scroll, phone full-width), `client/css/main.css` only if a base modal tweak is unavoidable
- Test: `client/tests/room-invite.test.js` (jsdom, harness copied from `client/tests/room-nav-rules.test.js`)

**Interfaces:**
- Produces: `window.RoomInvite.open() → void` — opens a `.modal-overlay.visible > .modal.rinv` dialog (same pattern as `openQrModal`: Escape / overlay click / close button close it; focus on search input; `role="dialog" aria-modal`). Contents: title, `input[type=search]`, status line (`role="status"`), `ul` of rows `{avatar|initials, displayName, button.rinv__btn}`.
- Data: on open `GET /api/room-invites/online` (credentials same-origin); list filtered client-side by search (case-insensitive on displayName+username); empty states `room.invite_loading`, `room.invite_none`, `room.invite_no_match`.
- Send: button click → `POST /api/room-invites` `{to: p.username, roomId: window.RoomState.roomData.roomId}` → button becomes disabled "Đã mời"; error → button re-enabled, `body.error` in the status line (429/403/409 included).
- i18n keys (vi / en): `room.invite_player` "Mời người chơi" / "Invite a player"; `room.invite_title` "Mời vào bàn" / "Invite to this table"; `room.invite_search` "Tìm người chơi online" / "Search online players"; `room.invite_btn` "Mời" / "Invite"; `room.invite_sent` "Đã mời" / "Invited"; `room.invite_loading`, `room.invite_none` "Chưa có ai online để mời.", `room.invite_no_match`, `room.invite_error`; `room.invite_hint` "Người được mời sẽ vào làm khán giả." / "Invited players join as spectators."

- [ ] **Step 1: Write failing tests**: menu item exists in `room.html` with that id; clicking it closes the menu and opens the dialog; list rows render names via `textContent` (name `<b>x</b>` stays text); typing filters rows; Invite click posts `{to:'bob', roomId:'#ABC'}` and shows "Đã mời" disabled; a 409 response shows the server message and re-enables the button; Escape closes; empty list shows `room.invite_none`; guest (`GvnSession.getUser().isGuest`) or non-host → menu item hidden; host transfer (`roomData.host` changes, `updateUI()`) shows/hides it.
- [ ] **Step 2: Run** `npx jest client/tests/room-invite.test.js` → FAIL.
- [ ] **Step 3: Implement** `room-invite.js` (IIFE attaching `window.RoomInvite`, DOM via `document.createElement` + `textContent`, no `innerHTML` with user data) and the wiring above. Styles: rows ≥44px tall, list `max-height: 50vh; overflow:auto`, hint line under the list.
- [ ] **Step 4: Run** `npx jest client/tests/room-invite.test.js client/tests/room-nav-rules.test.js` → PASS.

### Task 5: Verify end to end

- [ ] **Step 1:** `node scripts/cache-bust.js --write && node scripts/cache-bust.js` → prints OK.
- [ ] **Step 2:** `npm test 2>&1 | tail -30` → all green (≈11 s).
- [ ] **Step 3: Real-browser pass** (load skills `run` and `playwright-e2e-safety` first; test DB only, never the real one): two member accounts A (in a room) and B (on lobby). A: ≡ → "Mời người chơi" → search → Mời. B: bell shows invite with Chấp nhận / Từ chối. Check: accept → B lands in A's room as spectator with **no seat**; decline → row disappears; A re-invites → still one row; B already in another room → Accept shows the error. Viewports 1280px and 390px; screenshot picker + bell row.
- [ ] **Step 4:** Update `docs/todo/F443-room-invite.md` Status and move the `TODO.md` line to `docs/todo/DONE.md` **only after** the user confirms; report what was and was not verified.
