/* Shared fixture + chrome for the rankings mockups. Fields mirror GET /api/rankings (rank, displayName, rating,
   delta7, club, city/country, games, provisional). Anything else is marked "cần API sau" in the mockup. */
(function () {
  const N = [
    ['Sơn Tùng',2104,+38,'Hà Nội Gomoku','Hà Nội',412,0],['Gomoku_VN',2087,+12,'Sài Gòn Caro','TP.HCM',388,0],['Mai Anh',1811,+54,'Hà Nội Gomoku','Đà Nẵng',301,0],
    ['kaito',1795,-21,'Nhật Bản VN','Hải Phòng',276,0],['Linh_99',1702,+9,'Sài Gòn Caro','TP.HCM',250,0],['Tuấn Caro',1684,+61,'Cờ Thủ Huế','Huế',233,0],
    ['Duy Khánh',1610,-14,'Hà Nội Gomoku','Hà Nội',219,0],['thanh.vu',1588,+3,'','Cần Thơ',204,0],['HoàngLong',1540,+27,'Sài Gòn Caro','TP.HCM',198,0],
    ['Bảo Ngọc',1520,-33,'Cờ Thủ Huế','Huế',187,0],['Minh Khoa',1498,+8,'','Đà Nẵng',176,0],['Hà Vy',1471,+19,'Đà Nẵng 5 quân','Đà Nẵng',160,0],
    ['phuoc_nguyen',1455,-6,'','Biên Hòa',152,0],['Thu Trang',1430,+44,'Hà Nội Gomoku','Hà Nội',149,0],['Quang Huy',1412,0,'','Vinh',141,0],
    ['Lan Chi',1397,-18,'Sài Gòn Caro','TP.HCM',133,0],['nam.pro',1380,+5,'','Hải Phòng',127,0],['Đức Anh',1366,+72,'Nhật Bản VN','Hà Nội',120,0],
    ['Yến Nhi',1344,-9,'','Nha Trang',118,0],['bao_an',1320,+2,'','Cần Thơ',22,1],
  ];
  const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const players = N.map((r, i) => ({ rank: i + 1, name: r[0], rating: r[1], d: r[2], club: r[3], city: r[4], games: r[5], prov: !!r[6], h: hue(r[0]) }));
  const me = { rank: 47, name: 'Minh Khoa', rating: 1236, d: +21, club: 'Hà Nội Gomoku', city: 'Hà Nội', games: 64, h: hue('Minh Khoa'), total: 1284 };
  const ini = (n) => n.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const av = (p, s) => `<span class="av" style="--s:${s || 36}px;--h:${p.h}">${ini(p.name)}</span>`;
  const dl = (p) => p.d > 0 ? `<span class="dl up"><i class="tri"></i>${p.d}</span>` : p.d < 0 ? `<span class="dl dn"><i class="tri"></i>${-p.d}</span>` : '<span class="dl">—</span>';
  /* filters chrome: category chips + scope tabs + search + theme toggle (visual only) */
  function chrome(host, opt) {
    opt = opt || {};
    host.innerHTML = `<div class="chips" role="tablist" aria-label="Thể loại"><button class="chip" aria-selected="true">Tự do</button><button class="chip" aria-selected="false">Tiêu chuẩn</button><button class="chip" aria-selected="false">Caro</button></div>
      <div class="scope" role="tablist" aria-label="Phạm vi"><button aria-selected="true">Tất cả</button><button aria-selected="false">Việt Nam</button><button aria-selected="false">Bạn bè</button><button aria-selected="false">CLB của tôi</button></div>
      <label class="search"><input type="search" placeholder="Tìm người chơi" aria-label="Tìm người chơi"></label>`;
    host.querySelectorAll('[role=tablist]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    }));
  }
  function top() {
    const t = document.createElement('header'); t.className = 'mk-top';
    t.innerHTML = '<b class="logo"><i></i>Play3CR</b><nav><a>Trang chủ</a><a>Phòng</a><a>Giải đấu</a><a aria-current="page">Xếp hạng</a><a>Bạn bè</a></nav><button class="mode" aria-label="Đổi sáng/tối">◐</button>';
    document.body.prepend(t);
    t.querySelector('.mode').onclick = () => { const r = document.documentElement; r.dataset.mode = r.dataset.mode === 'light' ? 'dark' : 'light'; };
    const q = new URLSearchParams(location.search).get('mode'); if (q) document.documentElement.dataset.mode = q;
  }
  window.RK = { players, me, av, dl, chrome, top, ini };
})();
