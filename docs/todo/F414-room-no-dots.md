# F414 — Room page: no "A · B · C" joined strings
**Status:** ✅ DONE 2026-11-17 (merged dev; real-phone check not done)
**Area:** client/js/room-ui.js, client/js/chat-ui.js, client/js/i18n.js, client/room.html, client/css/room-arena.css
**From:** user 2026-11-17 ("Redesign Table (bàn chơi) — khử style A · B · C")   **Depends:** —

## Problem
room.html still joins facts with " · ": nav rules line, ≡ menu title "Bàn X · Xếp hạng" and rules sub,
seat button "Ngồi vào · #2", sheet button tooltip, chat "· người chơi" tag, rating "· tạm tính",
settings-changed detail.

## Scope
1. Nav rules + menu rules sub → one pill per rule (`.rpill`), CSS gap.
2. Menu title → "Bàn X" + mode pill.
3. Seat button → "Ngồi vào" + seat-number badge.
4. Chat player tag → small pill; settings detail / provisional / tooltip → plain prose punctuation.

## Don't
- Lobby, other pages, code comments. Board/stones. server/.

## Traps
- Spans without text separators read as one run for screen readers → visually-hidden ", ".
- Nav ticket must stay within --nav-h; phone uses the short line.

## Done when
- No visible " · " on room.html; tests assert segments; real-browser desktop + phone screenshots.
