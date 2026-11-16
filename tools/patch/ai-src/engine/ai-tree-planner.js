/* Butter = vA tree planner (2026-11-16 rebuild, user: CCとCC2の思考回路を参考に作り直せない?).
   Name: the user typed "vATree", the IME auto-converted it to "butter", and the user chose to
   name the AI Butter (バター). Per-player builds show as "Butter <player>" (e.g. Butter Y_Kei1215).
   Search: a Cold Clear 1 style tree. The root is the board now; a node is one more piece
   placed (or held). Leaves are picked by walking down from the root and choosing children
   by rank (mostly the best, sometimes the next ones), so the good lines get deep and the
   rest stay wide. Past the known NEXT, the next piece is guessed from the 7-bag and a node
   is the average of its pieces' best children.
   Evaluation = reward of the moves on the way (attack sent, cancel, shaping) + the value of
   the board at the leaf (CC1 terms: height, holes, overhangs, bumpiness, well, T-slots).
   What the user wanted from each:
   - CC1: its T-spin and Quad view (T-slot tiers, the well) - kept as CC1 has them.
     Not kept: it does not chain B2B and never does REN-Quad -> B2B has a chain value
     (capped) and a Quad inside a REN while digging pays extra.
   - CC2: B2B awareness and dig-with-Quad / dig-with-T-spin -> garbage rows cleared pay.
     Not kept: TSD turned into a mini, forcing B2B through a bad board -> a T-spin mini
     outside a REN pays a penalty (fine when it builds a TSD or digs: the search sees that),
     and the chain value is capped so it never outweighs the board.
   - PC: worth its attack only (the room's allclear rule), no flat bonus, so a PC that throws
     away a built stack is not taken (TL S1-like rooms with big PC attack still take it).
   - Cancel: garbage that is not cancelled enters the board when a piece does not clear,
     so the search sees what taking it costs. */
