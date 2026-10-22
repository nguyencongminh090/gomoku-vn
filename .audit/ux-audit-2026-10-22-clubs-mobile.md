# UX audit — clubs.html (mobile 414×846 @3x, touch) — 2026-10-22
Persona: người chơi trên điện thoại tìm một CLB để vào / lập CLB mới (tay một, giữa giờ làm). Default chosen: the persona question went unanswered.
Method: Playwright chromium, isolated server `PORT=3101` + temp DB (user's :3000 and real DB untouched; server stopped, DB deleted). 12 seeded clubs, 2 users. Evidence: `docs/audits/2026-10-22/clubs-mobile-*.png`, `clubs-mobile-metrics.json`.

```
VERDICT: Incomplete (protocol) — findings below are real, but the pass was one scripted run (~17 s), not the exhaustive walk.
Not run: keyboard-only, heavy-data (100+ clubs → pager never appeared, 12 rows), second-role/join flow, slow network, INP, sub-agent self-critique pass.
Hard gates: console errors 1 reportable (401, F1) + 1 from deliberate offline test (F2); warnings 0; 5xx 0; 403/404 0; layout collapse 0; axe Critical 0, Serious 0 (0 violations)
Performance (/clubs.html): LCP 152 ms / CLS 0 / INP not measured
Findings: Critical 1 (by gate), High 2, Medium 2, Low 1
```
Interaction manifest (all entries done, timestamps in run log): logged-out open; typed search "Mask" (1 row), "zzzzqq" (empty msg "Chưa có CLB nào."), "cờ" (2 rows), cleared (11); tapped Của tôi (empty state), Tạo CLB (panel opens), submit empty (native validation), duplicate "Mask" (409 → "Tên CLB đã được dùng."), valid create → `/c/co-thu-pho-co`; Back → Của tôi lists the new club (round trip OK); axe; widths 320/360/375/414/768 (scrollWidth = clientWidth at all).

## Findings
**F1 · Critical (gate) · Surface /clubs.html logged-out, 414**
Reproduce: open `/clubs.html` without a session. Observed: console error `401 GET /api/clubs/mine` on every visit. Expected: no red console entry for a normal logged-out visitor.
Suspected: `client/js/clubs.js:84` (`loadMine`, called unconditionally at :119). Patch: in `loadMine`, `if (!localStorage.getItem('gvn_user')) { renderTabs(false); return; }` before the fetch (keep the `!res.ok` branch). Note: `.audit/config.yml` allowlist is empty; allowlisting is the alternative, but the guard removes the request.

**F2 · High · search / pager on a failing network**
Reproduce: type "Night" in the search box, then go offline and type again. Observed: unhandled rejection `pageerror: Failed to fetch`; the list and the old status text stay (screenshot B13 shows "Chưa có CLB nào." under "Night", which is false: the request never completed); no error, no retry. Expected: an error line and the list left as is or cleared deliberately.
Suspected: `clubs.js:41-43` (`loadList`: `fetch` not in try/catch; only `!res.ok` handled, and that branch leaves the list untouched). Patch: wrap the fetch in try/catch; on failure and on `!res.ok` set `$('cl-status').textContent = t('clubs.error')` and `list.replaceChildren()`.

**F3 · High · long description makes one club fill the screen**
Reproduce: a club with a 208-char description. Observed: row 239 px tall at 414 (`metrics-B1.json` rows[0]); at 320 the first row exceeds the viewport (B11) and the "Công khai" badge floats in the middle. Expected: a discovery list of scannable rows.
Suspected: `clubs.js:31` puts `c.description` in the meta line unclamped; `platform.css` `.prow__meta`. Patch: render the description as its own `div.prow__m` and clamp: `#cl-list .prow__m { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }`.

**F4 · Medium · name column squeezed by two badges (the user's screenshot)**
Reproduce: a ranked club, 414 (user's screenshot: "FLASH / TEAM" wraps) or any 320–375 width. Observed: `.prow__body` is 181 px at 414, 142 at 375, 87 at 320 (`clubs.js:32-35` appends rank badge + policy badge to the right of the body, each ~80-110 px). Expected: the name on one line where it fits.
Patch: show the policy badge only for `invite` (open is the default and is not decision-relevant in a list), and at ≤480px let `#cl-list .prow` wrap with the badges on their own row: `#cl-list .prow { flex-wrap: wrap } #cl-list .prow .pbadge { margin-left: 0 }`.

**F5 · Medium · create-form error is not an error**
Reproduce: Tạo CLB → name "Mask" (taken) → submit. Observed (B8): "Tên CLB đã được dùng." is grey `.pnote` text beside the button, the name field is not marked, focus stays on the button; the live region is `role=status`. Expected: error colour/icon, field marked, focus on the offending field.
Suspected: `client/clubs.html:51` (`#cl-form-msg`), `clubs.js:99-100`. Patch: on error set `$('cl-name').setAttribute('aria-invalid','true')`, `aria-describedby="cl-form-msg"`, add class for `color: var(--c-error)` with a leading icon, and `$('cl-name').focus()`.

**F6 · Low · search pill is 33 px tall; focus ring is a square box inside a rounded pill**
Reproduce: tap the search box. Observed: `.psearch` 33 px high (metrics `search[0]`), under the 44 px target used elsewhere on the page; focused input shows a square `:focus-visible` outline inside the pill (B13). Suspected: `platform.css` `.psearch` (padding 6px 10px). Patch: `@media (max-width:860px){ .psearch { min-height: 44px } }` and `.psearch:focus-within { outline: 2px solid var(--c-ink) } .psearch input:focus-visible { outline: 0 }`.

## Passed (with proof)
- Search: debounce, accents ("cờ" → 2), empty message, clear restores 11 rows (run log).
- Create flow: native required validation, duplicate message, success redirect; fields 16 px / 46 px, submit 44 px (form metrics).
- Round trip: Back from the new club → Của tôi shows it, no reload needed.
- No horizontal scroll 320-768; LCP 152 ms, CLS 0; axe 0 violations; tabs 44 px, Tạo CLB 44 px.

## Roadmap
Quick wins: F1, F2, F5, F6. Structural: F3, F4 (row layout).
Not verified: logged-out call-to-action (no screenshot reviewed for A1), pager with >20 clubs, keyboard-only.

## Hold this in your hands
The page feels light and quick, and the create flow is short and forgiving, but the list is a stack of cards whose height is set by whoever writes the longest description, and the cards spend their width on two badges instead of the club's name. On a phone the first screen should answer "which club is for me?" at a glance; today it answers "who wrote an essay?". Fix the row first.
