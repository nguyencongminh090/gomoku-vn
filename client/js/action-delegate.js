'use strict';

/**
 * action-delegate.js — replaces inline `onclick="fn(...)"` attributes.
 *
 * CSP script-src without 'unsafe-inline' blocks inline event-handler
 * attributes too (they fall under script-src-attr, which inherits from
 * script-src when unset). Every dynamically-rendered button that used to
 * carry onclick="someGlobalFn(arg)" instead carries data-action="someGlobalFn"
 * (+ optional data-arg / data-arg-type="number" / data-action-self), and this
 * one delegated listener dispatches to the same window-level functions the
 * onclick attributes used to call directly.
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
})(typeof window !== 'undefined' ? window : this);
