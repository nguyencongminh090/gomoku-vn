/**
 * challenge-modal.js — "Thách đấu bạn bè" (#222): pick a friend → settings modal → POST /api/challenges.
 *
 * ChallengeModal.open()                    friend picker first (GET /api/friends; online first, offline allowed)
 * ChallengeModal.open({ to: {username, displayName, avatarUrl} })   skip the picker (profile card)
 *
 * Settings = create-room parity (board, winning rule, Swap2, wall/portal, clock, rated/friendly — same
 * fields and limits as lobby.js readFormSettings) + number of games (1/3/5/custom 1–99) + stake (none | Swap Elo,
 * rated only). The server re-validates everything (ChallengeService.parseSettings / checkStake) and its
 * error message is shown as-is. Pure helpers in ChallengeModal.util are unit-tested (client/tests).
 * Builds DOM with textContent only. Escape closes; focus returns to the opener.
 */
(function (root) {
  'use strict';

  const t = (key, vars) => (typeof root.t === 'function' ? root.t(key, vars) : key);
  const BOARD_SIZES = [15, 17, 19, 20];
  const RULES = ['freestyle', 'standard', 'caro'];
  const TIMER_MODES = [['per_move', 'modal.per_move'], ['per_game', 'modal.per_game'], ['blitz', 'modal.blitz']];
  const GAMES = [1, 3, 5];
  const MAX_GAMES = 99;
  const DEFAULTS = {
    boardSize: 17, winningRule: 'freestyle', ranked: true, ruleWall: false, rulePortal: false, ruleSwap2: false,
    timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0,
  };

  const util = {
    /** Online friends first, then by name; `q` filters on display name or username (case-insensitive). */
    sortFilter(friends, q) {
      const needle = String(q || '').trim().toLowerCase();
      return friends
        .filter((f) => !needle || f.displayName.toLowerCase().includes(needle) || f.username.toLowerCase().includes(needle))
        .sort((a, b) => (b.online === true) - (a.online === true) || a.displayName.localeCompare(b.displayName));
    },
    /** Same rules as the room-create form: Swap2 plays on a plain board; increment only in blitz. */
    normalize(s) {
      const out = { ...s };
      if (out.ruleSwap2) { out.ruleWall = false; out.rulePortal = false; }
      if (out.timerMode !== 'blitz') out.timerIncrementSeconds = 0;
      return out;
    },
    /** Stake needs a rated challenge. */
    stakeAllowed: (s) => s.ranked === true,
    /** One-line summary for incoming/outgoing rows: "Caro · 17×17 · Swap2 · 60 giây/nước · 3 ván · Xếp hạng · Cược Elo". */
    describe(c) {
      const s = c.settings;
      if (!s) return t('rankings.cat_' + c.rule) + (c.time ? ' · ' + c.time : '') + (c.rated ? ' · ' + t('challenge.rated') : '');
      const parts = [t('rankings.cat_' + s.winningRule), s.boardSize + '×' + s.boardSize];
      if (s.ruleSwap2) parts.push('Swap2');
      if (s.ruleWall) parts.push(t('modal.rule_wall'));
      if (s.rulePortal) parts.push(t('modal.rule_portal'));
      parts.push(util.clock(s));
      if (c.games > 1) parts.push(t('challenge.best_of', { n: c.games }));
      parts.push(s.ranked ? t('challenge.rated') : t('room.mode_friendly'));
      if (c.stake === 'swap') parts.push(t('challenge.stake_swap'));
      return parts.join(' · ');
    },
    clock(s) {
      if (s.timerMode === 'blitz') {
        const base = s.timerSeconds % 60 === 0 ? (s.timerSeconds / 60) + "'" : s.timerSeconds + 's';
        return base + '+' + s.timerIncrementSeconds + 's';
      }
      return t(s.timerMode === 'per_game' ? 'challenge.clock_game' : 'challenge.clock_move', { s: s.timerSeconds });
    },
  };

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  const avatar = (p) => (root.PlatformShell && root.PlatformShell.avatar
    ? root.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm') : el('span'));

  let uid = 0;
  /** Radio segment: [[value, label]] → {node, get(), set(v), inputs}. */
  function seg(name, label, options, value) {
    const id = 'pchal-' + name + '-' + (++uid);
    const row = el('div', undefined, 'pchal__row');
    const lab = el('span', label, 'pchal__label');
    lab.id = id;
    const group = el('div', undefined, 'pchal__seg');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', id);
    const inputs = options.map(([v, text]) => {
      const l = el('label');
      const i = document.createElement('input');
      i.type = 'radio'; i.name = id; i.value = String(v); i.checked = v === value;
      l.append(i, el('span', text));
      group.appendChild(l);
      return i;
    });
    row.append(lab, group);
    const get = () => { const i = inputs.find((x) => x.checked); return i ? i.value : null; };
    return { node: row, get, inputs, set: (v) => inputs.forEach((i) => { i.checked = i.value === String(v); }) };
  }

  function check(label, value) {
    const l = el('label', undefined, 'pchal__check');
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = !!value;
    l.append(i, el('span', label));
    return { node: l, input: i };
  }

  function num(label, value, min, max, step) {
    const l = el('label', undefined, 'pchal__num');
    const i = document.createElement('input');
    i.type = 'number'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
    l.append(el('span', label, 'pchal__label'), i, el('span', t('modal.time_unit'), 'pnote'));
    return { node: l, input: i };
  }

  /**
   * @param {{to?: {username, displayName, avatarUrl}, onSent?: (challenge) => void}} [opts]
   * @returns {{close: () => void, root: HTMLElement}}
   */
  function open(opts = {}) {
    const prevFocus = document.activeElement;
    const overlay = el('div', undefined, 'pcrop pchal');
    const dlg = el('div', undefined, 'pcrop__dlg pchal__dlg');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'pchal-title');
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape' && overlay.isConnected) { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const title = (text) => { const h = el('h2', text, 'ph2'); h.id = 'pchal-title'; return h; };
    const cancelBtn = () => {
      const b = el('button', t('modal.btn_cancel'), 'pbtn pbtn--ghost');
      b.type = 'button';
      b.addEventListener('click', close);
      return b;
    };

    async function picker() {
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'pchal__search';
      search.placeholder = t('challenge.search');
      search.setAttribute('aria-label', t('challenge.search'));
      const list = el('div', undefined, 'pchal__list');
      list.setAttribute('role', 'list');
      const note = el('p', t('challenge.loading'), 'pnote');
      const actions = el('div', undefined, 'pform__row pcrop__actions');
      actions.append(cancelBtn());
      dlg.replaceChildren(title(t('challenge.pick_title')), search, note, list, actions);
      search.focus();
      let friends = [];
      try {
        const res = await fetch('/api/friends', { credentials: 'same-origin' });
        if (res.status === 401) { location.href = '/login.html'; return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        friends = (await res.json()).friends || [];
      } catch (_) {
        note.textContent = t('friends.error');
        return;
      }
      const render = () => {
        const shown = util.sortFilter(friends, search.value);
        note.textContent = friends.length ? (shown.length ? '' : t('challenge.no_match')) : t('social.none_friends');
        list.replaceChildren(...shown.map((f) => {
          const b = el('button', undefined, 'prow pchal__friend');
          b.type = 'button';
          b.setAttribute('role', 'listitem');
          const body = el('span', undefined, 'prow__body');
          body.append(el('span', f.displayName, 'prow__t'), el('span', f.online ? t('challenge.online') : t('challenge.offline'), 'prow__m'));
          b.append(avatar(f), body, el('span', undefined, 'pdot' + (f.online ? ' pdot--on' : '')));
          b.addEventListener('click', () => settings(f, true));
          return b;
        }));
      };
      search.addEventListener('input', render);
      render();
    }

    function settings(friend, fromPicker) {
      const s = { ...DEFAULTS };
      const mode = seg('mode', t('modal.mode'), [['rated', t('room.mode_rated')], ['friendly', t('room.mode_friendly')]], 'rated');
      const board = seg('board', t('modal.board_size'), BOARD_SIZES.map((n) => [n, n + '×' + n]), s.boardSize);
      const rule = seg('rule', t('modal.win_rule'), RULES.map((r) => [r, t('rule.' + r)]), s.winningRule);
      const opening = seg('open', t('modal.opening'), [['none', t('rule.none')], ['swap2', 'Swap2']], 'none');
      const specials = el('div', undefined, 'pchal__row');
      const wall = check(t('modal.rule_wall'), false);
      const portal = check(t('modal.rule_portal'), false);
      const specialBox = el('div', undefined, 'pchal__seg');
      specialBox.append(wall.node, portal.node);
      specials.append(el('span', t('modal.special_rules'), 'pchal__label'), specialBox);
      const timer = seg('timer', t('modal.timer_mode'), TIMER_MODES.map(([v, k]) => [v, t(k)]), s.timerMode);
      const secs = num(t('modal.time_label'), s.timerSeconds, 5, 3600, 5);
      const inc = num(t('modal.time_plus'), 0, 0, 600, 1);
      const clockRow = el('div', undefined, 'pchal__row pchal__pair');
      clockRow.append(secs.node, inc.node);
      const games = seg('games', t('challenge.games'),
        [...GAMES.map((n) => [n, n === 1 ? t('challenge.one_game') : t('challenge.best_of', { n })]), ['custom', t('challenge.custom')]], 1);
      const customGames = num(t('challenge.custom_n'), 7, 1, MAX_GAMES, 1);
      customGames.node.querySelector('.pnote').hidden = true;
      const gamesCount = () => (games.get() === 'custom' ? parseInt(customGames.input.value, 10) || 0 : Number(games.get()));
      const stake = seg('stake', t('challenge.stake'), [['none', t('rule.none')], ['swap', t('challenge.stake_swap')]], 'none');
      const stakeHint = el('p', t('challenge.stake_hint'), 'pnote pchal__hint');
      const note = el('p', '', 'pnote pchal__status');
      note.setAttribute('role', 'status');

      const sync = () => {
        const swap2 = opening.get() === 'swap2';
        for (const c of [wall, portal]) { c.input.disabled = swap2; if (swap2) c.input.checked = false; }
        inc.input.disabled = timer.get() !== 'blitz';
        customGames.node.hidden = games.get() !== 'custom';
        const rated = mode.get() === 'rated';
        stake.inputs[1].disabled = !rated;
        if (!rated) stake.set('none');
        stakeHint.hidden = stake.get() !== 'swap';
      };
      for (const g of [mode, opening, timer, stake, games]) g.inputs.forEach((i) => i.addEventListener('change', sync));

      const send = el('button', t('challenge.send'), 'pbtn pbtn--primary');
      send.type = 'submit';
      const actions = el('div', undefined, 'pform__row pcrop__actions');
      if (fromPicker) {
        const back = el('button', t('challenge.back'), 'pbtn pbtn--ghost');
        back.type = 'button';
        back.addEventListener('click', picker);
        actions.append(back);
      }
      actions.append(cancelBtn(), send);

      const who = el('div', undefined, 'prow pchal__who');
      const whoBody = el('div', undefined, 'prow__body');
      whoBody.append(el('div', friend.displayName, 'prow__t'));
      who.append(avatar(friend), whoBody);

      const form = el('form', undefined, 'pchal__form');
      form.noValidate = true;
      form.append(who, mode.node, board.node, rule.node, opening.node, specials, timer.node, clockRow,
        games.node, customGames.node, stake.node, stakeHint, note, actions);
      dlg.replaceChildren(title(t('challenge.modal_title', { name: friend.displayName })), form);
      sync();
      (mode.inputs[0]).focus();

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const settingsOut = util.normalize({
          boardSize: Number(board.get()), winningRule: rule.get(), ranked: mode.get() === 'rated',
          ruleSwap2: opening.get() === 'swap2', ruleWall: wall.input.checked, rulePortal: portal.input.checked,
          timerMode: timer.get(),
          timerSeconds: parseInt(secs.input.value, 10) || 0,
          timerIncrementSeconds: parseInt(inc.input.value, 10) || 0,
        });
        send.disabled = true;
        note.textContent = '';
        try {
          const res = await fetch('/api/challenges', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: friend.username, settings: settingsOut, games: gamesCount(), stake: stake.get() }),
          });
          if (res.status === 401) { location.href = '/login.html'; return; }
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { note.textContent = res.status === 403 && !body.error ? t('challenge.members_only') : (body.error || t('friends.error')); return; }
          close();
          if (opts.onSent) opts.onSent(body);
        } catch (_) {
          note.textContent = t('friends.error');
        } finally {
          send.disabled = false;
        }
      });
    }

    if (opts.to) settings(opts.to, false); else picker();
    return { close, root: overlay };
  }

  root.ChallengeModal = { open, util };
})(typeof window !== 'undefined' ? window : globalThis);
