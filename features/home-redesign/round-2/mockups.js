'use strict';

(() => {
  const brand = '../../../client/assets/brand/logo-mark.svg';
  const photo = '../../../client/assets/photos/rooms-hero-1280.webp';
  const rooms = [
    { name: 'Bàn tre', host: 'Minh Anh', code: 'K7M', rule: 'Tự do', clock: '45 giây', state: 'Chờ người chơi' },
    { name: 'Caro tối thứ Bảy', host: 'Thanh Lam', code: 'V8Q', rule: 'Caro', clock: 'Tự động', state: 'Đang chơi' },
    { name: 'Chơi một ván nhanh', host: 'Quang Huy', code: 'N4X', rule: 'Tự do', clock: '1+1', state: 'Chờ người chơi' },
  ];
  const sections = [
    ['ranking', 'Xếp hạng'], ['tournament', 'Giải đấu'], ['club', 'Hội nhóm'], ['learn', 'Học'], ['forum', 'Diễn đàn'],
  ];
  const boardStones = [
    [3, 4, 'light'], [4, 10, 'dark'], [5, 6, 'dark'], [5, 7, 'light'], [5, 9, 'light'],
    [6, 5, 'light'], [6, 7, 'dark'], [6, 8, 'light'], [7, 6, 'light'], [7, 7, 'dark'],
    [7, 9, 'dark'], [8, 4, 'dark'], [8, 5, 'light'], [8, 7, 'light'], [8, 8, 'dark'],
    [9, 6, 'dark'], [9, 9, 'light'], [9, 10, 'dark'], [10, 8, 'dark'],
  ];

  function logo() {
    return `<span class="wordmark"><img src="${brand}" alt="">Play3CR</span>`;
  }

  function action(id, label, cls = '') {
    return `<button class="button ${cls}" type="button" data-action="${id}">${label}</button>`;
  }

  function navigation(items = sections) {
    return items.map(([id, label]) => action(id, label, 'nav-link')).join('');
  }

  function top(items = sections.slice(0, 3)) {
    return `<header class="site-top">${logo()}<nav aria-label="Điều hướng">${navigation(items)}</nav>${action('profile', 'Minh', 'profile')}</header>`;
  }

  function explore() {
    return `<nav class="explore" aria-label="Khám phá">${navigation()}</nav>`;
  }

  function board() {
    const point = (x, y) => `left:${x / 14 * 100}%;top:${y / 14 * 100}%`;
    return `<div class="board" aria-hidden="true"><div class="gridlines">
      ${[[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].map(([x, y]) => `<i class="star" style="${point(x, y)}"></i>`).join('')}
      ${boardStones.map(([x, y, color]) => `<i class="stone ${color}" style="${point(x, y)}"></i>`).join('')}
    </div></div>`;
  }

  function metrics() {
    return `<dl class="metrics">
      <div><dt>Đang online</dt><dd>248</dd></div>
      <div><dt>Đang tìm trận</dt><dd>12</dd></div>
      <div><dt>Ván đang chơi</dt><dd>18</dd></div>
    </dl>`;
  }

  function pulse() {
    return `<span class="pulse"><i aria-hidden="true"></i> 248 người online</span>`;
  }

  function play(label = 'Chơi nhanh') {
    return action('play', label + ' <span aria-hidden="true">↗</span>', 'primary');
  }

  function actionRow() {
    return `<div class="actions">${play()} ${action('challenge', 'Thách đấu', 'secondary')}</div>`;
  }

  function settings() {
    return `<div class="settings" aria-label="Tùy chọn tìm trận">${action('play', 'Tự do', 'chip')}${action('play', 'Tự động', 'chip')}${action('play', 'Xếp hạng', 'chip')}</div>`;
  }

  function code(label = 'Vào phòng bằng mã') {
    return `<form class="code">
      <label for="room-code">${label}</label>
      <div><input id="room-code" name="code" type="text" placeholder="VD K7M" aria-label="Mã phòng ba ký tự" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
      <button type="submit" class="button secondary">Vào phòng</button></div>
      <p class="form-error" role="status" hidden></p>
    </form>`;
  }

  function match() {
    return `<div class="match"><div><strong>Minh Anh</strong><span>1.620</span></div><span class="versus">vs</span><div><strong>Quang Huy</strong><span>1.585</span></div></div>`;
  }

  function roomRows() {
    return rooms.map(room => `<div class="room-row">
      <div><strong>${room.name}</strong><small>${room.host} · ${room.rule}</small></div>
      <span>${room.state}</span>${action('room-' + room.code, 'Xem ↗', 'key-link')}
    </div>`).join('');
  }

  const designs = [
    {
      id: 'moc', name: 'Mặt bàn', color: '#427151', summary: 'Chơi nhanh, bàn cờ và hoạt động cùng nằm trong một khung',
      render: () => `${top()}<main class="wrap">
        <div class="moc-hub">
          <div class="split">
            <section class="moc-copy">
              <div><h1>Một ván<br>cho hôm nay.</h1><p class="lede">Chọn luật và tìm người chơi cùng.</p></div>
              <div class="moc-entry">
                ${settings()}${actionRow()}${code()}
              </div>
            </section>
            <aside class="moc-scene" aria-label="Ván đang chơi">
              <div class="moc-art">${board()}<span class="board-caption">THẾ CỜ MẪU</span></div>
              <div class="moc-match">${match()}${action('room-V8Q', 'Xem ván ↗', 'key-link')}</div>
            </aside>
          </div>
          <div class="moc-footer">${metrics()}${explore()}</div>
        </div>
      </main>`,
    },
    {
      id: 'dem', name: 'Câu lạc bộ đêm', color: '#27443d', summary: 'Ván đang chơi nằm dưới lời chào, ngang với khu vào ván',
      render: () => `${top()}<main class="night"><div class="night-image" aria-hidden="true" style="background-image:url('${photo}')"></div>
        <div class="wrap night-inner">
          <div class="night-content"><div class="night-copy"><h1>Hẹn nhau<br>qua bàn cờ.</h1>
            <p class="lede">Chơi xếp hạng hoặc hẹn bạn bè vào một bàn.</p></div>
            <section class="night-card"><h2>Bắt đầu ván</h2>${settings()}${actionRow()}${code()}</section>
            <div class="night-match"><div><p>Ván Caro đang chơi</p>${match()}</div>${action('room-V8Q', 'Xem ván ↗', 'key-link')}</div>
          </div>
          <div class="night-foot">${metrics()}${explore()}</div>
        </div>
      </main>`,
    },
    {
      id: 'arena', name: 'Đấu trường', color: '#a9e753', summary: 'Bảng số liệu ngang và một ván đang diễn ra ở ngay đầu trang',
      render: () => `${top()}<main class="wrap arena"><div class="arena-strip">${metrics()}</div>
        <section class="arena-layout"><div class="arena-play"><h1>Vào trận</h1><p class="lede">Tìm một ván xếp hạng ngay.</p>${settings()}${actionRow()}${code()}</div>
          <div class="arena-live"><div class="live-heading"><span>Đang diễn ra</span><span>VÁN MẪU</span></div>
          ${match()}${board()}${action('room-V8Q', 'Xem ván ↗', 'key-link')}</div></section>
        <section class="arena-rooms"><h2>Phòng đang mở</h2>${roomRows()}</section>${explore()}
      </main>`,
    },
    {
      id: 'bento', name: 'Bento', color: '#785bc9', summary: 'Ô lớn dành cho chơi nhanh, các ô nhỏ cho phòng và thách đấu',
      render: () => `${top()}<main class="wrap bento"><h1>Chào Minh.</h1>${pulse()}
        <div class="tile-grid"><section class="tile tile-play"><div><h2>Tìm ván mới</h2><p>Vào hàng chờ với tùy chọn của bạn.</p>${settings()}${play()}</div>${board()}</section>
        <section class="tile tile-challenge"><h2>Chơi cùng bạn</h2>${action('challenge', 'Thách đấu ↗', 'secondary')}</section>
        <section class="tile tile-room"><h2>Đã có mã?</h2>${code('Mã phòng')}</section>
        <section class="tile tile-live"><h2>Đang diễn ra</h2>${metrics()}</section></div>${explore()}
      </main>`,
    },
    {
      id: 'bao', name: 'Nhật báo', color: '#a33e2f', summary: 'Bố cục tờ báo với cột vào ván và cột lịch giải đấu',
      render: () => `${top()}<main class="wrap broad">
        <div class="masthead"><span>PLAY3CR</span><h1>Bản tin bàn cờ</h1>${pulse()}</div>
        <div class="newspaper"><section class="news-play"><h2>Hôm nay chơi gì?</h2><p class="lede">Một ván tự do, một ván xếp hạng, hay trận hẹn với bạn bè?</p>
        ${settings()}${actionRow()}${code()}</section>
        <section class="news-match"><div class="news-photo" style="background-image:url('${photo}')" role="img" aria-label="Ảnh bàn cờ gỗ minh họa"></div>
        <div class="news-article"><span class="section-tag">GIẢI ĐẤU</span><h2>Cúp cuối tuần</h2><p>20:30 tối nay · 24 kỳ thủ</p>${action('tournament', 'Xem lịch giải ↗', 'key-link')}</div></section></div>
        <div class="news-footer">${metrics()}${explore()}</div>
      </main>`,
    },
    {
      id: 've', name: 'Vé vào ván', color: '#bd5a35', summary: 'Phiếu chơi gom tùy chọn với nút xác nhận, có lối vào phòng ngay bên dưới',
      render: () => `${top()}<main class="wrap tickets">
        <header class="ticket-title">${pulse()}<h1>Vé vào ván</h1><p class="lede">Chọn thông số cho ván tiếp theo.</p></header>
        <section class="ticket" aria-label="Vé chơi nhanh"><div class="ticket-main">
          <div class="ticket-stamp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <h2>Chơi nhanh</h2><dl class="ticket-fields"><div><dt>Luật</dt><dd>${action('play', 'Tự do ▾', 'chip')}</dd></div><div><dt>Thời gian</dt><dd>${action('play', 'Tự động ▾', 'chip')}</dd></div><div><dt>Chế độ</dt><dd>${action('play', 'Xếp hạng ▾', 'chip')}</dd></div></dl>
        </div><div class="ticket-stub"><strong>12</strong><span>đang tìm trận</span>${play('Lấy vé')}${action('challenge', 'Thách đấu', 'key-link')}</div></section>
        <div class="ticket-bottom">${code()}${explore()}</div>
      </main>`,
    },
    {
      id: 'console', name: 'Bàn điều khiển', color: '#4f83ad', summary: 'Bảng chơi, phòng đang mở và ván trực tiếp chung một lưới',
      render: () => `<div class="workspace"><aside class="rail">${logo()}<nav aria-label="Điều hướng"><span class="nav-current">Trang chủ</span>${navigation([['rooms', 'Phòng'], ...sections])}</nav>${action('profile', 'Minh · Elo 1.480', 'profile')}</aside>
        <main class="work-main">
          <div class="work-panels">
            <header class="work-head"><h1>Chào Minh</h1></header>
            <section class="work-play"><h2>Vào ván</h2>${settings()}${actionRow()}${code()}</section>
            <section class="work-rooms"><h2>Phòng đang mở</h2>${roomRows()}</section>
            <section class="work-live">
              <h2>Trực tiếp</h2>${metrics()}
              <div class="work-featured"><h3>Ván Caro đang chơi</h3>${match()}${board()}${action('room-V8Q', 'Xem ván ↗', 'key-link')}</div>
            </section>
          </div>
        </main>
      </div>`,
    },
    {
      id: 'phong', name: 'Bảng phòng', color: '#f4bb55', summary: 'Danh sách phòng dẫn trang, với lối vào bằng mã và nút tìm trận luôn thấy',
      render: () => `${top()}<main class="wrap station">
        <div class="station-head"><div>${pulse()}<h1>Chọn bàn chơi</h1></div><div class="station-actions">${actionRow()}</div></div>
        <section class="station-panel"><div class="station-toolbar">
          <label for="find-room">Tìm phòng<input id="find-room" type="search" placeholder="Tên phòng hoặc mã"></label>${code('Có mã phòng?')}
        </div><table><thead><tr><th scope="col">Phòng</th><th scope="col">Luật</th><th scope="col">Đồng hồ</th><th scope="col">Trạng thái</th><th scope="col">Mã</th></tr></thead>
          <tbody>${rooms.map(room => `<tr data-room="${room.name.toLowerCase()} ${room.code.toLowerCase()}"><th scope="row">${room.name}<small>${room.host}</small></th><td>${room.rule}</td><td>${room.clock}</td><td>${room.state}</td><td>${action('room-' + room.code, room.code + ' ↗', 'key-link')}</td></tr>`).join('')}</tbody></table>
          <p id="no-rooms" hidden>Không tìm thấy phòng trong danh sách mẫu.</p>
        </section>${explore()}
      </main>`,
    },
    {
      id: 'mobile', name: 'Trong tầm tay', color: '#246651', summary: 'Hai thao tác lớn, bố trí ngay dưới ngón tay trên điện thoại',
      render: () => `${top([])}<main class="wrap palm"><div class="palm-heading">${pulse()}<h1>Chơi một ván?</h1>
        <p class="lede">Tìm đối thủ hoặc vào phòng của bạn.</p></div>
        <div class="palm-actions"><section class="palm-play"><h2>Tìm đối thủ</h2><p>Tự do · Tự động · Xếp hạng</p>${play()}</section>
        <section class="palm-room"><h2>Vào phòng</h2>${code('Mã phòng')}</section></div>
        <div class="palm-footer">${action('challenge', 'Thách đấu bạn bè ↗', 'palm-challenge')}${explore()}</div>
      </main>`,
    },
    {
      id: 'poster', name: 'Bản in khổ lớn', color: '#283eca', summary: 'Tiêu đề lớn bên cạnh quân cờ, hàng thao tác chia rõ từng khu',
      render: () => `${top()}<main class="poster"><div class="poster-hero wrap"><div>${pulse()}<h1>Đến lượt<br>bạn đi.</h1></div>
        <div class="poster-art" aria-hidden="true"><div class="poster-grid"></div><i class="disk disk-one"></i><i class="disk disk-two"></i><i class="disk disk-three"></i></div></div>
        <div class="poster-band"><div class="wrap poster-actions">
          <section><h2>Tìm ván</h2>${settings()}${play()}</section>
          <section><h2>Chơi với bạn</h2>${action('challenge', 'Thách đấu ↗', 'secondary')}</section>
          <section><h2>Có mã phòng?</h2>${code('Mã phòng')}</section>
        </div></div><div class="wrap">${explore()}</div>
      </main>`,
    },
  ];

  window.Play3CRMockups = { designs };
  const home = document.querySelector('#home');
  if (!home) return;

  const dialog = document.querySelector('#demo');
  const dialogTitle = document.querySelector('#demo-title');
  const dialogBody = document.querySelector('#demo-body');
  const content = {
    ranking: ['Bảng xếp hạng', '1. Minh Anh · Elo 1.620', '2. Quang Huy · Elo 1.585'],
    tournament: ['Giải đấu', 'Cúp cuối tuần · 20:30 · 24 kỳ thủ'],
    club: ['Hội nhóm', 'Câu lạc bộ Bàn tre · 32 thành viên'],
    learn: ['Học', 'Bài tập hôm nay · Tìm nước đi thắng'],
    forum: ['Diễn đàn', 'Chủ đề: Cách phòng thủ trước ba mở'],
    profile: ['Minh', 'Elo 1.480 · 16 ván đã chơi'],
    rooms: ['Phòng đang mở', ...rooms.map(room => room.name + ' · ' + room.code)],
  };

  function openDemo(title, body) {
    dialogTitle.textContent = title;
    dialogBody.replaceChildren(...body);
    if (!dialog.open) dialog.showModal();
  }

  function paragraphs(lines) {
    return lines.map(text => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    });
  }

  function selectForm(markup) {
    const form = document.createElement('form');
    form.className = 'demo-form';
    form.innerHTML = markup;
    return form;
  }

  function showPlay() {
    const form = selectForm(`<label>Luật<select name="rule"><option>Tự do</option><option>Caro</option></select></label>
      <label>Thời gian<select name="clock"><option>Tự động</option><option>45 giây/nước</option><option>30 giây/nước</option><option>1+1</option></select></label>
      <label>Chế độ<select name="mode"><option>Xếp hạng</option><option>Giao hữu</option></select></label>
      <button type="submit" class="button primary">Tìm trận</button>`);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = [...new FormData(form).values()].join(' · ');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button secondary';
      cancel.textContent = 'Hủy tìm trận';
      cancel.addEventListener('click', () => dialog.close());
      openDemo('Đang tìm trận', [...paragraphs([values, 'Trạng thái mô phỏng']), cancel]);
    });
    openDemo('Chơi nhanh', [form]);
  }

  function showChallenge() {
    const form = selectForm(`<label>Chọn bạn<select name="friend"><option>Minh Anh</option><option>Thanh Lam</option><option>Quang Huy</option></select></label>
      <button type="submit" class="button primary">Gửi lời mời mẫu</button>`);
    form.addEventListener('submit', event => {
      event.preventDefault();
      openDemo('Lời mời mẫu', paragraphs(['Đã chọn ' + new FormData(form).get('friend') + '.']));
    });
    openDemo('Thách đấu', [form]);
  }

  function showRoom(code) {
    const room = rooms.find(entry => entry.code === code);
    openDemo(room?.name ?? 'Vào phòng', paragraphs([room ? room.host + ' · ' + room.state : 'Mã phòng ' + code, 'Thông tin mô phỏng']));
  }

  home.addEventListener('click', event => {
    const id = event.target.closest('[data-action]')?.dataset.action;
    if (id === 'play') showPlay();
    else if (id === 'challenge') showChallenge();
    else if (id?.startsWith('room-')) showRoom(id.slice(5));
    else if (content[id]) openDemo(content[id][0], paragraphs(content[id].slice(1)));
  });

  home.addEventListener('submit', event => {
    if (!event.target.matches('.code')) return;
    event.preventDefault();
    const code = new FormData(event.target).get('code').trim().toUpperCase();
    const error = event.target.querySelector('.form-error');
    error.hidden = /^[A-Z0-9]{3}$/.test(code);
    error.textContent = error.hidden ? '' : 'Nhập mã gồm 3 chữ cái hoặc chữ số.';
    if (error.hidden) showRoom(code);
  });

  home.addEventListener('input', event => {
    if (event.target.matches('#find-room')) {
      const q = event.target.value.trim().toLocaleLowerCase('vi');
      let count = 0;
      for (const row of home.querySelectorAll('tr[data-room]')) {
        row.hidden = !row.dataset.room.includes(q);
        if (!row.hidden) count++;
      }
      home.querySelector('#no-rooms').hidden = count > 0;
    }
    if (event.target.matches('#room-code')) {
      event.target.closest('form').querySelector('.form-error').hidden = true;
    }
  });

  function render() {
    const design = designs.find(option => '#' + option.id === location.hash) ?? designs[0];
    if (dialog.open) dialog.close();
    document.body.dataset.style = design.id;
    document.title = design.name + ' · Play3CR';
    home.innerHTML = design.render();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  render();
})();
