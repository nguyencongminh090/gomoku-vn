---
name: renju-rif-rules
description: Official RIF Renju rules - Black forbidden moves, exceptions, and opening procedures (Soosyrv-8, Taraguchi-10, Yamaguchi, Sakata, Tarannikov, Jonsson, Pro, Swap, Swap2)
domain: game-rules
tags: renju,rif,forbidden,opening
apply_when: "implementing or reviewing Renju legality (3-3, 4-4, overline) or any Renju opening procedure"
sources: "https://www.renju.net/rifrules/ ; https://www.renju.net/rule/{3,4,5,6,7,11,24,25,28}/ ; https://www.renju.net/gomokurules/ ; https://www.renju.net/openings/"
last_reviewed: 2026-11-20
confidence: medium
---

# RIF Renju rules (fetched 2026-11-20, paraphrased)

## Forbidden moves (rifrules s.9) — Black only
- Win: Black exactly 5; White 5 or more (overline wins for White).
- Black loses by overline, double-four, or double-three **unless the same stone makes five** (five wins even if shape is forbidden).
- Three = row that one stone turns into a *straight four* (open four, two ways to five). Four = one stone from five.
- 3-3 exception 9.3: allowed if at most one of the threes can become a straight four, and either (a) that stone makes no overline/4-4, or (b) the stone makes a 3-3 that is itself forbidden -> apply 9.3 **recursively**.
- 4-4 includes two fours on one line (one stone, several fours).
- Late-call 9.7/9.8 is over-the-board only; online = server decides immediately.

## Openings
- Pro (gomoku, no forbids): B1 centre, W2 anywhere, B3 outside central 5x5.
- Swap: P1 places 2B+1W anywhere; P2 stays or swaps. Swap2: current implementation.
- RIF Renju (s.12): tentative Black places 3 stones (one of 26 patterns), tentative White picks side; W plays move 4 anywhere; Black proposes 2 non-equivalent 5th moves; White picks, plays 6; opening ends.
- Soosyrv-8 (/rule/24): 26-pattern opening, swap right; W4 anywhere + declares N<=8; swap right; Black places N non-symmetric 5th moves; W picks one + plays 6.
- Taraguchi-10 (/rule/25, re-read 2026-11-21): B1 centre; "the other player may swap"; W2 in 3x3; swap; B3 in 5x5; swap; W4 in 7x7. "After the 4th move": choice 1 = swap, B5 in 9x9, swap, W6 anywhere; choice 2 = "Black puts ten 5th moves anywhere on board (symmetrical moves are not allowed)", W picks one + plays 6.
- Yamaguchi (/rule/5, re-read 2026-11-21): "The first player puts one of the 26 openings and declares how many 5th moves will be offered"; "The next player has a right to swap"; W4 anywhere; Black offers the declared number of 5ths (no symmetric ones); W picks one + plays 6. No second swap, no cap (site: 1..10).
- Neither page defines "symmetrical"; site meaning (#427): a board symmetry (8 dihedral) fixing stones 1-4 maps one offer onto another.
- Sakata (/rule/3): 26-pattern; next player W4 in 7x7, W5(sic: 5th) in 9x9; first player may swap after. Tarannikov (/rule/4): Taraguchi choice 1 with swap after every move. Jonsson (/rule/6): Soosyrv with N in 1..3.

## NOT found (do not invent)
- **Long Pro** procedure; **coordinates of the 26 patterns** (images only: rul5.gif/rul6.gif on rifrules, indirect_openings.png/direct_openings.png on /openings/). Leads: en.wikipedia.org/wiki/Renju_opening_pattern, Yamaguchi/Soosõrv-N/Taraguchi-N Wikipedia pages, renju.net/ga2015/. Needs a human to read the images or a verified source.
- Whether forbids apply to every "Renju"-category opening is inferred from the category label.

## 26 opening patterns (read from the Wikipedia diagram images, 2026-11-20; verify before shipping)
Black 1 = H8 (centre). Offsets (dx right, dy up) of White 2 and Black 3 from H8. Board letters skip I (H J K L ...).
Source: Renju_diagonal_openings-.png / Renju_vertical_openings-.png (en.wikipedia.org, numbering = renju.se `i1..i13`, `d1..d13`). Cross-check: renju.se says d2 = i2 and d6 = i6 (matches: same shape after symmetry).
- **Indirect** (White 2 = J9, offset (+1,+1)); Black 3: 1 Chosei K10 (+2,+2) · 2 Kyogetsu K9 (+2,+1) · 3 Kosei K8 (+2,0) · 4 Suigetsu K7 (+2,-1) · 5 Ryusei K6 (+2,-2) · 6 Ungetsu J8 (+1,0) · 7 Hogetsu J7 (+1,-1) · 8 Rangetsu J6 (+1,-2) · 9 Gingetsu H7 (0,-1) · 10 Myojo H6 (0,-2) · 11 Shagetsu G7 (-1,-1) · 12 Meigetsu G6 (-1,-2) · 13 Suisei F6 (-2,-2)
- **Direct** (White 2 = H9, offset (0,+1)); Black 3: 1 Kansei H10 (0,+2) · 2 Keigetsu J10 (+1,+2) · 3 Sosei K10 (+2,+2) · 4 Kagetsu J9 (+1,+1) · 5 Zangetsu K9 (+2,+1) · 6 Ugetsu J8 (+1,0) · 7 Kinsei K8 (+2,0) · 8 Shogetsu H7 (0,-1) · 9 Kyugetsu J7 (+1,-1) · 10 Shingetsu K7 (+2,-1) · 11 Zuisei H6 (0,-2) · 12 Sangetsu J6 (+1,-2) · 13 Yusei K6 (+2,-2)
- Pattern 13 (both): White has a sure win (renju.se). Old RIF evaluations exist per pattern; not needed for rules.

## Project decisions (user, 2026-11-20)
- "Long Pro" = "Pro" (renju.net/rule/7). gomoku-vn already uses it with WALL (first move beside a wall, 2nd move Chebyshev >= 4).
- Renju variants to support: **FreeRenju** (no opening rules), **Taraguchi-10**, **Yamaguchi**. Others (Soosyrv-8, Sakata, Tarannikov, Jonsson, Swap) are out of scope for now.
- **Renju + WALL**: walls are allowed; the Long Pro/wall opening constraints are NOT applied for now.
