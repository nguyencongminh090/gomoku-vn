const play = document.querySelector('[data-play]');
const label = play.querySelector('.label');
const status = document.querySelector('[role="status"]');
play.addEventListener('click', () => {
  const searching = play.getAttribute('aria-pressed') !== 'true';
  play.setAttribute('aria-pressed', String(searching));
  label.textContent = searching ? 'Hủy tìm' : 'Chơi nhanh';
  status.textContent = searching ? 'Đang tìm trận…' : '';
});
document.querySelector('.join').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelector('output').textContent = 'Mã phòng ' + form.elements.code.value.toUpperCase() + ' (bản mẫu)';
});
