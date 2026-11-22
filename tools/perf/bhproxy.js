// :3118 -> :3117. SIGUSR2: every connection open right now goes silent forever (data dropped, never closed); new ones pass.
const net = require('net'); let gen = 0;
net.createServer((c) => { const my = gen; const s = net.connect(3117, '127.0.0.1');
  const dead = () => my < gen;
  c.on('data', (d) => { if (!dead()) s.write(d); }); s.on('data', (d) => { if (!dead()) c.write(d); });
  c.on('end', () => { if (!dead()) s.end(); }); s.on('end', () => { if (!dead()) c.end(); });
  c.on('error', () => s.destroy()); s.on('error', () => c.destroy());
}).listen(3118);
process.on('SIGUSR2', () => { gen++; console.log('blackhole at', Date.now()); });
