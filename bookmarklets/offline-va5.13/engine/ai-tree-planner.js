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
 let W=10,FULL=(1<<W)-1;const PIECES=['t','s','z','l','j','i','o'];
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
  openers:null,openW:45,followKind:null,followBias:null,followW:300,protect:null,protectW:600,openBudget:250,openDepth:4,openMs:25,pickBeta:0,misdrop:0,
  // search
  ms:45,maxNodes:1e7,maxIters:1e9,maxTail:3,merge:true,speculate:true,seed:1,
  // keep the tree between moves (2026-11-23, user: CC1 がなぜ勝つか予測して組み直して): the next search starts from the
  // subtree of the move that was played, like CC1, so its work is not thrown away (Node vs CC1: 400 iterations a move
  // 14-9, 1000 iterations 20-4). Only when the new board, hold, B2B, combo, waiting garbage and pieces match that line.
  reuse:true,reuseKey:'tree',
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
 const DET_HS=[null,null,null,[0,0,0],[0,0,0,0]];
 function detect(o,h,shape){
  const hs=DET_HS[shape.n];
  for(let x=0;x+shape.n<=W;x++){for(let i=0;i<shape.n;i++)hs[i]=h[x+i];
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
  depth=Math.min(depth,P.maxWell);v+=P.wellDepth*depth;if(depth)v+=(W===10?P.wellColumn[well]:P.wellColumn[Math.round(well*9/Math.max(1,W-1))])||0;if(F){F.wellDepth=depth;if(depth)F['wc'+well]=1}
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
  // most placements clear nothing: no second copy then (speed, 2026-11-23)
  let full=false;for(let y=0;y<H;y++)if(n[y]===FULL){full=true;break}
  if(!full)return {rows:n,lines:0,dug:0};
  let lines=0,dug=0;const kept=[];for(let y=0;y<H;y++){if(n[y]===FULL){lines++;if(y>=H-g)dug++}else kept.push(n[y])}
  const out=new Array(H-kept.length).fill(0).concat(kept);
  return {rows:out,lines,dug};
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

 // can the rest of an opener still be filled with pieces? (user: どこに置いたら形が作れるか / どこまで組めば
 // あとは確定できるか) Exact cover of the opener's empty cells by tetrominoes, lowest-leftmost cell first, each kind
 // at most as many times as it can still come (avail, from the 7-bag). Returns how many ways (up to cap); 0 = this setup is lost.
 let ORI=null;
 function oris(){if(ORI)return ORI;ORI=[];const S=SP.__shapes(),seen=new Set();
  for(const type of PIECES)for(const cells of S[type]){const c=cells.map(([cx,cy])=>[cx,-cy]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),o=c.map(([x,k])=>[x-c[0][0],k-c[0][1]]),key=type+o.join(';');if(!seen.has(key)){seen.add(key);ORI.push({type,c:o})}}
  return ORI}
 function tilings(rem,free,avail,cap,budget){
  const n=rem.reduce((a,m)=>a+popc(m),0);if(!n)return 1;
  const O=oris(),cnt={},stack=[],L=rem.length;let found=0,left=budget;
  // a way only counts if the pieces can go in from below to above: a piece that has another one's cell under it in
  // the same column comes after it; a loop means it cannot be built
  const order=()=>{const n=stack.length,after=stack.map(()=>[]);
   for(let a=0;a<n;a++)for(let b=0;b<n;b++)if(a!==b&&stack[a].some(([x,k])=>stack[b].some(([X,K])=>X===x&&K>k)))after[a].push(b);
   const st=new Int8Array(n);const loop=v=>{st[v]=1;for(const w of after[v]){if(st[w]===1||st[w]===0&&loop(w))return true}st[v]=2;return false};
   for(let v=0;v<n;v++)if(!st[v]&&loop(v))return false;return true};
  // the lowest-leftmost setup cell is covered by some piece, which may also use free cells (DT砲の右側は自由)
  const rec=()=>{if(found>=cap||left--<=0)return;let k=0;while(k<L&&!rem[k])k++;if(k>=L){if(order())found++;return}
   const x=31-Math.clz32(rem[k]&-rem[k]);
   for(const o of O){if((cnt[o.type]|0)>=(avail[o.type]|0))continue;
    for(const [ax,ak] of o.c){const cs=o.c.map(([dx,dk])=>[x+dx-ax,k+dk-ak]);let ok=true;
     for(const [X,K] of cs){if(X<0||X>=W||K<0||K>=L||!((rem[K]|free[K])>>X&1)||(K<k||K===k&&X<x)&&(rem[K]>>X&1)){ok=false;break}}
     if(!ok)continue;const was=cs.map(([X,K])=>rem[K]>>X&1);
     for(const [X,K] of cs){rem[K]&=~(1<<X);free[K]&=~(1<<X)}cnt[o.type]=(cnt[o.type]|0)+1;stack.push(cs);
     rec();stack.pop();cnt[o.type]--;cs.forEach(([X,K],i)=>{if(was[i])rem[K]|=1<<X;else free[K]|=1<<X});if(found>=cap)return}}};
  rec();return found}
 const REUSE=new Map();
 function sameRows(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
 function create(engine,state,options={}){
  const P={...DEFAULTS,...(root.__treePlannerParams||{}),...options};
  if(!SP.load(engine,String(P.kickset||'SRS+')))return null;
  if(SP.useRules)SP.useRules({allow180:P.allow180!==false,slam:!!P.slam});
  // v5.19: any board width (from the board); openers are 10-wide shapes, so only on a 10-wide board
  {const w=SP.setWidth?SP.setWidth(state.board[0]?.length||10):10;if(w!==W){W=w;FULL=(1<<W)-1}if(W!==10)P.openers=null}
  const H=state.board.length,rows0=new Array(H);
  for(let y=0;y<H;y++){let m=0;for(let x=0;x<W;x++)if(state.board[y][x]!==null)m|=1<<x;rows0[y]=m}
  const seq=[String(state.falling).toLowerCase(),...(state.queue||[]).map(t=>String(t).toLowerCase())].filter(t=>PIECES.includes(t));
  const holdOk=state.holdAllowed!==false,rand=rng(P.seed),holes=(P.garbageHoles||[]).slice();
  const g0=Math.max(0,Number(P.gRows)||0);
  let rootNode={rows:rows0,hold:state.hold?String(state.hold).toLowerCase():null,qi:0,b2b:Math.max(0,state.b2b|0),combo:Math.max(0,state.combo|0),
   pend:Math.max(0,Number(P.incoming)||0),g:g0,gi:0,acc:0,eval:0,children:null,spec:null,depth:0};
  // opening shapes in play only when the search starts from an opening (no garbage, no more cells than the shape)
  let rootCells=0;for(const m of rows0)if(m)rootCells+=popc(m);
  const opens=(P.openers||[]).map(o=>{const rows=o.rows||o;return {rows,empty:o.empty||rows.map(()=>0),book:o.book||null,n:o.n||1}}).filter(()=>P.openLive!==undefined?!!P.openLive:!g0),openOn=opens.length>0;
  const seen=new Map();let nodes=0,done=false,spent=0,best=null,maxDepth=0,iters=0;
  const pieceAt=(i,extra)=>i<seq.length?seq[i]:extra;
  // the values that change what a node is worth besides the board (a player's opener / follow-up / bans): reuse only
  // when they are the same as for the old tree
  const sig=JSON.stringify([openOn,P.followKind,P.followBias,P.protect,P.kindBias,P.ban,P.style,P.tank,P.tankSafe,P.charging]);
  let reused=0;
  if(P.reuse){const prev=REUSE.get(P.reuseKey);REUSE.delete(P.reuseKey);
   if(prev&&prev.sig===sig&&prev.root.children)for(const c of prev.root.children){
    if(c.dead||c.hold!==rootNode.hold||c.b2b!==rootNode.b2b||c.combo!==rootNode.combo||c.pend!==rootNode.pend||!sameRows(c.rows,rows0))continue;
    const left=prev.seq.slice(c.qi);let ok=left.length<=seq.length;for(let i=0;ok&&i<left.length;i++)if(left[i]!==seq[i])ok=false;
    if(!ok)continue;
    // re-root: queue spots and depths move down; the first moves are the new root's children; lists past the old
    // queue become plain lists for the piece now in sight; then the values are backed up again
    const shift=c.qi,walk=(n,mv)=>{n.qi-=shift;n.depth--;if(n.depth===1)mv=n.own;n.move=mv;
     if(n.spec&&n.qi<seq.length){n.children=n.spec[seq[n.qi]]||null;n.spec=null}
     let k=0;if(n.children)for(const ch of n.children){walk(ch,mv);k++}
     if(n.spec)for(const t in n.spec)for(const ch of n.spec[t])walk(ch,mv);
     if(n.children&&n.children.length)n.children.sort((a,b)=>b.eval-a.eval);if(n.spec)for(const t in n.spec)n.spec[t].sort((a,b)=>b.eval-a.eval);
     if(n.children||n.spec)n.eval=score(n);reused++};
    walk(c,null);c.depth=0;c.move=undefined;rootNode=c;break}
   if(root.__reuseDbg&&prev){const why=!reused&&prev.root.children?prev.root.children.map(c=>sameRows(c.rows,rows0)?(c.hold!==rootNode.hold?'hold':c.b2b!==rootNode.b2b?'b2b':c.combo!==rootNode.combo?'combo':c.pend!==rootNode.pend?'pend':'seq'):null).find(Boolean)||'board':null;root.__reuseDbg(reused?'ok':prev.sig!==sig?'sig':why)}}
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
   let rew=0;
   // the setup's slots stay open until its T-spins are done (protect: rows from the bottom)
   if(P.protect&&!r.lines){const H=r.rows.length;for(let k=0;k<P.protect.length;k++)if(r.rows[H-1-k]&P.protect[k]){rew-=P.protectW;break}}
   let b2b=node.b2b,combo=node.combo,pend=node.pend,g=node.g-r.dug,rows=r.rows,gi=node.gi;
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
    // after a setup: the player's next attack from it (followKind, e.g. tspin2 then tspin3)
    if(P.followKind&&kindOf(type,p.spin,r.lines,r.dug,combo,node.g)===P.followKind)rew+=P.followW;
    // the second attack from a setup: the player's share of each kind (followBias {kind: share}), not fixed
    if(P.followBias){const k=kindOf(type,p.spin,r.lines,r.dug,combo,node.g);if(k&&P.followBias[k])rew+=P.followW*P.followBias[k]}
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
    own:{x:p.x,y:p.y,r:p.r,type,hold:held,spin:p.spin},dead:rows[0]!==0||rows[1]!==0};
   n.move=node.depth===0?n.own:node.move;
   // same board, hold, queue spot and counters reached another way (piece order swapped
   // through hold): keep only the line that got there with more reward (CC1 merges them).
   if(P.merge){let h1=2166136261,h2=qi*31+b2b*7+combo*3+pend*131+(hold?hold.charCodeAt(0):0);for(let y=0;y<rows.length;y++){const v=rows[y];if(!v)continue;h1=Math.imul(h1^v^(y<<10),16777619);h2=(h2*33+v+y)|0}
    const k=h1+':'+h2,prev=seen.get(k);if(prev!==undefined&&prev>=n.acc)return null;seen.set(k,n.acc)}
   n.tAhead=seq.indexOf('t',qi)>=0;
   n.eval=n.dead?-1e9:n.acc+boardValue(rows,n,P)+(openOn&&!g?openBonus(rows):0);
   return n;
  }
  function openBonus(rows){let best=Infinity;const H=rows.length;
   for(const o of opens){const t=o.rows;let s=0;for(let k=0;k<t.length&&k<H;k++)s+=popc(t[k]&~rows[H-1-k])+popc(o.empty[k]&rows[H-1-k]);if(s<best)best=s}
   return -P.openW*best/4}
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
  // opener in piece order (user: テンプレを組める順番を考えて / どこに置いたら形が作れるか / どこまで組めばあとは確定 /
  // DT砲は2巡目は左以外テンプレじゃない、右側は自由積み、Tは持ち越し). An opener = setup cells (must), slot cells (stay
  // empty) and free cells. Moves keep the slots empty, never cover a setup cell that could not be reached any more,
  // put no T into the setup (it is kept for the T-spins), clear no line. Over the known pieces (and hold) look for the
  // line that fills the most setup cells while the rest can still be filled with the pieces the 7-bag can give
  // (tilings); among the root moves that do as well, the tree's own order decides (free cells are played well).
  function openPlan(list){
   if(!openOn)return null;const H=rows0.length,D0=rootCells/4+(rootNode.hold?1:0);
   // time limit (user: テンプレの話を入れてからすごいラグ / たまにフリーズ: this search took up to 1.6 s for one piece)
   const tEnd=Math.min(performance.now()+P.openMs,hardEnd);
   const better=(a,b)=>(a.ok!==b.ok?a.ok>b.ok:a.g!==b.g?a.g>b.g:a.ways>b.ways);
   let best=null;
   for(const o of opens){const t=o.rows,e=o.empty,L=t.length;
    const bad=rows=>{for(let k=0;k<e.length;k++)if(rows[H-1-k]&e[k])return true;return false};
    const need=rows=>{let c=0;for(let k=0;k<L;k++)c+=popc(t[k]&~rows[H-1-k]);return c};
    if(bad(rows0)||!need(rows0))continue;
    const blocked=rows=>{const top=new Int8Array(W).fill(-1);for(let x=0;x<W;x++)for(let k=H-1;k>=0;k--)if(rows[H-1-k]>>x&1){top[x]=k;break}
     let c=0;for(let k=0;k<L;k++){const row=rows[H-1-k];for(let x=0;x<W;x++){if(!(t[k]>>x&1)||row>>x&1||top[x]<k)continue;
      let ok=false;for(const dir of [-1,1])for(let s=1,X=x+dir;s<=3&&X>=0&&X<W&&!(row>>X&1);s++,X+=dir)if(top[X]<k){ok=true;break}
      if(!ok)c++}}return c};
    const memo=new Map(),tmemo=new Map();let budget=P.openBudget;
    const leaf=(rows,hold,qi)=>{const left=seq.slice(qi),key=rows.join(',')+'|'+hold+'|'+left.join('');let w=tmemo.get(key);
     if(w===undefined){const rem=[],free=[];for(let k=0;k<L+1;k++){const b=rows[H-1-k]||0,tk=t[k]||0;rem.push(tk&~b);free.push(FULL&~tk&~(e[k]||0)&~b)}
      const n=Math.ceil(rem.reduce((a,m)=>a+popc(m),0)/4)+2,avail={};
      for(const x of left)avail[x]=(avail[x]||0)+1;if(hold)avail[hold]=(avail[hold]||0)+1;
      const gl=D0+seq.length-1,B=Math.floor(gl/7),inB=new Set();for(let j=0;j<seq.length;j++)if(Math.floor((D0+j)/7)===B)inB.add(seq[j]);
      const restN=6-gl%7;if(restN>0)for(const x of PIECES)if(!inB.has(x))avail[x]=(avail[x]||0)+1;
      const bags=Math.max(0,Math.ceil((n-left.length-(hold?1:0)-restN)/7));if(bags)for(const x of PIECES)avail[x]=(avail[x]||0)+bags;
      avail.t=0;w=performance.now()>tEnd?0:tilings(rem,free,avail,4,400);tmemo.set(key,w)}
     return {ok:w>0?1:0,g:0,ways:w}};
    // the T stays in hold for the T-spins; only placed when it cannot be held (hold is a T already)
    const tKeep=!(rootNode.hold==='t'&&seq[0]==='t');
    // free cells only up to one row above the setup (the free side is not stacked up)
    const tall=rows=>{for(let k=L+1;k<H;k++)if(rows[H-1-k])return true;return false};
    const okMove=(rows,type,p)=>{const r=lock(rows,type,p,0);if(r.lines||bad(r.rows)||tall(r.rows))return null;
     if(type==='t'&&tKeep)return null;if(blocked(r.rows)>blocked(rows))return null;return r};
    const dfs=(rows,hold,qi)=>{const cur=qi<P.openDepth?seq[qi]:null;if(!cur||budget--<=0||performance.now()>tEnd)return leaf(rows,hold,qi);
     const key=rows.join(',')+'|'+hold+'|'+qi;if(memo.has(key))return memo.get(key);
     let out=leaf(rows,hold,qi);const opts=[[cur,hold,qi+1]];
     if(holdOk){if(hold&&hold!==cur)opts.push([hold,cur,qi+1]);else if(!hold&&seq[qi+1])opts.push([seq[qi+1],cur,qi+2])}
     const n0=need(rows);
     for(const [type,h2,q2] of opts)for(const p of SP.placements(rows,type,4,19,P.maxTail)){
      const r=okMove(rows,type,p);if(!r)continue;const sub=dfs(r.rows,h2,q2),v={ok:sub.ok,g:sub.g+n0-need(r.rows),ways:sub.ways};
      if(better(v,out))out=v}
     memo.set(key,out);return out};
    // the root moves the tree found, in its order
    const n0=need(rows0);
    for(const c of list){if(c.dead)continue;if(performance.now()>tEnd)break;const m=c.move;const r=okMove(rows0,m.type,m);if(!r)continue;
     const h2=m.hold?(rootNode.hold?seq[0]:seq[0]):rootNode.hold,q2=m.hold&&!rootNode.hold?2:1;
     const sub=dfs(r.rows,h2,q2),v={ok:sub.ok,g:sub.g+n0-need(r.rows),ways:sub.ways,c};
     if(v.ok&&(!best||better(v,best)))best=v}
   }
   if(root.__openDbg)root.__openDbg(best&&{g:best.g,ways:best.ways,type:best.c.move.type},rootCells);
   return best?best.c:null;
  }
  // the player's setup from its book (user: y_kei1215 の DT砲を組めていない; 2026-11-16). A book = the pieces of the setup
  // where the player put them (kind + cells, rows from the bottom). A book piece goes in when its cells are empty and
  // every book piece that has a cell under one of its cells is in. Over the known pieces (hold too) the line that
  // puts in the most book pieces wins; a piece with no place yet is held, or goes where it covers no book cell, no
  // slot cell and no column above a book cell that is still open. The T is not put outside the book (kept for the T-spin).
  // Returns {c} (the root move), {done:true} (book complete: the tree plays, the package sets the follow-up) or null.
  function bookPlan(list){
   if(!openOn)return null;const H=rows0.length,S=SP.__shapes();let doneAny=false;const picks=[];const tEnd=Math.min(performance.now()+P.openMs,hardEnd);
   // the known pieces, plus the last piece of the bag when only one is left (7-bag: it is certain)
   const sq=seq.slice();{const D0=Math.round(rootCells/4)+(rootNode.hold?1:0),at=(D0+sq.length)%7;
    if(at===6){const inB=new Set(sq.slice(sq.length-6));const left=PIECES.filter(t=>!inB.has(t));if(left.length===1)sq.push(left[0])}}
   for(const o of opens){const B=o.book;if(!B||!B.length)continue;const e=o.empty,L=o.rows.length;
    const rb=new Array(L+6);for(let k=0;k<L+6;k++)rb[k]=rows0[H-1-k]||0;
    let bad=false;for(let k=0;k<e.length;k++)if(rb[k]&e[k]){bad=true;break}if(bad)continue;
    let done=0;for(let i=0;i<B.length&&!bad;i++){let f=0;for(const [x,k] of B[i].c)if(rb[k]>>x&1)f++;if(f===4)done|=1<<i;else if(f)bad=true}
    if(bad)continue;
    if(done===(1<<B.length)-1){doneAny=true;continue}
    // dep[i]: book pieces with a cell under a cell of piece i (same column)
    const dep=B.map((q,i)=>{let m=0;B.forEach((r,j)=>{if(j!==i&&q.c.some(([x,k])=>r.c.some(([X,K])=>X===x&&K<k)))m|=1<<j});return m});
    // can book piece i go in now: its cells are empty, it rests on something, and it can get there (a straight drop,
    // or a slide / spin the placement search finds: a J can still be slid under the Z that was put in first)
    const rmemo=new Map();
    const reach=(rows,i)=>{const key=i+'|'+rows.join(',');let v=rmemo.get(key);if(v!==undefined)return v;if(performance.now()>tEnd)return false;
     const full=new Array(H).fill(0);for(let k=0;k<rows.length;k++)full[H-1-k]=rows[k];v=false;
     for(const q of SP.placements(full,B[i].t,4,19,P.maxTail)){const cs=S[B[i].t][q.r];
      if(B[i].c.every(([x,k])=>cs.some(([cx,cy])=>q.x+cx===x&&H-1-(q.y+cy)===k))){v=true;break}}
     rmemo.set(key,v);return v};
    const fits=(rows,i)=>{let sup=false,drop=true;for(const [x,k] of B[i].c){if(rows[k]>>x&1)return 0;if(k===0||rows[k-1]>>x&1)sup=true;
      if(drop)for(let K=k+1;K<rows.length;K++)if(rows[K]>>x&1){drop=false;break}}return !sup?0:drop?2:1};
    const can=(rows,dn,i)=>{if(dn>>i&1)return false;const f=fits(rows,i);if(!f||(f===1&&!reach(rows,i)))return false;
     // it must not shut out a book piece under it that is still to come
     if((dep[i]&~dn)!==0){const n=put(rows,i);for(let j=0;j<B.length;j++)if(dep[i]>>j&1&&!(dn>>j&1)){const g=fits(n,j);if(g===1&&!reach(n,j))return false}}
     return true};
    const put=(rows,i)=>{const n=rows.slice();for(const [x,k] of B[i].c)n[k]|=1<<x;return n};
    const memo=new Map();
    // most book pieces that can still go in with the known pieces from qi on
    const dfs=(rows,dn,hold,qi)=>{const cur=sq[qi];if(!cur)return 0;const key=dn+'|'+hold+'|'+qi;if(memo.has(key))return memo.get(key);if(performance.now()>hardEnd)return 0;
     let best=0;const opts=[[cur,hold,qi+1]];
     if(holdOk){if(hold&&hold!==cur)opts.push([hold,cur,qi+1]);else if(!hold&&sq[qi+1])opts.push([sq[qi+1],cur,qi+2])}
     for(const [type,h2,q2] of opts){let placed=false;
      for(let i=0;i<B.length;i++)if(B[i].t===type&&can(rows,dn,i)){placed=true;const v=1+dfs(put(rows,i),dn|1<<i,h2,q2);if(v>best)best=v}
      if(!placed&&(type!=='t'||h2==='t')){const v=dfs(rows,dn,h2,q2)-0.01;if(v>best)best=v}}
     memo.set(key,best);return best};
    // remaining book cells, and the columns above them
    const rem=new Array(L+6).fill(0);for(let i=0;i<B.length;i++)if(!(done>>i&1))for(const [x,k] of B[i].c)rem[k]|=1<<x;
    const tKeep=!(rootNode.hold==='t'&&seq[0]==='t');let best=null;const DBG=root.__bookDbg?{cover:0,slot:0,tall:0,over:0,tk:0,dep:0,lines:0,free:0}:null;
    for(const c of list){if(c.dead)continue;if(best&&performance.now()>tEnd||performance.now()>hardEnd)break;const m=c.move,cells=S[m.type][m.r].map(([cx,cy])=>[m.x+cx,H-1-(m.y+cy)]);
     if(cells.some(([x,k])=>k<0||k>=L+6))continue;const r=lock(rows0,m.type,m,0);if(r.lines)continue;
     const h2=m.hold?seq[0]:rootNode.hold,q2=m.hold&&!rootNode.hold?2:1;
     let bi=-1;for(let i=0;i<B.length;i++)if(!(done>>i&1)&&B[i].t===m.type&&B[i].c.every(([x,k])=>cells.some(([X,K])=>X===x&&K===k))){bi=i;break}
     let v;
     // equal lines: the book's T goes in first (a T left in hold is in the way when the next T comes), then moves without hold
     if(bi>=0){if(!can(rb,done,bi))continue;v=1+dfs(put(rb,bi),done|1<<bi,h2,q2)+(m.type==='t'?0.005:0)+(m.hold?0:0.001)}
     else{if(m.type==='t'&&tKeep){if(DBG)DBG.tk++;continue}
      // a free piece: off the book cells and the slots, not over an open book cell, not stacked high
      let ok=true;for(const [x,k] of cells){if(rem[k]>>x&1||(e[k]||0)>>x&1||k>L+3){ok=false;if(DBG)DBG[rem[k]>>x&1?'cover':(e[k]||0)>>x&1?'slot':'tall']++;break}for(let K=0;K<k;K++)if(rem[K]>>x&1){ok=false;if(DBG)DBG.over++;break}if(!ok)break}
      // no hole under it in the setup's rows and nothing over a slot's opening (2026-11-21: a Z on the free side left a
      // hole in a row the DT cannon's TST clears, so the TST was lost)
      if(ok)for(const [x,k] of cells){if(k>0&&k<=L&&!(rb[k-1]>>x&1)&&!cells.some(([X,K])=>X===x&&K===k-1)){ok=false;if(DBG)DBG.hole=(DBG.hole|0)+1;break}
       for(let K=k-1;K>=0&&!(rb[K]>>x&1);K--)if((e[K]||0)>>x&1){ok=false;if(DBG)DBG.mouth=(DBG.mouth|0)+1;break}if(!ok)break}
      if(!ok)continue;const n=rb.slice();for(const [x,k] of cells)n[k]|=1<<x;v=dfs(n,done,h2,q2)-0.01;if(DBG){DBG.free++;DBG.fv=v}}
     if(!best||v>best.v+1e-9)best={v,c,book:bi>=0}}
    if(root.__bookDbg)root.__bookDbg({done:done.toString(2),best:best&&{v:best.v,book:best.book,t:best.c.move.type},why:DBG,list:list.length,seq:seq.join(''),hold:rootNode.hold});
    if(best&&best.v>0)picks.push({...best,o})}
   if(!picks.length)return doneAny?{done:true}:null;
   // which setup: the one that gets the most pieces in with the pieces in sight (a DT cannon cannot be built from
   // every order; the player then builds the other one); ties by how often the player built it
   const top=Math.max(...picks.map(p=>p.v)),near=picks.filter(p=>p.v>=top-0.5);
   let pick=near[0];if(near.length>1){let tot=near.reduce((a,p)=>a+p.o.n,0),r=Math.random()*tot;for(const p of near){r-=p.o.n;if(r<=0){pick=p;break}}}
   if(root.__openDbg)root.__openDbg({book:pick.book,v:pick.v,type:pick.c.move.type},rootCells);
   return {c:pick.c};
  }
  // both opener searches together stop at hardEnd (2026-11-21, user: プレイ中のフリーズ・開始数秒の硬直: bookPlan had no
  // limit when no root move fitted, up to 0.6 s for one piece)
  let hardEnd=0;
  function result(){
   if(P.reuse)REUSE.set(P.reuseKey,{root:rootNode,seq,sig});
   const list=rootNode.children||[];if(!list.length)return null;
   hardEnd=performance.now()+2*P.openMs;
   const bp=bookPlan(list);if(bp&&bp.c)return out(bp.c);
   const op=bp&&bp.done?null:openPlan(list);if(op)return out(op);
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
  const out=c=>(dbg(c),{...c.move,value:c.eval,nodes,iters,depth:maxDepth,reused});
  return {
   step(ms=4){if(done)return true;const t0=performance.now(),end=t0+Math.min(ms,Math.max(1,P.ms-spent));
    try{if(!rootNode.children)expand(rootNode);
     while(performance.now()<end){if(iterate()||nodes>=P.maxNodes||iters>=P.maxIters){done=true;break}}
     if(spent+performance.now()-t0>=P.ms)done=true}
    catch(e){done=true;if(root.__treeDebug)console.error(e)}
    spent+=performance.now()-t0;if(done)best=result();return done},
   // before the search is done (a Worker host asks after every 25 ms slice): the tree's best line only, without the
   // opener searches, which run once when it is done or stopped
   // (an app Worker takes this interim move when the PPS clock runs out and never asks for the final one: the tree is
   // kept here too, so the next move can start from it)
   result:()=>{if(done)return best;if(P.reuse)REUSE.set(P.reuseKey,{root:rootNode,seq,sig});const l=(rootNode.children||[]).filter(c=>!c.dead);return l.length?out(l[0]):null},get done(){return done},get spent(){return spent},get nodes(){return nodes},
   stop(){if(!done){done=true;best=result()}return best},
  };
 }
 function plan(engine,state,options={}){const p=create(engine,state,options);if(!p)return null;while(!p.step(50));return p.result()}
 const api={create,plan,boardValue,findTslot,nextPossible,moveFeatures,weightsOf,optionsOf,kindOf,KINDS,FIT_KEYS,DEFAULTS};
 if(typeof module!=='undefined')module.exports=api;else root.LocalTreePlanner=api;
})(typeof window==='undefined'?globalThis:window);
