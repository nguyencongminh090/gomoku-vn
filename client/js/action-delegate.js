'use strict';

/**
 * action-delegate.js — replaces inline `onclick="fn(...)"` / `onchange="fn()"`
 * attributes.
 *
 * CSP script-src without 'unsafe-inline' blocks inline event-handler
 * attributes too (they fall under script-src-attr, which inherits from
 * script-src when unset). Every dynamically-rendered button that used to
 * carry onclick="someGlobalFn(arg)" instead carries data-action="someGlobalFn"
 * (+ optional data-arg / data-arg-type="number" / data-action-self), and this
 * one delegated listener dispatches to the same window-level functions the
 * onclick attributes used to call directly.
 *
 * A form control that used to carry onchange="someGlobalFn()" instead carries
 * data-change-action="someGlobalFn" — a separate attribute from data-action,
 * not a reused one, because a radio/checkbox click fires both a native
 * `click` and a native `change` event; sharing one attribute across both
 * delegated listeners below would call the handler twice per interaction.
 * data-change-action handlers always take no arguments (they read the
 * current form state themselves, same as the onchange="fn()" call sites they
 * replace).
 */
(function (global) {
  document.addEventListener('click', function (evt) {
    const el = evt.target.closest('[data-action]');
    if (!el) return;

    const fn = global[el.dataset.action];
    if (typeof fn !== 'function') return;

    if (el.dataset.actionSelf !== undefined) {
      fn(el);
    } else if (el.dataset.arg === undefined) {
      fn();
    } else {
      fn(el.dataset.argType === 'number' ? Number(el.dataset.arg) : el.dataset.arg);
    }
  });

  document.addEventListener('change', function (evt) {
    const el = evt.target.closest('[data-change-action]');
    if (!el) return;

    const fn = global[el.dataset.changeAction];
    if (typeof fn !== 'function') return;

    fn();
  });
})(typeof window !== 'undefined' ? window : this);
