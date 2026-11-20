# Renju (all RIF variants) — user story

- Player picks winning rule **Renju**: Black cannot play overline / 3-3 / 4-4 (unless it makes five); White wins with 5+; Black exactly 5.
- Player picks an opening: Free, Pro, Swap, Swap2, RIF-26 + 4th/5th-move offers, Soosyrv-8, Taraguchi-10, Yamaguchi, Sakata, Tarannikov, Jonsson (Long Pro: no source yet).
- Board shows forbidden points for Black; server is the only judge.

Hard constraints: 15x15 only, no walls/portals/torus; Swap2 behaviour and existing games/replays unchanged; rule enum from one source; real DB v14 needs migration (CHECK enums in 012/013 + schema.sql); rules in [knowledge note](../../docs/knowledge/renju-rif-rules.md).
Links: [planning](planning.md) · [sequence](diagram/uml_diagram/opening.md) · [state](diagram/opening-state.md)
