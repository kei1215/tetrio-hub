// vAI: current pinned client only. Native, headless branches never touch the live engine.
(() => {
 const CLIENT='9628c0bbd',NAMES=['lines','holes','heightSum','bumpiness','peakHeight','attack','defense','spin','btbGain','charge','release','tSlots','well','combo','pressure','softDrop','groundSpin','hold'];
 function geometry(board){const h=board.length,w=board[0].length,heights=[],top=[];let holes=0;
  for(let x=0;x<w;x++){let first=h;for(let y=0;y<h;y++)if(board[y][x]!==null)first=Math.min(first,y);else if(first<h)holes++;top.push(first);heights.push(h-first)}
  let slots=0;const occupied=(x,y)=>x<0||x>=w||y>=h||y>=0&&board[y][x]!==null;
  for(let y=Math.max(1,Math.min(...top)-2);y<h-1;y++)for(let x=1;x<w-1;x++){if(occupied(x,y))continue;const open=!occupied(x-1,y)&&!occupied(x+1,y)&&!occupied(x,y-1)&&occupied(x-1,y+1)&&occupied(x+1,y+1),corners=[[-1,-1],[1,-1],[-1,1],[1,1]].filter(([dx,dy])=>occupied(x+dx,y+dy)).length,arms=[[-1,0],[0,-1],[1,0],[0,1]].filter(([dx,dy])=>!occupied(x+dx,y+dy)).length;if(open||corners>=3&&arms>=3)slots++}
  let well=0;for(let x=0;x<w;x++){const depth=Math.min(x?heights[x-1]:h,x<w-1?heights[x+1]:h)-heights[x];well=Math.max(well,Math.min(4,Math.max(0,depth)))}
  return {holes,sum:heights.reduce((a,b)=>a+b,0),rough:heights.slice(1).reduce((a,v,i)=>a+Math.abs(v-heights[i]),0),peak:Math.max(...heights),slots:Math.min(4,slots),well,top};
 }
 // Evaluate the outermost cell separately, not just 2-column edge valleys.
 // In the bot TTR at frame 6000 the outer columns were 8/10 rows below their
 // immediate neighbors, but the old two-column-only measure returned risk=0.
 // Preserve ONE clean shallow four-row I well, while forecasting loss of
 // access if BOTH side corridors begin to deepen (even before either reaches 5).
 function edgeAccess(board){
  if(!Array.isArray(board)||board.length===0||!board[0]||board[0].length<6)return {left:0,right:0,risk:0};
  // Edge checks run for every native placement. Avoid the expensive slots /
  // cavity scan in geometry(): only the ten column tops are needed here.
  const h=board.length,w=board[0].length,heights=new Int16Array(w);
  for(let x=0;x<w;x++){let y=0;while(y<h&&board[y][x]===null)y++;heights[x]=h-y;}
  const firstLeft=Math.max(0,heights[1]-heights[0]);
  const firstRight=Math.max(0,heights[w-2]-heights[w-1]);
  const corridorLeft=Math.max(0,Math.max(heights[2],heights[3])-Math.max(heights[0],heights[1]));
  const corridorRight=Math.max(0,Math.max(heights[w-3],heights[w-4])-Math.max(heights[w-1],heights[w-2]));
  const left=Math.max(firstLeft,corridorLeft),right=Math.max(firstRight,corridorRight);
  const single=depth=>1.45*Math.pow(Math.max(0,depth-4),1.35);
  const simultaneous=Math.min(left,right);
  // A shallow 2+2 side trap is an early warning, not an instant top-out.
  const bilateral=1.8*Math.pow(Math.max(0,simultaneous-1),1.45)+
      1.2*Math.pow(Math.max(0,simultaneous-3),1.5);
  const risk=single(left)+single(right)+bilateral;
  return {left,right,risk};
 }
 function terrainCorrection(before,after){
  const b=edgeAccess(before.board).risk,a=edgeAccess(after.board).risk;
  // Reward repair, punish new inaccessible edge valleys and avoid lingering
  // indefinitely in an already unsafe formation. Not linked to HOLD count.
  return 1.5*(b-a)-.2*a;
 }
 // Reward a usable four-line well, not an arbitrary tall empty column.
 function quadReady(board){const h=board.length,w=board[0].length;let best=0;
  for(let x=0;x<w;x++){let rows=0,blocked=false;for(let y=0;y<h;y++){if(board[y][x]!==null){blocked=true;break}}if(blocked)continue;
   for(let y=h-1;y>=0&&rows<4;y--){if(board[y].every((v,i)=>i===x||v!==null))rows++;else break}best=Math.max(best,rows)}return best;
 }
 function clearKind(before,after){const a=after.stats.clears||{},b=before.stats.clears||{};return Object.keys(a).filter(k=>(a[k]||0)>(b[k]||0))}
 function tactical(before,after,spinMode=false){const lines=after.stats.lines-before.stats.lines,kinds=clearKind(before,after),full=kinds.some(k=>k.startsWith('tspin')&&!k.includes('mini'));
  // Emergency survival and MOD penalties still outweigh these bounded bonuses.
  return spinMode?(full&&lines>0?20+10*lines:0):(lines===4?18:0)+(full&&lines>0?12+4*lines:0)+3*quadReady(after.board);
 }
 // Optional B2B curriculum policy: preserve a reachable well and delay small clears.
 function chainBonus(before,after,spin,well=9){const old=geometry(before.board),lines=after.stats.lines-before.stats.lines,safety=old.peak>=14?.15:1;
  const potential=state=>{const board=state.board,h=board.length;let height=0;for(let y=0;y<h;y++)if(board[y][well]!==null){height=h-y;break}
   const geom=geometry(board);return 7*quadReady(board)-2.5*height-5*geom.holes
    -.5*edgeAccess(board).risk-Math.max(0,geom.peak-12)*2
    +(LocalAIInformation.holdPiece(state.hold)==='i'&&quadReady(board)>0?5:0)};
  const blocked=old.peak<16&&before.board.every(row=>row[well]===null)&&after.board.some(row=>row[well]!==null)&&lines!==4&&!(spin&&lines>0);
  const raw=safety*(potential(after)-potential(before)+(lines===4?28:0)-(lines>0&&lines<4&&!spin?12:0)-(before.stats.btb>0&&after.stats.btb===0?24:0))-(blocked?18:0);
  return Math.max(-35,Math.min(35,raw));
 }
 function allSpinB2BBonus(before,after,nativeSpinClear,rules){
  if(!rules?.allSpin)return 0;
  const lines=Math.max(0,(after.stats.lines||0)-(before.stats.lines||0));
  if(!lines)return 0;
  const old=Math.max(0,Number(before.stats.btb)||0),next=Math.max(0,Number(after.stats.btb)||0);
  if(nativeSpinClear&&next>old)return Math.min(72,24+6*Math.min(8,next));
  if(old>0&&next===0)return -48;
  return 0;
 }
 function iTriplePenalty(before,after,type,nativeSpinClear){
  if(nativeSpinClear||String(type||'').toLowerCase()!=='i')return 0;
  const lines=Math.max(0,(after.stats.lines||0)-(before.stats.lines||0));
  if(lines!==3)return 0;
  const g=geometry(before.board),height=before.setoptions?.boardheight||before.board.length;
  // Preserve I for a clean Quad/B2B route. In immediate danger this remains
  // a legal survival move, but it is still less desirable than a Spin Triple.
  return g.peak<height-4&&g.holes===0?-140:-45;
 }
 function pressure(state){return Math.min(40,(state.impendingdamage||[]).reduce((n,d)=>n+(d.active===false?0:Math.max(0,d.amt||0)),0)+(state.garbageareentries||[]).length)}
 function charge(state){const o=state.setoptions||{};return o.b2bcharging?Math.max(0,(state.stats.btb||0)-(o.b2bcharge_at||0)):0}
 function vector(before,after,spin=false,soft=false,held=false){const g=geometry(after.board),a=after.stats,b=before.stats;
  return [Math.max(0,a.lines-b.lines),g.holes,g.sum,g.rough,g.peak,Math.max(0,a.garbage.attack-b.garbage.attack),Math.max(0,(after.lastoffensive?.defense||0)),spin?(clearKind(before,after).some(k=>k.startsWith('tspin')&&!k.includes('mini'))?2:1):0,Math.max(0,a.btb-b.btb),charge(after),Math.max(0,after.lastoffensive?.surge||0),g.slots,g.well,Math.min(20,a.combo||0),pressure(after),soft?1:0,spin&&soft?1:0,held?1:0];
 }
 const DEFAULT=[8,-11,-.55,-.85,-1.6,4,5,6,3,1.1,1.5,3,1.2,1,-2.5,0,2,0];
 // Share CPU time across all local BOTs on the renderer thread. A native
 // operation cannot be preempted mid-call, so these are cooperative budgets,
 // not a claim of hard realtime isolation. Keep it low if a human is playing.
 // Fair share (2026-11-13): first come first served let the left BOT (ticked
 // first) take 2.4 of 4.5 ms every frame and the right one often nothing, so
 // the right side played slower and lost more. Each BOT seen in the last frame
 // now gets an equal part; time it leaves unused goes to the others.
 const frameBudget=window.LocalAIFrameBudget??(()=>{
  let slot=-1,spent=0,peak=0,seen=new Map(),lastCount=1;
  const clock=()=>performance.now();
  return {claim(human=false,urgent=false,who=null){
    const tick=Math.floor(clock()/16.666667);
    if(tick!==slot){slot=tick;spent=0;lastCount=Math.max(1,seen.size);seen=new Map()}
    const m=window.LocalAIPower?.mult?.()||1,total=(human?1.7:4.5)*m,remaining=total-spent;
    if(who&&!seen.has(who))seen.set(who,0);
    const mine=who?seen.get(who):0,share=total/lastCount;
    // own part first; the common rest only once every BOT had its turn
    const own=who?Math.max(0,share-mine):remaining;
    const room=Math.min(remaining,seen.size>=lastCount?remaining:own);
    return room<.45?(urgent?.45:0):Math.max(.45,Math.min((human?1:2.4)*m,room));
   },account(ms,who=null){ms=Math.max(0,ms);spent+=ms;peak=Math.max(peak,ms);if(who)seen.set(who,(seen.get(who)||0)+ms)},
   status:()=>({slot,spent,peak,bots:lastCount}),
  };
 })();
 window.LocalAIFrameBudget=frameBudget;
 /* Compute power (Tab: 計算量). 'auto' measures this PC: the worker plan time
    per beam width is kept as a running average, and the width is chosen so a
    plan fits the time one piece has at the target PPS (fast PC = wider, deeper
    plans; high PPS = narrower ones instead of a lower PPS). Fixed levels cap
    the width / main-thread time. */
 const POWER={low:{maxW:10,mult:.6},mid:{maxW:24,mult:1},high:{maxW:40,mult:1.6},max:{maxW:64,mult:2.4},auto:{maxW:48,mult:1}};
 const power=()=>{let v='auto';try{v=localStorage.getItem('qp-ai-power')||'auto'}catch{}return POWER[v]?v:'auto'};
 const speed=window.LocalAIPlanSpeed??(window.LocalAIPlanSpeed={msPerWidth:8,samples:0,
  note(ms,width){if(!(ms>0)||!(width>0))return;const v=ms/width;this.msPerWidth=this.samples?this.msPerWidth*.85+v*.15:v;this.samples++},
  width(intervalFrames,quick){const lvl=POWER[power()],avail=Number.isFinite(intervalFrames)?Math.max(20,intervalFrames*16.67*.7):Infinity;
   const fit=Number.isFinite(avail)?Math.floor(avail/Math.max(.5,this.msPerWidth)):lvl.maxW;
   return Math.max(6,Math.min(lvl.maxW,quick,power()==='auto'?fit:lvl.maxW))}});
 window.LocalAIPower={get level(){return power()},levels:Object.keys(POWER),mult:()=>POWER[power()].mult,speed};


 // A hold is a normal placement-order choice, not a panic button or a free reward.
 // Self-created buried holes are costly; pre-existing garbage holes are not
 // penalized again just because they remain on the board.
 function holeDamage(board){
  if(!board?.length||!board[0]?.length)return 0;
  const h=board.length,w=board[0].length;let damage=0;
  for(let x=0;x<w;x++){
   let roof=0,started=false;
   for(let y=0;y<h;y++){
    if(board[y][x]!==null){started=true;roof++;continue}
    if(!started)continue;
    const left=x>0&&board[y][x-1]===null,right=x+1<w&&board[y][x+1]===null;
    const reachable=left||right;
    damage+=(reachable?.35:1.15)+Math.min(2.25,roof*.18);
   }
  }return damage;
 }
 function qualityChange(before,after){
  const a=geometry(before.board),b=geometry(after.board);
  const created=Math.max(0,b.holes-a.holes),removed=Math.max(0,a.holes-b.holes);
  const damage=Math.max(0,holeDamage(after.board)-holeDamage(before.board));
  // Preserve useful open wells, but do not manufacture unplayable sealed cavities.
  return -8*created-2.5*damage+2.5*removed+.4*(a.rough-b.rough)+.3*(a.peak-b.peak)+terrainCorrection(before,after);
 }
 function reserveValue(state){
  const type=LocalAIInformation.holdPiece(state.hold),g=geometry(state.board);
  if(type==='i')return Math.min(5,1.5+g.well*.7+quadReady(state.board));
  if(type==='t')return Math.min(4,1+g.slots*1.1);
  return 0;
 }
 // Alternate the two legal branches so the real-time deadline never gets
 // through only the no-HOLD candidates. Each branch remains fully simulated.
 function balancedQueue(choices){
  const plain=choices.filter(c=>!c.hold),held=choices.filter(c=>c.hold),result=[];
  for(let i=0;i<Math.max(plain.length,held.length);i++){
   if(i<plain.length)result.push(plain[i]);
   if(i<held.length)result.push(held[i]);
  }return result;
 }
 // Priority ordering only, not candidate deletion. Keep native-evaluated
 // plain / HOLD / rotation / HOLD-rotation choices in each small frame budget.
 function scheduleFamilies(every,spinBurst=2){
  spinBurst=Math.max(1,Math.min(4,Math.floor(Number(spinBurst)||2)));
  const makeLane=held=>{
   const lane=every.filter(c=>!!c.hold===held),plain=lane.filter(c=>!c.turn),spin=lane.filter(c=>c.turn),order=[];
   let p=0,t=0;
   while(p<plain.length||t<spin.length){
    if(p<plain.length)order.push(plain[p++]);
    for(let k=0;k<spinBurst&&t<spin.length;k++)order.push(spin[t++]);
   }
   return order;
  };
  const plainLane=makeLane(false),holdLane=makeLane(true),mixed=[];
  for(let i=0;i<Math.max(plainLane.length,holdLane.length);i++){
   if(i<plainLane.length)mixed.push(plainLane[i]);
   if(i<holdLane.length)mixed.push(holdLane[i]);
  }
  return mixed;
 }
 function balancedBeam(roots,count){
  const seen=new Set(),distinct=roots.filter(root=>{
   if(root.snapshot?._aiKnownCurrent===false)return false;
   const state=root.snapshot?.game;if(!state?.board)return false;
   const key=state.board.map(row=>row.map(c=>c===null?'.':'#').join('')).join('/')+'|'+(LocalAIInformation.holdPiece(state.hold)||'-')+'|'+(LocalAIInformation.holdLocked(state)?1:0)+'|'+(state.falling?.type||'-')+'|'+state.bag.slice(0,2).join('');
   if(seen.has(key))return false;seen.add(key);return true;
  });
  const beam=[],add=r=>{if(r&&!beam.includes(r)&&beam.length<count)beam.push(r)};
  // Reserve comparable search capacity for the HOLD path, without forcing
  // the final decision to use it. Final selection is score-based.
  distinct.filter(r=>r.hold).slice(0,2).forEach(add);
  distinct.filter(r=>!r.hold).slice(0,2).forEach(add);
  distinct.forEach(add);
  return beam;
 }
 function value(features,weights=DEFAULT){return features.reduce((n,v,i)=>n+v*(Number(weights?.[i])||0),0)}
 function boundedLearningValue(features,weights=DEFAULT){
  const safe=value(features,DEFAULT),trained=value(features,weights);
  return safe+Math.max(-10,Math.min(10,trained-safe));
 }
 function holeGuard(before,after,features,spinClear){
  const a=geometry(before.board),b=geometry(after.board);
  const created=Math.max(0,b.holes-a.holes),damage=Math.max(0,holeDamage(after.board)-holeDamage(before.board));
  // Penalize manufactured inaccessible holes. A genuine clearing Spin may
  // justify a small, temporary setup, but cannot erase the entire penalty.
  const clear=features[0]>0,forgiveness=spinClear&&clear?.4:1;
  return -(created*23+damage*5)*forgiveness;
 }

 // General native-verified spin entry repertoire. The final operation is
 // always a rotation: a lateral move/soft drop after that would cancel the
 // last-rotation condition used by the native spin detector.
 // Generate routes by action classes, NOT by memorizing a fixed board picture.
 // Offline can try the longer paths; realtime explores the short ones first.
 function spinEntryScripts(turn,allow180=true,allowDrop=true){
  const last=turn===2?'rotate180':turn===1?'rotateCW':'rotateCCW';
  const rotations=['rotateCW','rotateCCW',...(allow180?['rotate180']:[])];
  const dirs=['moveLeft','moveRight'],paths=[],seen=new Set();
  const push=prefix=>{
   const seq=[...prefix,last],id=seq.join(',');
   if(!seen.has(id)){seen.add(id);paths.push(seq)}
  };
  push([]);
  if(allowDrop){
   // Place these within the FIRST native checks, even at very high PPS.
   // S/Z use rotate -> drop -> rotate to fit underneath an overhang.
   for(const r of rotations)push([r,'sonicDrop']);
  }
  for(const side of dirs)push([side]);
  for(const r of rotations)push([r]);
  for(const r of rotations)for(const side of dirs)push([r,side]);
  for(const side of dirs)for(const r of rotations)push([side,r]);
  if(allowDrop){
   for(const side of dirs)push([side,'sonicDrop']);
   for(const r of rotations)for(const side of dirs)push([r,side,'sonicDrop']);
  }
  for(const r1 of rotations)for(const r2 of rotations)push([r1,r2]);
  for(const side of dirs)for(const r of rotations)push([side,r,side]);
  for(const r of rotations)for(const side of dirs)push([r,side,side]);
  return paths;
 }
 // Read the active room's native rotation rules instead of assuming SRS or
 // treating every mode as All-Spin. The native sandbox remains the authority
 // for kicks and successful-spin flags; this object only selects candidates.
 function rotationRules(options={}){
  const spinbonuses=String(options.spinbonuses??'none').trim().toLowerCase();
  const mods=Array.isArray(options.zenith_mods)?options.zenith_mods.map(String):[];
  const allSpin=spinbonuses.includes('all')||mods.some(mod=>mod==='allspin'||mod==='allspin_reversed');
  const disabled=['','none','off','false','0'].includes(spinbonuses);
  const enabled=allSpin||!disabled;
  return {
   client:CLIENT,
   kickset:String(options.kickset||options.rotation_system||'native'),
   allow180:options.allow180!==false&&options.allow180!==0,
   spinbonuses,
   allSpin,
   tOnly:enabled&&!allSpin,
   enabled,
   pieces:enabled?(allSpin?['i','j','l','o','s','t','z']:['t']):[],
   mods,
  };
 }
 function canSpin(type,options){return rotationRules(options).pieces.includes(String(type||'').toLowerCase())}
 function variants(state,engine,hold=false,spins=true){const f=state.falling,out=[],w=state.board[0].length,rules=rotationRules(state.setoptions),spinPiece=rules.pieces.includes(String(f.type||'').toLowerCase());
  for(let r=0;r<4;r++){const d=engine.fm.GetPieceDefinition(f.type,r);if(!d)continue;const xs=d.data.map(c=>c[0]-d.dx),min=Math.min(...xs),max=Math.max(...xs);
   for(let x=-min;x<w-max;x++){out.push({rotation:r,x,hold,turn:0});if(spins&&spinPiece){out.push({rotation:r,x,hold,turn:1});out.push({rotation:r,x,hold,turn:-1});if(rules.allow180)out.push({rotation:r,x,hold,turn:2})}}
  }return out;
 }
  // v4.8243: T-slot detector (TSD/TSS). Counts the covered cells of slots whose
 // stem row is clearable, both bottom corners are filled and at least one top
 // corner forms the overhang. Credited only while a T is in HOLD or NEXT.
 function tSlotHoles(board){
  // Readiness of the best T slot: 1 = open TSD shape (needs a roof),
  // 1.5 = roofed TSS, 3 = roofed TSD (T can spin in and clear two rows).
  if(!board?.length||!board[0]?.length)return 0;
  const h=board.length,w=board[0].length,solid=(x,y)=>x<0||x>=w||y>=h||y>=0&&board[y][x]!==null;
  const filled=y=>{let n=0;for(let x=0;x<w;x++)if(board[y][x]!==null)n++;return n};
  let best=0;
  for(let cy=2;cy<h;cy++){
   if(filled(cy)!==w-1)continue;
   const upper=filled(cy-1);
   for(let cx=1;cx<w-1;cx++){
    if(solid(cx-1,cy-1)||solid(cx,cy-1)||solid(cx+1,cy-1)||solid(cx,cy))continue;
    if(!solid(cx,cy+1)||!solid(cx-1,cy)||!solid(cx+1,cy))continue;
    let open=true;for(let y=0;y<cy-1;y++)if(solid(cx,y)){open=false;break}if(!open)continue;
    const roof=solid(cx-1,cy-2)||solid(cx+1,cy-2),tsd=upper===w-3;
    best=Math.max(best,roof?(tsd?3:1.5):(tsd?1:0));
   }
  }
  return best;
 }
 // v4.8243: columns at least three rows below BOTH neighbours. One such well
 // is the Quad / B2B well; every extra one is a second place that only an I fills.
 function deepWells(board){
  if(!board?.length||!board[0]?.length)return 0;
  const h=board.length,w=board[0].length,height=[];
  for(let x=0;x<w;x++){let y=0;while(y<h&&board[y][x]===null)y++;height.push(h-y)}
  let n=0;for(let x=0;x<w;x++){const l=x?height[x-1]:99,r=x<w-1?height[x+1]:99;if(Math.min(l,r)-height[x]>=3)n++}
  return n;
 }
 function wellPenalty(before,after){return 9*(Math.max(0,deepWells(after)-1)-Math.max(0,deepWells(before)-1))}
 function tSlotCredit(before,after,state){
  const known=state?._known||state?.bag||[],hold=LocalAIInformation.holdPiece(state?.hold);
  if(hold!=='t'&&!known.slice(0,5).some(t=>String(t).toLowerCase()==='t'))return 0;
  // Safety first: no setup credit once the stack is in the upper half.
  if(geometry(after).peak>Math.min(10,(state?.setoptions?.boardheight||20)-10))return 0;
  const b=Math.min(3,tSlotHoles(before)),a=Math.min(3,tSlotHoles(after));
  // Filling a ready slot with a non-T piece throws the setup away.
  return a>=b?a-b:-.6*(b-a);
 }
 // v4.8246 Spin B2B mode (game._aiTSpinB2B, solo / no-attack rooms).
 // Terrain read on the cell level: empty cells that a piece can still reach
 // from the sky by moving down / sideways are "tuck" cells (a spin or tuck
 // fills them); covered cells that nothing can reach are sealed holes. A
 // one-wide open column deeper than two rows can only be filled by a straight
 // I, which is never a spin, so those rows are dead for a spin chain.
 // Spin B2B planner settings without All-Spin mods (T-Spin style). Node self-play,
 // 8 seeds x 300 pieces (tools/ai-sim): T-Spin share of attack 45% -> 62%, TSD/TST
 // 115 -> 169 of ~340 T; with incoming garbage (GARB=4,120) 45% -> 55%, no top-outs.
 // Non-T attack counts 0.3, non-T mini spins little, TST slots most; tPotK 6 scans
 // T slots on twice as many boards (plan ~1.6x slower, still time-sliced).
 // tShape: learned T-Spin terrain table (ai-tshape-table.js, user + 5han TL replays).
 // vs Cold Clear 2 at 4 PPS (Node, 32 games): APP 0.59 -> 0.64, T-Spin share 47 -> 55%.
 const T_STYLE={wastedT:30,tFull:[0,10,45,90],tsdReady:40,tstReady:90,mini:[0,0,2,4],tPotK:6,atkOther:.3,tShape:10};
 const B2BP=window.__b2bParams||(window.__b2bParams={});
 const bp=(k,d)=>B2BP[k]??d;
 function spinTerrain(board){
  const h=board.length,w=board[0].length,seen=new Uint8Array(h*w),stack=[];
  for(let x=0;x<w;x++)if(board[0][x]===null){seen[x]=1;stack.push(x)}
  while(stack.length){const i=stack.pop(),x=i%w,y=(i-x)/w;
   if(x>0&&!seen[i-1]&&board[y][x-1]===null){seen[i-1]=1;stack.push(i-1)}
   if(x<w-1&&!seen[i+1]&&board[y][x+1]===null){seen[i+1]=1;stack.push(i+1)}
   if(y<h-1&&!seen[i+w]&&board[y+1][x]===null){seen[i+w]=1;stack.push(i+w)}}
  const heights=[];for(let x=0;x<w;x++){let y=0;while(y<h&&board[y][x]===null)y++;heights.push(h-y)}
  let sealed=0,tuck=0,dead=0;
  for(let y=0;y<h;y++){let fill=0;for(let x=0;x<w;x++)if(board[y][x]!==null)fill++;
   for(let x=0;x<w;x++){if(board[y][x]!==null||h-y>heights[x])continue;
    // covered cell (something above it in this column)
    if(!seen[y*w+x])sealed++;else if(fill>=w-4)tuck+=fill>=w-2?1:.6}}
  for(let x=0;x<w;x++){const l=x?heights[x-1]:h,r=x<w-1?heights[x+1]:h,depth=Math.min(l,r)-heights[x];if(depth>=3)dead+=depth-2}
  return {sealed,tuck,dead,peak:Math.max(...heights)};
 }
 function b2bScore(before,after,features,nativeSpinClear,type,mini,danger){
  const lines=features[0],btb=Math.max(0,Number(before.stats.btb)||0);let score=0;
  if(lines>0){
   if(nativeSpinClear)score+=type==='t'&&!mini?bp('tFull',80)+bp('tLine',40)*(lines-1):bp('miniClear',55)+bp('miniLine',20)*(lines-1);
   else if(lines===4)score+=danger?bp('quadDanger',20):bp('quad',-20);
   else score-=danger?bp('breakDanger',40):bp('break',300)+5*Math.min(40,btb);
  }
  const a=spinTerrain(after.board),b=spinTerrain(before.board);
  score-=bp('sealed',18)*(a.sealed-b.sealed);
  score+=bp('tuck',14)*(Math.min(8,a.tuck)-Math.min(8,b.tuck));
  score-=bp('dead',10)*(a.dead-b.dead);
  return score;
 }
 function spinMini(before,after){const a=after.stats.clears||{},b=before.stats.clears||{};return Object.keys(a).some(k=>k.includes('mini')&&(a[k]||0)>(b[k]||0))}
 function quickScore(plan,source){
   const before=geometry(source.board),after=plan.chainBoard?geometry(plan.chainBoard):null;
   const d=after?Math.max(0,after.holes-before.holes):0;
   return value((plan.features||[]).slice(0,5),[12,-11,-.6,-.8,-1.5])
      +(plan.setupScore||0)*.25+(plan.chainScore||0)*.15-25*d
      -(after?Math.max(0,holeDamage(plan.chainBoard)-holeDamage(source.board))*3:0)
      -(after?1.5*edgeAccess(plan.chainBoard).risk:0);
  }
 function createSearch(game,botPolicy,settings={}){
  if(game.options.version!==19)throw Error('vAIは現バージョン専用です');
  window.LocalSpinLibrary?.scheduleValidation?.(game);
  const sandbox=LocalNative.createAISandbox(game),base=LocalAIInformation.prepare({...game.ejectState(),_aiSeedAccess:game._aiSeedAccess===true},game._aiNextCount),engine=sandbox.source.self,weights=game._aiWeights||window.LocalBotLearning?.combatWeights?.(game)||DEFAULT;
  const network=Object.hasOwn(game,'_aiPolicy')?game._aiPolicy:window.LocalBotLearning?.combatPolicy?.(game)||null;
  // Unknown future garbage holes never enter candidate boards. Amounts remain
  // available for native cancellation; no live seed or hidden queue is scored.
  if(!game._aiSeedAccess)engine.bm.PushLine=()=>{};
  const spinLibrary=window.LocalSpinLibrary;
  const tSoon=spinLibrary?.knownPieces?.(game)?.some(p=>p.type==='t'&&(p.source==='HOLD'||p.source==='CURRENT'||Number(p.index)<=2));
  const focusTSpin=!!tSoon&&game._aiTSpinFocus!==false&&!botPolicy?.ownDanger;
  const tGoals=focusTSpin?(spinLibrary?.compileTSpinGoals?.(base.game.board,spinLibrary.knownPieces(game),undefined,engine.fm)||[]):[];
  const roofProgress=(before,after)=>spinLibrary?.tSpinGoalProgress?.(before,after,tGoals)||0;
  const routeCache=new WeakMap();let queue=[],cursor=0,roots=[],best=null,phase=0,beam=[],beamIndex=0,disposed=false,depth=1;
  // Realtime only: move to depth two after a representative set of native
  // root actions. Without this switch, huge full-spin frontiers consumed the
  // entire high-PPS deadline and the multi-piece search never started.
  let rootBudget=settings.realtime?Math.max(8,Math.min(64,Math.floor(Number(settings.rootBudget)||24))):Infinity;
  const beamWidth=settings.realtime?Math.max(1,Math.min(6,Math.floor(Number(settings.beamWidth)||3))):8;
  const stepBudgetMs=settings.realtime?Math.max(1,Math.min(9,Number(settings.stepBudgetMs)||3)):Infinity;
  let rootChecked=0,lookaheadChecked=0;
  function restore(snapshot){const state=LocalAIInformation.prepare(snapshot);state.game.setoptions={...state.game.setoptions,gameid:8180,noreplay:true,can_retry:false};sandbox.injectState(state);sandbox.state.pause=false}
  // v4.8243: every candidate is a placement that the native engine actually
  // reached from the spawn position (LocalAIMoveGen BFS: moves, native kicks,
  // non-locking drop). The old route + spin-script rehearsal tried up to 90
  // native scripts per candidate and, in real time, only 3-6 of ~200 enumerated
  // candidates were ever evaluated before the PPS deadline.
  const allowDrop=()=>game._aiAllowSoftDrop!==false&&window.LocalAIPlayerSettings?.canUse?.(game,'softDrop')!==false;
  function movegen(spins){
   return LocalAIMoveGen.generate(engine,sandbox.state,{allow180:sandbox.options?.allow180!==false&&rules0.allow180,allowDrop:allowDrop(),maxKeys:settings.humanActive?8:10,maxNodes:settings.humanActive?900:1600})
    .filter(p=>spins||!p.spin);
  }
  function quickPlacement(p,state,type,ctx){
   const board=state.board,h=board.length,w=board[0].length,d=engine.fm.GetPieceDefinition(type,p.r);if(!d)return null;
   // Per-node values of the current board are computed once (ctx), not per placement.
   if(!ctx.ready){ctx.ready=true;ctx.geo=geometry(board);ctx.damage=holeDamage(board);
    ctx.tSoon=LocalAIInformation.holdPiece(state.hold)==='t'||(state.bag||[]).slice(0,4).some(t=>String(t).toLowerCase()==='t');
    ctx.slots=ctx.tSoon?tSlotHoles(board):0}
   const cells=d.data.map(([dx,dy])=>[p.x+dx-d.dx,p.y+dy-d.dy]);
   const placed=board.map(row=>row.slice());for(const [x,y]of cells)if(y>=0&&y<h&&x>=0&&x<w)placed[y][x]='ai';
   let rows=placed.filter(row=>!row.every(c=>c!==null));const lines=h-rows.length;while(rows.length<h)rows.unshift(Array(w).fill(null));
   const a=ctx.geo,b=geometry(rows);
   let score=value([lines,b.holes,b.sum,b.rough,b.peak],[12,-11,-.6,-.8,-1.5])-25*Math.max(0,b.holes-a.holes)
     -1.5*edgeAccess(rows).risk;
   if(ctx.wells===undefined)ctx.wells=Math.max(0,deepWells(board)-1);
   score-=9*(Math.max(0,deepWells(rows)-1)-ctx.wells);
   if(b.holes>a.holes)score-=3*Math.max(0,holeDamage(rows)-ctx.damage);
   if(p.spin&&lines>0)score+=40+15*lines;
   if(tspinB2B&&lines>0&&!p.spin&&lines<4)score-=b.peak>=dangerPeak?40:400;
   if(tspinB2B&&p.spin&&lines>0)score+=type==='t'?40:25;
   if(p.spin&&lines===0&&!zeroSpinUseful)score-=tspinB2B?20:8;
   if(ctx.tSoon&&b.peak<=10)score+=Math.max(0,Math.min(3,tSlotHoles(rows))-Math.min(3,ctx.slots))*30;
   return {score,lines};
  }
  const cellKey=(type,x,y,r)=>{const d=engine.fm.GetPieceDefinition(type,r);return d?d.data.map(([dx,dy])=>(x+dx-d.dx)+':'+(y+dy-d.dy)).sort().join('|'):''};
  function nodeChoices(snapshot,spins,limit=Infinity,prefer=null){
   const lanes=[];
   restore(snapshot);
   const plainType=sandbox.state.falling?.type;
   if(plainType){const ctx={};lanes.push(movegen(spins).map(p=>({...p,hold:false,start:null,type:plainType,quick:quickPlacement(p,sandbox.state,plainType,ctx)})))}
   if(LocalAIInformation.holdAllowed(snapshot,game._aiAllowHold!==false)&&
     (LocalAIInformation.holdPiece(snapshot.game.hold)||LocalAIInformation.known(snapshot).length>0)){
    restore(snapshot);
    const beforePiece=sandbox.state.falling?.type,beforeHold=LocalAIInformation.holdPiece(sandbox.state.hold),beforeLocked=LocalAIInformation.holdLocked(sandbox.state);
    engine.fm.Hold();
    const afterHold=LocalAIInformation.holdPiece(sandbox.state.hold);
    const executed=!beforeLocked&&(LocalAIInformation.holdLocked(sandbox.state)||beforeHold!==afterHold||beforePiece!==sandbox.state.falling?.type);
    if(executed&&sandbox.state.falling?.type){
     const held=LocalAIInformation.held(sandbox.ejectState(),snapshot),type=sandbox.state.falling.type;
     const ctx={};lanes.push(movegen(spins).map(p=>({...p,hold:true,start:held,type,quick:quickPlacement(p,sandbox.state,type,ctx)})));
    }
   }
   restore(snapshot);
   if(prefer)for(const lane of lanes)for(const c of lane)if(c.quick&&!!c.hold===prefer.hold&&cellKey(c.type,c.x,c.y,c.r)===prefer.key){c.quick.score+=1e5+(!!c.spin===!!prefer.spin?50:0)-(c.path?.length||0);c.planned=true}
   const ordered=lanes.map(lane=>{
    const valid=lane.filter(c=>c.quick).sort((a,b)=>b.quick.score-a.quick.score);
    if(!Number.isFinite(limit))return valid;
    // Keep every line-clearing native spin plus the best plain placements.
    const spinsFirst=valid.filter(c=>c.spin&&c.quick.lines>0).slice(0,6),rest=valid.filter(c=>!spinsFirst.includes(c));
    return [...spinsFirst,...rest.slice(0,Math.max(2,limit-spinsFirst.length))];
   });
   const out=[];for(let i=0;i<Math.max(0,...ordered.map(l=>l.length));i++)for(const lane of ordered)if(i<lane.length)out.push(lane[i]);
   return out.map(c=>({hold:c.hold,start:c.start,type:c.type,path:c.path,x:c.x,y:c.y,rotation:c.r,turn:c.spin?1:0,spin:c.spin,quickScore:c.quick.score,planned:!!c.planned}));
  }
  // Spin B2B mode (vA option, meant for solo / no-attack rooms): every line
  // clear should be a spin (T-Spins first, any mini allowed), planned by
  // LocalSpinPlanner. Only while nothing is incoming: under attack the normal
  // evaluation decides.
  // v4.8250: also under attack; the plan then weighs cancelling the incoming
  // garbage and the B2B charge against keeping the chain (by height).
  const tspinB2B=game._aiTSpinB2B===true;
  const dangerPeak=Math.max(8,(base.game.setoptions?.boardheight||20)-6);
  // A zero-line spin only adds inputs, except where it scores by itself
  // (All-Spin / Warlock mod) or a revive mission asks for it.
  // 2026-11-13: only The Warlock (allspin_reversed) pays for one (a zero-line spin with a
  // charged B2B adds B2B there); under All-Spin a zero-line spin sends nothing (a real QP
  // replay had 160 of them in 3589 pieces).
  const zenMods=base.game.setoptions?.zenith_mods||[],allSpinMod=zenMods.some(m=>m==='allspin'||m==='allspin_reversed');
  const zeroSpinUseful=zenMods.includes('allspin_reversed')||!!botPolicy?.prompt;
  const tStyle=!allSpinMod&&!botPolicy?.prompt;
  const rules0=rotationRules(base.game.setoptions);
  const rootLimit=settings.realtime?(settings.humanActive?5:Math.max(5,Math.min(12,Math.floor((Number(settings.rootBudget)||24)/3)))):Infinity;
  // The plan runs in time slices inside step(), so a live frame never stalls
  // on it; the native root candidates are built once it is done.
  let spinPlan=null,planner=null,planSlices=0,planFrameCap=Infinity,planWidth=24,rootQueue=null;
  // vA private builds: an outside engine decides (see below); public builds have none.
  const externalPlan=!!window.LocalExternalAI?.active?.(game)&&!!base.game.falling?.type&&!settings.fast;
  if(tspinB2B&&!externalPlan&&window.LocalSpinPlanner&&base.game.falling?.type&&!settings.fast){
   try{const budget=Number(settings.rootBudget)||40;
    // Frames until this piece locks (high gravity leaves only the lock delay):
    // a short window gets a narrower, quicker plan.
    const left=settings.realtime?Number(window.LocalLegacyAI?.timing?.(game)?.total):Infinity;
    const quick=left<bp('quickFrames',45)?10:left<bp('mediumFrames',70)?16:24;
    // The piece keeps falling while the plan runs; its keys must still work.
    planFrameCap=Number.isFinite(left)?Math.max(4,Math.floor(left/3)):Infinity;
    planner=(settings.realtime&&LocalSpinPlanner.createAsync?LocalSpinPlanner.createAsync:LocalSpinPlanner.create)(engine,{board:base.game.board,falling:base.game.falling.type,hold:LocalAIInformation.holdPiece(base.game.hold),queue:LocalAIInformation.known(base),
     holdAllowed:LocalAIInformation.holdAllowed(base,game._aiAllowHold!==false),b2b:base.game.stats?.btb||0,combo:base.game.stats?.combo||0},
     {width:planWidth=(!settings.realtime?24:LocalSpinPlanner.createAsync&&typeof Worker!=='undefined'?speed.width(Number(settings.interval),quick===24?64:quick):Math.min(quick,budget>=40?24:budget>=28?16:10)),...playerPlanOptions(base.game),
      // Without All-Spin mods (2026-11-13, Node self-play, 8 seeds x 300 pieces):
      // no zero-line / hole-filling spins (6 -> 0.1 per game), T kept for TSD/TST
      // (T-Spin share of attack 33% -> 44%, TSD/TST 9 -> 14 of 43 T, APP 0.67 -> 0.71).
      ...(zeroSpinUseful?{}:{zeroSpin:-20}),...(tStyle?T_STYLE:{}),
      // The room's rotation rules: kick table, 180 on/off, and high gravity
      // (one row a frame or more: every move ends on the floor).
      kickset:String(base.game.setoptions?.kickset||'SRS+'),allow180:rules0.allow180&&sandbox.options?.allow180!==false,
      slam:Number(engine.fm.GetEffectiveGravity?.()??base.game.g??0)>=1});
   }catch(error){planner=null}
  }
  // vA private builds: an outside engine (Cold Clear 2, ai-external.js) picks the
  // placement instead of the spin planner; the native sandbox still checks it and
  // plays its exact keys. Public builds have no LocalExternalAI.
  if(externalPlan){try{planner=LocalExternalAI.planner(game,base,{engine,kickset:String(base.game.setoptions?.kickset||'SRS+'),allow180:rules0.allow180&&sandbox.options?.allow180!==false,
   slam:Number(engine.fm.GetEffectiveGravity?.()??base.game.g??0)>=1})}catch(error){planner=null}}
  // The player's own data steers the plan: templates that fit this board and
  // the coming pieces, where they make spins, how often they take a
  // low-attack B2B clear (single-line spin / mini) and how often a Quad.
  function playerPlanOptions(state){
   const out={},T=window.LocalAITemplates,o=state.setoptions||{};
   const incoming=pressure(state),g=geometry(state.board);
   out.charging=!!o.b2bcharging;out.chargeAt=Number(o.b2bcharge_at??4);out.chargeBase=Number(o.b2bcharge_base??3);
   // Cancel or take it? Keep a record of the garbage received lately: in QP
   // attacks come in series, so more is likely right after some arrived.
   const frame=typeof game.getFrame==='function'?game.getFrame():0,recv=Number(state.stats?.garbage?.received)||0;
   const hist=game._aiRecvHist||(game._aiRecvHist=[]);hist.push([frame,recv]);while(hist.length>2&&frame-hist[0][0]>600)hist.shift();
   const span=Math.max(60,frame-hist[0][0]),rate=(recv-hist[0][1])/span*60;
   const series=Math.min(12,rate*3);
   // Room to the top after all of it lands. Plenty of room: take the garbage
   // (it can be dug with spins / combos) and send the attack, which in QP also
   // climbs; cancelling is only special when taking it could kill.
   const top=Number(o.boardheight||20),margin=top-(g.peak+incoming+series);
   out.incoming=incoming+(margin<8?Math.round(series):0);
   out.cancelW=!incoming?0:margin<4?4+.5*g.peak:margin<8?1.5:0;
   out.cashout=50;
   game._aiCancelInfo={incoming,series:+series.toFixed(1),margin:+margin.toFixed(1),cancelW:out.cancelW};
   if(!T)return out;
   try{
    const pieces=[state.falling?.type,LocalAIInformation.holdPiece(state.hold),...LocalAIInformation.known(base)];
    const ctx=T.ctxOf?T.ctxOf(state.setoptions):'normal';
    out.templates=T.match(state.board,pieces,8,ctx);
    // Without All-Spin mods only the player's TSD / TST builds steer the plan: their
    // mini / S-spin / Quad builds pulled the AI away from T-Spins (2026-11-13).
    if(ctx==='normal')out.templates=out.templates.filter(t=>t.kind==='T2'||t.kind==='T3');
    game._localTemplateMatches=(game._localTemplateMatches||0)+(out.templates.length?1:0);
    const st=T.style(ctx);
    if(st){
     out.colWeight=st.colWeight;if(st.cashout)out.cashout=Math.max(8,st.cashout);
     const low=Math.max(0,Math.min(1,st.lowShare));
     out.mini=[0,1+12*low,8,14];out.tMini=[0,1+8*low,3+4*low,4];
     // Quads in imported matches can be relaxed play against a weaker side;
     // the share only nudges the Quad value, capped well below a full copy.
     out.quad=Math.round(14*Math.max(.5,Math.min(1.3,.6+2*st.quadShare)));
     out.tFull=[0,16,38,52+20*Math.min(1,st.tripleShare*4)];
    }
   }catch(error){}
   return out;
  }
  function buildRoot(){
   // Diagnostics (saved with local TL / CUSTOM TTRMs as replay.aiDebug): how
   // often the spin plan exists, was cut by the clock, is reachable natively and
   // is actually played.
   const ps=game._aiPlanStats??={plans:0,noPlan:0,cut:0,notFound:0,played:0,spinMismatch:0,ms:0,width:0,async:0};
   let planMs=0;if(planner){planMs=planner.spent;ps.plans++;ps.ms+=planMs;ps.width+=planWidth;if(planner.async)ps.async++;const cut=!planner.done;const p=planner.done?planner.result():planner.stop();if(cut||planner.stopped)ps.cut++;spinPlan=p?{...p,key:cellKey(p.type,p.x,p.y,p.r)}:null;if(!p)ps.noPlan++;planner=null}
   game._localSpinPlan=spinPlan;
   queue=nodeChoices(base,!botPolicy?.ownDanger||tspinB2B,rootLimit,spinPlan);
   if(spinPlan&&!queue.some(c=>c.planned))ps.notFound++;
   rootQueue=queue;
   if(settings.fast)queue=queue.slice(0,6);
   rootBudget=queue.length;cursor=0;
   game._localSpinAudit={enumerated:queue.filter(c=>c.spin).length,generated:queue.length,checked:0,rootChecked:0,lookaheadChecked:0,rootBudget:queue.length,scriptTrials:0,nativeSpinHits:0,spinClears:0,selectedSpin:false,rules:rules0,plan:spinPlan,planMs};
  }
  game._localSpinAudit={enumerated:0,generated:0,checked:0,rootChecked:0,lookaheadChecked:0,rootBudget:0,scriptTrials:0,nativeSpinHits:0,spinClears:0,selectedSpin:false,rules:rules0};
  if(!planner)buildRoot();

  const imitation=game._aiMimicTiming?1:game._rlState?.imitation??.75;
  const playerSpinRate=(()=>{const t=game._aiBehavior?.total;if(!t)return 0;const n=(t.fire||0)+(t.dig||0)+(t.lower||0)+(t.build||0);return n>=20?Math.min(1,(t.spin||0)/n):0})();
  function evaluate(choice,snapshot,root=false){if(choice.spin)game._localSpinAudit.checked++;
   restore(choice.start||snapshot);const before=structuredClone(sandbox.state);
   const io=LocalAIMoveGen.makeIO(engine,sandbox.state),routeStart={x:sandbox.state.falling.x,r:sandbox.state.falling.r},trace=[];
   for(const key of choice.path){
    if(!io.apply(key))return null;
    const f=sandbox.state.falling,item={x:f.x,y:Math.ceil(f.y),r:f.r};
    if(key==='moveLeft'||key==='moveRight')item.wall=!io.legal(f.x+(key==='moveRight'?1:-1),f.y,f.r);
    trace.push(item);
   }
   const spun=sandbox.state.falling,last=choice.path[choice.path.length-1]||'';
   const spin=!!(spun.flags&8)&&last.startsWith('rotate');
   if(choice.spin&&!spin)return null;
   if(spin)game._localSpinAudit.nativeSpinHits++;
   const final={x:spun.x,y:Math.ceil(spun.y),rotation:spun.r},pre={...final};
   if(spun.x!==choice.x||final.y!==choice.y||spun.r!==choice.rotation)return null;
   const placed=sandbox.state.stats.piecesplaced;engine.fm.Harddrop();
   for(let i=0;i<180&&sandbox.isPlaying()&&(sandbox.state.falling.flags&128||sandbox.state.stats.piecesplaced===placed);i++)sandbox.advanceFrames(1,false);
   const soft=choice.path.slice(0,-1).includes('sonicDrop');
   const after=sandbox.state,features=vector(before,after,spin,soft,!!choice.hold);
   const nativeSpinClear=spin&&clearKind(before,after).some(kind=>/spin/i.test(kind));
   if(nativeSpinClear)game._localSpinAudit.spinClears++;
   const route=choice.path.slice(),spinSteps=[],spinTrace=trace;const g=geometry(before.board);
      const visible=LocalAIInformation.modelStates(before,after,choice.start||snapshot),input=(network||settings.collect)?LocalAIModel.encode(...visible,features):null;const playerImitation=game._aiMimicTiming?1:game._rlState?.imitation??.75;let score=boundedLearningValue(features,weights)+tactical(before,after,tspinB2B)+(game._aiChainFocus?chainBonus(before,after,spin,game._aiChainWell??9):0)+(nativeSpinClear&&features[0]>0?Math.min(40,16+8*features[0])*(spinMini(before,after)?.35:1):0)+(network?Math.max(-24,Math.min(24,(1+3*playerImitation)*LocalAIModel.score(network,input))):0);
   score+=allSpinB2BBonus(before,after,nativeSpinClear,rotationRules(base.game.setoptions));
   score+=iTriplePenalty(before,after,before.falling.type,nativeSpinClear);
   if((tspinB2B||externalPlan)&&root&&choice.planned)score+=bp('planBonus',120);
   if(tspinB2B)score+=b2bScore(before,after,features,nativeSpinClear,before.falling.type,spinMini(before,after),geometry(before.board).peak>=dangerPeak);
   // v4.8243: a T-slot overhang built while a T is coming is a setup, not a
   // buried hole. Only the slot's own covered cells are forgiven.
   const slotCredit=botPolicy?.ownDanger||before.falling.type==='t'?0:tSlotCredit(before.board,after.board,{...after,_known:LocalAIInformation.known(choice.start||snapshot)});
   score+=slotCredit*36;
   score-=wellPenalty(before.board,after.board);
   // A spin that clears nothing only spends the T/piece (no attack, no B2B).
   if(spin&&features[0]===0&&!zeroSpinUseful)score-=tspinB2B?bp('zeroSpin',25):12;
   else if(spin&&features[0]===0)score-=6;
   // Player imitation: a player who spins often makes confirmed spin clears worth more.
   if(nativeSpinClear&&features[0]>0)score+=Math.min(30,6+40*playerSpinRate)*(0.5+0.5*imitation)*(spinMini(before,after)?.35:1);
   score+=qualityChange(before,after)+holeGuard((choice.start||snapshot).game,after,features,nativeSpinClear)+reserveValue(after)-reserveValue(snapshot.game);const nextKnown=LocalAIInformation.known(choice.start||snapshot).length>0;if(nextKnown?(!sandbox.isPlaying()||after.zenith?.incapacitated):features[4]>(before.setoptions.boardheight||20))score-=1e6;
      const strategy=botPolicy?{...botPolicy,warlock:false}:null;
   // Conservative player-observed roof/wall preference. It is a tiny, capped
   // score bias and never creates new moves, bypasses native legality or
   // overrides the much larger native spin/survival priorities.
   // A geometry-only spin template is not proof of reachability or spin
   // recognition. Only routes already confirmed by the native simulator may
   // bias BOT decisions; never give bonuses to impossible 'roof' ghosts.
   if(!botPolicy?.ownDanger){
    const placedDef=engine.fm.GetPieceDefinition(before.falling.type,final.rotation);
    const placedCells=placedDef?.data?.map(([dx,dy])=>[final.x+dx-placedDef.dx,final.y+dy-placedDef.dy])||[];
    score+=window.LocalSpinLibrary?.verifiedPlacementBonus?.(game,before.board,placedCells,before.falling.type,spin)||0;
    if(nativeSpinClear)score+=window.LocalSpinLibrary?.learnedNativeSpinBonus?.(before.board,placedCells,before.falling.type,final.rotation)||0;
   }
   // A partially built *learned* T-Spin roof has value even when completion
   // takes two setup pieces. Native simulation is still required for each
   // placement; only a real recognized Spin is eligible for the large reward.
   if(focusTSpin&&tGoals.length&&before.falling.type!=='t'&&!botPolicy?.ownDanger&&
      geometry(after.board).holes<=geometry(before.board).holes&&
      edgeAccess(after.board).risk<=edgeAccess(before.board).risk+1)
    score+=roofProgress(before.board,after.board);
   // Player-observed behavior is the strongest non-safety preference. Native
   // legality, top-out, holes and duplicate rules still remain hard guards.
   if(game._aiBehavior)score+=Math.max(-20,Math.min(20,48*LocalAIBehavior.bonus(game._aiBehavior,before,after,playerImitation)));
   if(game._rlState)score+=Math.max(-8,Math.min(8,LocalRLCore.bonus(game._aiMimicTiming?{...game._rlState,imitation:1}:game._rlState,game._rlKey,features)));
      score+=LocalTestQP.taskScore(strategy,game,{...choice,spin,type:before.falling.type,cells:engine.fm.GetPieceDefinition(before.falling.type,choice.rotation).data.map(([x,y])=>[x-engine.fm.GetPieceDefinition(before.falling.type,choice.rotation).dx,y])},features[0],g.top,before.board[0].length,before.board.length);
   if((base.game.setoptions.zenith_mods||[]).some(m=>m==='allspin'||m==='allspin_reversed')&&(after.zenith?.lastclearwasdupe||LocalRLCore.duplicate(before.zenith,before.falling.type,features[0],spin,(base.game.setoptions.zenith_mods||[]).includes('allspin_reversed'))))score-=1e6;
   // Never burn a safe charged chain merely to match a placement preference.
   if(charge(before)>0&&after.stats.btb===0&&!features[10]&&!botPolicy?.ownDanger)score-=15;
   const definition=engine.fm.GetPieceDefinition(before.falling.type,final.rotation),cells=definition.data.map(([dx,dy])=>[final.x+dx-definition.dx,final.y+dy-definition.dy]);
   const previewBoard=before.board.map(row=>row.slice());for(const [x,y]of cells)if(previewBoard[y]&&x>=0&&x<previewBoard[y].length)previewBoard[y][x]=1;const clearedRows=previewBoard.flatMap((row,y)=>row.every(Boolean)?[y]:[]);
   const origGeo=geometry(snapshot.game.board),endGeo=geometry(after.board);
   const edgeBefore=edgeAccess(snapshot.game.board),edgeAfter=edgeAccess(after.board);
   const structuralRisk=-Math.max(0,slotCredit)*20+Math.max(0,endGeo.holes-origGeo.holes)*20+Math.max(0,holeDamage(after.board)-holeDamage(snapshot.game.board))*4+Math.max(0,edgeAfter.risk-edgeBefore.risk)*1.5;
      const result={...choice,structuralRisk,edgeAccess:edgeAfter,clearedRows,boardRows:before.board.length,route,routeStart:{x:before.falling.x,r:before.falling.r},type:before.falling.type,cells,pre,final,spinSteps,spinTrace,trace:spinTrace,path:route,features,input,score,snapshot:LocalAIInformation.after(sandbox.ejectState(),choice.start||snapshot),spin,nativeSpinClear,depth:1};return result;
  }
  function planAt(root,index){let plan=root;for(let i=0;i<index&&plan;i++)plan=plan.nextPlan||plan.next;return plan}
  /* Misdrops (Tab: 置きミスを再現, off by default). A human-like slip: the
     chosen piece lands one column off (same piece, rotation and HOLD). They are
     bad moves on purpose: nothing learns them as good terrain, and review tools
     do not point them out. Rate: qp-ai-misdrop-rate (default 3%). */
  function misdrop(){
   let on=false,rate=.03;try{on=localStorage.getItem('qp-ai-misdrop')==='true';rate=Math.max(0,Math.min(.3,Number(localStorage.getItem('qp-ai-misdrop-rate')??.03)||0))}catch{}
   if(!on||settings.collect||!best||!rootQueue?.length||Math.random()>=rate)return;
   const dx=Math.random()<.5?-1:1,c=rootQueue.find(q=>q.type===best.type&&!!q.hold===!!best.hold&&q.rotation===best.rotation&&q.x===best.x+dx&&!q.spin)||rootQueue.find(q=>q.type===best.type&&!!q.hold===!!best.hold&&q.rotation===best.rotation&&q.x===best.x-dx&&!q.spin);
   if(!c)return;const r=evaluate(c,base,true);if(!r||r.score<=-1e5)return;
   r.misdrop=true;roots=[r];best=r;game._aiMisdrops=(game._aiMisdrops||0)+1;if(game._aiPlanStats)game._aiPlanStats.misdrops=(game._aiPlanStats.misdrops||0)+1;
  }
  const previewChoices=()=>settings.humanActive?[]:roots.filter(r=>r&&r.score> -100000&&r.route&&Array.isArray(r.cells)).map(({cells,route,turn,spin,features,hold,type,score})=>({cells,route,turn,spin,features,hold,type,score})).sort((a,b)=>b.score-a.score).slice(0,24);function finish(){misdrop();const priorityRoots=roots.filter(r=>r.score> -100000);if(priorityRoots.length&&!settings.collect){
    const effective=r=>{const future=Number(r.futureScore??r.score);const delta=Number(r.structuralRisk)||0;
     return future-Math.min(180,delta)*.65;
    };
    best=priorityRoots.reduce((a,b)=>effective(a)>=effective(b)?a:b);
   }if(!disposed&&!settings.collect&&game._rlState?.enabled){const picked=LocalRLCore.choose(game._aiMimicTiming?{...game._rlState,imitation:1}:game._rlState,game._rlKey,priorityRoots);if(picked&&(!best||((picked.futureScore??picked.score)>=(best.futureScore??best.score)-6&&picked.structuralRisk<=(best.structuralRisk||0)+3)))best=picked}else if(!settings.rootOnly&&!disposed&&game._aiExploration&&!botPolicy?.ownDanger&&roots.length>1&&Math.random()<.12){const candidates=priorityRoots.filter(r=>(r.futureScore??r.score)>((best?.lookaheadScore??best?.score??0)-10)&&r.score> -100000);if(candidates.length){const picked=candidates[Math.floor(Math.random()*Math.min(3,candidates.length))];best={...picked,depth:picked.futureScore===undefined?1:2,lookaheadScore:picked.futureScore}}}if(!disposed&&best&&!settings.collect){game._localSpinAudit.selectedSpin=!!best.spin;best={...best,next:best.nextPlan||best.next}}if(!disposed){disposed=true;sandbox.state.playing=false;sandbox.destroy()}return {done:true,best,previewChoices:previewChoices(),...(settings.collect?{choices:roots}: {})}}
  return {finalize(){if(planner)buildRoot();return finish()},step(limit=4){if(disposed)return {done:true,best};
   if(planner){
    // Live play: the plan never holds the piece past its lock time. With
    // little time left (high gravity) the deepest finished beam level is used.
    const left=settings.realtime?Number(window.LocalLegacyAI?.timing?.(game)?.total):Infinity;
    // A worker plan (createAsync) costs this thread nothing: only the lock time
    // and the frame cap stop it, not the slice budget meant for in-thread plans.
    if(!planner.done&&(planSlices>=planFrameCap||!planner.async&&planSlices>=(settings.realtime?bp('planSlices',(Number(settings.rootBudget)||40)>=40?20:(Number(settings.rootBudget)||40)>=28?10:6):Infinity)||left<bp('planStopFrames',22)))planner.stop();
    // A worker plan stops at the PPS clock with its deepest finished level, so a
    // high target PPS is met instead of waiting for the whole plan.
    if(!planner.done&&planner.async&&Number.isFinite(settings.dueAt)&&typeof game.getFrame==='function'&&game.getFrame()>=settings.dueAt-Math.max(1,Math.min(4,Math.floor(Number(settings.interval)/4)))&&planner.result())planner.stop();
    if(!planner.done){planSlices++;planner.step(settings.realtime?stepBudgetMs:1e9);return {done:false,best:null,previewChoices:[]}}
    // a plan cut by the clock only tells that this PC is at least that slow
    if(planner.async)(planner.stopped?(planner.spent/planWidth>speed.msPerWidth&&speed.note(planner.spent,planWidth)):speed.note(planner.spent,planWidth));
    // Native root candidates in the next slice, not in the same one.
    buildRoot();if(settings.realtime)return {done:false,best:null,previewChoices:[]};
   }
   const start=performance.now();let count=0;
   while(count<limit&&(count===0||performance.now()-start<stepBudgetMs)){
    if(cursor>=queue.length||(phase===0&&cursor>=rootBudget&&roots.length)){
     if(phase===0){roots.sort((a,b)=>b.score-a.score);best=roots[0]||null;if(settings.rootOnly)return finish();beam=balancedBeam(roots,beamWidth);phase=1;beamIndex=0}
     else beamIndex++;
     if(beamIndex>=beam.length){if(phase+1<Math.max(2,Math.min(7,settings.maxDepth||2))){beam=beam.filter(root=>{const parent=planAt(root,phase);return parent&&parent.snapshot._aiKnownCurrent!==false});beamIndex=0;phase++}else return finish()}
     if(!beam.length)return finish();
     const continuation=planAt(beam[beamIndex],phase-1).snapshot;const spins=!botPolicy?.ownDanger;queue=nodeChoices(continuation,spins,settings.realtime?(phase>=2?2:3):12);cursor=0;if(!queue.length)continue;
    }
    const root=phase?beam[beamIndex]:null,result=evaluate(queue[cursor++],phase?planAt(root,phase-1).snapshot:base,!phase);count++;
    if(phase){lookaheadChecked++;game._localSpinAudit.lookaheadChecked=lookaheadChecked}
    else {rootChecked++;game._localSpinAudit.rootChecked=rootChecked}
    if(!result)continue;
    if(!phase){roots.push(result);if(!best||result.score>best.score)best=result;
     // Spin B2B mode: the planner reproduces the native rules exactly, so a
     // planned placement whose keys, kicks and spin flag the sandbox confirmed
     // is played as is (the remaining native checks only cost time).
     if((tspinB2B||externalPlan)&&result.planned&&result.score>-1e5&&(!spinPlan?.spin||result.spin)){roots=[result];best=result;if(game._aiPlanStats)game._aiPlanStats.played++;return finish()}if(result.planned&&spinPlan?.spin&&!result.spin&&game._aiPlanStats)game._aiPlanStats.spinMismatch++;}
    else {if(result.score< -100000)continue;depth=Math.max(depth,phase+1);let combined=result.score*Math.pow(.65,phase),weight=Math.pow(.65,phase);for(let i=0;i<phase;i++){combined+=planAt(root,i).score*Math.pow(.65,i);weight+=Math.pow(.65,i)}combined/=weight;root.depthScores??={};if(combined>(root.depthScores[phase]??-Infinity)){root.depthScores[phase]=combined;const parent=planAt(root,phase-1);if(phase===1)parent.nextPlan=result;else parent.next=result;root.futureScore=combined;root.depth=phase+1}const winner=roots.reduce((a,b)=>(a.futureScore??a.score)>(b.futureScore??b.score)?a:b);best={...winner,lookaheadScore:winner.futureScore??winner.score,depth:winner.depth,next:winner.nextPlan}}

   }return {done:false,best,previewChoices:previewChoices()}},dispose(){planner=null;return finish()},get candidates(){return queue.length},get depth(){return depth}};
 }
 window.LocalCombatAI={client:CLIENT,featureNames:NAMES,defaults:DEFAULT,geometry,edgeAccess,deepWells,tSlotHoles,tSlotCredit,terrainCorrection,holeDamage,qualityChange,reserveValue,holdGuard:holeGuard,quickScore,boundedLearningValue,balancedQueue,balancedBeam,chainBonus,allSpinB2BBonus,iTriplePenalty,quadReady,clearKind,tactical,pressure,charge,vector,value,rotationRules,canSpin,variants,spinEntryScripts,scheduleFamilies,createSearch};
})();
