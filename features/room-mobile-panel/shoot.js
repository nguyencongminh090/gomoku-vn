// Screenshots of the room mobile-panel mockups. Usage: node features/room-mobile-panel/shoot.js
const path=require('path');const {chromium}=require('playwright');
const F='file://'+path.join(__dirname,'mockups/index.html');const OUT=path.join(__dirname,'shots');
(async()=>{const b=await chromium.launch({executablePath:process.env.HOME+'/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const p=await b.newPage({viewport:{width:1800,height:1100},deviceScaleFactor:1});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
const sets={rest:['rest','rest','rest','rest'],open:['sheet:chat','sheet:score','burst','open:chat'],alt:['sheet:score','sheet:chat','sheet:score','open:score'],aud:['aud','aud','aud','aud']};
for(const [theme,h] of [['light',844],['dark',844],['light',667]]){
 await p.goto(`${F}?theme=${theme}&h=${h}`);await p.waitForTimeout(300);
 for(const [k,s] of Object.entries(sets)){ if(h===667&&k!=='rest')continue; await p.evaluate(a=>setAll(a),s);await p.waitForTimeout(k==='open'?700:450);
  const g=await p.$('#gallery');await g.screenshot({path:`${OUT}/${k}-${theme}-${h}.png`});}
}
console.log('errors:',errs);await b.close();})();
