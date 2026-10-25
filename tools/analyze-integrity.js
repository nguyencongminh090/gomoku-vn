'use strict';
// Read-only integrity diagnosis over a sim/real DB: node tools/analyze-integrity.js [db] (default exports/vncaro-sim.db). See features/integrity-calibration/findings.md
const path=require('path').join(__dirname,'..')+'/';
const Database=require(path+'node_modules/better-sqlite3');
const RI=require(path+'server/utils/rating-integrity.js');
const db=new Database(process.argv[2]||path+'exports/vncaro-sim.db',{readonly:true});
const rows=db.prepare('select user_id,opponent_id,game_id,score,rating_before,rating_after,created_at,category from rating_history order by id').all();
const out={};
// A baseline
const base=RI.analyze(rows);
out.baseline={pop:base.population,active:base.activePlayers,hubs:base.hubs.length,players:base.players.length,pairs:base.pairs.length,groups:base.groups.length};
// sensitivity of gain_from_one to MIN_GAMES
const T=RI.THRESHOLDS; const keep={...T};
out.sens={};
for(const mg of [10,15,20,30,40]){T.MIN_GAMES=mg;const r=RI.analyze(rows);out.sens[mg]={active:r.activePlayers,flagged:r.players.length,gain:r.players.filter(p=>p.flags.includes('gain_from_one')).length,narrow:r.players.filter(p=>p.flags.includes('narrow_opponents')).length};}
Object.assign(T,keep);
// B pair Elo-expected z (use one row per game: user_id<opponent_id side)
const exp=(d)=>1/(1+Math.pow(10,-d/400));
const pairs=new Map();
for(const r of rows){ if(r.user_id>=r.opponent_id) continue; if(r.score===0.5) continue;
 const opp=rows; }
// need opponent's rating_before: build index game_id+user -> row
const byGame=new Map(); for(const r of rows){ byGame.set(r.game_id+'|'+r.user_id,r);}
for(const r of rows){ if(r.user_id>=r.opponent_id) continue;
 const o=byGame.get(r.game_id+'|'+r.opponent_id); const ob=o?o.rating_before:r.rating_before;
 const k=r.user_id+'|'+r.opponent_id; let p=pairs.get(k); if(!p){p={a:r.user_id,b:r.opponent_id,n:0,aw:0,bw:0,E:0,V:0,gaps:0,t:[],res:[]};pairs.set(k,p);}
 const pa=exp(r.rating_before-ob); p.n++; if(r.score===1)p.aw++; else if(r.score===0)p.bw++; p.E+=pa; p.V+=pa*(1-pa); p.gaps+=r.rating_before-ob; p.t.push(Date.parse(r.created_at)); p.res.push(r.score);
}
const cand=[...pairs.values()].filter(p=>p.n>=6);
for(const p of cand){ const dec=p.aw+p.bw; p.z=p.V>0?(p.aw+0.5*(p.n-dec)-p.E)/Math.sqrt(p.V):0; p.skew=dec?Math.max(p.aw,p.bw)/dec:0; p.avgGap=p.gaps/p.n; }
out.pairs={tested:cand.length,total:pairs.size,flagged85:cand.filter(p=>p.skew>=.85).length,
 absz3:cand.filter(p=>Math.abs(p.z)>=3).length, absz4:cand.filter(p=>Math.abs(p.z)>=4).length,
 flaggedBoth:cand.filter(p=>p.skew>=.85&&Math.abs(p.z)>=3).length,
 flagged85_butExplained:cand.filter(p=>p.skew>=.85&&Math.abs(p.z)<2).length};
// Bonferroni: z>=sqrt(2)*erfinv... approx |z|>=4.0 for ~1000 tests
const top=cand.filter(p=>Math.abs(p.z)>=3).sort((x,y)=>Math.abs(y.z)-Math.abs(x.z));
out.topPairs=top.slice(0,20).map(p=>({a:p.a.slice(0,6),b:p.b.slice(0,6),n:p.n,aw:p.aw,bw:p.bw,E:+p.E.toFixed(2),z:+p.z.toFixed(1),gap:Math.round(p.avgGap)}));
// upset direction: dominant side is lower-rated
const upset=cand.filter(p=>p.skew>=.85&&((p.aw>p.bw&&p.avgGap<-0)||(p.bw>p.aw&&p.avgGap>0)));
out.upset85=upset.length; out.upsetZ3=upset.filter(p=>Math.abs(p.z)>=3).length;
out.upsetList=upset.sort((x,y)=>Math.abs(y.z)-Math.abs(x.z)).slice(0,15).map(p=>({a:p.a.slice(0,6),b:p.b.slice(0,6),n:p.n,aw:p.aw,bw:p.bw,z:+p.z.toFixed(1),gap:Math.round(p.avgGap)}));
// pair burstiness: >=5 games of pair within 24h
let burst=0;const burstList=[];
for(const p of cand){const t=p.t.sort((x,y)=>x-y);let best=0;for(let i=0,j=0;i<t.length;i++){while(t[i]-t[j]>864e5)j++;best=Math.max(best,i-j+1);} p.burst=best; if(best>=5){burst++;burstList.push(p);}}
out.burst24h5=burst; out.burstAndZ3=burstList.filter(p=>Math.abs(p.z)>=3).length;
// alternation (win-trading): in pair with n>=6 decisive, fraction of consecutive results that flip while not near 50/50 ... count pairs where both sides win >=40% and alternating run-length avg ~1
let altn=0;
for(const p of cand){const r=p.res.filter(x=>x!==.5);if(r.length<8)continue;let flips=0;for(let i=1;i<r.length;i++)if(r[i]!==r[i-1])flips++;const f=flips/(r.length-1);const w=r.filter(x=>x===1).length/r.length;if(f>=0.85&&w>=.35&&w<=.65)altn++;}
out.alternating=altn;
// C permutation test for gain_from_one flagged
const players=new Map();for(const r of rows){let a=players.get(r.user_id);if(!a)players.set(r.user_id,a=[]);a.push(r);}
let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const gf=base.players.filter(p=>p.flags.includes('gain_from_one'));
let sig=0;const gfRes=[];
for(const f of gf){const g=players.get(f.userId);const gains=g.map(r=>Math.max(0,r.rating_after-r.rating_before));const opps=g.map(r=>r.opponent_id);
 const share=(o)=>{const m=new Map();let tot=0;for(let i=0;i<o.length;i++){m.set(o[i],(m.get(o[i])||0)+gains[i]);tot+=gains[i];}let mx=0;for(const v of m.values())mx=Math.max(mx,v);return tot?mx/tot:0;};
 const obs=share(opps);let ge=0;const N=2000;const sh=opps.slice();for(let it=0;it<N;it++){for(let i=sh.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[sh[i],sh[j]]=[sh[j],sh[i]];}if(share(sh)>=obs)ge++;}
 const pv=(ge+1)/(N+1);if(pv<0.01)sig++;gfRes.push({g:f.games,opp:f.uniqueOpponents,share:f.topGainShare,p:+pv.toFixed(3)});}
out.gainFromOne={flagged:gf.length,perm_p_lt_001:sig,p_lt_05:gfRes.filter(x=>x.p<.05).length,medianGames:gfRes.map(x=>x.g).sort((a,b)=>a-b)[Math.floor(gfRes.length/2)],sample:gfRes.slice(0,8)};
// D rating-vs-games: cap bias
const gcount=[...players.values()].map(a=>a.length);out.capHit=gcount.filter(n=>n>=190).length;
console.log(JSON.stringify(out,null,1));
