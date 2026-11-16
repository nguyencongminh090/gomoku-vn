# UX audit — quick-match status line as tags (scoped to this change)

**Verdict: Incomplete** (scoped pass: no axe-core in node_modules, no perf trace, 1 route only). Persona: first-time guest on a phone + returning rated member. Local :3101, own DB, vi-VN. Evidence: `docs/audits/2026-10-23/*.png`.

Observed OK: 0 console errors/warnings, 0 4xx/5xx, no horizontal overflow (375/768/1280); chips update live when rule/time/board chips change; searching → lead text only, cancel restores chips; `aria-live="polite"` kept.

## Findings
- **M1 (Visual, guest 375px):** the guest note "khách chỉ chơi giao hữu — đăng nhập để chơi xếp hạng" is a sentence rendered as a grey chip that wraps to 2 lines (`guest-375-qm.png`). Chips should be short facts. Patch: render it as plain muted text (class `qm-line__note`, `flex-basis:100%`, no fill) in `setSegments` / `shell.css` `.qm-line`.
- **L1 (Visual, searching with queue ≥2):** `.qm-line .rtag:nth-child(2)` green fill also hits "N người đang chờ" because the searching line is [lead, queue-tag]. From DOM structure only; not reproduced visually (needs 2 users in one bucket). Patch: mark the rule tag with a class (`rtag--rule`) and style that.
- Not verified in browser: queue + ETA tags (unit-tested only), English locale, dark/light toggle.

## Resolution (#328)
M1 and L1 fixed (explicit `qm-line__note` / `rtag--rule` classes); browser-checked at 375/1280 as guest. Still unverified: queue+ETA chips with real waiters, English, theme toggle.
