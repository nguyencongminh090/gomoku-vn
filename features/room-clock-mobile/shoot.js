// Screenshots of the clock mockups. Usage: node features/room-clock-mobile/shoot.js
const path=require('path');const {chromium}=require('playwright');
const F='file://'+path.join(__dirname,'mockups/index.html');const OUT=path.join(__dirname,'shots');
(async()=>{const b=await chromium.launch({executablePath:process.env.HOME+'/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const p=await b.newPage({viewport:{width:2200,height:1000},deviceScaleFactor:1});const errs=[];p.on('pageerror',e=>errs.push(e.message));
for(const [th,h,hand] of [['light',844,''],['light',844,'1'],['dark',844,''],['light',667,'']]){
 await p.goto(`${F}?theme=${th}&h=${h}&hand=${hand}`);await p.waitForTimeout(200);
 await (await p.$('#gallery')).screenshot({path:`${OUT}/${th}-${h}${hand?'-hand':''}.png`});}
console.log('errors:',errs);await b.close();})();
