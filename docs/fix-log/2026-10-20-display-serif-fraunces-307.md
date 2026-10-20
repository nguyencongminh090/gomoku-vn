# 2026-10-20 — #307 Fraunces display face for lobby hero + section titles
## Prompt
"Do #307" → mood chosen via AskUserQuestion: warm, handmade, soft serif → "Làm Fraunces thôi" → "DO remain work".
## Decision
Fraunces (variable wght, SIL OFL), self-hosted latin + vietnamese only (latin-ext falls to Georgia/serif). Used by `--font-display` for `.zen-hero__title` (600) and lobby `.ph2` section titles (16px/600, was 14px/700). Manrope stays for body, labels, chips, rows, numbers. Ground: docs/knowledge/ui-ux/vbase-typography.md, vstyle-handmade-organic.md.
## Verification
Real Chromium, static server, 375/1280 (screenshots in session scratchpad): stacked caps Ấ Ề Ổ Ữ Ỵ render without clipping; #300 shared title column still fits "Đang phát trực tiếp"; hero height unchanged (62.4/36.4px). CLS hero A/B 0.2549 vs 0.2560 (375), 0.0972 vs 0.0974 (1280). Bytes +48.2 KB woff2 (latin 36.6 preloaded + vietnamese 11.6 on demand). x-height 0.48 em vs Manrope 0.54 (canvas measure). `npm test` 3391 pass; cache-bust OK; api-early preload test now covers both families.
## Not verified
LCP on a real network (localhost numbers are noise); no size-adjust fallback (Georgia not installed here to measure → left to #308); text-only hero A/B, no design review by the user yet.
