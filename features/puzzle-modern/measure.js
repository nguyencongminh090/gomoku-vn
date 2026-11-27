// Shared in-page measurements for the puzzle shoot scripts (runs inside page.evaluate).
// Measurements in the page: console errors are collected outside; here text contrast, small targets, focus ring.
const MEASURE = () => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const unit = /^color\(srgb/.test(c) ? 1 : 255; // color-mix() computes to color(srgb 0..1 …)
    const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { v /= unit; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] === undefined ? 1 : Number(m[3]) }; };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const l = lum(c); if (l && l.a > 0.5) return l; } return lum(getComputedStyle(document.body).backgroundColor) || { L: 0 }; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
  const lowContrast = [];
  for (const el of document.querySelectorAll('main *')) {
    if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest('button:disabled, [aria-disabled="true"]')) continue;
    const fg = lum(getComputedStyle(el).color); const bg = bgOf(el); if (!fg) continue;
    const ratio = (Math.max(fg.L, bg.L) + 0.05) / (Math.min(fg.L, bg.L) + 0.05);
    if (ratio < 4.5) lowContrast.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 24)}"`);
  }
  const small = [];
  if (innerWidth < 860) for (const el of document.querySelectorAll('main button, main a, main select, main input, main textarea')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect();
    if (r.height < 44 && !el.closest('.pz-moves, .prow')) small.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const transitions = [...document.querySelectorAll('main *')].filter((el) => { const s = getComputedStyle(el); return parseFloat(s.transitionDuration) > 0.011 || (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.011); }).length;
  return { lowContrast: lowContrast.slice(0, 12), lowContrastN: lowContrast.length, small: small.slice(0, 12), smallN: small.length, transitions, hScroll: document.documentElement.scrollWidth > innerWidth };
};

module.exports = { MEASURE };
