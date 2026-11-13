/* vA 4.8246 Spin B2B planner (game._aiTSpinB2B, solo / no-attack rooms).
   A small bitboard copy of the native rules, used only to look further
   ahead than the native sandbox can afford: the piece shapes, SRS+ kicks and
   corner table are read from the running engine, and spins follow the
   all-mini+ rule of the client (T: three corners, two in front = full, the
   last kick upgrades; any piece that cannot move after its last rotation =
   mini). The plan is a beam search over CURRENT / HOLD / NEXT. It only
   suggests a first placement; the native sandbox still checks the exact
   keys, the kicks and the spin flag before anything is played. */
(function spinPlannerFactory(root){
 'use strict';
 const W=10,FULL=(1<<W)-1;
 let tables=null,rawTables=null;const tablesBy={},rawBy={};
 // Room rules of the plan being computed: 180 rotations allowed, and whether
 // gravity is so high that every move ends on the floor (no mid-air moves or
 // rotations, as players do not make them there either).
 let mode={allow180:true,slam:false};
 function load(engine,kick='SRS+'){
  if(tablesBy[kick]){tables=tablesBy[kick];return tables}
  if(!engine)return tables;
  const c=engine.cm?.constants,ks=c?.kicksets?.[kick]||c?.kicksets?.['SRS+'];if(!ks||!engine.fm?.GetPieceDefinition)return null;
  const shapes={};
  for(const t of ['t','s','z','l','j','i','o']){shapes[t]=[];for(let r=0;r<4;r++){const d=engine.fm.GetPieceDefinition(t,r);shapes[t].push(d.data.map(([x,y])=>[x-d.dx,y-d.dy]))}}
  rawBy[kick]={shapes,kicks:ks.kicks,ikicks:ks.i_kicks||ks.kicks,corner:c.cornerTable?.t||null};
  tables=tablesBy[kick]=withBits({...rawBy[kick]});
  return tables;
 }
 // rows[y] is a 10-bit mask, y=0 is the top of the 40-row field.
 // Shapes as row masks: legal() is the hot spot of every plan.
 function bitsOf(cells){
  let minx=9,maxx=-9;const byRow=new Map();
  for(const [cx,cy] of cells){minx=Math.min(minx,cx);maxx=Math.max(maxx,cx);byRow.set(cy,(byRow.get(cy)||0)|(1<<(cx+3)))}
  const dy=[...byRow.keys()].sort((a,b)=>b-a);
  return {minx,maxx,n:dy.length,dy:Int8Array.from(dy),m:Int32Array.from(dy.map(k=>byRow.get(k)))};
 }
 function withBits(t){
  t.bits={};for(const k of Object.keys(t.shapes))t.bits[k]=t.shapes[k].map(bitsOf);
  return t;
 }
 function legal(rows,b,x,y){
  if(x+b.minx<0||x+b.maxx>=W)return false;
  const sh=x-3,H=rows.length;
  for(let k=0;k<b.n;k++){const py=y+b.dy[k];if(py>=H)return false;if(py<0)continue;
   if(rows[py]&(sh>=0?b.m[k]<<sh:b.m[k]>>-sh))return false}
  return true;
 }
 function occupied(rows,x,y){return x<0||x>=W||y>=rows.length||(y>=0&&((rows[y]>>x)&1)===1)}
 function spinKind(rows,type,x,y,r,kick){
  const cells=tables.bits[type][r];
  if(legal(rows,cells,x,y+1))return 0;
  const immobile=!legal(rows,cells,x-1,y)&&!legal(rows,cells,x+1,y)&&!legal(rows,cells,x,y-1);
  if(type==='t'&&tables.corner){
   const tab=tables.corner[r];let n=0,front=0;
   for(const o of tab)if(occupied(rows,x+o[0],y+o[1])){n++;if(r===o[2]||r===o[3])front++}
   if(n>=3)return front===2||kick===3?2:1;
  }
  return immobile?1:0;
 }
 /* Every grounded placement, as in LocalAIMoveGen: moves / rotations at the
    spawn height, a drop, then up to three keys from the floor. States are
    small integers and visits are stamped in one typed array (this runs tens
    of thousands of times per plan). */
 const XO=3,YO=4,NX=16,NY=48,stamp=new Uint32Array(4*NY*NX*3*2);let gen=1;
 const sid=(x,y,r,spin,layer)=>((((layer*3+spin)*4+r)*NY+(y+YO))*NX+(x+XO));
 const qx=new Int8Array(8192),qy=new Int8Array(8192),qr=new Int8Array(8192),qt=new Int8Array(8192);
 function placements(rows,type,spawnX=4,spawnY=19,maxTail=3){
  const T=tables,shapes=T.bits[type],out=new Map();
  if(++gen>=0xfffffff0){stamp.fill(0);gen=1}
  const table=type==='i'?T.ikicks:T.kicks;
  let rx=0,ry=0,rr=0,rk=-1;
  const rotate=(x,y,r,dir)=>{
   if(type==='o')return false;
   const nr=(r+dir+4)&3,cells=shapes[nr];
   if(legal(rows,cells,x,y)){rx=x;ry=y;rr=nr;rk=-1;return true}
   const list=table[String(r)+String(nr)]||[];
   for(let k=0;k<list.length;k++){const nx=x+list[k][0],ny=y+list[k][1];if(legal(rows,cells,nx,ny)){rx=nx;ry=ny;rr=nr;rk=k;return true}}
   return false;
  };
  const record=(x,y,r,spin)=>{const id=(r*NY+y+YO)*NX+x+XO;const old=out.get(id);
   if(!old){out.set(id,{x,y,r,spin,plain:!spin});return}
   if(!spin)old.plain=true;else if(spin>old.spin)old.spin=spin};
  if(!legal(rows,shapes[0],spawnX,spawnY))return [];
  // phase 1: spawn height
  let head=0,tail=0;
  if(mode.slam)while(legal(rows,shapes[0],spawnX,spawnY+1))spawnY++;
  qx[tail]=spawnX;qy[tail]=spawnY;qr[tail]=0;tail++;stamp[sid(spawnX,spawnY,0,0,0)]=gen;
  const ground=[];
  while(head<tail){const x=qx[head],y=qy[head],r=qr[head];head++;
   for(let a=0;a<5;a++){let nx,ny,nr;
    if(a===4&&!mode.allow180)continue;
    if(a<2){nx=x+(a?-1:1);ny=y;nr=r;if(!legal(rows,shapes[r],nx,ny))continue;if(mode.slam)while(legal(rows,shapes[r],nx,ny+1))ny++}
    else{if(mode.slam&&legal(rows,shapes[r],x,y+1))continue;if(!rotate(x,y,r,a===2?1:a===3?-1:2))continue;nx=rx;ny=ry;nr=rr}
    if(ny<-YO||ny>=NY-YO||nx<-XO||nx>=NX-XO)continue;
    const id=sid(nx,ny,nr,0,0);if(stamp[id]===gen)continue;stamp[id]=gen;
    qx[tail]=nx;qy[tail]=ny;qr[tail]=nr;tail++;if(tail>=8000)break}}
  // phase 2: drop every spawn-height state
  let gh=0,gt=0;const gx=[],gy=[],gr=[],gtail=[];
  for(let i=0;i<tail;i++){const x=qx[i],r=qr[i],cells=shapes[r];let y=qy[i];while(legal(rows,cells,x,y+1))y++;
   record(x,y,r,0);const id=sid(x,y,r,0,1);if(stamp[id]===gen)continue;stamp[id]=gen;gx.push(x);gy.push(y);gr.push(r);gtail.push(0)}
  // phase 3: up to maxTail keys from the floor
  for(let i=0;i<gx.length&&i<900;i++){const x=gx[i],y=gy[i],r=gr[i],t=gtail[i];if(t>=maxTail)continue;
   for(let a=0;a<6;a++){let nx,ny,nr,spin=0;
    if(a===4&&!mode.allow180)continue;
    if(a===5){if(!legal(rows,shapes[r],x,y+1))continue;nx=x;nr=r;ny=y;while(legal(rows,shapes[r],nx,ny+1))ny++}
    else if(a<2){nx=x+(a?-1:1);ny=y;nr=r;if(!legal(rows,shapes[r],nx,ny))continue;if(mode.slam)while(legal(rows,shapes[r],nx,ny+1))ny++}
    else{if(mode.slam&&legal(rows,shapes[r],x,y+1))continue;if(!rotate(x,y,r,a===2?1:a===3?-1:2))continue;nx=rx;ny=ry;nr=rr;if(!legal(rows,shapes[nr],nx,ny+1))spin=spinKind(rows,type,nx,ny,nr,rk)}
    if(ny<-YO||ny>=NY-YO||nx<-XO||nx>=NX-XO)continue;
    const g=!legal(rows,shapes[nr],nx,ny+1);
    if(g)record(nx,ny,nr,spin);
    const id=sid(nx,ny,nr,spin,1);if(stamp[id]===gen)continue;stamp[id]=gen;
    gx.push(nx);gy.push(ny);gr.push(nr);gtail.push(t+1)}}
  return [...out.values()];
 }
 function place(rows,type,p){
  const next=rows.slice();for(const [cx,cy] of tables.shapes[type][p.r]){const y=p.y+cy;if(y>=0)next[y]|=1<<(p.x+cx)}
  let lines=0;const kept=[];for(let y=0;y<next.length;y++){if(next[y]===FULL)lines++;else kept.push(next[y])}
  while(kept.length<next.length)kept.unshift(0);
  return {rows:kept,lines};
 }
 /* Board value for the chain. Sealed holes (no piece can reach them) are the
    real damage; covered cells a piece can still slide into are spin targets.
    A one-wide open column deeper than two rows is only an I's, never a spin. */
 const EDGE=0b1100000011;
 // Sealed holes (empty, covered, not reachable from the top).
 function sealedCount(rows){let reach=0,above=0,n=0;for(let y=0;y<rows.length;y++){const empty=~rows[y]&FULL;let r=y===0?empty:(reach&empty);for(let k=0;k<W;k++){const m=r|(((r<<1)|(r>>1))&empty);if(m===r)break;r=m}reach=r;for(let b=empty&above&~r;b;b&=b-1)n++;above|=rows[y]}return n}
 function boardValue(rows,P){
  const H=rows.length,heights=new Array(W).fill(0);let reach=0,above=0,sealed=0,tuck=0,tuckReady=0,trap=0,edgeCave=0,tuckSparse=0;
  for(let y=0;y<H;y++){
   const row=rows[y],empty=~row&FULL;
   let r=(y===0?empty:(reach&empty));
   for(let k=0;k<W;k++){const n=r|(((r<<1)|(r>>1))&empty);if(n===r)break;r=n}
   reach=r;
   const covered=empty&above;
   if(covered){let fill=0;for(let b=row;b;b&=b-1)fill++;
    for(let b=covered;b;b&=b-1){const bit=b&-b;if(r&bit){tuck++;if(fill>=8)tuckReady++;
     // An overhang cave at the wall (cols 0-1 / 8-9): only a J / L back spin
     // fills it, so the edge no longer takes a clean Quad later.
     if(bit&EDGE)edgeCave++;
     // An overhang over a sparse row (<7 filled) is no spin slot yet: a 'strange hole'.
     if(fill<7)tuckSparse++}else{sealed++;
     // A sealed hole in an almost full row: no spin can finish that row, so
     // digging to it ends the chain (the 'hole at the bottom right').
     if(fill>=7)trap++}}}
   for(let x=0;x<W;x++)if(!heights[x]&&((row>>x)&1))heights[x]=H-y;
   above|=row;
  }
  let peak=0,bump=0,dead=0,sum=0;
  for(let x=0;x<W;x++){peak=Math.max(peak,heights[x]);sum+=heights[x];if(x)bump+=Math.abs(heights[x]-heights[x-1]);
   const l=x?heights[x-1]:99,rr=x<W-1?heights[x+1]:99,d=Math.min(l,rr)-heights[x];if(d>=3)dead+=d-2}
  // A clean Quad well at the edge: rows full except that column, counted from
  // the well's top down (max 4). Only an I fills it, so it is worth something
  // only while Quads are part of the mix (P.well).
  let well=0;if(P.well){for(const x of [0,W-1]){const bit=1<<x;let n=0;for(let y=H-heights[x]-1;y>=0&&n<4;y--){if((rows[y]|bit)===FULL&&!(rows[y]&bit))n++;else break}
    // rows are counted upward from the well floor
    well=Math.max(well,n)}}
  let bumpSq=0;for(let x=1;x<W;x++){const d=heights[x]-heights[x-1];bumpSq+=d*d}
  // Dig readiness (any column): rows at the bottom full except one column
  // that is open from the top, so an I digs them (garbage is dug by Quads).
  // REN readiness: open rows that are nearly full (8-9 cells, gaps reachable
  // from the top) are fuel for a combo after the dig / surge.
  let ren=0;if(P.ren){let reach2=0;for(let y=0;y<H;y++){const empty=~rows[y]&FULL;let r=y===0?empty:(reach2&empty);for(let k=0;k<W;k++){const m=r|(((r<<1)|(r>>1))&empty);if(m===r)break;r=m}reach2=r;let f=0;for(let b=rows[y];b;b&=b-1)f++;if(f>=8&&f<W&&(empty&~r)===0)ren++}ren=Math.min(6,ren)}
  // Own stack above the garbage (5han: keep it within about 4 lines; 4 lines
  // are enough for T-Spins / mechanical hearts). Garbage = bottom rows with
  // exactly 9 cells, counted up from the floor.
  let ownOver=0;if(P.own){let g=0;for(let y=H-1;y>=0;y--){let f=0;for(let b=rows[y];b;b&=b-1)f++;if(f===W-1)g++;else break}ownOver=Math.max(0,sum/W-g-(P.ownCap||4))}
  let dig=0;if(P.dig){for(let x=0;x<W;x++){const bit=1<<x;let n=0;for(let y=H-heights[x]-1;y>=0&&n<4;y--){if((rows[y]|bit)===FULL&&!(rows[y]&bit))n++;else break}if(n>dig)dig=n}}
  // Garbage holes to dig next (v4.8270, user: keep about 3 groups in mind): own
  // cells stacked in the hole column of the top garbage groups bury the dig.
  let gCover=0;if(P.gHole){const seg=[];let y=H-1;for(;y>=0;y--){const e=~rows[y]&FULL;if(!rows[y]||e&(e-1))break;const c=31-Math.clz32(e);if(!seg.length||seg[seg.length-1]!==c)seg.push(c)}
   if(seg.length){const top=y,wk=[1,.6,.3];for(let k=0;k<3&&k<seg.length;k++){const bit=1<<seg[seg.length-1-k];let n=0;for(let yy=top;yy>=0;yy--)if(rows[yy]&bit)n++;gCover+=wk[k]*Math.min(6,n)}}}
  const tShape=P.tShape?P.tShape*tShapeValue(rows,P.tShapeTable||root.LocalTShapeTable):0;
 return -(P.gHole||0)*gCover+tShape-P.sealed*sealed-P.trap*trap-P.tuck*tuck+P.tuckReady*tuckReady-P.bump*bump-P.bumpSq*bumpSq-P.height*sum/W-P.peak*Math.max(0,peak-P.safePeak)-P.top*Math.max(0,peak-P.topPeak)-P.dead*dead+P.well*well-(P.edgeCave||0)*edgeCave+(P.dig||0)*dig+(P.ren||0)*ren-(P.tuckSparse||0)*tuckSparse-(P.own||0)*ownOver*ownOver;
 }
 /* T-Spin terrain sense (2026-11-13): shape patterns learned from real TL
    replays (the user and 5han), scored by how often a TSD / TST followed within
    a few pieces (tools/ai-sim/tspin-terrain-fit.mjs -> ai-tshape-table.js).
    A key is a 3-wide, 4-tall window anchored on the deepest column of the
    window (one row below its surface, then three above), plus how full the two
    rows around the slot are outside the window, plus an edge flag. */
 function tShapeKeys(rows){
  const H=rows.length,top=new Array(W).fill(H),keys=[];
  for(let x=0;x<W;x++)for(let y=0;y<H;y++)if((rows[y]>>x)&1){top[x]=y;break}
  const occ=(x,y)=>y>=H?1:y<0?0:(rows[y]>>x)&1;
  for(let x=0;x<=W-3;x++){
   let c=x;for(let d=1;d<3;d++)if(top[x+d]>top[c])c=x+d;
   const y0=top[c]-1;let bits=0,k=0;
   for(let r=1;r>=-2;r--)for(let dx=0;dx<3;dx++){if(occ(x+dx,y0+r))bits|=1<<k;k++}
   let key=bits;
   for(const [i,yy] of [[0,y0],[1,y0-1]]){let n=0;if(yy>=0&&yy<H){const m=rows[yy]&~(7<<x)&FULL;for(let b=m;b;b&=b-1)n++}key|=(n>=7?2:n>=5?1:0)<<(12+2*i)}
   keys.push(key|((x===0||x===W-3)?1:0)<<16);
  }
  return keys;
 }
 function tShapeValue(rows,table){
  if(!table)return 0;let m=-Infinity;const ks=tShapeKeys(rows),v=new Array(ks.length);
  for(let i=0;i<ks.length;i++){v[i]=table[ks[i]]||0;if(v[i]>m)m=v[i]}
  let z=0;for(const a of v)z+=Math.exp(a-m);return m+Math.log(z)-Math.log(ks.length);
 }
 // n garbage rows pushed under the stack; the hole stays where the bottom
 // garbage row has it (TETR.IO keeps a column for a while), else column 0.
 function withGarbage(rows,n,cols,gi){const b=rows[rows.length-1],hole=b&&((~b&FULL)&((~b&FULL)-1))===0&&(~b&FULL)?(~b&FULL):1;
  const out=rows.slice(n);for(let i=0;i<n;i++){const c=cols?.[gi+i];out.push(FULL&~(c!=null?1<<c:hole))}return out}
 /* Hole columns of the garbage waiting, in the order it enters (v4.8270, user: the seed may
    be read so the BOT can dig what it takes). Same steps as TETR.IO's TakeAllDamage with
    the garbage RNG copied: s = {seed, lastColumn, changed, inner, change, timeout, nosame,
    center, width, items:[{amt, column}]}. Cancelling and the cap can shift it a little. */
 function predictHoles(s){
  let seed=s.seed%2147483647;if(seed<=0)seed=(seed+2147483646)||1;
  const rnd=()=>(seed=16807*seed%2147483647,(seed-1)/2147483646),width=s.width||W;
  let last=s.lastColumn??null,changed=!!s.changed;const out=[];
  const reroll=()=>{const cb=s.center?Math.round(W/5):0;let n;if(s.nosame&&last!==null){n=cb+Math.floor(rnd()*(width-1-2*cb));if(n>=last)n++}else n=cb+Math.floor(rnd()*(width-2*cb));return last=n};
  if(s.timeout&&!changed){reroll();changed=true}
  for(const it of s.items||[])for(let a=it.amt;a>0&&out.length<40;a--){
   let c=last;if(it.column!=null)c=it.column;else if(last===null||rnd()<(s.inner||0)){if(!changed){c=reroll();changed=true}}
   out.push(c==null?0:c);changed=false;
   if(a===1&&rnd()<(s.change||0)){reroll();changed=true}}
  return out;
 }
 function tPotential(rows,P){
  let best=0;
  for(const p of placements(rows,'t',4,19,2)){if(!p.spin)continue;
   const r=place(rows,'t',p).lines;best=Math.max(best,p.spin===2?(r>=3?P.tstReady:r>=2?P.tsdReady:r?P.tssReady:P.slotReady):P.miniReady*r)}
  return best;
 }
 // TETR.IO attack of one clear (no combo): spin kind 2 = full T-Spin, 1 = mini.
 // combo: the clear's place in an unbroken run of clearing pieces (1 = first).
 // Client: x(1 + 0.25(combo-1)); from combo 3 never below log1p(1.25(combo-1)).
 function attackOf(type,spin,lines,b2bBefore,combo=1){
  if(!lines)return 0;let a;
  if(spin===2&&type==='t')a=[0,2,4,6][Math.min(3,lines)];
  else if(spin)a=[0,0,1,2][Math.min(3,lines)];
  else a=[0,0,1,2,4][Math.min(4,lines)];
  if(b2bBefore>0&&(spin||lines===4))a+=1;
  if(combo>1){a*=1+.25*(combo-1);if(combo>2)a=Math.max(Math.log1p(1.25*(combo-1)),a)}
  return a;
 }
 const DEFAULTS={width:24,sealed:9,tuck:1.5,tuckReady:1,bump:.8,bumpSq:.3,height:2,peak:4,safePeak:8,top:12,topPeak:12,dead:1.5,tsdReady:16,tstReady:30,tssReady:3,slotReady:1.5,miniReady:1.2,
  tFull:[0,16,38,52],tMini:[0,1,3,4],mini:[0,1,8,14],quad:14,breakClear:-30,dangerPeak:15,depthDecay:.97,zeroSpin:-1.5,wastedT:7,tPotK:3,perFirst:3,breakPerB2B:0,breakDangerPerB2B:0,outlook:5,outlookCap:4,well:2,tMiniWasted:true,comboCashAt:3,comboCashMin:8,comboScale:.25,cancelLoss:1,atkOther:1,combo:true,trap:4,atk:2,charging:false,chargeAt:4,chargeBase:3,cashout:Infinity,incoming:0,cancelW:0,tpl:10,colWeight:[.8,.86,.95,1,1,1,1,.95,.86,.8]};
 /* create(engine,state,options) → a time-sliced planner: step(ms) runs for
    about ms and returns true when done; result() is the first placement of
    the best line {x,y,r,type,hold,spin,value}, or null. A whole plan costs
    10-30 ms, so the live BOT spreads it over frames instead of stalling one.
    state: {board,falling,hold,queue,holdAllowed,b2b}. */
 function* search(state,P,out={}){
  const H=state.board.length,rows=new Array(H);
  for(let y=0;y<H;y++){let m=0;for(let x=0;x<W;x++)if(state.board[y][x]!==null)m|=1<<x;rows[y]=m}
  const queue=(state.queue||[]).map(t=>String(t).toLowerCase()).filter(t=>tables.shapes[t]);
  const start={combo:Math.max(0,Number(state.combo)||0),incoming:Math.max(0,Number(P.incoming)||0),rows,cur:String(state.falling).toLowerCase(),hold:state.hold?String(state.hold).toLowerCase():null,qi:0,acc:0,first:null,b2b:state.b2b||0,spins:0};
  if(!tables.shapes[start.cur])return null;
  // Player templates that fit this board: their placements (exact cells) are
  // preferred while the build is in progress (until the first clear).
  const tpl=new Map();
  for(const t of P.templates||[])for(const st of t.steps){const k=st.t+'|'+st.c.map(c=>c[0]+','+c[1]).sort().join(';');tpl.set(k,Math.max(tpl.get(k)||0,P.tpl*(1+Math.min(1,(t.score||0)/10))))}
  const colW=P.colWeight||null;
  let beam=[start],best=null,leaves=[];const depth=Math.min(P.maxDepth||7,1+queue.length);
  for(let d=0;d<depth;d++){
   const children=[],seen=new Set();
   for(const node of beam){
    const options=[[node.cur,node.hold,node.qi,false]];
    if(state.holdAllowed!==false){
     if(node.hold&&node.hold!==node.cur)options.push([node.hold,node.cur,node.qi,true]);
     else if(!node.hold&&node.qi<queue.length)options.push([queue[node.qi],node.cur,node.qi+1,true]);
    }
    let heightBefore=0;for(let y=0;y<H;y++)if(node.rows[y]){heightBefore=H-y;break}
    // Garbage still coming counts as height already there.
    // Only half of it: spins cancel too, so waiting garbage alone must not
    // turn the plan into breaking the chain and digging.
    // P.threat: attack the opponent can fire soon (their B2B charge, a ready spin):
    // taking garbage now must leave room for that too, a cancel can be dodged.
    const danger=heightBefore+.5*(node.incoming||0)+.5*(P.threat||0)>=P.dangerPeak;
    for(const [type,hold,qi,held] of options){
     for(const p of placements(node.rows,type)){
      const res=place(node.rows,type,p);
      let gain=0,b2b=node.b2b,tplOff=node.tplOff,inc=node.incoming||0,gi=node.gi||0,pendS=node.pendS||0,pendR=node.pendR||0;
      if(tpl.size&&!tplOff){const cells=tables.shapes[type][p.r];const k=type+'|'+cells.map(([cx,cy])=>(p.x+cx)+','+(p.y+cy)).sort().join(';');const v=tpl.get(k);if(v)gain+=v}
      if(res.lines){
       const combo=(node.combo||0)+1;
       // A chain broken earlier in this line pays off once the combo it opened
       // reaches comboCashAt: its charge counts and the break is forgiven.
       if(pendS&&combo>=P.comboCashAt){gain+=pendS+pendR;pendS=pendR=0}
       let atk=attackOf(type,p.spin,res.lines,node.b2b,P.combo?combo:1);
       // B2B charge (QP / TL): breaking a chain longer than chargeAt sends
       // (b2b - chargeAt + chargeBase) at once.
       const breaking=!p.spin&&res.lines<4;
       const surge=breaking&&P.charging&&node.b2b>P.chargeAt?node.b2b-P.chargeAt+P.chargeBase:0;
       // The surge only counts where cashing the chain is wanted; otherwise
       // a long chain would always look like a reason to break it.
       const cashOk=surge>0&&(node.b2b>=P.cashout||danger||(node.incoming||0)>0&&P.cancelW>=4);
       if(cashOk)atk+=surge;
       // Attack that is not a full T-Spin can count for less (T-Spin style).
       gain+=P.atk*atk*(type==='t'&&p.spin===2?1:P.atkOther);
       // Garbage waiting is cancelled first (automatic in TETR.IO). With little
       // room that is the point; with room it only spends attack that would
       // otherwise be sent (and in QP climb), so take the garbage instead.
       // Take or cancel by height: low board -> take it and keep the attack;
       // a board that would not survive the garbage -> cancel (P.takeMax rows).
       if(inc>0){const c=Math.min(inc,atk);if(P.cancelW>0)gain+=P.cancelW*c;else if(P.takeMax&&heightBefore+inc+(P.threat||0)>P.takeMax)gain+=(P.cancelHi||4)*c;else gain-=P.atk*P.cancelLoss*c;inc-=c;gi+=c}
       if(p.spin){let g=(type==='t'?(p.spin===2?P.tFull:P.tMini):P.mini)[Math.min(3,res.lines)];
        // Where the player makes spins (centre / edge), from their own data.
        if(colW&&g>0){const cells=tables.shapes[type][p.r];const cx=Math.round(cells.reduce((a,[x])=>a+x,0)/4+p.x);g*=colW[Math.max(0,Math.min(W-1,cx))]}
        // The combo multiplier also scales the finisher: a spin after a run of
        // clears is worth more than the same spin fired at once.
        if(P.comboScale&&combo>1&&g>0)g*=1+P.comboScale*(combo-1);
        // Donation: a T-Spin over a hole is fine only if the hole is still
        // open after it; one that leaves it sealed buries the dig for good.
        if(P.donateSeal&&type==='t'){const d=sealedCount(res.rows)-sealedCount(node.rows);if(d>0)g-=P.donateSeal*d}
        gain+=g;b2b++}
       else if(res.lines===4){gain+=(danger?6:P.quad)*(P.comboScale&&combo>1?1+P.comboScale*(combo-1):1);b2b++}
       // Breaking is fine near top-out, under attack when the surge is needed,
       // or once the chain is as long as the player usually cashes it in.
       else{const pen=danger||cashOk?-2:P.breakClear-P.breakPerB2B*Math.min(60,node.b2b);gain+=pen;
        // Break -> combo -> finisher: keep the charge pending; it is paid only
        // if the clears keep coming (see above), never for a lone break.
        if(!danger&&!cashOk&&surge>0&&node.b2b>=P.comboCashMin){pendS=P.atk*surge;pendR=-pen}
        b2b=0}
       if(res.rows.every(v=>v===0))gain+=12;
       tplOff=true;
      }else{pendS=pendR=0;if(p.spin&&!p.plain)gain+=P.zeroSpin}
      // A piece that clears nothing lets the waiting garbage in.
      // v4.8270: the garbage really rises under the stack (it used to vanish,
      // so taking garbage looked free and a second batch topped the BOT out).
      // Surviving (v4.8270, user: unless there is really none, pick pieces that keep
      // clearing): while the waiting garbage would not fit, a clear holds it out
      // (TETR.IO lets garbage in only on a lock that clears nothing), so a piece
      // that clears nothing is bad and a run of clears is good.
      if(P.surviveNoClear&&(node.incoming||0)>0&&heightBefore+(node.incoming||0)+(P.threat||0)>(P.takeMax||14)){
       if(res.lines)gain+=(P.surviveCombo||0)*Math.min(6,(node.combo||0)+1);else gain-=P.surviveNoClear}
      let rowsOut=res.rows;
      if(!res.lines&&inc>0&&P.cancelW===0){const k=Math.min(inc,H,P.garbageCap||inc);rowsOut=withGarbage(res.rows,k,P.garbageHoles,gi);inc-=k;gi+=k;
       let h=0;for(let y=0;y<H;y++)if(rowsOut[y]){h=H-y;break}
       if(h>=(P.topOut||20))gain-=P.topOutPen??1000}
      if(type==='t'&&!(p.spin&&res.lines&&(p.spin===2||!P.tMiniWasted))&&!danger)gain-=P.wastedT;
      const nextCur=qi<queue.length?queue[qi]:null;
      // Transpositions (same board, same HOLD / next piece) waste the beam.
      let hash=hold?hold.charCodeAt(0):1;for(let y=0;y<H;y++)hash=Math.imul(hash,31)+rowsOut[y]|0;
      const acc=node.acc+gain*Math.pow(P.depthDecay,d),key=hash+':'+(nextCur||'');
      if(seen.has(key))continue;seen.add(key);
      const child={rows:rowsOut,cur:nextCur,hold,qi:qi+1,acc,tplOff,incoming:inc,gi,pendS,pendR,combo:res.lines?(node.combo||0)+1:0,attack:(node.attack||0)+(res.lines?attackOf(type,p.spin,res.lines,node.b2b,P.combo?(node.combo||0)+1:1):0),first:node.first||{x:p.x,y:p.y,r:p.r,hold:held,spin:p.spin,type},b2b,spins:node.spins+(p.spin&&res.lines?1:0)};
      child.value=acc+boardValue(rowsOut,P);
      children.push(child);
     }
     yield;
    }
   }
   if(!children.length)break;
   children.sort((a,b)=>b.value-a.value);
   // T-slot outlook for the best few boards of this depth (a T-move scan per
   // board is too slow for all of them).
   const k=Math.min(children.length,Math.ceil(P.width*P.tPotK));
   // P.reserve: when the opponent's ready attack would push this stack past
   // takeMax, a ready T-spin slot is ammunition to cancel with; value it more.
   for(let i=0;i<k;i++){const c=children[i];let m=1;if(P.reserve&&P.threat){let h=0;for(let y=0;y<H;y++)if(c.rows[y]){h=H-y;break}if(h+P.threat>(P.takeMax||14))m+=P.reserve}
    c.value+=m*tPotential(c.rows,P);if(i%8===7)yield}
   children.length=k;
   children.sort((a,b)=>b.value-a.value);
   // Keep different first moves alive so the beam is not one idea.
   const next=[],firsts=new Map();
   for(const c of children){const f=c.first,id=f.x+','+f.y+','+f.r+','+f.hold;const n=firsts.get(id)||0;if(n>=P.perFirst)continue;firsts.set(id,n+1);next.push(c);if(next.length>=P.width)break}
   best=next[0]||best;leaves=next;if(best)out.best={...best.first,value:best.value,spins:best.spins};
   beam=next.filter(c=>c.cur);
   if(!beam.length)break;
   yield;
  }
  // Outlook of the final boards for pieces nobody has seen yet: how many of
  // the seven shapes would have a line-clearing spin there.
  if(P.outlook>0&&leaves.length){
   for(const c of leaves){let n=0;for(const t of ['s','z','l','j','i','o']){for(const p of placements(c.rows,t,4,19,2)){if(p.spin&&place(c.rows,t,p).lines){n++;break}}}c.value+=P.outlook*Math.min(P.outlookCap,n);yield}
   leaves.sort((a,b)=>b.value-a.value);best=leaves[0];
  }
  return best?{...best.first,value:best.value,spins:best.spins}:null;
 }
 function create(engine,state,options={}){
  const P={...DEFAULTS,...(root.__spinPlannerParams||{}),...options};
  const kick=String(P.kickset||'SRS+'),rules={allow180:P.allow180!==false,slam:!!P.slam};
  if(!load(engine,kick))return null;const myTables=tables;
  const use=()=>{tables=myTables;mode=rules};use();
  const out={},it=search(state,P,out);let done=false,result=null,spent=0;
  return {
   step(ms=4){if(done)return true;use();const t0=performance.now(),end=t0+ms;
    try{while(performance.now()<end){const r=it.next();if(r.done){done=true;result=r.value;break}}}
    catch(error){done=true;result=null}
    spent+=performance.now()-t0;return done},
   result:()=>done?result:(out.best||null),get done(){return done},get spent(){return spent},
   stop(){if(!done){done=true;result=out.best||null}return result},
  };
 }
 function plan(engine,state,options={}){const p=create(engine,state,options);if(!p)return null;while(!p.step(50));return p.result()}
 function setTables(t){rawTables={shapes:t.shapes,kicks:t.kicks,ikicks:t.ikicks,corner:t.corner};tables=withBits({...t})}
 /* An outside engine (vA private builds: Cold Clear 2) names a placement by its
    cells; find the reachable placement with exactly those cells, in planner
    coordinates {x,y,r,spin}. cells: [x,y] with y=0 the top row of state.board. */
 function matchCells(engine,state,type,cells,options={}){
  if(!load(engine,String(options.kickset||'SRS+')))return null;
  const prev=mode;mode={allow180:options.allow180!==false,slam:!!options.slam};
  try{
   const H=state.board.length,rows=new Array(H);
   for(let y=0;y<H;y++){let m=0;for(let x=0;x<W;x++)if(state.board[y][x]!==null&&state.board[y][x]!==undefined)m|=1<<x;rows[y]=m}
   const key=c=>c.map(([x,y])=>x+','+y).sort().join(';'),want=key(cells),sh=tables.shapes[type];
   for(const p of placements(rows,type))if(key(sh[p.r].map(([cx,cy])=>[p.x+cx,p.y+cy]))===want)return {x:p.x,y:p.y,r:p.r,spin:p.spin,type};
   return null;
  }finally{mode=prev}
 }
 /* The same plan in a Web Worker (vA 2026-11-13): the live BOT used to get
    only 1-2 ms a frame while a human played (TL / CUSTOM vs a player), so the
    plan never finished and half-searched moves were played (a real TL: APP
    0.23, 1 TSD in 316 pieces). In a worker the full plan runs beside the
    game without costing the player frames. Same interface as create();
    without Worker support (Node, blocked blob workers) it is create(). */
 // A pool of workers (up to 4, one core left for the game). Each worker runs
 // all its jobs in turn (8 ms each): with one worker that replaced its job, two
 // BOTs cancelled each other's plans and played half-searched moves.
 let workers=null,workerBroken=false,fileBroken=false,jobSeq=0;const jobs=new Map();
 // Worker side (also in engine/ai-plan-worker.js, which loads this file).
 const WORKER_GLUE='const SP=self.LocalSpinPlanner;const jobs=new Map();let running=false,kick=null;'+
    'const ch=new MessageChannel();ch.port1.onmessage=run;const later=()=>ch.port2.postMessage(0);'+
    'self.onmessage=e=>{const m=e.data;if(m.cancel){jobs.delete(m.cancel);return}'+
    'if(m.kick!==kick){SP.setTables(m.tables);kick=m.kick}jobs.set(m.id,{id:m.id,p:SP.create(null,m.state,m.P),last:null});if(!running){running=true;later()}};'+
    'function run(){const it=jobs.values().next();if(it.done){running=false;return}const j=it.value;jobs.delete(j.id);let fin=false;try{fin=j.p.step(8)}catch(err){fin=true}const b=j.p.result();'+
    'if(fin){self.postMessage({id:j.id,done:true,result:b})}else{jobs.set(j.id,j);if(b&&b!==j.last){j.last=b;self.postMessage({id:j.id,best:b})}}later()}';
 root.__spinWorkerGlue=WORKER_GLUE;
 function getWorker(){
  if(workerBroken)return null;
  if(!workers){
   if(typeof Worker==='undefined'||typeof Blob==='undefined'||typeof URL==='undefined'||!URL.createObjectURL){workerBroken=true;return null}
   const glue=';('+String(spinPlannerFactory)+')(self);'+WORKER_GLUE;
   const fileUrl=!fileBroken&&typeof document!=='undefined'&&document.querySelector?.('script[src*="/engine/ai-spin-planner.js"]')?'/engine/ai-plan-worker.js':null;
   try{
    const url=fileUrl||URL.createObjectURL(new Blob([glue],{type:'text/javascript'}));
    const n=Math.max(1,Math.min(4,((typeof navigator!=='undefined'&&navigator.hardwareConcurrency)||2)-1));
    workers=[];
    for(let i=0;i<n;i++){const w=new Worker(url);w.load=0;
     w.onmessage=e=>{const m=e.data,j=jobs.get(m.id);if(!j)return;if(m.done){jobs.delete(m.id);w.load=Math.max(0,w.load-1);j.finish(m.result)}else j.best=m.best};
     // a worker that cannot load: file -> blob -> in-thread plans
     w.onerror=()=>{if(fileUrl&&!fileBroken){fileBroken=true}else workerBroken=true;try{for(const x of workers||[])x.terminate()}catch{}workers=null;for(const j of jobs.values())j.fail();jobs.clear()};
     workers.push(w)}
   }catch(error){workers=null;if(fileUrl&&!fileBroken){fileBroken=true;return getWorker()}workerBroken=true;return null}
  }
  // the least busy worker
  return workers.reduce((a,b)=>b.load<a.load?b:a);
 }
 function createAsync(engine,state,options={}){
  const P={...DEFAULTS,...(root.__spinPlannerParams||{}),...options};
  const kick=String(P.kickset||'SRS+');
  if(!load(engine,kick))return null;
  const raw=rawBy[kick]||rawTables,w=raw&&getWorker();
  // In-thread fallback: the narrower width the caller allows for in-thread plans.
  const syncOpts=options.syncWidth?{...options,width:Math.min(options.width||24,options.syncWidth)}:options;
  if(!w)return create(engine,state,syncOpts);
  const id=++jobSeq,t0=performance.now();let done=false,result=null,fallback=null,spent=0,stoppedEarly=false;
  const job={best:null,finish(r){if(done)return;done=true;result=r;spent=performance.now()-t0},fail(){if(!done)fallback=create(engine,state,syncOpts)}};
  jobs.set(id,job);
  // Options must survive structured clone: plain data only.
  const send={};for(const [k,v] of Object.entries(P))if(typeof v!=='function')send[k]=v;
  if(send.tShape&&!send.tShapeTable&&root.LocalTShapeTable)send.tShapeTable=root.LocalTShapeTable;
  w.load++;
  try{w.postMessage({id,kick:kick+(raw===rawTables?':set':''),tables:raw,state:{board:state.board,falling:state.falling,hold:state.hold,queue:state.queue,holdAllowed:state.holdAllowed,b2b:state.b2b,combo:state.combo},P:send})}
  catch(error){jobs.delete(id);w.load=Math.max(0,w.load-1);return create(engine,state,syncOpts)}
  return {
   get async(){return !fallback},
   step(ms=4){if(fallback)return fallback.step(ms);return done},
   result:()=>fallback?fallback.result():done?result:job.best,
   get done(){return fallback?fallback.done:done},get spent(){return fallback?fallback.spent:spent},
   get stopped(){return stoppedEarly},stop(){if(fallback)return fallback.stop();if(!done){done=true;stoppedEarly=true;result=job.best;if(jobs.delete(id))w.load=Math.max(0,w.load-1);try{w.postMessage({cancel:id})}catch{}}return result},
  };
 }
 const api={attackOf,setTables,create,createAsync,plan,placements,place,boardValue,load,matchCells,tShapeKeys,tShapeValue,predictHoles,DEFAULTS};
 if(typeof module!=='undefined')module.exports=api;else root.LocalSpinPlanner=api;
})(typeof window==='undefined'?globalThis:window);
