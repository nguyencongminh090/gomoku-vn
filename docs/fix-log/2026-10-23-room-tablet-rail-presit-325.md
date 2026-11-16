# #325 Room 769–1024 px: rail hidden before seating

- **Symptom:** at 1024×768 (B284 default = rail collapsed) a fresh guest could not click "Ngồi vào" (rail `visibility:hidden`).
- **Root cause:** the collapsed-rail exemption only matched `#game-controls:not(:empty)` (seated), not an open seat.
- **Fix:** `client/css/room-arena.css` exemption + `.room` padding + dock-toggle offset now also match `.seatcard__sit` (seat button present). Game over → button gone → rail collapses again.
- **Test:** `room-rail-dock.test.js` pins the selector (CSS contract; jsdom has no layout).
- **Browser pass (headless chromium, throwaway DB, fresh guest):** pre-sit at 769/900/1024 rail visible + "Ngồi vào" clickable, still collapsed (chevron); 1025 unchanged (expanded). After sitting with no opponent yet the rail collapses+hides again (no #game-controls) — pre-existing, not changed here.
