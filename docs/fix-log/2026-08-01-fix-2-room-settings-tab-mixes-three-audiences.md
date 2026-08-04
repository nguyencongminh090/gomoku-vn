# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #2: room settings tab mixes three audiences with no visual separation — as host, 9 field-groups scroll flat and the two personal preferences are appended with no break; as guest, the read-only rules summary and the same two toggles are equally unseparated.

## Action

Added a `settingsGroup(titleKey, hintKey, inner)` helper in [client/js/room-ui.js](client/js/room-ui.js); `renderSettings()` now builds its existing markup into a `roomRows` string on both the host and guest branches and emits two `.settings-group` sections instead of one flat `innerHTML`. Added `.settings-group` / `__head` / `__title` / `__hint` styles to [client/css/room.css](client/css/room.css) and five `settings.group_*` keys (VI + EN) to [client/js/i18n.js](client/js/i18n.js).

## Decision

No data moved between surfaces and no controls were added or removed — only the wrapper changed, so `updateSettings()` / `updateLocalSettings()` and every element id keep working untouched. The two branches share one section shell but take different hint strings (`…hint_host` = "Applies to everyone in this room" vs `…hint_guest` = "Only the host can change these"), which conveys the host/guest permission difference in the group header rather than per-row. Separator is a top border on the second group plus a title/hint header, matching the panel's existing flat visual language instead of introducing collapsible cards.

## Summary output

Live check with a host session and a real guest joining the same room via the lobby Join button. Host: exactly 2 groups — "Phòng chơi" (7 rows, hint "Áp dụng cho mọi người trong phòng") and "Tuỳ chọn của tôi" (2 rows). Guest: same 2 groups, room group read-only with 3 summary rows and hint "Chỉ chủ phòng thay đổi được". In both roles the display-mode and click-mode inputs live only in the personal group and are non-disabled. Screenshots: [docs/screenshots/fix2-settings-host.png](docs/screenshots/fix2-settings-host.png), [docs/screenshots/fix2-settings-host-bottom.png](docs/screenshots/fix2-settings-host-bottom.png), [docs/screenshots/fix2-settings-guest.png](docs/screenshots/fix2-settings-guest.png).
