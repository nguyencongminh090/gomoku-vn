const sharp=require(process.cwd()+'/node_modules/sharp');const S=process.argv[2];
(async()=>{for(const c of ['c1','c2','c3']){const names=['1440','1024','1920','pick','search','busy'];const W=760,comps=[];let y=0;
for(let i=0;i<names.length;i+=2){let hmax=0;for(let j=0;j<2;j++){const b=await sharp(`${S}/shots/${c}-${names[i+j]}.png`).resize({width:W}).png().toBuffer();const m=await sharp(b).metadata();hmax=Math.max(hmax,m.height);comps.push({input:b,left:j*(W+8),top:y})}y+=hmax+8}
await sharp({create:{width:W*2+8,height:y,channels:3,background:'#555'}}).composite(comps).jpeg({quality:82}).toFile(`${S}/sheet-${c}.jpg`)}})();
