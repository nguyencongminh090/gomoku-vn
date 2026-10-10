/**
 * forum-thread.js — one thread with its replies (#203 7c), page /forum/t/<id>.
 * GET /api/forum/threads/:id?page=; members reply + report; staff (canModerate) delete.
 * Deleted replies keep their slot with a placeholder (the API never sends their body).
 */

'use strict';

(function () {
  const { t, el, errMsg, isMember, when, pager, say, send } = window.Forum;
  const $ = (id) => document.getElementById(id);

  const id = decodeURIComponent((location.pathname.match(/^\/forum\/t\/([^/]+)/) || [])[1] || '');
  let page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1);
  let member = false;
  let data = null;

  const author = (a) => a.displayName;

  /** "Báo cáo" opens an inline reason box under the item; sending closes it. */
  function reportButton(type, targetId, host) {
    const b = el('button', t('forum.report'), 'pbtn pbtn--ghost pbtn--sm');
    b.type = 'button';
    b.addEventListener('click', () => {
      if (host.querySelector('.fm-reportbox')) return;
      const box = el('div', undefined, 'fm-reportbox');
      const input = el('input');
      input.maxLength = 200;
      input.placeholder = t('forum.report_reason');
      input.setAttribute('aria-label', t('forum.report_reason'));
      const go = el('button', t('forum.report_send'), 'pbtn pbtn--primary pbtn--sm');
      go.type = 'button';
      const out = el('p', undefined, 'pz-result');
      out.hidden = true;
      go.addEventListener('click', async () => {
        const r = await send('POST', '/api/forum/report', { type, id: targetId, reason: input.value });
        if (!r.ok) return say(out, errMsg(r.data));
        box.replaceChildren(el('span', t('forum.reported'), 'muted small'));
      });
      box.append(input, go, out);
      host.appendChild(box);
      input.focus();
    });
    return b;
  }

  function staffDelete(type, targetId) {
    const b = el('button', t('forum.delete'), 'pbtn pbtn--ghost pbtn--sm');
    b.type = 'button';
    b.addEventListener('click', async () => {
      if (!window.confirm(t('forum.delete_confirm'))) return;
      const r = await send('DELETE', '/api/forum/' + (type === 'thread' ? 'threads/' : 'posts/') + encodeURIComponent(targetId));
      if (!r.ok) return window.alert(errMsg(r.data));
      if (type === 'thread') location.href = '/forum';
      else load();
    });
    return b;
  }

  function renderPost(p) {
    const box = el('div', undefined, 'fm-post' + (p.deleted ? ' is-deleted' : ''));
    const meta = el('div', undefined, 'fm-meta');
    meta.append(el('b', author(p.author)), el('time', when(p.createdAt), 'muted small'));
    box.appendChild(meta);
    if (p.deleted) {
      box.appendChild(el('p', t('forum.deleted'), 'fm-text'));
      return box;
    }
    box.appendChild(el('p', p.body, 'fm-text'));
    const actions = el('div', undefined, 'pactions');
    if (member) actions.appendChild(reportButton('post', p.id, box));
    if (data.canModerate) actions.appendChild(staffDelete('post', p.id));
    if (actions.childElementCount) box.appendChild(actions);
    return box;
  }

  function render() {
    const th = data.thread;
    document.title = 'Play3CR — ' + (th.deleted ? t('forum.deleted') : th.title);
    $('th-cat').textContent = t('forum.cat_' + th.category);
    $('th-author').textContent = author(th.author);
    $('th-time').textContent = when(th.createdAt);
    $('th-title').textContent = th.deleted ? t('forum.deleted') : th.title;
    $('th-body').textContent = th.body;
    const actions = $('th-actions');
    actions.replaceChildren();
    if (!th.deleted) {
      if (member) actions.appendChild(reportButton('thread', th.id, $('th-actions').parentElement));
      if (data.canModerate) actions.appendChild(staffDelete('thread', th.id));
    }
    $('th-replies-h').textContent = t('forum.replies', { n: th.replyCount });
    $('th-posts').replaceChildren(...data.posts.map(renderPost));
    pager($('th-pager'), data.pagination, (p) => { page = p; load(); });
    $('th-form').hidden = !member || th.deleted;
    $('th-login').hidden = member;
    $('th-login').textContent = t('forum.login_to_post');
  }

  async function load() {
    try {
      const res = await fetch('/api/forum/threads/' + encodeURIComponent(id) + '?page=' + page, { credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        $('th-view').hidden = true;
        $('th-error').hidden = false;
        $('th-error').textContent = errMsg(body);
        return;
      }
      data = body;
      $('th-view').hidden = false;
      render();
    } catch (err) {
      $('th-error').hidden = false;
      $('th-error').textContent = t('forum.error');
    }
  }

  async function submitReply(ev) {
    ev.preventDefault();
    const out = $('th-result');
    say(out, '');
    $('th-submit').disabled = true;
    const r = await send('POST', '/api/forum/threads/' + encodeURIComponent(id) + '/posts', { body: $('th-reply').value });
    $('th-submit').disabled = false;
    if (!r.ok) return say(out, errMsg(r.data));
    $('th-reply').value = '';
    // jump to the last page, where the new reply is
    const total = data.pagination.total + 1;
    page = Math.max(1, Math.ceil(total / data.pagination.limit));
    load();
  }

  async function init() {
    window.PlatformShell.build('learn');
    if (!id) { $('th-error').hidden = false; $('th-error').textContent = t('err.forum_not_found'); return; }
    member = await isMember();
    $('th-form').addEventListener('submit', submitReply);
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
