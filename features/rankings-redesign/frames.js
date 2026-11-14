// Frames of RK17's 5s opening (motion allowed). node features/rankings-redesign/frames.js → shots/rk17-t<ms>-<w>.png
const path = require('path'); const { chromium } = require('playwright');
const DIR = __dirname, T = [400, 1500, 2600, 3500, 4300, 5200];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  for (const [w, h] of [[1280, 900], [375, 812]]) for (const t of T) {
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'no-preference' });
    await p.goto('file://' + path.join(DIR, 'mockups', 'rk17-podium-board.html'));
    await p.waitForTimeout(t);
    await p.screenshot({ path: path.join(DIR, 'shots', `rk17-t${t}-${w}.png`) });
    if (t === 5200) console.log(w, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'intro', await p.evaluate(() => document.documentElement.classList.contains('intro')));
    await p.close();
  }
  await b.close();
})();
