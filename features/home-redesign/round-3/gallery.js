'use strict';

/**
 * Play3CR Round 3 Gallery Controller:
 * - Switches between 10 new home concepts (14..23)
 * - Viewport tester (1440 / 1280 / 768 / 390 / 320 px) with proportional scaling when wider than host pane
 * - Quick Compare Mode ("So sánh nhanh") with pin/filter and desktop/mobile comparison
 */
document.addEventListener('DOMContentLoaded', () => {
  const designs = window.Play3CRRuntime ? window.Play3CRRuntime.getDesigns() : [];
  if (!designs.length) return;

  const shell = document.getElementById('gal-shell');
  const list = document.getElementById('design-list');
  const stage = document.getElementById('gal-stage');
  const viewportEl = document.getElementById('gal-viewport');
  const iframe = document.getElementById('preview-frame');
  const singleView = document.getElementById('single-view');
  const compareView = document.getElementById('compare-view');
  const compareGrid = document.getElementById('compare-grid');
  const btnPin = document.getElementById('btn-add-compare');
  const pinCountEl = document.getElementById('pin-count');

  const state = {
    mode: 'single', // 'single' | 'compare'
    vp: 1280,
    cmpFilter: 'all', // 'all' | 'pinned'
    pinned: new Set(),
    activeId: designs[0].id,
  };

  // Build sidebar buttons
  const sideButtons = designs.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gal-item';
    b.dataset.id = d.id;
    b.innerHTML = `<span class="gal-item-num">${d.num}</span><span class="gal-item-name">${d.name}</span><span class="gal-item-dot" style="background:${d.color}" aria-hidden="true"></span>`;
    b.addEventListener('click', () => {
      location.hash = d.id;
    });
    return b;
  });
  list.append(...sideButtons);

  function getActiveDesign() {
    const hashId = location.hash.replace(/^#/, '');
    return designs.find((d) => d.id === hashId) || designs[0];
  }

  function updatePinUI() {
    pinCountEl.textContent = String(state.pinned.size);
    const active = getActiveDesign();
    const isPinned = state.pinned.has(active.id);
    btnPin.setAttribute('aria-pressed', String(isPinned));
    btnPin.textContent = isPinned ? '✓ Đã ghim so sánh' : '+ Ghim so sánh';
  }

  function layoutSingleViewport() {
    if (state.mode !== 'single') return;
    const availW = Math.max(260, stage.clientWidth - 20);
    const targetW = state.vp;
    const boxW = Math.min(availW, targetW);
    viewportEl.style.width = boxW + 'px';

    const boxH = viewportEl.clientHeight;
    if (availW < targetW) {
      const scale = availW / targetW;
      iframe.style.width = targetW + 'px';
      iframe.style.height = Math.ceil(boxH / scale) + 'px';
      iframe.style.transform = `scale(${scale})`;
    } else {
      iframe.style.width = targetW + 'px';
      iframe.style.height = boxH + 'px';
      iframe.style.transform = 'none';
    }
  }

  function showActiveDesign() {
    const d = getActiveDesign();
    state.activeId = d.id;
    const url = 'preview.html#' + d.id;
    document.getElementById('cap-num').textContent = d.num;
    document.getElementById('cap-name').textContent = d.name;
    document.getElementById('cap-summary').textContent = d.summary;
    document.getElementById('open-standalone').href = url;
    iframe.title = `${d.num} · ${d.name}`;
    iframe.src = url;
    sideButtons.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.id === d.id));
    });
    updatePinUI();
    layoutSingleViewport();
  }

  function layoutCompareFrames() {
    if (state.mode !== 'compare') return;
    const isMobileVp = state.vp <= 480;
    const targetW = isMobileVp ? state.vp : Math.max(1024, state.vp);
    for (const box of compareGrid.querySelectorAll('.gal-cmp-frame-box')) {
      const fr = box.querySelector('iframe');
      if (!fr) continue;
      if (isMobileVp) {
        box.dataset.mobile = 'true';
        const scale = Math.min(1, (box.clientHeight - 16) / 760);
        fr.style.width = targetW + 'px';
        fr.style.height = Math.ceil((box.clientHeight - 16) / scale) + 'px';
        fr.style.transform = `scale(${scale})`;
        fr.style.transformOrigin = 'top center';
      } else {
        box.dataset.mobile = 'false';
        const scale = box.clientWidth / targetW;
        fr.style.width = targetW + 'px';
        fr.style.height = Math.ceil(box.clientHeight / scale) + 'px';
        fr.style.transform = `scale(${scale})`;
        fr.style.transformOrigin = 'top left';
      }
    }
  }

  function renderCompareGrid() {
    const subset = state.cmpFilter === 'pinned' && state.pinned.size > 0
      ? designs.filter((d) => state.pinned.has(d.id))
      : designs;

    const subText = state.cmpFilter === 'pinned' && state.pinned.size === 0
      ? 'Chưa có mẫu nào được ghim — đang hiển thị cả 10 mẫu để bạn chọn.'
      : `Đang so sánh ${subset.length} mẫu ở chiều rộng ${state.vp <= 480 ? state.vp + 'px (Mobile)' : Math.max(1024, state.vp) + 'px (Desktop)'}.`;
    document.getElementById('cmp-subtitle').textContent = subText;

    compareGrid.replaceChildren(...subset.map((d) => {
      const card = document.createElement('article');
      card.className = 'gal-cmp-card';
      const isPinned = state.pinned.has(d.id);
      card.innerHTML = `
        <div class="gal-cmp-head">
          <div class="gal-cmp-title">
            <span class="gal-cap-num">${d.num}</span>
            <strong>${d.name}</strong>
          </div>
          <div class="gal-cmp-acts">
            <button type="button" data-pin-id="${d.id}" class="${isPinned ? 'is-pinned' : ''}">${isPinned ? 'Đã ghim' : 'Ghim'}</button>
            <button type="button" data-inspect-id="${d.id}">Mở xem →</button>
          </div>
        </div>
        <p class="gal-cmp-desc">${d.summary}</p>
        <div class="gal-cmp-frame-box"><iframe src="preview.html#${d.id}" title="${d.num} · ${d.name}" loading="lazy"></iframe></div>
      `;
      return card;
    }));
    requestAnimationFrame(layoutCompareFrames);
  }

  function setMode(mode) {
    state.mode = mode;
    shell.dataset.mode = mode;
    singleView.hidden = mode !== 'single';
    compareView.hidden = mode !== 'compare';
    document.querySelectorAll('[data-mode]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    if (mode === 'compare') renderCompareGrid();
    else layoutSingleViewport();
  }

  // Event bindings
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  document.querySelectorAll('[data-vp]').forEach((b) => {
    b.addEventListener('click', () => {
      state.vp = Number(b.dataset.vp);
      document.querySelectorAll('[data-vp]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      if (state.mode === 'single') layoutSingleViewport();
      else renderCompareGrid();
    });
  });

  btnPin.addEventListener('click', () => {
    const id = getActiveDesign().id;
    if (state.pinned.has(id)) state.pinned.delete(id);
    else state.pinned.add(id);
    updatePinUI();
  });

  document.querySelectorAll('[data-cmp-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.cmpFilter = b.dataset.cmpFilter;
      document.querySelectorAll('[data-cmp-filter]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderCompareGrid();
    });
  });

  document.getElementById('btn-clear-pins').addEventListener('click', () => {
    state.pinned.clear();
    updatePinUI();
    renderCompareGrid();
  });

  compareGrid.addEventListener('click', (event) => {
    const pinBtn = event.target.closest('[data-pin-id]');
    if (pinBtn) {
      const id = pinBtn.dataset.pinId;
      if (state.pinned.has(id)) state.pinned.delete(id);
      else state.pinned.add(id);
      updatePinUI();
      renderCompareGrid();
      return;
    }
    const inspBtn = event.target.closest('[data-inspect-id]');
    if (inspBtn) {
      location.hash = inspBtn.dataset.inspectId;
      setMode('single');
    }
  });

  // Keyboard Left/Right navigation in Single Mode
  window.addEventListener('keydown', (event) => {
    if (state.mode !== 'single') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const idx = designs.findIndex((d) => d.id === getActiveDesign().id);
    if (event.key === 'ArrowRight') {
      location.hash = designs[(idx + 1) % designs.length].id;
    } else if (event.key === 'ArrowLeft') {
      location.hash = designs[(idx - 1 + designs.length) % designs.length].id;
    }
  });

  new ResizeObserver(() => {
    layoutSingleViewport();
    layoutCompareFrames();
  }).observe(stage);

  window.addEventListener('hashchange', showActiveDesign);
  showActiveDesign();
});
