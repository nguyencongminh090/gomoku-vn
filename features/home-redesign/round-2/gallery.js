'use strict';

const { designs } = window.Play3CRMockups;
const picker = document.querySelector('#designs');
const stage = document.querySelector('.stage');
const viewport = document.querySelector('.viewport');
const preview = document.querySelector('#preview');
const buttons = designs.map((design, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `<span class="number">${String(index + 1).padStart(2, '0')}</span><span>${design.name}</span><span class="swatch" aria-hidden="true" style="background:${design.color}"></span>`;
  button.addEventListener('click', () => { location.hash = design.id; });
  return button;
});
picker.append(...buttons);

function showDesign() {
  const design = designs.find(option => '#' + option.id === location.hash) ?? designs[0];
  const url = 'preview.html#' + design.id;
  document.querySelector('#design-name').textContent = design.name;
  document.querySelector('#description').textContent = design.summary + ' · Dữ liệu mẫu';
  document.querySelector('#open').href = url;
  preview.title = 'Mockup ' + design.name;
  preview.src = url;
  buttons.forEach((button, index) => {
    button.setAttribute('aria-pressed', String(designs[index] === design));
  });
}

function sizePreview() {
  const width = viewport.clientWidth;
  const minDesktopWidth = 1024;
  if (stage.dataset.device === 'desktop' && width > 0 && width < minDesktopWidth) {
    const scale = width / minDesktopWidth;
    preview.style.width = minDesktopWidth + 'px';
    preview.style.height = Math.ceil(viewport.clientHeight / scale) + 'px';
    preview.style.transform = 'scale(' + scale + ')';
  } else {
    preview.removeAttribute('style');
  }
}

const devices = [...document.querySelectorAll('[data-view]')];
devices.forEach(button => {
  button.addEventListener('click', () => {
    stage.dataset.device = button.dataset.view;
    devices.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    sizePreview();
  });
});

new ResizeObserver(sizePreview).observe(viewport);
window.addEventListener('hashchange', showDesign);
showDesign();
