// Club chat refactor — clickable mockup. Static data, no server. Scenes: ?scene=actions|edit|slash|delete|report|poll|calendar|event
(() => {
  const Q = new URLSearchParams(location.search);
  const scene = Q.get('scene') || 'actions';
  const staff = Q.get('as') === 'staff';
  const phone = () => matchMedia('(max-width: 860px)').matches;
  const $ = (id) => document.getElementById(id);
  const ico = (n) => `<svg class="icon" aria-hidden="true"><use href="#ph-regular-${n}"></use></svg>`;
  // dialogs live inside .cl-hq (as #cb-poll-editor does today) so club tokens and .cl-hq .pbtn apply
  document.querySelectorAll('dialog').forEach((d) => document.getElementById('cb-app').append(d));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- scene tabs (hidden in screenshots) ----
  const SCENES = ['actions', 'edit', 'slash', 'delete', 'report', 'poll', 'calendar', 'event'];
  const link = (p) => { const q = new URLSearchParams(location.search); Object.entries(p).forEach(([k, v]) => q.set(k, v)); return '?' + q; };
  $('mk-tab').innerHTML = SCENES.map((s) => `<a href="${link({ scene: s })}"${s === scene ? ' aria-current="page"' : ''}>${s}</a>`).join('')
    + `<a href="${link({ mode: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' })}">theme</a>`
    + `<a href="${link({ as: staff ? 'member' : 'staff' })}">${staff ? 'staff' : 'member'}</a>`;
  if (staff) $('me-role').textContent = 'Phó nhóm';

  // ---- data ----
  const PEOPLE = {
    hoamai: { name: 'Hoa Mai', av: 'HM', c: 'teal', role: 'owner' },
    ducanh: { name: 'Đức Anh', av: 'ĐA', c: 'orange', role: 'officer' },
    minhkhoi: { name: 'Minh Khôi', av: 'MK', c: 'purple' },
    lanchi: { name: 'Lan Chi', av: 'LC', c: 'pink' },
    quocbao: { name: 'Quốc Bảo', av: 'QB', c: 'green' },
    thuong_h: { name: 'Hoài Thương', av: 'HT', c: 'red' },
    hoang99: { name: 'Huy Hoàng', av: 'HH', c: 'gray' },
    trucmai: { name: 'Trúc Mai', av: 'TM', me: true },
  };
  let msgs = [
    { id: 101, day: 'Hôm qua', at: '21:40', by: 'ducanh', text: 'Tuần này ai muốn tập khai cuộc Hoa Nguyệt không?' },
    { id: 102, day: 'Hôm qua', at: '21:44', by: 'minhkhoi', text: 'Mình! @trucmai vào cùng không?', mentionsMe: true },
    { id: 103, day: 'Hôm qua', at: '21:46', by: 'trucmai', text: 'Có, tối nay 21h nhé', edited: '21:47' },
    { id: 104, day: 'Hôm nay', at: '08:12', by: 'lanchi', kind: 'poll', text: 'Giải tháng 12 đánh thể thức nào?', poll: [['Tự do 5+3', 7, true], ['Renju 10+5', 4], ['Caro chuẩn 3+2', 2]] },
    { id: 105, day: 'Hôm nay', at: '09:03', by: 'quocbao', text: 'Ván hôm qua thua tiếc quá, nước 23 đi hỏng 😅 ai xem lại giúp với' },
    { id: 106, day: 'Hôm nay', at: '09:05', by: 'trucmai', text: 'Ai có link ván đấu thì gửi mình với' },
  ];
  const RANK = { owner: 3, officer: 2 };
  const myRank = staff ? 2 : 1;
  const canDelete = (m) => PEOPLE[m.by].me || (staff && myRank > (RANK[PEOPLE[m.by].role] || 1));

  // ---- chat rows ----
  function pollCard(m, preview) {
    const total = m.poll.reduce((s, o) => s + o[1], 0);
    return `<div class="cb-poll"><div class="cb-poll__opts">${m.poll.map(([t, n, mine]) => {
      const pct = total ? Math.round(n / total * 100) : 0;
      return `<button type="button" class="cb-poll__opt${mine ? ' is-mine' : ''}" style="--pct:${pct}%"${preview ? ' disabled' : ''}><span class="cb-poll__label">${mine ? ico('check-circle') : ''}${esc(t)}</span><span class="cb-poll__n">${n} phiếu</span></button>`;
    }).join('')}</div><div class="cb-poll__foot"><span class="cl-count">${total} phiếu</span><span class="cl-count cb-poll__open">Mở đến ${preview ? '20:15, 27-11' : '08:12, 27-11'}</span></div></div>`;
  }
  function textHtml(t) {
    return esc(t).replace(/@([A-Za-z0-9_]{3,20})/g, (all, u) => PEOPLE[u.toLowerCase()] ? `<b class="cb-chat__at${PEOPLE[u.toLowerCase()].me ? ' is-me' : ''}">@${u}</b>` : all);
  }
  function tools(m) {
    const mine = PEOPLE[m.by].me;
    const b = (cls, icon, label, act, extra = '') => `<button type="button" class="cl-ib ${cls}" data-act="${act}" aria-label="${label}" title="${label}" tabindex="-1"${extra}>${ico(icon)}</button>`;
    let h = '';
    if (mine && !m.kind) h += b('', 'pencil-simple', 'Sửa', 'edit');
    if (!mine) h += b('', 'flag', 'Báo cáo', 'report');
    if (canDelete(m)) h += b('cl-ib--danger', 'trash', 'Xoá', 'delete');
    h += b('cb-tools__more', 'dots-three', 'Tác vụ tin nhắn', 'more', ' aria-haspopup="menu" aria-expanded="false"');
    return `<div class="cb-tools" role="toolbar" aria-label="Tác vụ tin nhắn của ${esc(PEOPLE[m.by].name)}">${h}</div>`;
  }
  function row(m) {
    const p = PEOPLE[m.by];
    const time = `<time class="cb-chat__time">${m.at}</time>${m.edited ? `<span class="cb-chat__edited" title="Sửa lúc ${m.edited}">đã sửa</span>` : ''}`;
    if (m.kind === 'poll') {
      return `<div class="cb-chat__msg cb-chat__msg--sys" data-id="${m.id}"><span class="cb-chat__tile">${ico('check-square')}</span><div class="cb-chat__body"><div class="cb-chat__sys-t">${esc(p.name)} tạo bình chọn ${time}</div><div class="cb-chat__text cb-poll__q">${esc(m.text)}</div>${pollCard(m)}</div>${tools(m)}</div>`;
    }
    const role = p.role ? `<span class="cl-role">${p.role === 'owner' ? 'Chủ nhiệm' : 'Phó nhóm'}</span>` : '';
    return `<div class="cb-chat__msg${m.mentionsMe ? ' is-mentioned' : ''}" data-id="${m.id}"><span class="pav cl-av40${p.c ? ' pav--c-' + p.c : ''}">${p.av}</span><div class="cb-chat__body"><div class="cb-chat__who"><a class="cl-nm cb-chat__name" href="#">${esc(p.name)}</a>${role}${time}</div><div class="cb-chat__text">${textHtml(m.text)}</div></div>${tools(m)}</div>`;
  }
  function renderLog() {
    let day = '';
    $('cb-chat-log').innerHTML = msgs.map((m) => {
      const sep = m.day !== day ? `<div class="cl-day" role="separator">${(day = m.day)}</div>` : '';
      return sep + row(m);
    }).join('');
    // roving tabindex: first tool of each toolbar is the row's single tab stop
    document.querySelectorAll('.cb-tools').forEach((t) => { t.firstElementChild.tabIndex = 0; });
  }
  const byId = (id) => msgs.find((m) => m.id === Number(id));
  const quote = (m) => `<span class="pav${PEOPLE[m.by].c ? ' pav--c-' + PEOPLE[m.by].c : ''}">${PEOPLE[m.by].av}</span><div><b>${esc(PEOPLE[m.by].name)}</b><p>${esc(m.text)}</p></div>`;

  // ---- actions: toolbar, ⋯ menu (desktop), long-press sheet (phone) ----
  function actionsFor(m) {
    const mine = PEOPLE[m.by].me;
    const list = [];
    if (mine && !m.kind) list.push(['edit', 'pencil-simple', 'Sửa tin nhắn']);
    list.push(['copy', 'copy', 'Sao chép nội dung']);
    if (phone()) list.push(['select', 'text-align-left', 'Chọn văn bản']);
    if (!mine) list.push(['report', 'flag', 'Báo cáo']);
    if (canDelete(m)) list.push(['delete', 'trash', mine ? 'Xoá tin nhắn' : 'Xoá tin nhắn (ban quản trị)', true]);
    return list.map(([a, i, l, d]) => `<button type="button" role="menuitem" class="cb-act${d ? ' cb-act--danger' : ''}" data-act="${a}">${ico(i)}${l}</button>`).join('');
  }
  let selected = null;
  function openSheet(rowEl, byKeyboard) {
    const m = byId(rowEl.dataset.id);
    closeMenus();
    selected = rowEl;
    rowEl.classList.add('is-selected');
    $('sheet-quote').innerHTML = quote(m);
    $('sheet-list').innerHTML = actionsFor(m);
    $('sheet-list').dataset.id = m.id;
    $('sheet-actions').showModal();
    // keep the marked row visible just above the sheet
    const s = $('cb-stream'), top = $('sheet-actions').getBoundingClientRect().top, r = rowEl.getBoundingClientRect();
    if (r.bottom > top - 12) s.scrollTop += r.bottom - (top - 12);
    if (r.top < s.getBoundingClientRect().top) s.scrollTop -= s.getBoundingClientRect().top - r.top + 8;
    // touch: focus the sheet (no ring on the first item); keyboard: first item, as the APG menu does
    if (byKeyboard) $('sheet-list').querySelector('[role=menuitem]').focus(); else { $('sheet-actions').tabIndex = -1; $('sheet-actions').focus(); }
  }
  $('sheet-actions').addEventListener('close', () => { if (selected) selected.classList.remove('is-selected'); selected = null; });
  $('sheet-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const id = $('sheet-list').dataset.id;
    $('sheet-actions').close();
    doAct(b.dataset.act, id);
  });
  function closeMenus() { document.querySelectorAll('.cb-menu').forEach((n) => n.remove()); document.querySelectorAll('[aria-expanded="true"].cb-tools__more').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  function openMenu(btn) {
    closeMenus();
    const rowEl = btn.closest('.cb-chat__msg');
    const menu = document.createElement('div');
    menu.className = 'cb-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = actionsFor(byId(rowEl.dataset.id));
    rowEl.append(menu);
    // flip upward when the stream would clip it (last rows)
    if (menu.getBoundingClientRect().bottom > $('cb-stream').getBoundingClientRect().bottom - 8) menu.classList.add('cb-menu--up');
    rowEl.classList.add('is-hover');
    btn.setAttribute('aria-expanded', 'true');
    menu.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act]'); if (b) { closeMenus(); doAct(b.dataset.act, rowEl.dataset.id); } });
    menu.querySelector('[role=menuitem]').focus();
  }
  function doAct(act, id) {
    const m = byId(id);
    if (act === 'edit') startEdit(m);
    else if (act === 'delete') openDelete(m);
    else if (act === 'report') openReport(m);
    else if (act === 'copy') navigator.clipboard?.writeText(m.text).catch(() => {});
    else if (act === 'select') { // Q5 (a): native selection + iOS/Android callout back on this one row until the next tap elsewhere
      const r = document.querySelector(`.cb-chat__msg[data-id="${id}"]`);
      r.classList.add('is-selecting');
      const t = r.querySelector('.cb-chat__text');
      getSelection().selectAllChildren(t);
      document.addEventListener('pointerdown', (ev) => { if (!r.contains(ev.target)) r.classList.remove('is-selecting'); }, { once: true, capture: true });
    }
    else if (act === 'more') {
      const r = document.querySelector(`.cb-chat__msg[data-id="${id}"]`);
      if (phone()) openSheet(r, true); else openMenu(r.querySelector('.cb-tools__more'));
    }
  }
  const log = $('cb-chat-log');
  log.addEventListener('click', (ev) => {
    const b = ev.target.closest('.cb-tools [data-act]');
    if (!b) return;
    if (b.dataset.act === 'more' && !phone()) { openMenu(b); return; }
    doAct(b.dataset.act, b.closest('.cb-chat__msg').dataset.id);
  });
  // roving tabindex inside a toolbar (APG toolbar)
  log.addEventListener('keydown', (ev) => {
    const t = ev.target.closest('.cb-tools');
    if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const items = [...t.querySelectorAll('button')].filter((b) => b.offsetParent);
    let i = items.indexOf(document.activeElement);
    i = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
    items[i].focus();
    ev.preventDefault();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenus(); });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.cb-menu, .cb-tools__more')) closeMenus(); });
  // long-press: 450 ms, cancelled by > 8 px movement, scroll or pointercancel; contextmenu opens the same sheet
  let hold = null;
  log.addEventListener('pointerdown', (ev) => {
    const r = ev.target.closest('.cb-chat__msg');
    if (!r || ev.pointerType !== 'touch' || ev.target.closest('button, a')) return;
    const x = ev.clientX, y = ev.clientY;
    hold = { r, x, y, t: setTimeout(() => { hold = null; openSheet(r); navigator.vibrate?.(10); }, 450) };
  });
  const cancelHold = () => { if (hold) { clearTimeout(hold.t); hold = null; } };
  log.addEventListener('pointermove', (ev) => { if (hold && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 8) cancelHold(); });
  ['pointerup', 'pointercancel'].forEach((e) => log.addEventListener(e, cancelHold));
  $('cb-stream').addEventListener('scroll', cancelHold, { passive: true });
  log.addEventListener('contextmenu', (ev) => {
    const r = ev.target.closest('.cb-chat__msg');
    if (!r || ev.target.closest('a')) return;
    ev.preventDefault();
    cancelHold();
    if (phone()) openSheet(r); else openMenu(r.querySelector('.cb-tools__more'));
  });

  // ---- edit mode in the composer ----
  let editing = null;
  function startEdit(m) {
    editing = m;
    document.querySelectorAll('.is-editing').forEach((n) => n.classList.remove('is-editing'));
    document.querySelector(`.cb-chat__msg[data-id="${m.id}"]`)?.classList.add('is-editing');
    $('cb-editbar').hidden = false;
    $('cb-edit-orig').textContent = m.text;
    $('cb-chat-input').value = m.text;
    $('cb-send').innerHTML = ico('check');
    $('cb-send').setAttribute('aria-label', 'Lưu thay đổi');
    $('cb-chat-input').focus();
  }
  function endEdit() {
    editing = null;
    document.querySelectorAll('.is-editing').forEach((n) => n.classList.remove('is-editing'));
    $('cb-editbar').hidden = true;
    $('cb-chat-input').value = '';
    $('cb-send').innerHTML = ico('paper-plane-tilt');
    $('cb-send').setAttribute('aria-label', 'Gửi');
    hideHints();
  }
  $('cb-edit-cancel').onclick = endEdit;
  $('cb-chat-form').onsubmit = (ev) => {
    ev.preventDefault();
    const text = $('cb-chat-input').value.trim();
    if (!text) return;
    if (editing) {
      if (text !== editing.text) Object.assign(editing, { text, edited: 'vừa xong' });
      endEdit();
    } else {
      msgs.push({ id: Date.now(), day: 'Hôm nay', at: '09:10', by: 'trucmai', text });
      $('cb-chat-input').value = '';
    }
    renderLog();
    $('cb-stream').scrollTop = 1e6;
  };

  // ---- popup: slash commands + mentions (folding match on display name and username) ----
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const COMMANDS = [
    { w: 'binhchon', alt: 'poll', icon: 'check-square', args: 'câu hỏi | lựa chọn | …', d: 'Mở bảng tạo bình chọn' },
    { w: 'lich', alt: 'calendar', icon: 'calendar', args: staff ? '[25/12 20:00 tên]' : '', d: staff ? 'Xem lịch, hoặc mở bảng tạo sự kiện' : 'Mở lịch sự kiện của nhóm' },
    { w: 'giaohuu', alt: 'challenge', icon: 'handshake', args: '@tên [luật] [giờ]', d: 'Mời một thành viên đánh giao hữu' },
    ...(staff ? [{ w: 'ghim', alt: 'pin', icon: 'megaphone', args: 'nội dung', d: 'Ghim thông báo cho cả nhóm' }] : []),
  ];
  let hints = [], active = 0;
  function hideHints() { hints = []; $('cb-chat-hints').hidden = true; $('cb-chat-input').setAttribute('aria-expanded', 'false'); $('cb-chat-input').removeAttribute('aria-activedescendant'); }
  function markMatch(name, q) {
    if (!q) return esc(name);
    const f = fold(name);
    const at = f.split(' ').reduce((acc, w, i, arr) => acc >= 0 ? acc : (w.startsWith(q) ? arr.slice(0, i).join(' ').length + (i ? 1 : 0) : -1), -1);
    return at < 0 ? esc(name) : esc(name.slice(0, at)) + '<mark>' + esc(name.slice(at, at + q.length)) + '</mark>' + esc(name.slice(at + q.length));
  }
  function renderHints() {
    const input = $('cb-chat-input');
    const v = input.value, caret = input.selectionStart ?? v.length;
    const slash = /^\/([A-Za-z]*)$/.exec(v);
    const at = /(?:^|[^A-Za-z0-9_@])@([^\s@]*)$/.exec(v.slice(0, caret));
    const box = $('cb-chat-hints');
    if (slash && !editing) {
      const q = slash[1].toLowerCase();
      hints = COMMANDS.filter((c) => c.w.startsWith(q) || c.alt.startsWith(q));
      box.setAttribute('aria-label', 'Lệnh');
      box.innerHTML = `<div class="cb-hints__head" aria-hidden="true"><span>Lệnh</span><span>↑↓ chọn, Enter dùng</span></div>` + hints.map((c, i) => `<div class="cb-hint" role="option" id="h${i}" aria-selected="${i === active}"><span class="cb-hint__tile">${ico(c.icon)}</span><span class="cb-hint__main"><span class="cb-hint__t">/${c.w}<code>${esc(c.args)}</code></span><span class="cb-hint__d"><span>${c.d}</span></span></span><small class="cb-hint__d">/${c.alt}</small></div>`).join('');
    } else if (at) {
      const q = fold(at[1]);
      const groups = [['officers', 'Ban quản trị', 'Báo cho chủ nhiệm và phó nhóm']].concat(staff ? [['all', 'Tất cả thành viên', 'Báo cho cả nhóm']] : []);
      const people = Object.entries(PEOPLE).filter(([u, p]) => !p.me && (u.startsWith(q) || fold(p.name).split(' ').some((w) => w.startsWith(q))));
      hints = people.slice(0, 8).map(([u, p]) => ({ u, p, q })).concat(groups.filter(([u, n]) => u.startsWith(q) || fold(n).split(' ').some((w) => w.startsWith(q))).map(([u, n, d]) => ({ u, group: n, d })));
      box.setAttribute('aria-label', 'Gợi ý thành viên');
      box.innerHTML = `<div class="cb-hints__head" aria-hidden="true"><span>Thành viên</span><span>${hints.length} gợi ý</span></div>` + hints.map((h, i) => h.group
        ? `<div class="cb-hint" role="option" id="h${i}" aria-selected="${i === active}"><span class="cb-hint__tile">${ico('users-three')}</span><span class="cb-hint__main"><span class="cb-hint__t">${esc(h.group)}</span><span class="cb-hint__d"><span>@${h.u}</span><span>${h.d}</span></span></span></div>`
        : `<div class="cb-hint" role="option" id="h${i}" aria-selected="${i === active}"><span class="pav${h.p.c ? ' pav--c-' + h.p.c : ''}">${h.p.av}</span><span class="cb-hint__main"><span class="cb-hint__t"><span>${markMatch(h.p.name, h.q)}</span></span><span class="cb-hint__d"><span>@${h.u}</span></span></span>${h.p.role ? `<span class="cl-role">${h.p.role === 'owner' ? 'Chủ nhiệm' : 'Phó nhóm'}</span>` : ''}</div>`).join('');
      hints.forEach((h) => { h.start = caret - at[1].length - 1; });
    } else { hideHints(); return; }
    if (!hints.length) { hideHints(); return; }
    active = Math.min(active, hints.length - 1);
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', 'h' + active);
    // M2: never taller than the room between the channel header and the input (keyboard-aware: the layout
    // already ends at the visual viewport), keeping ~96px of messages visible; at most 4 rows on a phone.
    const boxTop = document.querySelector('.cl-compose__box').getBoundingClientRect().top;
    const headBottom = document.querySelector('.cl-head').getBoundingClientRect().bottom;
    const free = boxTop - headBottom - $('cb-editbar').offsetHeight - 96;
    box.style.setProperty('--cb-hint-max', Math.max(120, Math.min(free, phone() ? 4 * 52 + 34 : 340)) + 'px');
    box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) {
    const h = hints[i], input = $('cb-chat-input');
    if (!h) return;
    if (h.w) input.value = '/' + h.w + ' ';
    else input.setRangeText('@' + h.u + ' ', h.start, input.selectionStart, 'end');
    hideHints();
    input.focus();
  }
  $('cb-chat-hints').addEventListener('pointerdown', (ev) => { const o = ev.target.closest('[role=option]'); if (o) { ev.preventDefault(); pick(Number(o.id.slice(1))); } });
  $('cb-chat-input').addEventListener('input', () => { active = 0; renderHints(); });
  $('cb-chat-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !hints.length && editing) { endEdit(); return; }
    if (ev.key === 'ArrowUp' && !hints.length && !ev.target.value) { const mine = [...msgs].reverse().find((m) => PEOPLE[m.by].me && !m.kind); if (mine) { startEdit(mine); ev.preventDefault(); } return; }
    if (!hints.length || ev.isComposing) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + hints.length) % hints.length; renderHints(); }
    else if (ev.key === 'Enter' || ev.key === 'Tab') pick(active);
    else if (ev.key === 'Escape') hideHints();
    else return;
    ev.preventDefault();
  });

  // ---- delete + report dialogs ----
  let target = null;
  function openDelete(m) {
    target = m;
    const mine = PEOPLE[m.by].me;
    $('dlg-delete-h').textContent = mine ? 'Xoá tin nhắn này?' : `Xoá tin nhắn của ${PEOPLE[m.by].name}?`;
    $('dlg-delete-quote').innerHTML = quote(m);
    $('dlg-delete-warn').textContent = mine ? 'Tin nhắn biến mất với mọi người trong nhóm. Không hoàn tác được.' : 'Tin nhắn biến mất với mọi người trong nhóm. Việc xoá được ghi vào nhật-ký của nhóm.';
    $('dlg-delete').showModal();
  }
  $('dlg-delete-ok').onclick = () => { msgs = msgs.filter((m) => m !== target); $('dlg-delete').close(); renderLog(); };
  function openReport(m) { $('dlg-report-quote').innerHTML = quote(m); $('dlg-report').showModal(); }
  $('dlg-report').addEventListener('change', () => { $('report-other').hidden = $('dlg-report').querySelector('input:checked').value !== 'other'; });
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });

  // ---- poll sheet ----
  const MAXO = 6;
  function pollState() {
    const q = $('poll-q').value.trim();
    const opts = [...$('poll-opts').querySelectorAll('input')].map((i) => i.value.trim());
    const errs = opts.map((o, i) => (!o ? 'Nhập nội dung hoặc bỏ lựa chọn này' : opts.findIndex((x) => fold(x) === fold(o)) < i ? `Trùng với lựa chọn ${opts.findIndex((x) => fold(x) === fold(o)) + 1}` : ''));
    return { q, opts, errs };
  }
  function renderPollSheet(showErrors) {
    const { q, opts, errs } = pollState();
    $('poll-q-n').textContent = q.length + '/140';
    $('poll-n').textContent = opts.length + '/' + MAXO;
    [...$('poll-opts').children].forEach((li, i) => {
      li.querySelector('.cb-opt__n').textContent = i + 1;
      const inp = li.querySelector('input');
      inp.setAttribute('aria-label', 'Lựa chọn ' + (i + 1));
      li.querySelector('[data-up]').disabled = i === 0;
      li.querySelector('[data-down]').disabled = i === opts.length - 1;
      li.querySelector('[data-rm]').disabled = opts.length <= 2;
      const err = li.querySelector('.cb-opt__err');
      const e = showErrors || errs[i].startsWith('Trùng') ? errs[i] : '';
      err.hidden = !e;
      err.innerHTML = e ? ico('warning') + e : '';
      inp.setAttribute('aria-invalid', String(!!e));
      if (e) inp.setAttribute('aria-describedby', 'oe' + i); else inp.removeAttribute('aria-describedby');
      err.id = 'oe' + i;
    });
    $('poll-add').disabled = opts.length >= MAXO;
    const bad = errs.map((e, i) => e && (showErrors || e.startsWith('Trùng')) ? i : -1).filter((i) => i >= 0);
    $('poll-summary').hidden = !bad.length;
    $('poll-summary').innerHTML = bad.length ? ico('warning') + `<span>Sửa ${bad.length} lỗi trước khi đăng: ${bad.map((i) => `<a href="#" data-go="${i}">lựa chọn ${i + 1}</a>`).join(', ')}.</span>` : '';
    const shown = opts.map((o, i) => [o || 'Lựa chọn ' + (i + 1), 0]);
    $('poll-preview').innerHTML = `<span class="cb-chat__tile">${ico('check-square')}</span><div class="cb-chat__body"><div class="cb-chat__sys-t">Trúc Mai tạo bình chọn</div><div class="cb-chat__text cb-poll__q">${esc(q || 'Câu hỏi của bạn')}</div>${pollCard({ poll: shown }, true)}</div>`;
  }
  function addOpt(v = '') {
    const li = document.createElement('li');
    li.className = 'cb-opt';
    li.innerHTML = `<span class="cb-opt__n" aria-hidden="true"></span><input class="cb-in" maxlength="50" value="${esc(v)}"><span class="cb-opt__btns"><button type="button" class="cl-ib" data-up aria-label="Đưa lên">${ico('arrow-up')}</button><button type="button" class="cl-ib" data-down aria-label="Đưa xuống">${ico('arrow-down')}</button><button type="button" class="cl-ib" data-rm aria-label="Bỏ lựa chọn">${ico('x')}</button></span><p class="cb-opt__err" hidden></p>`;
    $('poll-opts').append(li);
    return li.querySelector('input');
  }
  $('poll-opts').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const li = b.closest('li');
    if (b.hasAttribute('data-up')) li.previousElementSibling.before(li);
    if (b.hasAttribute('data-down')) li.nextElementSibling.after(li);
    if (b.hasAttribute('data-rm')) li.remove();
    renderPollSheet();
    (b.isConnected && !b.disabled ? b : li.querySelector('input') || $('poll-add')).focus();
  });
  $('poll-opts').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('input')) {
      ev.preventDefault();
      const last = ev.target.closest('li') === $('poll-opts').lastElementChild;
      if (last && $('poll-opts').children.length < MAXO) { addOpt().focus(); renderPollSheet(); } else ev.target.closest('li').nextElementSibling?.querySelector('input').focus();
    }
  });
  $('poll-add').onclick = () => { addOpt().focus(); renderPollSheet(); };
  $('poll-form').oninput = () => renderPollSheet();
  $('poll-form').onsubmit = (ev) => { ev.preventDefault(); renderPollSheet(true); const first = $('poll-opts').querySelector('[aria-invalid="true"]'); if (first) first.focus(); else $('dlg-poll').close(); };
  $('poll-summary').addEventListener('click', (ev) => { const a = ev.target.closest('[data-go]'); if (a) { ev.preventDefault(); $('poll-opts').children[a.dataset.go].querySelector('input').focus(); } });
  function openPoll(q, opts) { $('poll-q').value = q; $('poll-opts').innerHTML = ''; opts.forEach((o) => addOpt(o)); renderPollSheet(); $('dlg-poll').showModal(); }
  $('cb-poll-new').onclick = () => openPoll('', ['', '']);

  // ---- calendar (Vietnam time; today = Thu 26-11-2026) ----
  const TODAY = { y: 2026, m: 11, d: 26 };
  const EVENTS = [
    { y: 2026, m: 11, d: 21, at: '20:00', t: 'Giao hữu cuối tuần', going: 9, past: true },
    { y: 2026, m: 11, d: 26, at: '21:00', t: 'Tập khai cuộc Hoa Nguyệt', going: 4 },
    { y: 2026, m: 11, d: 28, at: '14:00', t: 'Chữa ván cùng Đức Anh', going: 3 },
    { y: 2026, m: 11, d: 28, at: '20:00', t: 'Giao hữu nội bộ', going: 12, mine: true },
    { y: 2026, m: 12, d: 5, at: '19:30', t: 'Giải tháng 12, vòng 1', going: 16 },
  ];
  const WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const wd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let cal = { y: 2026, m: 11, sel: 28 };
  function evRow(e, preview) {
    return `<div class="cb-ev${e.past ? ' is-past' : ''}"><span class="cb-ev__time">${e.at}<small>GMT+7</small></span><div class="cb-ev__body"><div class="cb-ev__t">${esc(e.t)}</div><div class="cb-ev__m"><span>${e.going} người tham gia</span></div>${e.past ? '<span class="cl-count">Đã diễn ra</span>' : `<button type="button" class="pbtn pbtn--sm" aria-pressed="${!!e.mine}"${preview ? ' disabled' : ''}>${e.mine ? ico('check') + 'Đã tham gia' : 'Tham gia'}</button>`}</div></div>`;
  }
  function renderCal(focus) {
    const { y, m } = cal;
    const first = (wd(y, m, 1) + 6) % 7; // Monday-first offset
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const n = i - first + 1;
      const out = n < 1 || n > days;
      const d = out ? (n < 1 ? prevDays + n : n - days) : n;
      const mm = out ? (n < 1 ? m - 1 : m + 1) : m;
      const evs = EVENTS.filter((e) => e.y === y && e.m === mm && e.d === d);
      const isToday = TODAY.y === y && TODAY.m === mm && TODAY.d === d;
      const past = mm < TODAY.m || (mm === TODAY.m && d < TODAY.d);
      const sel = !out && d === cal.sel;
      const label = `${WD[wd(y, mm, d)]}, ${d} tháng ${mm}` + (evs.length ? `, ${evs.length} sự kiện` : '') + (isToday ? ', hôm nay' : '');
      if (i % 7 === 0) cells += '<tr>';
      cells += `<td role="gridcell"><button type="button" class="cb-day${out ? ' is-out' : ''}${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}" data-d="${out ? '' : d}" tabindex="${sel ? 0 : -1}" aria-selected="${sel}" aria-label="${label}">${d}<span class="cb-day__dots">${evs.slice(0, 3).map(() => '<i></i>').join('')}</span></button></td>`;
      if (i % 7 === 6) cells += '</tr>';
    }
    const sel = EVENTS.filter((e) => e.y === y && e.m === m && e.d === cal.sel);
    $('panel-events').innerHTML = `<div class="cb-cal">
      <div class="cb-cal__bar">
        <button type="button" class="cl-ib" id="cal-prev" aria-label="Tháng trước">${ico('caret-left')}</button>
        <h3 class="cb-cal__title" id="cal-title" aria-live="polite">Tháng ${m}, ${y}</h3>
        <button type="button" class="cl-ib" id="cal-next" aria-label="Tháng sau">${ico('caret-right')}</button>
        <button type="button" class="pbtn pbtn--sm" id="cal-today">Hôm nay</button>
        ${staff ? `<button type="button" class="pbtn pbtn--primary pbtn--sm" id="cal-new">${ico('plus-circle')}Tạo sự kiện</button>` : ''}
        <span class="cb-cal__tz">${ico('globe')}Giờ Việt Nam (GMT+7)</span>
      </div>
      <div class="cb-grid"><table role="grid" aria-labelledby="cal-title"><thead><tr>${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d, i) => `<th scope="col"><abbr title="${WD[(i + 1) % 7]}">${d}</abbr></th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>
      <div class="cb-agenda" aria-live="polite"><h3>${WD[wd(y, m, cal.sel)]}, ${cal.sel}/${m}</h3>${sel.length ? sel.map(evRow).join('') : `<p class="cb-empty">Không có sự kiện trong ngày này.${staff ? '' : ''}</p>`}</div>
    </div>`;
    $('cal-prev').onclick = () => { cal = { y: m === 1 ? y - 1 : y, m: m === 1 ? 12 : m - 1, sel: 1 }; renderCal(); };
    $('cal-next').onclick = () => { cal = { y: m === 12 ? y + 1 : y, m: m === 12 ? 1 : m + 1, sel: 1 }; renderCal(); };
    $('cal-today').onclick = () => { cal = { y: TODAY.y, m: TODAY.m, sel: TODAY.d }; renderCal(true); };
    if (staff) $('cal-new').onclick = openEvent;
    if (focus) document.querySelector('.cb-day[tabindex="0"]').focus();
  }
  $('panel-events').addEventListener('click', (ev) => { const b = ev.target.closest('.cb-day[data-d]:not([data-d=""])'); if (b) { cal.sel = Number(b.dataset.d); renderCal(true); } });
  $('panel-events').addEventListener('keydown', (ev) => {
    if (!ev.target.matches('.cb-day')) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (!step) return;
    const days = new Date(Date.UTC(cal.y, cal.m, 0)).getUTCDate();
    cal.sel = Math.min(days, Math.max(1, cal.sel + step));
    renderCal(true);
    ev.preventDefault();
  });

  // ---- event sheet ----
  function openEvent() {
    $('ev-title').value = 'Giao hữu nội bộ';
    $('ev-date').value = '2026-11-28';
    $('ev-time').value = '20:00';
    renderEvent();
    $('dlg-event').showModal();
  }
  function renderEvent() {
    const [y, m, d] = $('ev-date').value.split('-').map(Number);
    const time = $('ev-time').value;
    const dayChips = [['Hôm nay', '2026-11-26'], ['Thứ bảy này', '2026-11-28'], ['Chủ nhật này', '2026-11-29']];
    $('ev-day-chips').innerHTML = dayChips.map(([l, v]) => `<button type="button" class="pchip" data-date="${v}" aria-pressed="${$('ev-date').value === v}">${l}</button>`).join('');
    $('ev-time-chips').innerHTML = ['19:00', '19:30', '20:00', '21:00'].map((v) => `<button type="button" class="pchip" data-time="${v}" aria-pressed="${time === v}">${v}</button>`).join('');
    $('ev-t-n').textContent = $('ev-title').value.length + '/60';
    $('ev-preview').innerHTML = `<h3 class="cl-evday" style="margin:0 0 8px">${y ? WD[wd(y, m, d)] + ', ' + d + '/' + m : 'Chọn ngày'}</h3>` + evRow({ at: time || '--:--', t: $('ev-title').value || 'Tên sự kiện', going: 0 }, true);
  }
  $('event-form').addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-date],[data-time]');
    if (!c) return;
    if (c.dataset.date) $('ev-date').value = c.dataset.date; else $('ev-time').value = c.dataset.time;
    renderEvent();
  });
  $('event-form').oninput = renderEvent;
  $('event-form').onsubmit = (ev) => { ev.preventDefault(); $('dlg-event').close(); };

  // ---- channels ----
  function showChannel(ch) {
    $('ch-chat').classList.toggle('is-on', ch === 'chat');
    $('ch-events').classList.toggle('is-on', ch === 'events');
    $('panel-chat').hidden = ch !== 'chat';
    $('panel-events').hidden = ch !== 'events';
    $('head-icon').innerHTML = ico(ch === 'chat' ? 'chat-circle' : 'calendar');
    $('cb-head-title').textContent = ch === 'chat' ? 'trò-chuyện' : 'sự-kiện';
    $('head-sub').textContent = ch === 'chat' ? 'Nói chuyện chung, hẹn ván, khoe ván hay' : 'Lịch hoạt động của nhóm';
    if (ch === 'events') renderCal();
  }
  $('ch-chat').onclick = () => showChannel('chat');
  $('ch-events').onclick = () => showChannel('events');

  // ---- initial scene ----
  renderLog();
  showChannel(scene === 'calendar' || scene === 'event' ? 'events' : 'chat');
  $('cb-stream').scrollTop = 1e6;
  const rowOf = (id) => document.querySelector(`.cb-chat__msg[data-id="${id}"]`);
  if (scene === 'actions') {
    if (phone()) openSheet(rowOf(103));
    else { openMenu(rowOf(106).querySelector('.cb-tools__more')); document.activeElement.blur(); }
  } else if (scene === 'edit') {
    if (phone()) { document.body.classList.add('mk-has-kbd'); $('mk-kbd').hidden = false; $('cb-app').classList.add('is-kbd'); }
    startEdit(byId(106));
    const input = $('cb-chat-input');
    input.value = 'Ai có link ván đấu tối qua thì gửi @hoa';
    input.setSelectionRange(input.value.length, input.value.length);
    renderHints();
    $('cb-stream').scrollTop = 1e6;
  } else if (scene === 'slash') {
    $('cb-chat-input').value = '/';
    $('cb-chat-input').focus();
    renderHints();
  } else if (scene === 'delete') {
    openDelete(staff ? byId(105) : byId(106));
  } else if (scene === 'report') {
    openReport(byId(105));
  } else if (scene === 'poll') {
    openPoll('Giải tháng 12 đánh thể thức nào?', ['Tự do 5+3', 'Renju 10+5', 'Caro chuẩn 3+2', 'tự do 5+3']);
    $('poll-opts').children[3].querySelector('input').focus();
  } else if (scene === 'event') {
    openEvent();
  } else if (scene === 'calendar' && phone()) {
    document.querySelector('.cb-agenda').scrollIntoView({ block: 'end' });
  }
})();
