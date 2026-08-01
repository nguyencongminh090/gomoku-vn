const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  
  console.log('Loading http://localhost:3000/login.html');
  await page.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle0' });
  
  console.log('Done loading login.html. Wait for a second...');
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
