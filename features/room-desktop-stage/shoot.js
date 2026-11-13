// Screenshots of the room desktop-stage mockups. Usage: node features/room-desktop-stage/shoot.js
const path=require('path');const {chromium}=require('playwright');
const F='file://'+path.join(__dirname,'mockups/index.html');const OUT=path.join(__dirname,'shots');
(async()=>{const b=await chromium.launch({executablePath:process.env.HOME+'/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const errs=[];
for(const [dir,size,theme,state] of [['A','1440x900','light','tab:chat'],['A','1440x900','light','tab:score'],['A','1440x900','dark','mine'],['A','1024x700','light','tab:moves'],
  ['B','1440x900','light','tab:chat'],['B','1440x900','dark','mine'],['B','1440x900','light','aud'],['B','1024x700','light','tab:chat']]){
 const [w,h]=size.split('x').map(Number);const p=await b.newPage({viewport:{width:w+40,height:h+200},deviceScaleFactor:1});
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`${F}?dir=${dir}&size=${size}&theme=${theme}`);await p.waitForTimeout(300);
 await p.evaluate(s=>setState(s),state);await p.waitForTimeout(500);
 await (await p.$('#scr')).screenshot({path:`${OUT}/${dir}-${size}-${theme}-${state.replace(':','-')}.png`});await p.close();}
console.log('errors:',errs);await b.close();})();
