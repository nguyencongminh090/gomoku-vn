# settings#profile redesign (mockups only, nothing built)
Mockups: `index.html` + `mockups/{sa-preview,sb-bento,sc-sheet}.html`; `node features/settings-profile-redesign/shoot.js` → `shots/`.
Rules from the user (2026-11-16): no `A · B · C` strings; no transparent background on button/div (shoot.js flags offenders).
Kept: every `#st-*` id, the 3 audience selects become radio groups (values everyone/friends/nobody; friend = everyone/nobody).
Open: pick one direction; the audience `<select>` → segmented radios is a markup change in settings.js (`fillSelect` on `select[data-aud]`).
Motion (subtle): 140/240ms, `cubic-bezier(.2,.7,.2,1)`; one load rise; switch knob + segment colour; Save → "Đã lưu". Reduced motion: all off.
