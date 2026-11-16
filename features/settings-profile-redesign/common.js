// Demo behaviour only: theme from ?mode=, icons, save feedback, bio counter, live preview bindings.
(() => {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.mode = q.get('mode') === 'light' ? 'light' : 'dark';
  document.querySelectorAll('[data-i]').forEach((n) => { n.insertAdjacentHTML('afterbegin', `<svg class="icon" aria-hidden="true"><use href="#ph-regular-${n.dataset.i}"></use></svg>`); });
  const bio = document.getElementById('st-bio'), cnt = document.getElementById('bio-count');
  const upd = () => { if (bio && cnt) cnt.textContent = bio.value.length + '/280'; };
  if (bio) { bio.addEventListener('input', upd); upd(); }
  const save = document.getElementById('st-save');
  if (save) save.addEventListener('click', (e) => {
    e.preventDefault();
    const s = save.querySelector('span'), old = s.textContent;
    save.classList.add('is-done'); s.textContent = 'Đã lưu';
    setTimeout(() => { save.classList.remove('is-done'); s.textContent = old; }, 1800);
  });
  // preview bindings: [data-bind=id] shows value of #id; [data-when=id] visible only when checkbox id is (un)checked
  const bind = () => {
    document.querySelectorAll('[data-bind]').forEach((n) => { const el = document.getElementById(n.dataset.bind); if (el) n.textContent = el.value || n.dataset.empty || ''; });
    document.querySelectorAll('[data-hide-if]').forEach((n) => { const el = document.getElementById(n.dataset.hideIf); n.hidden = !!(el && el.checked); });
    document.querySelectorAll('[data-show-if]').forEach((n) => { const el = document.getElementById(n.dataset.showIf); n.hidden = !(el && el.checked); });
    document.querySelectorAll('[data-aud-out]').forEach((n) => { const r = document.querySelector(`input[name="${n.dataset.audOut}"]:checked`); if (r) n.textContent = r.nextElementSibling.textContent; });
  };
  document.addEventListener('input', bind); document.addEventListener('change', bind); bind();
})();
