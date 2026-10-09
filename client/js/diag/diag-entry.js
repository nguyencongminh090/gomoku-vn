'use strict';

/**
 * diag-entry.js — page bootstrap for the unlisted diagnostic page
 * (TODO.md #168 step 5).
 *
 * Owns the four-screen state machine (intro → running → results → sent), the
 * socket lifecycle, and the DOM. All arithmetic lives elsewhere:
 * LatencyProbeSession accumulates, DiagReport judges, DiagBoard plays.
 *
 * CSP: no inline handlers anywhere (`scriptSrcAttr: 'none'` in
 * server/config/csp.js) — every listener is attached here.
 *
 * This page never authenticates. It connects to the `/diag` namespace, which
 * has no auth middleware, and it deliberately does not load session.js: a
 * reporter should be able to open the link in a private window with no
 * account and no cookie.
 */

(function (global) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const t = (key) => (global.t ? global.t(key) : key);

  /** The run's own asset version, recorded so a stale cached page is visible. */
  const ASSET_VERSION = 168;

  const el = {};
  let socket = null;
  let session = null;
  let board = null;
  let finished = false;

  // ── Screens ──────────────────────────────────────────────────────────────

  function show(name) {
    for (const s of document.querySelectorAll('.diag-screen')) {
      s.classList.toggle('is-active', s.id === `screen-${name}`);
    }
    // A screen change is a navigation as far as the reader is concerned.
    global.scrollTo(0, 0);
  }

  function showError(target, message) {
    const box = $(target);
    $(`${target}-text`).textContent = message;
    box.hidden = false;
  }

  function hideError(target) { $(target).hidden = true; }

  // ── Intro → running ──────────────────────────────────────────────────────

  function connect() {
    // Same origin, dedicated namespace. No auth payload of any kind.
    return global.io('/diag', { transports: ['websocket', 'polling'] });
  }

  function startRun() {
    el.start.disabled = true;
    hideError('intro-error');

    socket = connect();

    socket.on('connect_error', () => {
      el.start.disabled = false;
      showError('intro-error', t('diag.err_connect'));
    });

    socket.on('connect', () => {
      socket.emit('diag:start', {}, (res) => {
        if (!res || res.error) {
          el.start.disabled = false;
          const code = res && res.code;
          showError('intro-error',
            code === 'DIAG_RATE_LIMITED' ? t('diag.err_rate_limited') : t('diag.err_start'));
          socket.close();
          socket = null;
          return;
        }
        beginMeasuring(res.game);
      });
    });
  }

  function beginMeasuring(game) {
    session = new global.DiagProbeSession({
      socket,
      onProgress: renderProgress,
    });

    board = new global.DiagBoard({
      canvas: el.canvas,
      socket,
      session,
      onMove: () => { renderProgress(session.progress()); renderClock(); },
      onEnded: () => {
        // The server ended the run (timeout, or the bot/player completed a
        // line). Whatever was measured up to here is still a real sample.
        finishRun();
      },
      onRefused: () => { /* an occupied cell — the board simply rolls back */ },
    });

    board.init(game);
    board.lastSync = game.timer;

    show('run');
    // The canvas needs a laid-out parent before it can size itself.
    board.resize();
    renderClock();
    renderProgress(session.progress());

    session.start();
    global.addEventListener('resize', onResize);
    clockTimer = global.setInterval(renderClock, 1000);
  }

  let clockTimer = null;

  function onResize() { if (board) board.resize(); }

  // ── Running screen rendering ─────────────────────────────────────────────

  function renderClock() {
    const secs = board && board.remainingSeconds();
    if (!Number.isFinite(secs)) { el.clock.textContent = '—'; return; }
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    el.clock.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderRail(rowId, fillId, countId, value, target) {
    const pct = Math.min(100, target ? (value / target) * 100 : 0);
    $(fillId).style.width = `${pct}%`;
    $(countId).textContent = `${Math.min(value, target)}/${target}`;
    $(rowId).classList.toggle('is-done', value >= target);
  }

  function renderProgress(p) {
    renderRail('rail-moves', 'fill-moves', 'count-moves', p.moves, p.minMoves);
    renderRail('rail-probes', 'fill-probes', 'count-probes', p.probes, p.minProbes);
    // The run does not stop itself the moment it is complete — the player
    // decides when to look. The button simply becomes the obvious next step.
    el.finish.classList.toggle('diag-btn--quiet', !p.complete);
  }

  // ── Running → results ────────────────────────────────────────────────────

  function finishRun() {
    if (finished) return;
    finished = true;

    if (clockTimer) { global.clearInterval(clockTimer); clockTimer = null; }
    global.removeEventListener('resize', onResize);
    if (session) session.stop();
    if (board) board.destroy();

    renderResults();
    show('result');
  }

  function renderResults() {
    const run = session.stats();
    const rows = global.DiagReport.rows(run);

    el.verdicts.replaceChildren();
    for (const row of rows) {
      const wrap = document.createElement('div');
      wrap.className = `diag-verdict v-${row.verdict || 'none'}`;

      // Built with createElement rather than innerHTML: this page is
      // unauthenticated and the safest habit is to have no HTML-string path
      // at all, even for strings that are currently all our own.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `assets/icons/phosphor-sprite.svg?v=${ASSET_VERSION}#${row.icon}`);
      svg.appendChild(use);

      const text = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'diag-verdict__label';
      label.textContent = t(row.labelKey);
      const msg = document.createElement('div');
      msg.className = 'diag-verdict__msg';
      msg.textContent = t(row.messageKey);
      text.append(label, msg);

      wrap.append(svg, text);
      el.verdicts.appendChild(wrap);
    }

    el.partial.hidden = session.isComplete();

    el.detailGrid.replaceChildren();
    for (const d of global.DiagReport.details(run)) {
      const dt = document.createElement('dt');
      dt.textContent = t(d.labelKey);
      const dd = document.createElement('dd');
      dd.textContent = d.value;
      el.detailGrid.append(dt, dd);
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  function netSnapshot() {
    const c = global.navigator && (navigator.connection || navigator.mozConnection);
    if (!c) return undefined;
    return {
      effectiveType: c.effectiveType,
      downlink: c.downlink,
      rtt: c.rtt,
      saveData: c.saveData,
    };
  }

  function clientSnapshot() {
    let tz;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = undefined; }
    return {
      assetVersion: ASSET_VERSION,
      tz,
      viewport: `${global.innerWidth}x${global.innerHeight}`,
    };
  }

  function submit() {
    if (!socket || !socket.connected) {
      showError('submit-error', t('diag.err_connect'));
      return;
    }
    el.submit.disabled = true;
    hideError('submit-error');

    const run = session.stats();
    socket.emit('diag:submit', {
      name: el.name.value,
      feedback: el.feedback.value,
      run,
      verdict: global.DiagReport.verdicts(run),
      net: netSnapshot(),
      client: clientSnapshot(),
    }, (res) => {
      if (!res || res.error) {
        el.submit.disabled = false;
        showError('submit-error', t('diag.err_submit'));
        return;
      }
      show('done');
      socket.close();
      socket = null;
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(el, {
      start: $('btn-start'),
      finish: $('btn-finish'),
      submit: $('btn-submit'),
      lang: $('diag-lang'),
      canvas: $('diag-canvas'),
      clock: $('diag-clock'),
      verdicts: $('diag-verdicts'),
      partial: $('diag-partial'),
      detailGrid: $('diag-detail-grid'),
      name: $('diag-name'),
      feedback: $('diag-feedback'),
    });

    el.start.addEventListener('click', startRun);
    el.finish.addEventListener('click', finishRun);
    el.submit.addEventListener('click', submit);

    // This page has no Settings panel and no login shell, so it carries its
    // own switcher rather than reusing either mount point.
    const syncLangButton = () => {
      const lang = global.getLanguage ? global.getLanguage() : 'vi';
      el.lang.textContent = lang === 'vi' ? 'EN' : 'VI';
    };
    el.lang.addEventListener('click', () => {
      const next = (global.getLanguage && global.getLanguage()) === 'vi' ? 'en' : 'vi';
      global.setLanguage(next);
      syncLangButton();
      // Re-render anything already painted from a key rather than from the DOM.
      if (finished && session) renderResults();
    });
    syncLangButton();
  });

})(window);
