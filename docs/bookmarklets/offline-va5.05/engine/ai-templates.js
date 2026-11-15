/* vA 4.8249 player templates.
   A template is the short build a player made before a B2B-keeping clear
   (a spin or a Quad): up to 8 placements, each with its piece and its exact
   cells, plus the stack surface it was built on. Templates come from the
   player's own games and imported TTR replays; a player may have hundreds.
   The Spin B2B planner gets the templates that fit the current surface and
   the coming pieces (CURRENT / HOLD / NEXT) and prefers their placements.
   Built-in loops (e.g. Mechanical Hearts) are learned the same way from a
   replay that plays them, so their piece order is always a real one. */
(function(root){
 'use strict';
 const KEY='qp-ai-templates-v1',MAX=2500,W=10,SURF=3,MAXSTEPS=8;
 const SHAPES=['t','s','z','l','j','i','o'];
 let store=null;
 function read(){
  if(store)return store;
  try{const raw=JSON.parse(root.localStorage?.getItem(KEY)||'null');store=raw&&Array.isArray(raw.list)?raw:{v:1,list:[],stats:null}}
  catch{store={v:1,list:[],stats:null}}
  return store;
 }
 function write(){try{root.localStorage?.setItem(KEY,JSON.stringify(store))}catch{}}
 // Rules context: All-Spin / Warlock games value spins differently (any spin
 // is attack there), so their templates and style never steer normal games.
 const ctxOf=options=>{const mods=(options?.zenith_mods||[]).map(String);return mods.some(m=>m==='allspin'||m==='allspin_reversed')?'allspin':'normal'};
 const toRows=board=>board.map(row=>row.reduce((m,c,x)=>c!==null&&c!==undefined?m|(1<<x):m,0));
 function cellsOf(fm,type,r,x,y){const d=fm.GetPieceDefinition(type,r);return d?d.data.map(([dx,dy])=>[x+dx-d.dx,y+dy-d.dy]):null}
 // Surface of the touched columns (+-1): the top filled row of that span is the
 // anchor; the signature is the occupancy of SURF rows starting there.
 function anchorOf(rows,lo,hi){const H=rows.length;let mask=0;for(let x=lo;x<=hi;x++)mask|=1<<x;for(let y=0;y<H;y++)if(rows[y]&mask)return y;return H}
 function signature(rows,lo,hi,anchor){let mask=0;for(let x=lo;x<=hi;x++)mask|=1<<x;const out=[];for(let k=0;k<SURF;k++){const y=anchor+k;out.push(y<rows.length?(rows[y]&mask):mask)}return out}
 const keyOf=t=>(t.ctx||'normal')+'#'+t.lo+':'+t.hi+':'+t.sig.join(',')+'|'+t.steps.map(s=>s.t+s.c.map(c=>c.join('.')).join(';')).join('/');
 /* locks: [{type,cells:[[x,y]],pre:rows(before),spin,lines,quad}] in play order.
    Every spin clear / Quad ends a template; it starts after the previous clear. */
 function extract(locks,ctx='normal'){
  const out=[];let start=0;
  for(let i=0;i<locks.length;i++){
   const L=locks[i];if(!L.lines)continue;
   const keep=(L.spin||L.lines===4);
   if(keep){
    const from=Math.max(start,i-MAXSTEPS+1);
    // The build of a spin is local: keep the placements that touch the spin
    // piece's columns (+-2). A narrow surface matches far more boards later.
    let slo=W,shi=-1;for(const [x] of L.cells){slo=Math.min(slo,x);shi=Math.max(shi,x)}
    const near=s=>s===L||s.cells.some(([x])=>x>=slo-2&&x<=shi+2);
    const seq=locks.slice(from,i+1).filter(near).slice(-6);
    let lo=W,hi=-1;for(const s of seq)for(const [x] of s.cells){lo=Math.min(lo,x);hi=Math.max(hi,x)}
    lo=Math.max(0,lo-1);hi=Math.min(W-1,hi+1);
    const pre=seq[0].pre,anchor=anchorOf(pre,lo,hi);
    // Steps after the first that sit under a clear inside the sequence are
    // already shifted; keep only sequences without an inner clear.
    if(!locks.slice(from,i).some(s=>s.lines))out.push({lo,hi,sig:signature(pre,lo,hi,anchor),
     steps:seq.map(s=>({t:s.type,c:s.cells.map(([x,y])=>[x,y-anchor])})),
     kind:(L.spin?(L.type==='t'&&L.spin===2?'T':L.type==='t'?'t':'S'):'Q')+L.lines,uses:1,ctx});
   }
   start=i+1;
  }
  return out;
 }
 function add(templates){
  const s=read(),index=new Map(s.list.map((t,i)=>[keyOf(t),i]));let added=0;
  for(const t of templates){const k=keyOf(t),i=index.get(k);if(i!==undefined)s.list[i].uses=Math.min(99999,(s.list[i].uses||1)+1);else{index.set(k,s.list.length);s.list.push(t);added++}}
  // Keep the most used ones when the store is full.
  if(s.list.length>MAX)s.list=s.list.sort((a,b)=>(b.uses||1)-(a.uses||1)).slice(0,MAX);
  write();return added;
 }
 /* Player style from the same lock stream: how often a B2B clear is a
    low-attack one (single-line spin / mini), and in which columns spins are
    made. Blended into the running totals. */
 function addStats(locks,ctx='normal'){
  const s=read();s.statsBy=s.statsBy||{};const st=s.statsBy[ctx]||{clears:0,low:0,tFull:0,other:0,quad:0,triples:0,cols:Array(W).fill(0)};
  // Chain length when the player breaks B2B on purpose (or not): where they cash the charge.
  st.breaks=st.breaks||[];let chain=0;
  for(const L of locks){if(!L.lines)continue;if(L.spin||L.lines===4)chain++;else{if(chain>4)st.breaks.push(chain);chain=0}}
  if(st.breaks.length>400)st.breaks=st.breaks.slice(-400);
  for(const L of locks){if(!L.lines)continue;if(!(L.spin||L.lines===4))continue;st.clears++;
   if(L.lines===4&&!L.spin)st.quad++;else if(L.type==='t'&&L.spin===2)st.tFull++;else st.other++;
   if(L.spin&&(L.lines===1||L.spin===1&&L.type==='t'))st.low++;if(L.spin&&L.lines>=3)st.triples++;
   if(L.spin){const cx=L.cells.reduce((a,[x])=>a+x,0)/4;st.cols[Math.max(0,Math.min(W-1,Math.round(cx)))]++}}
 s.statsBy[ctx]=st;write();
 }
 function style(ctx='normal'){
  const st=(read().statsBy||{})[ctx];if(!st||st.clears<20)return null;
  const max=Math.max(1,...st.cols);
  const br=(st.breaks||[]).slice().sort((a,b)=>a-b);
  return {cashout:br.length>=3?br[br.length>>1]:null,lowShare:st.low/st.clears,tShare:st.tFull/st.clears,quadShare:st.quad/st.clears,tripleShare:st.triples/st.clears,
   colWeight:st.cols.map(n=>.75+.5*n/max),clears:st.clears};
 }
 /* Templates that fit this board and these pieces, with absolute cells. */
 function match(board,pieces,limit=8,ctx='normal'){
  const s=read();if(!s.list.length)return [];
  const rows=Array.isArray(board[0])?toRows(board):board,H=rows.length;
  const have={};for(const p of pieces){const t=String(p||'').toLowerCase();if(t)have[t]=(have[t]||0)+1}
  const found=[];
  for(const t of s.list){
   if((t.ctx||'normal')!==ctx)continue;
   const anchor=anchorOf(rows,t.lo,t.hi),sig=signature(rows,t.lo,t.hi,anchor);
   if(sig.some((v,i)=>v!==t.sig[i]))continue;
   // Pieces of the build that are already known now (order is left to the planner).
   const need={};for(const st of t.steps)need[st.t]=(need[st.t]||0)+1;
   let fit=0,total=0;for(const k in need){total+=need[k];fit+=Math.min(need[k],have[k]||0)}
   if(fit<Math.min(2,total))continue;
   const steps=t.steps.map(st=>({t:st.t,c:st.c.map(([x,dy])=>[x,dy+anchor])}));
   if(steps.some(st=>st.c.some(([x,y])=>y<0||y>=H||(rows[y]>>x)&1)))continue;
   const attack={T3:6,T2:4,T1:2,S3:2,S2:1,S1:0,t1:0,t2:1,Q4:4}[t.kind]??1;
   found.push({steps,kind:t.kind,uses:t.uses||1,score:Math.log2(1+(t.uses||1))+attack*.6+3*fit/total});
  }
  return found.sort((a,b)=>b.score-a.score).slice(0,limit);
 }
 // Lock stream recorder for a native game (player game or a replay being learned).
 function recorder(game){
  const locks=[];let lastLines=game.state?.stats?.lines||0,prev=null;
  const fm=game.source?.self?.fm,ctx=ctxOf(game.state?.setoptions||game.options);
  game.on('lock','qp-ai-template-lock',function(piece){
   try{
    const st=this.state,type=String(piece.type).toLowerCase();if(!SHAPES.includes(type))return;
    const cells=cellsOf(this.source?.self?.fm||fm,type,piece.r,piece.x,Math.ceil(piece.y));if(!cells)return;
    const rows=toRows(st.board);for(const [x,y] of cells)if(y>=0&&y<rows.length)rows[y]&=~(1<<x);
    const spin=(piece.flags&8)?(this.source?.self?.fm?.IsSpinMini?.()?1:2):0;
    if(prev){prev.lines=(st.stats.lines||0)-lastLines}
    lastLines=st.stats.lines||0;
    prev={type,cells,pre:rows,spin,lines:0};locks.push(prev);
   }catch(error){}
  });
  return {ctx,finish(){if(prev)prev.lines=(game.state?.stats?.lines||0)-lastLines;return locks}};
 }
 function learn(locks,ctx='normal'){const t=extract(locks,ctx);addStats(locks,ctx);return add(t)}
 /* A TTRM (TETRA LEAGUE match) holds every round of both players. Each round
    of the chosen player (default: the match winner) becomes a single-player
    replay and is learned like a TTR. */
 function roundsOf(data,player){
  const rounds=data?.replay?.rounds;if(!Array.isArray(rounds))return null;
  const names=new Set(rounds.flatMap(r=>(r||[]).map(p=>p?.username)).filter(Boolean));
  let who=String(player||'').trim().toLowerCase();
  if(!who)who=String(data.replay.leaderboard?.[0]?.username||[...names][0]||'').toLowerCase();
  if(![...names].some(n=>n.toLowerCase()===who))throw Error('この対戦に「'+player+'」はいません（'+[...names].join(' / ')+'）');
  const out=[];
  for(const round of rounds){const p=(round||[]).find(x=>String(x?.username||'').toLowerCase()===who);
   if(p?.replay?.events)out.push({id:data.id,gamemode:data.gamemode||'league',version:1,users:[{username:p.username}],replay:p.replay})}
  return {player:who,list:out};
 }
 async function importTTR(file,progress,options={}){
  if(!file||file.size>48*1024*1024)throw Error('TTR / TTRMは48MB以下にしてください');
  const data=JSON.parse(await file.text());
  const match=roundsOf(data,options.player);
  if(match){
   let sum={count:0,total:0,templates:0,templateTotal:0,locks:0,rounds:0,player:match.player};
   for(const [i,replay] of match.list.entries()){
    const r=await importReplay(replay,(n,t)=>progress?.(i+n/t,match.list.length));
    sum={...sum,count:sum.count+r.count,total:r.total,templates:sum.templates+r.templates,templateTotal:r.templateTotal,locks:sum.locks+r.locks,rounds:i+1,ctx:r.ctx};
   }
   return sum;
  }
  return importReplay(data,progress);
 }
 async function importReplay(replay,progress){
  root.LocalTTRFormat?.inspect?.(replay);
  if(typeof root.LocalNative?.learnReplay!=='function')throw Error('TTR再生解析を利用できません');
  const spins=[];let rec=null;
  await root.LocalNative.learnReplay(replay,game=>{try{root.LocalSpinLibrary?.attach?.(game,'replay',spins)}catch{}rec=recorder(game)},(n,total)=>progress?.(n,total));
  for(const p of spins)root.LocalSpinLibrary?.add?.(p);
  const locks=rec?rec.finish():[];const ctx=rec?.ctx||ctxOf(replay?.replay?.options||replay?.options);const added=learn(locks,ctx);
  return {count:spins.length,total:root.LocalSpinLibrary?.load?.().length||0,templates:added,templateTotal:read().list.length,locks:locks.length,ctx};
 }
 // The player's own local games teach templates too (BOT games never do).
 function attachPlayer(game){
  if(!game?.on||game._qpTemplateRec)return;
  const rec=recorder(game);game._qpTemplateRec=rec;
  // A BOT may be attached after the start event: decide at the end.
  game.on('end','qp-ai-template-end',()=>{try{if(!game._localLiveBot&&!game._useLocalBotLearning)learn(rec.finish(),rec.ctx)}catch{}});
 }
 const api={extract,add,learn,match,style,importTTR,roundsOf,recorder,attachPlayer,ctxOf,list:()=>read().list.slice(),stats:ctx=>(read().statsBy||{})[ctx||'normal'],clear(){store={v:1,list:[],stats:null};write()}};
 if(typeof module!=='undefined')module.exports=api;
 else{
  root.LocalAITemplates=api;
  root.addEventListener?.('local-game-started',()=>{const game=root.OriginalReplay?.game?.();if(game?.isPlaying?.())attachPlayer(game)});
 }
})(typeof window==='undefined'?globalThis:window);