(function treePlannerFactory(root){
 'use strict';
 const SP=(typeof require==='function'?require('./ai-spin-planner.js'):null)||root.LocalSpinPlanner;
 const COMBO_G=[0,0,1,1,2,2,3,3,4,4,4,5];
 const W=10,FULL=(1<<W)-1,PIECES=['t','s','z','l','j','i','o'];
 const DEFAULTS={
  // CC1 Standard (default) board weights
  backToBack:52,b2bStep:14,b2bCap:6,bump:-24,bumpSq:-7,rowTrans:-5,height:-39,topHalf:-150,topQuarter:-511,
  cavity:-173,cavitySq:-3,overhang:-34,overhangSq:-1,covered:-17,coveredSq:-1,tslot:[8,148,192,407],
  wellDepth:57,maxWell:17,wellColumn:[20,23,20,50,59,21,59,10,-10,24],
  // rewards
  // rewards: CC1's clear values (style 'cc1') or attack x atkW (style 'atk'), plus the user's changes
  style:'cc1',clear:[0,-143,-100,-58,390],tspin:[0,121,410,602],b2bClear:104,comboW:150,allSpin:60,
  atkW:105,clear1:-90,clear2:-60,clear3:-30,wastedT:-152,tMiniSolo:-130,renQuad:160,digW:45,
  pcAttack:5,pcB2B:1,charging:true,chargeAt:4,chargeBase:3,simGarbage:true,garbageCap:8,
  // take, then send (user: 火力があっても受けて死なないなら受けてからまとめ打ち): attack that would only cancel
  // garbage the board can take (stack + waiting garbage <= tankSafe rows) costs tankW per line, so the search
  // lets it in and sends the attack after (digging it with spins / REN pays digW).
  tank:true,tankW:120,tankSafe:14,
  // moves the player never makes (user: プレーヤーがしない動きは取り入れない、掘りクアッドが見えてない等): kinds from
  // kindOf() listed in ban are never chosen (player data sets it, see learn-core.mjs)
  ban:null,banW:5000,
  // a player's own Butter (user: 開幕テンプレが全く違う・動きが効率的すぎる、僕の動きに合ってない):
  //  openers: board shapes the player builds first (bottom row first). When the search starts from an opening
  //  (no garbage, no more cells than a shape), cells in the shape's rows but outside the best-fitting shape cost
  //  openW (no reward for matching: a reward that stops when the shape is done made the search avoid finishing).
  //  pickBeta: the move is drawn from the top lines with weight exp(pickBeta x (value - best)) like the
  //  player's own spread; misdrop: that share of moves lands one column off (the player's misdrop rate).
  openers:null,openW:45,openBudget:1500,openDepth:5,pickBeta:0,misdrop:0,
  // search
  ms:45,maxNodes:1e7,maxIters:1e9,maxTail:3,merge:true,speculate:true,seed:1,
 };
 function popc(n){let c=0;while(n){n&=n-1;c++}return c}
 function heightsOf(rows){const H=rows.length,h=new Int8Array(W);let seen=0;for(let y=0;y<H&&seen!==FULL;y++){let nb=rows[y]&~seen;if(!nb)continue;seen|=nb;while(nb){const b=nb&-nb;h[31-Math.clz32(b)]=H-y;nb^=b}}return h}
 function filled(rows,x,y){return x<0||x>=W||y>=rows.length||(y>=0&&(rows[y]>>x&1)===1)}
 /* T-slots as CC1 finds them (sky slot left/right, TST twist -> cave slot or a 3-corner
    spot on the stack, fin left/right). CC1 coordinates here: yb = 0 is the bottom row. */
 const TS={S:[[0,0],[-1,0],[1,0],[0,-1]],E:[[0,0],[0,1],[0,-1],[1,0]],W:[[0,0],[0,1],[0,-1],[-1,0]]};
 const SHAPES=[
  {n:3,req:(o,x,h)=>h[1]<=h[2]-1,sy:h=>h[2]+1,ok:{dx:1,y:h=>h[2],rot:'S'},rows:['#??','_??','#??']},
  {n:3,req:(o,x,h)=>h[1]<=h[0]-1,sy:h=>h[0]+1,ok:{dx:1,y:h=>h[0],rot:'S'},rows:['??#','??_','??#']},
 ];
 const TST=[
  {n:3,req:(o,x,h)=>h[0]<=h[1]&&o(x-1,h[1])===o(x-1,h[1]+1),sy:h=>h[1]+1,ok:{dx:2,y:h=>h[1]-2,rot:'W'},rows:['??#','??_','??_','?__','??_']},
  {n:3,req:(o,x,h)=>h[2]<=h[1]&&o(x+3,h[1])===o(x+3,h[1]+1),sy:h=>h[1]+1,ok:{dx:0,y:h=>h[1]-2,rot:'E'},rows:['#??','_??','_??','__?','_??']},
 ];
 const FIN=[
  {n:4,req:(o,x,h)=>h[0]<=h[1]+1,sy:h=>h[1]+2,ok:{dx:3,y:h=>h[1]-1,rot:'W'},rows:['??##?','??__?','??__#','??__?','??#_#']},
  {n:4,req:(o,x,h)=>h[3]<=h[2]+1&&o(x-1,h[2])&&o(x-1,h[2]-2),sy:h=>h[2]+2,ok:{dx:0,y:h=>h[2]-1,rot:'E'},rows:['##??','__??','__??','__??','_#??']},
 ];
 function detect(o,h,shape){
  for(let x=0;x+shape.n<=W;x++){const hs=[];for(let i=0;i<shape.n;i++)hs.push(h[x+i]);
   if(!shape.req(o,x,hs))continue;let y=shape.sy(hs),ok=true;
   for(const row of shape.rows){for(let i=0;i<row.length&&ok;i++){const c=row[i];if(c==='#'&&!o(x+i,y))ok=false;else if(c==='_'&&o(x+i,y))ok=false}if(!ok)break;y--}
   if(ok)return {x:x+shape.ok.dx,y:shape.ok.y(hs),rot:shape.ok.rot};
  }
  return null;
 }
 const fits=(o,p)=>TS[p.rot].every(([dx,dy])=>!o(p.x+dx,p.y+dy));
 function caveSlot(o,p){
  p={...p};while(fits(o,{...p,y:p.y-1}))p.y--;const x=p.x,y=p.y;
  if(p.rot==='E'){
   if(!o(x-1,y)&&o(x-1,y-1)&&o(x+1,y-1)&&o(x-1,y+1))return {x,y,rot:'S'};
   if(!o(x+1,y-1)&&!o(x+2,y-1)&&!o(x+1,y-2)&&o(x-1,y)&&o(x+2,y)&&o(x,y-2)&&o(x+2,y-2))return {x:x+1,y:y-1,rot:'S'};
  }else if(p.rot==='W'){
   if(!o(x+1,y)&&o(x+1,y+1)&&o(x+1,y-1)&&o(x-1,y-1))return {x,y,rot:'S'};
   if(!o(x-1,y-1)&&!o(x-2,y-1)&&!o(x-1,y-2)&&o(x+1,y)&&o(x-2,y)&&o(x-2,y-2)&&o(x,y-2))return {x:x-1,y:y-1,rot:'S'};
  }
  return null;
 }
 function findTslot(rows,h){
  const H=rows.length,o=(x,yb)=>x<0||x>=W||yb<0||(yb<H&&(rows[H-1-yb]>>x&1)===1);
  let p=detect(o,h,SHAPES[0])||detect(o,h,SHAPES[1]);
  if(!p){const t=detect(o,h,TST[0])||detect(o,h,TST[1]);
   if(t){p=caveSlot(o,t);if(!p){const c=o(t.x-1,t.y-1)+o(t.x+1,t.y-1)+o(t.x-1,t.y+1)+o(t.x+1,t.y+1);if(c>=3&&!fits(o,{...t,y:t.y-1}))p=t}}}
  if(!p)p=detect(o,h,FIN[0])||detect(o,h,FIN[1]);
  if(!p||!fits(o,p))return null;
  // cut it out: lock the T, clear lines
  const n=rows.slice();for(const [dx,dy] of TS[p.rot]){const yb=p.y+dy;if(yb>=0&&yb<H)n[H-1-yb]|=1<<(p.x+dx)}
  const kept=n.filter(r=>r!==FULL),lines=H-kept.length;while(kept.length<H)kept.unshift(0);
  return {lines:Math.min(3,lines),rows:kept};
 }
 function boardValue(rows,node,P,F){
  let v=0;const H=rows.length;
  if(node.b2b>0){v+=P.backToBack+P.b2bStep*Math.min(node.b2b,P.b2bCap);if(F){F.backToBack=1;F.b2bStep=Math.min(node.b2b,P.b2bCap)}}
  let h=heightsOf(rows);let hp=0;for(let x=0;x<W;x++)if(h[x]>hp)hp=h[x];
  const eff=hp+(node.pend||0);
  v+=P.topQuarter*Math.max(0,eff-15)+P.topHalf*Math.max(0,eff-10);if(F){F.topQuarter=Math.max(0,eff-15);F.topHalf=Math.max(0,eff-10)}
  // T-slots, cut out as many times as Ts are at hand
  let ts=(node.tAhead?1:0)+(node.hold==='t'?1:0);if(ts<1)ts=1;
  for(let i=0;i<ts;i++){const s=findTslot(rows,h);if(!s)break;v+=P.tslot[s.lines];if(F)F['tslot'+s.lines]=(F['tslot'+s.lines]||0)+1;if(s.lines<2)break;rows=s.rows;h=heightsOf(rows)}
  hp=0;for(let x=0;x<W;x++)if(h[x]>hp)hp=h[x];
  v+=P.height*hp;if(F)F.height=hp;
  // well: lowest column (last of the lowest), depth = rows above it filled elsewhere
  let well=0;for(let x=1;x<W;x++)if(h[x]<=h[well])well=x;
  let depth=0;for(let yb=h[well];yb<20;yb++){const r=rows[H-1-yb];if((r|(1<<well))!==FULL)break;depth++}
  depth=Math.min(depth,P.maxWell);v+=P.wellDepth*depth;if(depth)v+=P.wellColumn[well];if(F){F.wellDepth=depth;if(depth)F['wc'+well]=1}
  // row transitions
  if(P.rowTrans){let t=0;for(let y=0;y<H;y++){const r=rows[y];if(!r)continue;const d=(r|(1<<W))^(1|r<<1);t+=popc(d)}v+=P.rowTrans*t;if(F)F.rowTrans=t}
  // bumpiness outside the well
  {let b=-1,bs=-1,prev=well===0?1:0;for(let i=1;i<W;i++){if(i===well)continue;const d=Math.abs(h[prev]-h[i]);b+=d;bs+=d*d;prev=i}v+=P.bump*Math.abs(b)+P.bumpSq*Math.abs(bs);if(F){F.bump=Math.abs(b);F.bumpSq=Math.abs(bs)}}
  // cavities / overhangs (CC1), covered cells
  let cav=0,ov=0,cov=0,covSq=0;
  for(let yb=0;yb<hp;yb++){const r=rows[H-1-yb];for(let x=0;x<W;x++){if(r>>x&1||yb>=h[x])continue;
   if(x>1&&h[x-1]<=yb-1&&h[x-2]<=yb){ov++;continue}
   if(x<8&&h[x+1]<=yb-1&&h[x+2]<=yb){ov++;continue}
   cav++}}
  for(let x=0;x<W;x++)for(let yb=h[x]-3;yb>=0;yb--){if(!(rows[H-1-yb]>>x&1)){const c=Math.min(6,h[x]-yb-1);cov+=c;covSq+=c*c}}
  v+=P.cavity*cav+P.cavitySq*cav*cav+P.overhang*ov+P.overhangSq*ov*ov+P.covered*cov+P.coveredSq*covSq;
  if(F)Object.assign(F,{cavity:cav,cavitySq:cav*cav,overhang:ov,overhangSq:ov*ov,covered:cov,coveredSq:covSq});
  return v;
 }

 /* Player data (user: プレーヤーのttrからプレイを学習して真似る). moveFeatures() gives the counts
    behind every weight for one placement (reward of the move + board after it), so a player's
    choices can be fitted as weights: value = sum(weight x count). Keys are weight names;
    arrays are flattened (tslot0..3, wc0..9, clear1..4, tspin1..3). */
 function moveFeatures(rows,type,p,ctx,P0){
  const P={...DEFAULTS,...(P0||{})},g=ctx.g|0,r=lock(rows,type,p,g),F={};
  const b2bBefore=Math.max(0,ctx.b2b|0);let b2b=b2bBefore,combo=Math.max(0,ctx.combo|0);
  if(r.lines){combo++;const special=p.spin||r.lines===4,fullT=type==='t'&&p.spin===2;
   if(fullT)F['tspin'+Math.min(3,r.lines)]=1;
   else if(type==='t'&&p.spin===1){if(combo<2)F.tMiniSolo=1}
   else{F['clear'+Math.min(4,r.lines)]=1;if(p.spin)F.allSpin=1}
   if(special&&b2bBefore>0)F.b2bClear=1;
   F.comboW=COMBO_G[Math.min(11,combo-1)];
   if(!special&&b2b>0)b2b=0;if(special)b2b++;
   if(r.lines===4&&combo>=2&&g>0)F.renQuad=1;
   if(r.dug)F.digW=r.dug;
  }else combo=0;
  if(type==='t'&&!(type==='t'&&p.spin===2&&r.lines)&&!(r.lines&&combo>=2))F.wastedT=1;
  boardValue(r.rows,{b2b,hold:ctx.hold||null,tAhead:!!ctx.tAhead,pend:0},P,F);
  return {F,lines:r.lines,rows:r.rows};
 }
 // move kind of a clear (for player data: kinds the player never makes are banned)
 function kindOf(type,spin,lines,dug,combo,g){if(!lines)return null;
  if(type==='t'&&spin===2)return 'tspin'+Math.min(3,lines);if(type==='t'&&spin===1)return 'tmini';if(spin)return 'allSpin';
  if(lines===4)return dug>0?(combo>=2&&g>0?'renQuad':'digQuad'):'quad';return null}
 const KINDS=['tspin1','tspin2','tspin3','tmini','allSpin','quad','digQuad','renQuad'];
 // weight vector <-> options
 const FIT_KEYS=['backToBack','b2bStep','bump','bumpSq','rowTrans','height','topHalf','topQuarter','cavity','cavitySq','overhang','overhangSq','covered','coveredSq',
  'tslot0','tslot1','tslot2','tslot3','wellDepth','wc0','wc1','wc2','wc3','wc4','wc5','wc6','wc7','wc8','wc9',
  'clear1','clear2','clear3','clear4','tspin1','tspin2','tspin3','b2bClear','comboW','allSpin','wastedT','tMiniSolo','renQuad','digW'];
 function weightsOf(P0){const P={...DEFAULTS,...(P0||{})},w={};for(const k of FIT_KEYS){let m;
  if((m=/^tslot(\d)$/.exec(k)))w[k]=P.tslot[+m[1]];else if((m=/^wc(\d)$/.exec(k)))w[k]=P.wellColumn[+m[1]];
  else if((m=/^clear(\d)$/.exec(k)))w[k]=P.clear[+m[1]];else if((m=/^tspin(\d)$/.exec(k)))w[k]=P.tspin[+m[1]];else w[k]=P[k]}return w}
 function optionsOf(w){const o={tslot:[],wellColumn:[],clear:[0],tspin:[0]};for(const k of FIT_KEYS){let m;const v=w[k];
  if((m=/^tslot(\d)$/.exec(k)))o.tslot[+m[1]]=v;else if((m=/^wc(\d)$/.exec(k)))o.wellColumn[+m[1]]=v;
  else if((m=/^clear(\d)$/.exec(k)))o.clear[+m[1]]=v;else if((m=/^tspin(\d)$/.exec(k)))o.tspin[+m[1]]=v;else o[k]=v}return o}
 function popc(n){n=n-((n>>1)&0x55555555);n=(n&0x33333333)+((n>>2)&0x33333333);return((n+(n>>4)&0xF0F0F0F)*0x1010101)>>24}
 // Place + clear, reporting how many of the bottom g (garbage) rows were cleared.
 function lock(rows,type,p,g){
  const n=rows.slice(),H=n.length;for(const [cx,cy] of SP.__shapes()[type][p.r]){const y=p.y+cy;if(y>=0)n[y]|=1<<(p.x+cx)}
  let lines=0,dug=0;const kept=[];for(let y=0;y<H;y++){if(n[y]===FULL){lines++;if(y>=H-g)dug++}else kept.push(n[y])}
  while(kept.length<H)kept.unshift(0);
  return {rows:kept,lines,dug};
 }
 function addGarbage(rows,n,hole){const out=rows.slice(n);const r=FULL&~(1<<hole);for(let i=0;i<n;i++)out.push(r);return out}
 // Pieces that can come right after the known sequence (7-bag, any bag offset that fits).
 function nextPossible(seq){
  const can=new Set();
  for(let off=0;off<7;off++){let ok=true;
   for(let s=-off;s<seq.length&&ok;s+=7){const seen=new Set();for(let i=Math.max(0,s);i<Math.min(seq.length,s+7);i++){if(seen.has(seq[i]))ok=false;seen.add(seq[i])}}
   if(!ok)continue;
   const s=seq.length-((seq.length+off)%7);const used=new Set(seq.slice(Math.max(0,s)));
   for(const t of PIECES)if(!used.has(t))can.add(t);
  }
  return can.size?[...can]:PIECES.slice();
 }
 function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}

 function create(engine,state,options={}){
  const P={...DEFAULTS,...(root.__treePlannerParams||{}),...options};
  if(!SP.load(engine,String(P.kickset||'SRS+')))return null;
  if(SP.useRules)SP.useRules({allow180:P.allow180!==false,slam:!!P.slam});
  const H=state.board.length,rows0=new Array(H);
  for(let y=0;y<H;y++){let m=0;for(let x=0;x<W;x++)if(state.board[y][x]!==null)m|=1<<x;rows0[y]=m}
  const seq=[String(state.falling).toLowerCase(),...(state.queue||[]).map(t=>String(t).toLowerCase())].filter(t=>PIECES.includes(t));
  const holdOk=state.holdAllowed!==false,rand=rng(P.seed),holes=(P.garbageHoles||[]).slice();
  const g0=Math.max(0,Number(P.gRows)||0);
  const rootNode={rows:rows0,hold:state.hold?String(state.hold).toLowerCase():null,qi:0,b2b:Math.max(0,state.b2b|0),combo:Math.max(0,state.combo|0),
   pend:Math.max(0,Number(P.incoming)||0),g:g0,gi:0,acc:0,eval:0,children:null,spec:null,depth:0};
  // opening shapes in play only when the search starts from an opening (no garbage, no more cells than the shape)
  let rootCells=0;for(const m of rows0)if(m)rootCells+=popc(m);
  const opens=(P.openers||[]).map(o=>o.rows||o).filter(t=>!g0&&t.reduce((a,m)=>a+popc(m),0)>=rootCells),openOn=opens.length>0;
  const seen=new Map();let nodes=0,done=false,spent=0,best=null,maxDepth=0,iters=0;
  const pieceAt=(i,extra)=>i<seq.length?seq[i]:extra;
  // children of a node for one known current piece (and the hold swap)
  function expandWith(node,cur,next){
   const out=[];const opts=[[cur,node.hold,1,false]];
   if(holdOk){if(node.hold&&node.hold!==cur)opts.push([node.hold,cur,1,true]);else if(!node.hold&&next)opts.push([next,cur,2,true])}
   for(const [type,hold,adv,held] of opts){
    for(const p of SP.placements(node.rows,type,4,19,P.maxTail)){
     const r=lock(node.rows,type,p,node.g);
     const c=child(node,type,p,r,hold,adv,held);nodes++;if(c)out.push(c);
    }
   }
   return out;
  }
  function child(node,type,p,r,hold,adv,held){
   let rew=0,b2b=node.b2b,combo=node.combo,pend=node.pend,g=node.g-r.dug,rows=r.rows,gi=node.gi;
   const fullT=type==='t'&&p.spin===2;
   if(r.lines){
    combo++;
    const special=p.spin||r.lines===4;
    let atk=SP.attackOf(type,p.spin,r.lines,b2b,combo);
    if(!special&&b2b>0){if(P.charging&&b2b>P.chargeAt)atk+=b2b-P.chargeAt+P.chargeBase;b2b=0}
    if(special)b2b++;
    let pc=true;for(let y=0;y<rows.length;y++)if(rows[y]){pc=false;break}
    if(pc){atk+=P.pcAttack;b2b+=P.pcB2B}
    if(P.style==='cc1'){
     const b2bBefore=node.b2b;
     if(fullT)rew+=P.tspin[Math.min(3,r.lines)];
     else if(type==='t'&&p.spin===1){if(combo<2)rew+=P.tMiniSolo}
     else{rew+=P.clear[Math.min(4,r.lines)];if(p.spin)rew+=P.allSpin}
     if(special&&b2bBefore>0)rew+=P.b2bClear;
     rew+=P.comboW*COMBO_G[Math.min(11,combo-1)];
     if(pc)rew+=P.atkW*P.pcAttack;
     if(!special&&b2bBefore>P.chargeAt&&P.charging)rew+=P.atkW*(b2bBefore-P.chargeAt+P.chargeBase);
    }else{
     rew+=P.atkW*atk;
     if(!p.spin&&r.lines<4&&combo<2)rew+=[0,P.clear1,P.clear2,P.clear3][r.lines];
     if(type==='t'&&p.spin===1&&combo<2)rew+=P.tMiniSolo;
    }
    if(r.lines===4&&combo>=2&&node.g>0)rew+=P.renQuad;
    rew+=P.digW*r.dug;
    if((P.ban&&P.ban.length)||P.kindBias){const k=kindOf(type,p.spin,r.lines,r.dug,combo,node.g);if(k){if(P.ban&&P.ban.includes(k))rew-=P.banW;
     // the player's mix of attacks (user: 攻撃の種類の割合も合わせる、ただし高さや地形で変える): a soft bonus/penalty per
     // kind, added to the search value, so the board (height, shape, a TSM combo coming) still decides
     if(P.kindBias&&P.kindBias[k])rew+=P.kindBias[k]}}
    if(P.tank&&pend>0&&atk>0){const h=heightsOf(rows);let top=0;for(let x=0;x<W;x++)if(h[x]>top)top=h[x];if(top+pend<=P.tankSafe)rew-=P.tankW*Math.min(pend,atk)}
    pend=Math.max(0,pend-atk);
   }else{
    combo=0;
    if(P.simGarbage&&pend>0){const n=Math.min(pend,P.garbageCap)|0;if(n>0){const hc=holes[gi]??wellOf(rows);gi++;rows=addGarbage(rows,n,hc);pend-=n;g+=n}}
   }
   if(type==='t'&&!(fullT&&r.lines)&&!(r.lines&&combo>=2))rew+=P.wastedT;
   const qi=node.qi+adv;
   const n={rows,hold,qi,b2b,combo,pend,g,gi,acc:node.acc+rew,eval:0,children:null,spec:null,parent:node,depth:node.depth+1,
    move:node.depth===0?{x:p.x,y:p.y,r:p.r,type,hold:held,spin:p.spin}:node.move,dead:rows[0]!==0||rows[1]!==0};
   // same board, hold, queue spot and counters reached another way (piece order swapped
   // through hold): keep only the line that got there with more reward (CC1 merges them).
   if(P.merge){let h1=2166136261,h2=qi*31+b2b*7+combo*3+pend*131+(hold?hold.charCodeAt(0):0);for(let y=0;y<rows.length;y++){const v=rows[y];if(!v)continue;h1=Math.imul(h1^v^(y<<10),16777619);h2=(h2*33+v+y)|0}
    const k=h1+':'+h2,prev=seen.get(k);if(prev!==undefined&&prev>=n.acc)return null;seen.set(k,n.acc)}
   n.tAhead=seq.indexOf('t',qi)>=0;
   n.eval=n.dead?-1e9:n.acc+boardValue(rows,n,P)+(openOn&&!g?openBonus(rows):0);
   return n;
  }
  function openBonus(rows){let best=Infinity;const H=rows.length;
   for(const t of opens){let s=0;for(let k=0;k<t.length&&k<H;k++)s+=popc(rows[H-1-k]&~t[k]);if(s<best)best=s}
   return -P.openW*best}
  function wellOf(rows){const h=heightsOf(rows);let w=0;for(let x=1;x<W;x++)if(h[x]<=h[w])w=x;return w}
  function expand(node){
   const cur=pieceAt(node.qi,null);
   if(cur){node.children=expandWith(node,cur,pieceAt(node.qi+1,null));node.children.sort((a,b)=>b.eval-a.eval);return}
   if(!P.speculate){node.children=[];return}
   // past the known queue: one child list per possible piece (hold stays usable)
   const known=seq.slice(0,node.qi);node.spec={};
   for(const t of nextPossible(known.length?known:seq)){const l=expandWith(node,t,null);l.sort((a,b)=>b.eval-a.eval);node.spec[t]=l}
   node.children=[];
  }
  function score(node){
   if(node.spec){const ks=Object.keys(node.spec);let s=0,n=0;for(const k of ks){const l=node.spec[k];if(l.length){s+=l[0].eval;n++}}return n?s/n:-1e9}
   if(node.children&&node.children.length)return node.children[0].eval;
   return node.eval;
  }
  function pick(list){
   // rank-weighted choice: 1, 1/4, 1/9 ... (mostly the best line)
   let tot=0;const k=Math.min(list.length,8);for(let i=0;i<k;i++)tot+=1/((i+1)*(i+1));
   let r=rand()*tot;for(let i=0;i<k;i++){r-=1/((i+1)*(i+1));if(r<=0)return list[i]}return list[0];
  }
  function iterate(){
   let node=rootNode;const path=[node];
   while(true){
    if(node.spec){const ks=Object.keys(node.spec).filter(k=>node.spec[k].length);if(!ks.length)break;node=pick(node.spec[ks[(rand()*ks.length)|0]])}
    else if(node.children&&node.children.length)node=pick(node.children.filter(c=>!c.dead).length?node.children:node.children);
    else if(node.children)break;
    else{expand(node);break}
    path.push(node);
    if(node.dead)break;
   }
   iters++;if(node.depth>maxDepth)maxDepth=node.depth;
   // back up: re-sort the parent lists and refresh the evals on the path
   for(let i=path.length-1;i>=0;i--){const n=path[i];if(n.children&&(n.children.length||n.spec)){
    if(n.spec)for(const k in n.spec)n.spec[k].sort((a,b)=>b.eval-a.eval);else n.children.sort((a,b)=>b.eval-a.eval);
    n.eval=score(n)}}
   return path.length===1&&rootNode.children&&!rootNode.children.length;
  }
  // opener in piece order (user: テンプレを組める順番を考えて組んでほしい): look through the known pieces (and hold)
  // for the placements that only fill the opener's own cells, no line clear; take the first move of the line that
  // places the most pieces into the opener (and covers the fewest of its empty cells). Most common opener first.
  function openPlan(list){
   if(!openOn)return null;const H=rows0.length;
   const inT=(rows,t)=>{for(let k=0;k<H;k++){const m=rows[H-1-k];if(m&&(m&~(t[k]||0)))return false}return true};
   const covered=(rows,t)=>{let c=0;for(let x=0;x<W;x++){let top=false;for(let k=H-1;k>=0;k--){const f=rows[H-1-k]>>x&1;if(f)top=true;else if(top&&k<t.length&&(t[k]>>x&1))c++}}return c};
   let best=null;
   for(let ti=0;ti<opens.length;ti++){const t=opens[ti];if(!inT(rows0,t))continue;
    const memo=new Map();let budget=P.openBudget;
    const dfs=(rows,hold,qi)=>{const cur=qi<P.openDepth?seq[qi]:null;if(!cur||budget--<=0)return {d:0,cv:covered(rows,t)};
     const key=rows.join(',')+'|'+hold+'|'+qi;if(memo.has(key))return memo.get(key);
     let out={d:0,cv:covered(rows,t)};const opts=[[cur,hold,qi+1,false]];
     if(holdOk){if(hold&&hold!==cur)opts.push([hold,cur,qi+1,true]);else if(!hold&&seq[qi+1])opts.push([seq[qi+1],cur,qi+2,true])}
     for(const [type,h2,q2,held] of opts)for(const p of SP.placements(rows,type,4,19,P.maxTail)){
      const r=lock(rows,type,p,0);if(r.lines||!inT(r.rows,t))continue;
      const sub=dfs(r.rows,h2,q2),v={d:sub.d+1,cv:sub.cv,type,p,held};
      if(v.d>out.d||v.d===out.d&&v.cv<out.cv)out=v}
     memo.set(key,out);return out};
    const r=dfs(rows0,rootNode.hold,0);
    if(r.d>0&&(!best||r.d>best.d||r.d===best.d&&r.cv<best.cv))best=r;
   }
   if(!best)return null;
   return list.find(c=>!c.dead&&c.move.type===best.type&&c.move.x===best.p.x&&c.move.y===best.p.y&&c.move.r===best.p.r&&!!c.move.hold===best.held)||null;
  }
  function result(){
   const list=rootNode.children||[];if(!list.length)return null;
   const op=openPlan(list);if(op)return out(op);
   // CC1 pick_move: skip lines that let the waiting garbage top out the middle columns
   const inc=Math.max(0,Number(P.incoming)||0);
   const pickList=[];
   for(const c of list){if(c.dead)continue;if(inc){const h=heightsOf(c.rows);if(!(h[3]+c.pend<=20&&h[4]+c.pend<=20&&h[5]+c.pend<=20))continue}pickList.push(c)}
   if(!pickList.length)return out(list[0]);
   let c=pickList[0];
   if(P.pickBeta>0){const top=pickList.slice(0,6),w=top.map(x=>Math.exp(P.pickBeta*(x.eval-c.eval)));let s=w.reduce((a,b)=>a+b,0)*Math.random();for(let i=0;i<top.length;i++){s-=w[i];if(s<=0){c=top[i];break}}}
   if(P.misdrop>0&&Math.random()<P.misdrop){const m=c.move,near=list.filter(x=>!x.dead&&x.move.type===m.type&&x.move.hold===m.hold&&x.move.r===m.r&&Math.abs(x.move.x-m.x)===1);if(near.length)c=near[(Math.random()*near.length)|0]}
   return out(c);
  }
  function dbg(c){if(!root.__treeDebug)return;const r=lock(rootNode.rows,c.move.type,c.move,rootNode.g);if(!r.lines||c.move.spin||r.lines===4)return;
   const show=rows=>rows.slice(-12).map(m=>Array.from({length:W},(_,x)=>m>>x&1?'#':'.').join('')).join('\n');
   console.error('PLAIN',r.lines,'b2b',rootNode.b2b,'combo',rootNode.combo,'pend',rootNode.pend,'seq',seq.join(''),'hold',rootNode.hold);console.error(show(rootNode.rows));
   for(const k of (rootNode.children||[]).slice(0,4)){let n=k,line=[];while(n){line.push(n.move&&n===k?k.move.type+k.move.x+','+k.move.r+(k.move.hold?'H':''):'');n=n.children&&n.children[0]}console.error(' cand',k.move.type,k.move.x,k.move.r,'acc',k.acc|0,'eval',k.eval|0,'own',(k.eval-k.acc)|0)}}
  const out=c=>(dbg(c),{...c.move,value:c.eval,nodes,iters,depth:maxDepth});
  return {
   step(ms=4){if(done)return true;const t0=performance.now(),end=t0+Math.min(ms,Math.max(1,P.ms-spent));
    try{if(!rootNode.children)expand(rootNode);
     while(performance.now()<end){if(iterate()||nodes>=P.maxNodes||iters>=P.maxIters){done=true;break}}
     if(spent+performance.now()-t0>=P.ms)done=true}
    catch(e){done=true;if(root.__treeDebug)console.error(e)}
    spent+=performance.now()-t0;if(done)best=result();return done},
   result:()=>done?best:result(),get done(){return done},get spent(){return spent},get nodes(){return nodes},
   stop(){if(!done){done=true;best=result()}return best},
  };
 }
 function plan(engine,state,options={}){const p=create(engine,state,options);if(!p)return null;while(!p.step(50));return p.result()}
 const api={create,plan,boardValue,findTslot,nextPossible,moveFeatures,weightsOf,optionsOf,kindOf,KINDS,FIT_KEYS,DEFAULTS};
 if(typeof module!=='undefined')module.exports=api;else root.LocalTreePlanner=api;
})(typeof window==='undefined'?globalThis:window);
