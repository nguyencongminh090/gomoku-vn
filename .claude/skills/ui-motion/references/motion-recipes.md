# Motion recipes (2D, page, scroll)

Adapt to the project's framework and token names. Every recipe keeps content visible without the animation. Reasons and numbers: `fe-web-animation`.

Contents:
1. Tokens and global reduced motion
2. State transition (button, card)
3. Enter and exit with `@starting-style` (dialog, popover)
4. Keyframes (loading, attention)
5. Web Animations API
6. Same-document View Transitions
7. Cross-document View Transitions
8. Scroll reveal: scroll-driven with IntersectionObserver fallback
9. Motion (React)
10. GSAP with ScrollTrigger
11. Pause control for long motion

## 1. Tokens and global reduced motion

```css
:root {
  --dur-fast: 120ms;   /* press, hover feedback */
  --dur-base: 200ms;   /* dropdown, dialog, toast */
  --dur-slow: 320ms;   /* drawer, page transition */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* same tokens as the animate skill */
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-slow: 120ms; } /* keep short fades, drop long moves */
}
```

Prefer per-effect reduced-motion rules (below) over a global `* { animation: none !important }`, which also removes end states and fades.

## 2. State transition

```css
.btn { transition: transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out); }
.btn:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .card { transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out); }
  .card:hover { transform: translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .btn:active, .card:hover { transform: none; }
}
```

## 3. Enter and exit with `@starting-style`

```css
dialog {
  opacity: 0; transform: scale(0.96);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out),
              overlay var(--dur-base) allow-discrete, display var(--dur-base) allow-discrete;
}
dialog[open] { opacity: 1; transform: scale(1); }
@starting-style { dialog[open] { opacity: 0; transform: scale(0.96); } }
dialog::backdrop { background: rgb(0 0 0 / 0.4); transition: opacity var(--dur-base); }
@media (prefers-reduced-motion: reduce) {
  dialog, dialog[open] { transform: none; } /* fade only */
}
```

Browsers without `@starting-style` show the dialog instantly, which is fine. Popovers: same pattern on `[popover]:popover-open`; set `transform-origin` toward the trigger.

## 4. Keyframes

```css
@keyframes spin { to { transform: rotate(1turn); } }
.spinner { animation: spin 0.8s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2.4s; } /* slow, do not remove: it carries meaning */
}
```

A spinner shows state, so it stays. Decorative loops longer than five seconds need a pause control (section 11).

## 5. Web Animations API

```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export function flash(el) {
  const frames = reduce.matches
    ? [{ opacity: 0.6 }, { opacity: 1 }]
    : [{ transform: 'scale(0.97)', opacity: 0.6 }, { transform: 'none', opacity: 1 }];
  return el.animate(frames, { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
}
```

`animation.reverse()`, `finished` and `cancel()` give control that CSS lacks.

## 6. Same-document View Transitions (SPA state or route change)

```js
export function withTransition(update) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) return update();
  return document.startViewTransition(update);
}
```

```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--dur-slow); }
.product-thumb { view-transition-name: var(--vt-name); } /* unique name per element, e.g. product-42 */
```

Frameworks: React Router and Next.js have their own view-transition integrations; prefer them when present.

## 7. Cross-document View Transitions (multi-page sites)

```css
/* in the CSS of both pages, same origin only */
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
}
.site-header { view-transition-name: site-header; }
```

Not Baseline as of 2026-11: browsers without it navigate normally.

## 8. Scroll reveal

Scroll-driven, CSS only, applied only where supported:

```css
@keyframes reveal { from { opacity: 0; transform: translateY(16px); } }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% entry 40%; }
  }
}
```

IntersectionObserver fallback, animating once and leaving the element in place:

```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = CSS.supports('animation-timeline: view()');
if (!reduce && !css && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('reveal-js');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
```

```css
.reveal-js .reveal { opacity: 0; transform: translateY(16px);
  transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out); }
.reveal-js .reveal.is-in { opacity: 1; transform: none; }
```

Content is hidden only after the script has run, so a script failure leaves it visible. Do not put `.reveal` on the hero or LCP element.

## 9. Motion (React)

```jsx
import { motion, AnimatePresence, MotionConfig } from "motion/react";

export function Toasts({ items }) {
  return (
    <MotionConfig reducedMotion="user">{/* drops transform motion when the OS asks */}
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.li key={t.id} layout
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}>
            {t.text}
          </motion.li>
        ))}
      </AnimatePresence>
    </MotionConfig>
  );
}
```

Install: `npm i motion`. Wrap the app once in `MotionConfig`, not every component.

## 10. GSAP with ScrollTrigger

```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  gsap.from(".feature", {
    y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out", stagger: 0.06,
    scrollTrigger: { trigger: ".features", start: "top 80%", once: true },
  });
}); // matchMedia reverts these animations when the query stops matching
```

React: `import { useGSAP } from "@gsap/react"` and `useGSAP(() => { ... }, { scope: containerRef })` so selectors are scoped and cleaned up on unmount. Call `ScrollTrigger.refresh()` after content changes height. Avoid `pin` and scrub scenes on task pages and on mobile (`vstyle-motion-immersive` "Keep it usable").

## 11. Pause control for long motion

```html
<button type="button" class="motion-toggle" aria-pressed="false">Pause animation</button>
```

```js
const btn = document.querySelector('.motion-toggle');
btn.addEventListener('click', () => {
  const paused = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', String(paused));
  btn.textContent = paused ? 'Play animation' : 'Pause animation';
  document.documentElement.classList.toggle('motion-paused', paused);
  document.querySelectorAll('video[autoplay]').forEach((v) => (paused ? v.pause() : v.play()));
});
```

```css
.motion-paused * { animation-play-state: paused !important; }
```

Required for anything that moves by itself for more than five seconds alongside other content (WCAG 2.2.2).
