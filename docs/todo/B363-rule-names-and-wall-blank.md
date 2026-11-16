# B363 — vi rule names Luật 1/Luật 2 + Ô khoá in the home rule blank
**Status:** ✅ DONE 2026-11-13 — built on ui/rule-names-wall (uncommitted)
**Area:** client/js/i18n.js (vi), client/index.html, client/js/lobby-home.js BLANKS.rule, client/tests/lobby-home.test.js
**From:** user 2026-11-13: "FreeStyle -> Luật 1, CaroVN -> Luật 2, chỉ đổi tên luật, áp dụng toàn bộ" + "Thêm lựa chọn: Ô khóa … chỉ khi chọn ô khóa mới ghi (), nếu không thì ghi liền."

## Scope
1. vi only: rule.freestyle/caro, rankings.cat_freestyle/caro, puzzles.rule_freestyle/caro → Luật 1 / Luật 2 (+ index.html fallbacks). English unchanged; Standard unchanged.
2. Home rule blank lists rule × wall: Luật 1, Luật 1 (Ô khoá), Luật 2, Luật 2 (Ô khoá). Picking sets qm.rule + qm.wall (sent in match:join, saved). "(Ô khoá)" shown only when wall is on. Label reuses `room.rule_wall`.

## Don't
- No separate toggle control; no portal option on Home (stays saved/hidden).

## Traps
- Default stays wall:true (16108ea), default rule changed caro → freestyle (user 2026-11-13 "Mặc định Luật 1") → default sentence "Luật 1 (Ô khoá)". Saved picks still win.
- Waiting count in #qm-line keys on rule|time only, while MatchQueue buckets by wall too → may count waiters you can't pair with (pre-existing, not changed).
