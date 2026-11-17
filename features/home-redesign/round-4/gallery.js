'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const concepts = window.Play3CR4Core ? window.Play3CR4Core.getConcepts() : [];
  if (!concepts.length) return;

  const tabsBox = document.getElementById('concept-tabs');
  const stage = document.getElementById('g4-stage');
  const vpBox = document.getElementById('g4-viewport');
  const frame = document.getElementById('g4-frame');
  const singlePane = document.getElementById('single-pane');
  const comparePane = document.getElementById('compare-pane');
  const compareGrid = document.getElementById('compare-grid');

  const state = { mode: 'single', vp: 1440 };

  const tabBtns = concepts.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g4-tab';
    b.dataset.id = c.id;
    b.innerHTML = `<i style="background:${c.accent}" aria-hidden="true"></i><span>${c.label}</span>`;
    b.addEventListener('click', () => { location.hash = c.id; });
    return b;
  });
  tabsBox.append(...tabBtns);

  function getActive() {
    const id = location.hash.replace(/^#/, '');
    return concepts.find((c) => c.id === id) || concepts[0];
  }

  function layoutSingle() {
    if (state.mode !== 'single') return;
    const avail = Math.max(260, stage.clientWidth - 20);
    const target = state.vp;
    vpBox.style.width = Math.min(avail, target) + 'px';
    const h = vpBox.clientHeight;
    if (avail < target) {
      const s = avail / target;
      frame.style.width = target + 'px';
      frame.style.height = Math.ceil(h / s) + 'px';
      frame.style.transform = `scale(${s})`;
    } else {
      frame.style.width = target + 'px';
      frame.style.height = h + 'px';
      frame.style.transform = 'none';
    }
  }

  function showActive() {
    const c = getActive();
    const url = 'preview.html#' + c.id;
    document.getElementById('c-title').textContent = c.label;
    document.getElementById('c-hook').textContent = c.hook;
    document.getElementById('c-open').href = url;
    frame.src = url;
    tabBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
    layoutSingle();
  }

  function layoutCompare() {
    if (state.mode !== 'compare') return;
    const isMob = state.vp <= 480;
    const target = isMob ? state.vp : Math.max(1280, state.vp);
    for (const box of compareGrid.querySelectorAll('.g4-cmp-frame')) {
      const fr = box.querySelector('iframe');
      if (!fr) continue;
      if (isMob) {
        box.dataset.mob = 'true';
        const s = Math.min(1, (box.clientHeight - 16) / 844);
        fr.style.width = target + 'px';
        fr.style.height = Math.ceil((box.clientHeight - 16) / s) + 'px';
        fr.style.transform = `scale(${s})`;
        fr.style.transformOrigin = 'top center';
      } else {
        box.dataset.mob = 'false';
        const s = box.clientWidth / target;
        fr.style.width = target + 'px';
        fr.style.height = Math.ceil(box.clientHeight / s) + 'px';
        fr.style.transform = `scale(${s})`;
        fr.style.transformOrigin = 'top left';
      }
    }
  }

  function renderCompare() {
    compareGrid.replaceChildren(...concepts.map((c) => {
      const card = document.createElement('article');
      card.className = 'g4-cmp-card';
      card.innerHTML = `
        <div class="g4-cmp-head">
          <strong>${c.label}</strong>
          <button type="button" data-open-id="${c.id}">Mở tương tác →</button>
        </div>
        <p class="g4-cmp-desc">${c.hook}</p>
        <div class="g4-cmp-frame"><iframe src="preview.html#${c.id}" title="${c.label}"></iframe></div>
      `;
      return card;
    }));
    requestAnimationFrame(layoutCompare);
  }

  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      singlePane.hidden = state.mode !== 'single';
      comparePane.hidden = state.mode !== 'compare';
      if (state.mode === 'compare') renderCompare();
      else layoutSingle();
    });
  });

  document.querySelectorAll('[data-vp]').forEach((b) => {
    b.addEventListener('click', () => {
      state.vp = Number(b.dataset.vp);
      document.querySelectorAll('[data-vp]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (state.mode === 'single') layoutSingle();
      else renderCompare();
    });
  });

  compareGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-id]');
    if (!btn) return;
    location.hash = btn.dataset.openId;
    document.querySelector('[data-mode="single"]').click();
  });

  new ResizeObserver(() => { layoutSingle(); layoutCompare(); }).observe(stage);
  window.addEventListener('hashchange', showActive);
  showActive();
});
