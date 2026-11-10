/* vA 4.8246 Spin B2B planner (game._aiTSpinB2B, solo / no-attack rooms).
   A small bitboard copy of the native rules, used only to look further
   ahead than the native sandbox can afford: the piece shapes, SRS+ kicks and
   corner table are read from the running engine, and spins follow the
   all-mini+ rule of the client (T: three corners, two in front = full, the
   last kick upgrades; any piece that cannot move after its last rotation =
   mini). The plan is a beam search over CURRENT / HOLD / NEXT. It only
   suggests a first placement; the native sandbox still checks the exact
   keys, the kicks and the spin flag before anything is played. */
(function(root){
 'use strict';
 const W=10,FULL=(1<<W)-1;
 let tables=null;
 function load(engine){
  if(tables)return tables;
  const c=engine.cm?.constants,ks=c?.kicksets?.['SRS+'];if(!ks||!engine.fm?.GetPieceDefinition)return null;
  const shapes={};
  for(const t of ['t','s','z','l','j','i','o']){shapes[t]=[];for(let r=0;r<4;r++){const d=engine.fm.GetPieceDefinition(t,r);shapes[t].push(d.data.map(([x,y])=>[x-d.dx,y-d.dy]))}}
  tables=withBits({shapes,kicks:ks.kicks,ikicks:ks.i_kicks,corner:c.cornerTable?.t||null});
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
  qx[tail]=spawnX;qy[tail]=spawnY;qr[tail]=0;tail++;stamp[sid(spawnX,spawnY,0,0,0)]=gen;
  const ground=[];
  while(head<tail){const x=qx[head],y=qy[head],r=qr[head];head++;
   for(let a=0;a<5;a++){let nx,ny,nr;
    if(a<2){nx=x+(a?-1:1);ny=y;nr=r;if(!legal(rows,shapes[r],nx,ny))continue}
    else{if(!rotate(x,y,r,a===2?1:a===3?-1:2))continue;nx=rx;ny=ry;nr=rr}
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
    if(a===5){if(!legal(rows,shapes[r],x,y+1))continue;nx=x;nr=r;ny=y;while(legal(rows,shapes[r],nx,ny+1))ny++}
    else if(a<2){nx=x+(a?-1:1);ny=y;nr=r;if(!legal(rows,shapes[r],nx,ny))continue}
    else{if(!rotate(x,y,r,a===2?1:a===3?-1:2))continue;nx=rx;ny=ry;nr=rr;if(!legal(rows,shapes[nr],nx,ny+1))spin=spinKind(rows,type,nx,ny,nr,rk)}
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
 function boardValue(rows,P){
  const H=rows.length,heights=new Array(W).fill(0);let reach=0,above=0,sealed=0,tuck=0,tuckReady=0;
  for(let y=0;y<H;y++){
   const row=rows[y],empty=~row&FULL;
   let r=(y===0?empty:(reach&empty));
   for(let k=0;k<W;k++){const n=r|(((r<<1)|(r>>1))&empty);if(n===r)break;r=n}
   reach=r;
   const covered=empty&above;
   if(covered){let fill=0;for(let b=row;b;b&=b-1)fill++;
    for(let b=covered;b;b&=b-1){const bit=b&-b;if(r&bit){tuck++;if(fill>=8)tuckReady++}else sealed++}}
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
  return -P.sealed*sealed-P.tuck*tuck+P.tuckReady*tuckReady-P.bump*bump-P.bumpSq*bumpSq-P.height*sum/W-P.peak*Math.max(0,peak-P.safePeak)-P.top*Math.max(0,peak-P.topPeak)-P.dead*dead+P.well*well;
 }
 function tPotential(rows,P){
  let best=0;
  for(const p of placements(rows,'t',4,19,2)){if(!p.spin)continue;
   const r=place(rows,'t',p).lines;best=Math.max(best,p.spin===2?(r>=3?P.tstReady:r>=2?P.tsdReady:r?P.tssReady:P.slotReady):P.miniReady*r)}
  return best;
 }
 const DEFAULTS={width:24,sealed:9,tuck:1.5,tuckReady:1,bump:.8,bumpSq:.3,height:2,peak:4,safePeak:8,top:12,topPeak:12,dead:1.5,tsdReady:16,tstReady:30,tssReady:3,slotReady:1.5,miniReady:1.2,
  tFull:[0,16,38,52],tMini:[0,1,3,4],mini:[0,1,8,14],quad:14,breakClear:-30,dangerPeak:15,depthDecay:.97,zeroSpin:-1.5,wastedT:7,tPotK:3,perFirst:3,breakPerB2B:0,breakDangerPerB2B:0,outlook:5,outlookCap:4,well:2,tMiniWasted:true};
 /* create(engine,state,options) → a time-sliced planner: step(ms) runs for
    about ms and returns true when done; result() is the first placement of
    the best line {x,y,r,type,hold,spin,value}, or null. A whole plan costs
    10-30 ms, so the live BOT spreads it over frames instead of stalling one.
    state: {board,falling,hold,queue,holdAllowed,b2b}. */
 function* search(state,P,out={}){
  const H=state.board.length,rows=new Array(H);
  for(let y=0;y<H;y++){let m=0;for(let x=0;x<W;x++)if(state.board[y][x]!==null)m|=1<<x;rows[y]=m}
  const queue=(state.queue||[]).map(t=>String(t).toLowerCase()).filter(t=>tables.shapes[t]);
  const start={rows,cur:String(state.falling).toLowerCase(),hold:state.hold?String(state.hold).toLowerCase():null,qi:0,acc:0,first:null,b2b:state.b2b||0,spins:0};
  if(!tables.shapes[start.cur])return null;
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
    const danger=heightBefore>=P.dangerPeak;
    for(const [type,hold,qi,held] of options){
     for(const p of placements(node.rows,type)){
      const res=place(node.rows,type,p);
      let gain=0,b2b=node.b2b;
      if(res.lines){
       if(p.spin){gain+=(type==='t'?(p.spin===2?P.tFull:P.tMini):P.mini)[Math.min(3,res.lines)];b2b++}
       else if(res.lines===4){gain+=danger?6:P.quad;b2b++}
       else{gain+=danger?-2-P.breakDangerPerB2B*Math.min(60,node.b2b):P.breakClear-P.breakPerB2B*Math.min(60,node.b2b);b2b=0}
       if(res.rows.every(v=>v===0))gain+=12;
      }else if(p.spin&&!p.plain)gain+=P.zeroSpin;
      if(type==='t'&&!(p.spin&&res.lines&&(p.spin===2||!P.tMiniWasted))&&!danger)gain-=P.wastedT;
      const nextCur=qi<queue.length?queue[qi]:null;
      // Transpositions (same board, same HOLD / next piece) waste the beam.
      let hash=hold?hold.charCodeAt(0):1;for(let y=0;y<H;y++)hash=Math.imul(hash,31)+res.rows[y]|0;
      const acc=node.acc+gain*Math.pow(P.depthDecay,d),key=hash+':'+(nextCur||'');
      if(seen.has(key))continue;seen.add(key);
      const child={rows:res.rows,cur:nextCur,hold,qi:qi+1,acc,first:node.first||{x:p.x,y:p.y,r:p.r,hold:held,spin:p.spin,type},b2b,spins:node.spins+(p.spin&&res.lines?1:0)};
      child.value=acc+boardValue(res.rows,P);
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
   for(let i=0;i<k;i++){children[i].value+=tPotential(children[i].rows,P);if(i%8===7)yield}
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
  if(!load(engine))return null;
  const P={...DEFAULTS,...(root.__spinPlannerParams||{}),...options};
  const out={},it=search(state,P,out);let done=false,result=null,spent=0;
  return {
   step(ms=4){if(done)return true;const t0=performance.now(),end=t0+ms;
    try{while(performance.now()<end){const r=it.next();if(r.done){done=true;result=r.value;break}}}
    catch(error){done=true;result=null}
    spent+=performance.now()-t0;return done},
   result:()=>done?result:(out.best||null),get done(){return done},get spent(){return spent},
   stop(){if(!done){done=true;result=out.best||null}return result},
  };
 }
 function plan(engine,state,options={}){const p=create(engine,state,options);if(!p)return null;while(!p.step(50));return p.result()}
 function setTables(t){tables=withBits({...t})}
 const api={setTables,create,plan,placements,place,boardValue,load,DEFAULTS};
 if(typeof module!=='undefined')module.exports=api;else root.LocalSpinPlanner=api;
})(typeof window==='undefined'?globalThis:window);
