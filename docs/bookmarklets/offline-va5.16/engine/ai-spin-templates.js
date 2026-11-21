/* vA-only local spin-pattern library.  Only real native spin flags from
 * human-controlled sessions or explicitly imported TTRs become "seen".
 * The data are advisory, never gameplay input. */
(function(root){
 'use strict';
 const KEY='qp-spin-patterns-v1',OPEN_KEY='qp-spin-openings-v1',MAX_SAVED=120,SHAPES='iotszjl';
 const empty=v=>v===null||v===undefined;
 const coord=(x,y)=>x+','+y;
 const solid=(board,x,y)=>x<0||x>=(board[0]?.length||0)||y>=board.length||y>=0&&!empty(board[y][x]);
 const shape=(fm,type,r,x,y)=>{const d=fm?.GetPieceDefinition?.(type,r);if(!d?.data||d.data.length!==4)return null;return d.data.map(([dx,dy])=>[x+dx-d.dx,y+dy-d.dy])};
 const bounds=cells=>({l:Math.min(...cells.map(c=>c[0])),r:Math.max(...cells.map(c=>c[0])),t:Math.min(...cells.map(c=>c[1])),b:Math.max(...cells.map(c=>c[1]))});
 const unique=p=>p.type+':'+p.rotation+':'+p.final.map(c=>c.join(',')).join(';')+':'+p.structure.map(c=>c.join(',')).join(';');
 // Similar successful spins are grouped by the functional shape of their
 // roof and sidewalls, not by their absolute column on the board.
 function family(p){
  const top=Math.min(...p.final.map(c=>c[1])),left=Math.min(...p.final.map(c=>c[0])),right=Math.max(...p.final.map(c=>c[0]));
  const roof=p.structure.some(([x,y])=>y<=top),sideL=p.structure.some(([x,y])=>x<left),sideR=p.structure.some(([x,y])=>x>right);
  return p.type+':'+p.rotation+':'+(roof?'roof':'open')+':'+(sideL?'L':'')+(sideR?'R':'');
 }
 function readOpenings(){try{const a=JSON.parse(root.localStorage?.getItem(OPEN_KEY)||'[]');return Array.isArray(a)?a.filter(p=>Array.isArray(p.sequence)&&Number.isInteger(p.uses)).slice(0,60):[]}catch{return []}}
 let openings=readOpenings();
 function saveOpening(sequence){if(sequence.length<3)return;const signature=sequence.map(s=>s.type+String(s.x)+String(s.r)).join('/');
  const p=openings.find(s=>s.signature===signature);
  if(p)p.uses++;else openings.push({signature,sequence:sequence.slice(),uses:1});
  openings=openings.sort((a,b)=>b.uses-a.uses).slice(0,60);
  try{root.localStorage?.setItem(OPEN_KEY,JSON.stringify(openings))}catch{}
 }
 function openingStats(){return openings.map(p=>({...p,sequence:p.sequence.map(s=>({...s}))}))}

 function capture(board,piece,fm,mini=false){
  if(!Array.isArray(board)||!Array.isArray(board[0])||!piece||!SHAPES.includes(String(piece.type).toLowerCase())||!(piece.flags&8))return null;
  const type=String(piece.type).toLowerCase(),rot=Number(piece.r),x=Number(piece.x),y=Math.ceil(Number(piece.y));
  if(!Number.isInteger(rot)||rot<0||rot>3||!Number.isInteger(x)||!Number.isInteger(y))return null;
  const cells=shape(fm,type,rot,x,y);if(!cells)return null;
  const b=bounds(cells),occupied=[];for(let yy=b.t-2;yy<=b.b+2;yy++)for(let xx=b.l-2;xx<=b.r+2;xx++){
   if(xx<0||xx>=board[0].length||yy<0||yy>=board.length||!solid(board,xx,yy))continue;
   // Record only the nearby structure, not the entire background stack.
   if(cells.some(([cx,cy])=>cx===xx&&cy===yy))continue; // locked spin piece is never its own roof/wall
   if(cells.some(([cx,cy])=>Math.abs(cx-xx)+Math.abs(cy-yy)<=2))occupied.push([xx-x,yy-y]);
  }
  const final=cells.map(([cx,cy])=>[cx-x,cy-y]);
  if(!occupied.length)return null;
  return {type,rotation:rot,final,structure:occupied,mini:!!mini,uses:1,attempts:1};
 }
 function validate(p){return p&&SHAPES.includes(p.type)&&Number.isInteger(p.rotation)&&p.rotation>=0&&p.rotation<=3&&Array.isArray(p.final)&&p.final.length===4&&Array.isArray(p.structure)&&p.structure.length>=1&&p.structure.length<=32&&[...p.final,...p.structure].every(c=>Array.isArray(c)&&c.length===2&&c.every(n=>Number.isInteger(n)&&Math.abs(n)<10));}
 function load(){try{const raw=JSON.parse(root.localStorage?.getItem(KEY)||'[]');return Array.isArray(raw)?raw.filter(validate).slice(0,MAX_SAVED):[]}catch{return []}}
 let patterns=load(),linked=new WeakSet();
 function commit(next){patterns=next.slice(-MAX_SAVED);try{root.localStorage?.setItem(KEY,JSON.stringify(patterns))}catch{}}
 function add(p){if(!validate(p))return false;const k=unique(p),i=patterns.findIndex(x=>unique(x)===k);if(i>=0){const next=patterns.slice();next[i]={...next[i],uses:Math.min(99999,(next[i].uses||1)+1),attempts:Math.min(99999,(next[i].attempts||next[i].uses||1)+1)};commit(next)}else commit([...patterns,p]);return true}
 function attach(game,source='player',sink=null){
  if(!game?.on||linked.has(game))return false;linked.add(game);
  let lastRotation=null,lastToken='',rotated=false,opening=[];
  if(source==='player')game.on('frame','qp-spin-observe-rotation',function(){
   if(this._localLiveBot||this._localAIProfileId)return;
   const falling=this.state?.falling;if(!falling)return;
   const token=String(this.state?.stats?.piecesplaced??0)+':'+falling.type;
   if(token!==lastToken){lastRotation=falling.r;rotated=false;lastToken=token}
   else if(lastRotation!==falling.r){rotated=true;lastRotation=falling.r}
  });
  game.on('lock','qp-human-spin-pattern',function(piece){
   try{
    if(source==='player'&&(this._localLiveBot||this._localAIProfileId))return;
    if(source==='player'&&opening.length<8){
     opening.push({type:String(piece.type).toUpperCase(),x:Math.round(piece.x),r:piece.r});
     if(opening.length===8)saveOpening(opening);
    }
    const p=capture(this.state?.board,piece,this.source?.self?.fm,this.source?.self?.fm?.IsSpinMini?.());
    if(p){if(sink)sink.push(p);else add(p)}
    else if(rotated&&source==='player'){
     // Rotation attempts are inferred, not guaranteed attempted Spin:
     // only count if the neighboring roof/wall structure matches an already
     // observed successful spin of the same type and orientation.
     const pseudo=capture(this.state?.board,{...piece,flags:(piece.flags||0)|8},this.source?.self?.fm);
     if(pseudo){const match=patterns.find(x=>unique(x)===unique(pseudo));
      if(match){const next=patterns.slice(),i=next.indexOf(match);next[i]={...match,attempts:Math.min(99999,(match.attempts||match.uses||1)+1)};commit(next)}
     }
    }
    rotated=false;lastRotation=null;lastToken='';
   }catch(error){console.warn('[QP spin capture]',error?.message||error)}
  });
  if(source==='player')game.on('end','qp-spin-opening-end',()=>{if(opening.length>=3&&opening.length<8)saveOpening(opening)});
  return true;
 }

 function landing(board,fm,type,rotation,x){
  const h=board.length,w=board[0].length,def=fm.GetPieceDefinition(type,rotation);if(!def?.data)return null;
  // Only simple vertical, fully visible, hard-drop reachable setups are
  // treated as executable. Wall kicks and finesse are not invented.
  let y=0;for(let n=0;n<4;n++)if(shape(fm,type,rotation,x,y)?.some(([cx,cy])=>cx<0||cx>=w||cy>=h))return null;
  const fits=yy=>shape(fm,type,rotation,x,yy)?.every(([cx,cy])=>cx>=0&&cx<w&&cy<h&&(cy<0||empty(board[cy]?.[cx])));
  if(!fits(y))return null;
  while(y<h&&fits(y+1))y++;
  const cells=shape(fm,type,rotation,x,y);
  if(cells.some(([,cy])=>cy<0))return null;
  return cells;
 }
 function knownPieces(game){
  const state=game.state||{},out=[],hold=state.hold;
  const normalize=type=>String(type?.piece||type?.type||type||'').toLowerCase();
  if(state.falling?.type)out.push({type:normalize(state.falling.type),source:'CURRENT',index:0});
  if(game.options?.display_hold!==false&&game.options?.display_hold!==0&&!LocalAIInformation.holdLocked(state)&&LocalAIInformation.holdPiece(hold))
   out.push({type:normalize(hold),source:'HOLD',index:0});
  const shown=root.LocalAIInformation?.nextCount?.(game.options)||0;
  if(game.options?.display_next!==false&&Array.isArray(state.bag))for(const [i,type] of state.bag.slice(0,shown).entries())
   out.push({type:normalize(type),source:'NEXT'+(i+1),index:i+1});
  return out.filter(a=>SHAPES.includes(a.type));
 }
 function findSetups(board,fm,missing,target,available,max=20){
  if(!missing.length||missing.length>4)return [];
  const targetCells=new Set(target.map(c=>coord(...c))),out=[];
  for(const a of available){for(let rotation=0;rotation<4;rotation++)for(let x=-3;x<board[0].length+3;x++){
   const cells=landing(board,fm,a.type,rotation,x);if(!cells||!missing.every(c=>cells.some(v=>v[0]===c[0]&&v[1]===c[1])))continue;
   if(cells.some(c=>targetCells.has(coord(...c))))continue;
   const post=board.map(row=>row.slice());for(const [cx,cy] of cells)post[cy][cx]='new';
   if(post.some(row=>row.every(v=>!empty(v))))continue;
   out.push({cells,type:a.type,source:a.source,index:a.index,rotation});
   if(out.length>=max)return out;
  }}return out;
 }
 function findSetup(board,fm,missing,target,available){return findSetups(board,fm,missing,target,available,1)[0]||null}
 // A two-step claim requires both distinct chronological minos to be known.
 // If a next piece is hidden, a learned spin is a construction IDEA only.
 function finishAvailability(setup,pieces,spinType){
  if(!setup)return {ready:false,source:'UNKNOWN'};
  if(setup.index===0){
   const next=pieces.find(p=>p.source==='NEXT1'&&p.type===spinType);
   if(next)return {ready:true,source:'NEXT1'};
   if(setup.source==='CURRENT'){
    const held=pieces.find(p=>p.source==='HOLD'&&p.type===spinType);
    if(held)return {ready:true,source:'HOLD'};
   }
  }
  return {ready:false,source:'FUTURE'};
 }
 // Cache native-verified plans per board and active piece. A shape match
 // alone NEVER qualifies as a drawable spin, even if the same roof was seen.
 const verifiedCache=new WeakMap();
 const timeNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
 const compareCells=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.map(c=>coord(...c)).sort().join('|')===b.map(c=>coord(...c)).sort().join('|');
 function stateKey(game){const state=game?.state||{};
  if(!Array.isArray(state.board)||!state.board.length)return '';
  return state.board.map(row=>row.map(v=>empty(v)?'.':'#').join('')).join('/')+'|'+String(state.falling?.type||'')+'|'+String(state.hold||'')+'|'+String(state.holdlocked||false)+'|'+String(state.stats?.piecesplaced||0)+'|'+(state.bag||[]).slice(0,3).join('');
 }
 function nativeVerifierAvailable(){return typeof root.LocalNative?.createAISandbox==='function'&&typeof root.LocalAIRouting?.find==='function'&&typeof root.LocalAIInformation?.prepare==='function'}
 // Native sandbox proof: produce the setup piece with legal inputs, lock,
 // spawn the actual known NEXT/HOLD mino, then make the final rotation and
 // observe the native spin flag at the exact four requested cells.
 function verifyNative(game,plan){
  if(!nativeVerifierAvailable()||typeof game?.ejectState!=='function')return false;
  let sim=null;
  try{
   sim=root.LocalNative.createAISandbox(game);
   if(!sim?.injectState||!sim?.source?.self?.fm||!sim?.source?.self?.bm)return false;
   const engine=sim.source.self,fm=engine.fm,bm=engine.bm;
   const seed=root.LocalAIInformation.prepare({...game.ejectState(),_aiSeedAccess:false},game._aiNextCount);
   const reset=s=>{sim.injectState(structuredClone(s));bm.ClearIsLegalAtPosMemo?.();};
   reset(seed);
   const execute=key=>{const f=sim.state.falling;if(!f)return false;const old={x:f.x,y:f.y,r:f.r};
    if(key==='rotateCW'||key==='rotateCCW'||key==='rotate180')fm.Rotate(key==='rotateCW'?1:key==='rotateCCW'?-1:2);
    else{const dx=key==='moveRight'?1:key==='moveLeft'?-1:0;if(!dx||!bm.IsLegalAtPos(f.type,f.x+dx,f.y,f.r))return false;f.x+=dx;f.lockresets++;f.locking=0;fm.ClearFlags(63|64);bm.ClearIsLegalAtPosMemo?.();if(fm.Is20G())fm.SlamToFloor()}
    return f.x!==old.x||f.y!==old.y||f.r!==old.r;
   };
   const routeTo=(x,rotation)=>{const route=root.LocalAIRouting.find({
    get:()=>structuredClone(sim.state.falling),
    set:f=>{Object.assign(sim.state.falling,structuredClone(f));bm.ClearIsLegalAtPosMemo?.()},
    apply:execute
   },{x,rotation},sim.options?.allow180!==false);
    if(!route)return false;return route.every(execute);
   };
   if(plan.setup){
    if(!['CURRENT','HOLD'].includes(plan.setup.source))return false;
    if(plan.setup.source==='HOLD'){
     if(sim.state.holdlocked||!sim.state.hold||sim.state.setoptions?.display_hold===false)return false;
     fm.Hold();
    }
    if(String(sim.state.falling?.type).toLowerCase()!==plan.setup.type)return false;
    // Route to the setup before hard dropping: wrong-height ghost proposals
    // never pass the exact landing cell comparison.
    const landingCells=()=>shape(fm,sim.state.falling.type,sim.state.falling.r,sim.state.falling.x,Math.ceil(sim.state.falling.y));
    const def=fm.GetPieceDefinition(plan.setup.type,plan.setup.rotation);
    const minDx=Math.min(...def.data.map(c=>c[0]-def.dx)),minX=Math.min(...plan.setup.cells.map(c=>c[0]));
    if(!routeTo(minX-minDx,plan.setup.rotation))return false;
    fm.SlamToFloor();if(!compareCells(landingCells(),plan.setup.cells))return false;
    const beforePieces=Number(sim.state.stats?.piecesplaced||0);fm.Harddrop();
    for(let n=0;n<180&&sim.isPlaying?.()&&(Number(sim.state.stats?.piecesplaced||0)===beforePieces||sim.state.falling?.flags&128);n++)sim.advanceFrames(1,false);
    if(!sim.isPlaying?.()||Number(sim.state.stats?.piecesplaced||0)===beforePieces)return false;
    // The promised wall/roof must still exist after the setup; a line clear
    // that removes the roof invalidates this plan.
    for(const [x,y]of plan.roof.concat(plan.walls))if(empty(sim.state.board[y]?.[x]))return false;
   }
   if(plan.setup&&plan.finish?.source==='HOLD'){
    if(sim.state.holdlocked||sim.state.setoptions?.display_hold===false)return false;
    fm.Hold();
   } else if(!plan.setup&&plan.finish?.source==='HOLD'){
    if(sim.state.holdlocked||sim.state.setoptions?.display_hold===false)return false;
    fm.Hold();
   }
   if(String(sim.state.falling?.type||'').toLowerCase()!==plan.type)return false;
   const atFinish=structuredClone(sim.ejectState());
   const targetDef=fm.GetPieceDefinition(plan.type,plan.rotation);
   if(!targetDef)return false;
   // A kick may move the centre horizontally. Try all three actual native
   // rotation inputs from nearby grounded pre-rotation positions.
   const targetMinX=Math.min(...plan.final.map(c=>c[0]));
   const offsets=targetDef.data.map(c=>c[0]-targetDef.dx),targetAnchor=targetMinX-Math.min(...offsets);
   for(const turn of [1,-1,...(sim.options?.allow180!==false?[2]:[])]){
    const prior=(plan.rotation-turn+4)%4;
    for(let x=targetAnchor-2;x<=targetAnchor+2;x++){
     reset(atFinish);
     if(!routeTo(x,prior))continue;
     fm.SlamToFloor();
     const f=sim.state.falling;
     if(!f||!bm.IsLegalAtPos(f.type,f.x,f.y,f.r))continue;
     // A real native Rotate, not an invented 'final orientation' ghost.
     const old=f.r;fm.Rotate(turn);
     if(f.r===old||!(f.flags&8))continue;
     const result=shape(fm,f.type,f.r,f.x,Math.ceil(f.y));
     if(!compareCells(result,plan.final))continue;
     const statsBefore=structuredClone(sim.state.stats||{});
     const placedBefore=Number(sim.state.stats?.piecesplaced||0);
     fm.Harddrop();
     for(let n=0;n<120&&sim.isPlaying?.()&&Number(sim.state.stats?.piecesplaced||0)===placedBefore;n++)sim.advanceFrames(1,false);
     // The native flag is necessary, but after locking confirm that a
     // registered spin clear is not contradicted by the native statistics.
     const beforeLines=Number(statsBefore.lines||0),afterLines=Number(sim.state.stats?.lines||0);
     if(afterLines>beforeLines){
      const b=statsBefore.clears||{},a=sim.state.stats?.clears||{};
      if(!Object.keys(a).some(k=>/spin/i.test(k)&&Number(a[k]||0)>Number(b[k]||0)))continue;
     }
     return true;
    }
   }
   return false;
  }catch(error){return false}
  finally{try{sim?.destroy?.()}catch{}}
 }
 function possiblePlans(game,options={}){
  const board=game?.state?.board,fm=game?.source?.self?.fm;
  if(!Array.isArray(board)||!board.length||!fm)return [];
  const replay=options.replay===true,lib=(options.library||patterns).filter(validate),list=[],available=knownPieces(game),w=board[0].length,h=board.length;
  for(const p of lib.slice(-60))for(let x=0;x<w;x++)for(let y=Math.max(0,h-20);y<h;y++){
   const final=p.final.map(([dx,dy])=>[x+dx,y+dy]);
   if(final.some(([cx,cy])=>cx<0||cx>=w||cy<0||cy>=h||!empty(board[cy][cx])))continue;
   const structure=p.structure.map(([dx,dy])=>[x+dx,y+dy]);
   if(structure.some(([cx,cy])=>cx<0||cx>=w||cy<0||cy>=h))continue;
   const have=structure.filter(([cx,cy])=>!empty(board[cy][cx])),missing=structure.filter(([cx,cy])=>empty(board[cy][cx]));
   if(!have.length||missing.length>4)continue;
   const setups=missing.length?findSetups(board,fm,missing,final,available,6):[null];
   for(const setup of setups){
    const finish=setup?finishAvailability(setup,available,p.type):{ready:available.some(a=>a.type===p.type&&a.index===0),source:available.find(a=>a.type===p.type&&a.index===0)?.source||'UNKNOWN'};
    if(!finish.ready)continue; // No promises about hidden future pieces.
    const b=bounds(final),roof=structure.filter(([,cy])=>cy<=b.t),walls=structure.filter(([,cy])=>cy>b.t);
    const score=have.length*10-missing.length*18+(setup?.source==='CURRENT'?18:0)+Math.log2(p.uses||1)*5;
    const key=coord(x,y)+':'+p.type+':'+p.rotation+':'+(setup?.source||'NONE');
    list.push({key,score,type:p.type,rotation:p.rotation,final,missing,roof,walls,setup,finish,ready:true,
      family:family(p),used:p.uses||1,attempts:p.attempts||p.uses||1,from:'learned',replay,verified:false});
   }
  }
  // Reduce duplicate variants BEFORE running any expensive native simulations.
  const seen=new Set();return list.sort((a,b)=>b.score-a.score).filter(p=>{
   const signature=p.family+'|'+(p.setup?.type||'')+'|'+p.type+'|'+(p.setup?.source||'');
   if(seen.has(signature))return false;seen.add(signature);return true;
  }).slice(0,50);
 }
 function opportunities(game,options={}){
  if(!game||!nativeVerifierAvailable())return []; // Fail closed.
  const key=stateKey(game);if(!key)return [];
  let cache=verifiedCache.get(game);
  if(!cache||cache.key!==key){cache={key,raw:possiblePlans(game,options),cursor:0,verified:[],nextTime:0};verifiedCache.set(game,cache)}
  const now=timeNow();if(now>=cache.nextTime&&cache.cursor<cache.raw.length&&cache.verified.length<5){
   const started=now;
   // Bounded work; unfinished proposals remain pending, never visible.
   let tested=0;while(cache.cursor<cache.raw.length&&cache.verified.length<5&&tested<5){
    const p=cache.raw[cache.cursor++];tested++;
    if(verifyNative(game,p)){p.verified=true;cache.verified.push(p)}
    if(timeNow()-started>7)break;
   }
   cache.nextTime=timeNow()+350;
  }
  return cache.verified.slice(0,5);
 }
 function cachedVerified(game){const entry=verifiedCache.get(game);return entry?.key===stateKey(game)?entry.verified.slice():[]}
 function verifiedPlacementBonus(game,before,finalCells,type,spin){
  // Only a successfully replayed native route may affect the AI's choices.
  // The setup bonus cannot overwhelm ordinary survival/attack heuristics.
  if(!Array.isArray(before)||!Array.isArray(finalCells))return 0;
  for(const p of cachedVerified(game)){
   if(p.setup&&p.setup.type===String(type).toLowerCase()&&compareCells(finalCells,p.setup.cells))return 14;
   if(spin&&p.type===String(type).toLowerCase()&&compareCells(finalCells,p.final))return 30;
  }
  return 0;
 }
 // Reward only ACTUAL native-confirmed Spin locks matching this player's
 // recorded spin shape. This does not guess that a roof alone creates a spin.
 function learnedNativeSpinBonus(board,finalCells,type,rotation){
  if(!Array.isArray(board)||!Array.isArray(finalCells)||finalCells.length!==4)return 0;
  let best=0;
  for(const p of patterns){
   if(p.type!==String(type||'').toLowerCase()||p.rotation!==rotation)continue;
   for(const cell of finalCells){
    const dx=cell[0]-p.final[0][0],dy=cell[1]-p.final[0][1];
    if(!compareCells(finalCells,p.final.map(([x,y])=>[x+dx,y+dy])))continue;
    if(p.structure.every(([x,y])=>{const xx=x+dx,yy=y+dy;return yy>=0&&yy<board.length&&xx>=0&&xx<board[0].length&&!empty(board[yy][xx])})){
     best=Math.max(best,Math.min(36,10+Math.log2(1+Math.max(1,p.uses||1))*6));
    }
   }
  }
  return best;
 }
 // Planning only: use real previously observed T-Spin roofs as *partial*
 // objectives.  A roof resemblance is never itself a Spin or an executable
 // move.  Final rewards still require the native engine to confirm the Spin.
 function canonicalTSpinPatterns(fm){
  const corners=[[-1,-1],[1,-1],[-1,1],[1,1]],out=[];
  if(typeof fm?.GetPieceDefinition!=='function')return out;
  for(let rotation=0;rotation<4;rotation++){
   const def=fm.GetPieceDefinition('t',rotation);
   if(!Array.isArray(def?.data)||def.data.length!==4)continue;
   const final=def.data.map(([x,y])=>[x-def.dx,y-def.dy]);
   for(let missing=0;missing<corners.length;missing++){
    const structure=corners.filter((_,i)=>i!==missing);
    if(structure.some(([x,y])=>final.some(([fx,fy])=>fx===x&&fy===y)))continue;
    out.push({type:'t',rotation,final,structure,uses:1,attempts:0,generated:true});
   }
  }
  return out;
 }
 function compileTSpinGoals(board,available,library=patterns,fm=null){
  if(!Array.isArray(board)||!Array.isArray(board[0])||!Array.isArray(available))return [];
  // Never plan around hidden future pieces. Two roof pieces + a T require T
  // in HOLD or within the next two known draws.
  if(!available.some(a=>a.type==='t'&&(a.source==='HOLD'||a.source==='CURRENT'||Number(a.index)<=2)))return [];
  const width=board[0].length,height=board.length,goals=[],seen=new Set();
  const examples=[...library.filter(p=>validate(p)&&p.type==='t').sort((a,b)=>(b.uses||1)-(a.uses||1)).slice(0,24),...canonicalTSpinPatterns(fm)];
  for(const p of examples)for(let x=0;x<width;x++)for(let y=Math.max(0,height-15);y<height;y++){
   const final=p.final.map(([dx,dy])=>[x+dx,y+dy]);
   if(final.some(([cx,cy])=>cx<0||cx>=width||cy<0||cy>=height||!empty(board[cy][cx])))continue;
   const roof=p.structure.map(([dx,dy])=>[x+dx,y+dy]);
   if(roof.some(([cx,cy])=>cx<0||cx>=width||cy<0||cy>=height))continue;
   const have=roof.reduce((n,[cx,cy])=>n+(!empty(board[cy][cx])?1:0),0),missing=roof.length-have;
   if(have<1||missing<1||missing>8||roof.length<3)continue;
   const id=p.rotation+':'+final.map(c=>c.join(',')).sort().join('|');
   if(seen.has(id))continue;seen.add(id);
   goals.push({final,roof,baseCount:have,missing,uses:p.uses||1,rotation:p.rotation});
  }
  return goals.sort((a,b)=>a.missing-b.missing||b.baseCount-a.baseCount||b.uses-a.uses).slice(0,80);
 }
 function tSpinGoalProgress(before,after,goals){
  if(!Array.isArray(before)||!Array.isArray(after)||!goals?.length)return 0;
  let best=0;
  for(const goal of goals){
   // A placement inside the future T cavity or a clear which destroys the
   // future roof must NEVER be rewarded as construction progress.
   if(goal.final.some(([x,y])=>!empty(after[y]?.[x])))continue;
   let oldCount=0,newCount=0;
   for(const [x,y]of goal.roof){oldCount+=!empty(before[y]?.[x])?1:0;newCount+=!empty(after[y]?.[x])?1:0}
   if(oldCount<goal.baseCount||newCount<=oldCount)continue;
   const added=newCount-oldCount,remaining=goal.roof.length-newCount;
   // Extra pieces of the roof can be added one step at a time; the score
   // is bounded well below a confirmed native T-Spin and survival penalties.
   best=Math.max(best,Math.min(10,added*3+(remaining===0?3:remaining<=4?1:0)+Math.min(2,Math.log2(1+goal.uses))));
  }
  return best;
 }
 const pendingValidation=new WeakSet();
 function scheduleValidation(game){
  if(!game||pendingValidation.has(game)||!nativeVerifierAvailable())return;
  const player=root.OriginalReplay?.game?.();
  // Native validation is background enrichment, never worth stalling human
  // gameplay. Defer the expensive work while any local human is playing.
  if(player?.isPlaying?.()&&!player._localLiveBot&&!player._localAIProfileId)return;
  pendingValidation.add(game);
  const run=(idle)=>{pendingValidation.delete(game);
   if(idle&&typeof idle.timeRemaining==='function'&&idle.timeRemaining()<2)return;
   const human=root.OriginalReplay?.game?.();
   if(human?.isPlaying?.()&&!human._localLiveBot&&!human._localAIProfileId)return;
   try{opportunities(game,{replay:false})}catch{}
  };
  if(typeof root.requestIdleCallback==='function')root.requestIdleCallback(run);
  else if(!player?.isPlaying?.()&&typeof root.setTimeout==='function')root.setTimeout(run,60);
  else pendingValidation.delete(game);
 }
 function guidanceBonus(before,after){
  // Bounded non-invasive bias to preserve a player-observed setup; far below
  // native spin reward and terminal danger penalty.
  if(!Array.isArray(before)||!Array.isArray(after)||!patterns.length)return 0;
  let beforeR=0,afterR=0;
  const sample=(board)=>{let best=0,h=board.length,w=board[0].length;for(const p of patterns.slice(-30))for(let x=1;x<w-1;x++)for(let y=Math.max(0,h-12);y<h;y++){
   const final=p.final.map(([dx,dy])=>[x+dx,y+dy]);if(final.some(([cx,cy])=>cx<0||cx>=w||cy<0||cy>=h||!empty(board[cy][cx])))continue;
   const s=p.structure.map(([dx,dy])=>[x+dx,y+dy]);if(s.some(([cx,cy])=>cx<0||cx>=w||cy<0||cy>=h))continue;
   const have=s.filter(([cx,cy])=>!empty(board[cy][cx])).length;
   if(have>=2&&s.length-have<=4)best=Math.max(best,have/s.length);
  }return best};
  beforeR=sample(before);afterR=sample(after);return Math.max(-4,Math.min(4,(afterR-beforeR)*5));
 }
 // Optional import of user's own replay. The game performs native headless
 // replay; no spin is fabricated from JSON's raw input list.
 async function importTTR(file,progress){
  if(!file||file.size>32*1024*1024)throw Error('TTRは32MB以下にしてください');
  if(root.OriginalReplay?.game?.()?.isPlaying()||root.LocalAIRoom?.active?.().length)throw Error('プレイを終了してから読み込んでください');
  const replay=JSON.parse(await file.text());root.LocalTTRFormat.inspect(replay);
  if(typeof root.LocalNative?.learnReplay!=='function')throw Error('TTR再生解析を利用できません');
  const found=[];await root.LocalNative.learnReplay(replay,game=>attach(game,'replay',found),(n,total)=>progress?.(n,total));
  const count=found.length;for(const p of found)add(p);return {count,total:patterns.length};
 }
 const api={capture,add,attach,load:()=>patterns.slice(),opportunities,verifyNative,cachedVerified,scheduleValidation,verifiedPlacementBonus,learnedNativeSpinBonus,guidanceBonus,canonicalTSpinPatterns,compileTSpinGoals,tSpinGoalProgress,importTTR,landing,findSetup,knownPieces,family,openingStats};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else {
  root.LocalSpinLibrary=api;
  root.addEventListener('local-game-started',()=>{const game=root.OriginalReplay?.game?.();if(game?.isPlaying?.()&&!game._localLiveBot)attach(game,'player')});
  root.addEventListener('local-ai-match-start',e=>{for(const game of e.detail?.games||[])if(!game._localAIProfileId)attach(game,'player')});
 }
})(typeof window==='undefined'?globalThis:window);
