# 2026-10-17 16:42 — #278 Puzzle editor hints in plain words
## Prompt
Do #277 - 279 (ux-audit puzzle findings).
## Root cause
Count-line and portal strings assumed knowledge of the rule (equal stones / alternating) and of the 2-click gesture.
## Fix
vi+en: counts_equal 'lượt Đen (hai bên bằng quân)', counts_black_more 'lượt Trắng (Đen nhiều hơn 1 quân)', tool_portal 'Cổng — bấm 2 ô để nối thành một cặp'. Validation untouched.
## Verification
jsdom pins the 3 keys in both languages. Real browser 390×844: portal label fits its own chip row.
