/* Legacy AI planner and frame-driven controller; exact computation and
   routing extracted from the previously supplied Mac AI patch. vA UI and
   LocalTestQP's modern native DUO transport remain unchanged. */
(() => {
 const api=window.LocalTestQP;
 if(!api) throw Error('LocalTestQP is not ready');
 function grade(board){
  const width=board[0].length,height=board.length,heights=[];let holes=0,complete=0;
  for(const row of board)if(row.every(cell=>cell!==null))complete++;
  const remaining=board.filter(row=>!row.every(cell=>cell!==null));while(remaining.length<height)remaining.unshift(Array(width).fill(null));
  for(let x=0;x<width;x++){let top=height;for(let y=0;y<height;y++){if(remaining[y][x]!==null)top=Math.min(top,y);else if(top<height)holes++}heights.push(height-top)}
  const roughness=heights.slice(1).reduce((v,h,i)=>v+Math.abs(h-heights[i]),0);
  return 12*complete-8*holes-.6*heights.reduce((a,b)=>a+b,0)-.4*roughness-1.5*Math.max(...heights);
 }
 function boardHeight(game){const board=game?.state?.board;if(!board?.length)return 0;const first=board.findIndex(row=>row.some(cell=>cell!==null));return first<0?0:board.length-first}
 function policy(game){
  const ally=game.source?.self?.zthm?.duoOtherSideGame;
  const prompt=game.state.zenith?.allyincapacitated?(game.state.zenith.reviveprompts||[]).find(p=>!p.complete&&!p.locked&&!p.stunned):null;
  const ownHeight=boardHeight(game),ownLimit=game.options?.boardheight||20;
  const protect=!!game.options?.zenith_mods?.includes('duo_reversed')&&!!ally&&(ally.state.zenith?.incapacitated||boardHeight(ally)>=(ally.options?.boardheight||20)-6);
  return {prompt,protect,ownDanger:ownHeight>=ownLimit-4,warlock:!!game.options?.zenith_mods?.includes('allspin_reversed'),lastClearSpin:game.state.zenith?.lastclearspin};
 }
 function taskScore(policy,game,choice,clears,top,width,height){
  if(!policy)return 0;const task=policy.prompt?.id,type=choice.type||game.state.falling.type;let bonus=0;
  if(task){
   if(['lines','attack','combo','combonohold','iholdlines','nogarbage'].includes(task))bonus+=clears*50;
   if(['singleconsecutive','singlesonly','singlenocombo','osingle','szsingle','iclearspam'].includes(task))bonus+=clears===1?100:clears?-100:0;
   if(['double','odouble','szdouble','odoubleconsecutive','doublespiece','oclearspam'].includes(task))bonus+=clears===2?120:clears?-70:0;
   if(['triple','ljtriple'].includes(task))bonus+=clears===3?140:clears?-50:0;
   if(['quad','quadbuckets','quadcombo','quadconsecutive','upperhalfquad','b2b'].includes(task)){
    bonus+=clears===4?200:clears&&!policy.ownDanger?-80:0;
    if(!clears&&!policy.ownDanger){let well=width-1;for(let x=width-2;x>=0;x--)if(top[x]>top[well])well=x;bonus-=choice.cells.filter(([dx])=>choice.x+dx===well).length*12}
   }
   if(task==='noclear')bonus+=clears?-160:30;
   if(task==='iflat'&&type==='i')bonus+=clears&&(choice.rotation===0||choice.rotation===2)?120:0;
   if(task==='columnopiece'&&type==='o')bonus-=Math.abs(choice.x-1)*20;
   if(task==='linesnoti'&&['i','t'].includes(type)&&clears)bonus-=120;
   if(['combo','combonohold'].includes(task)&&(game.state.stats.combo||0)>0&&!clears)bonus-=40;
   if(['osingle','odouble','oclear','odoubleconsecutive','oclearspam'].includes(task)&&type==='o')bonus+=clears*60;
   if(['szsingle','szdouble'].includes(task)&&['s','z'].includes(type))bonus+=clears*60;
   if(task==='ljtriple'&&['l','j'].includes(type))bonus+=clears*60;
  }
  // Avoid bursts into a threatened ally. Prefer a single over multi-line/B2B clears.
  if(policy.protect&&!policy.ownDanger){bonus-=clears*(clears>=2?100:20);if(clears&&(game.state.stats.combo||0)>0)bonus-=60;if(clears===4)bonus-=150}
  // Survival remains necessary: don't sacrifice a nearly topped-out rescuer to a task.
  if(policy.ownDanger)bonus*=.25;
  // Straight-drop plans are conservatively treated as non-spins. Native Warlock
  // penalizes consecutive non-spin clears regardless of their line counts.
  if(policy.warlock&&policy.lastClearSpin==='none'&&clears)bonus-=1000000;
  return bonus;
 }
 // Search snapshots use row bitmasks; the live engine's collision memo is untouched.
 function createSearch(game,botPolicy=null,settings={}){
  if(game._useLocalBotLearning&&window.LocalCombatAI&&game.ejectState)return LocalCombatAI.createSearch(game,botPolicy,settings);
  const engine=game.source.self,board=game.state.board,falling=game.state.falling,width=board[0].length,height=board.length,full=(1<<width)-1,startY=Math.ceil(falling.y);
  const rows=new Uint16Array(height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(board[y][x]!==null)rows[y]|=1<<x;
  const top=new Int16Array(width).fill(height),counts=new Int16Array(width),nextOccupied=Array.from({length:width},()=>new Int16Array(height+1));
  let baseHoles=0,baseSum=0;for(let x=0;x<width;x++){let nearest=height;nextOccupied[x][height]=height;for(let y=height-1;y>=0;y--){if(rows[y]&(1<<x)){nearest=y;counts[x]++;top[x]=y}nextOccupied[x][y]=nearest}baseSum+=height-top[x];baseHoles+=height-top[x]-counts[x]}
  const choices=[];for(let rotation=0;rotation<4;rotation++){
   const definition=engine.fm.GetPieceDefinition(falling.type,rotation);if(!definition)continue;
   const cells=definition.data.map(([x,y])=>[x-definition.dx,y-definition.dy]);
   const min=Math.min(...cells.map(c=>c[0])),max=Math.max(...cells.map(c=>c[0]));
   for(let x=-min;x<width-max;x++)choices.push({rotation,x,cells});
  }
  const weights=window.LocalBotLearning?.weights(game)||[12,-8,-.6,-.4,-1.5];let candidateFeatures;
  const evaluate=values=>{candidateFeatures=values;return values.reduce((sum,value,i)=>sum+value*weights[i],0)};
  let cursor=0,best=null;const collected=[];
  function landing(choice){let distance=height;for(const [dx,dy]of choice.cells){const row=startY+dy,column=choice.x+dx;if(row<0||row>=height||nextOccupied[column][row]===row)return null;distance=Math.min(distance,nextOccupied[column][row]-row-1)}return startY+distance}
  function score(choice,y){
   let clearsLine=false;const additions=new Map;for(const [dx,dy]of choice.cells){const row=y+dy;additions.set(row,(additions.get(row)||0)|(1<<(choice.x+dx)))}
   for(const [row,bits]of additions)if((rows[row]|bits)===full){clearsLine=true;break}
   if(!clearsLine){const nextTop=top.slice(),nextCounts=counts.slice();for(const [dx,dy]of choice.cells){const x=choice.x+dx;nextTop[x]=Math.min(nextTop[x],y+dy);nextCounts[x]++}
    let holes=baseHoles,sum=baseSum,peak=0,roughness=0,previous=0;for(let x=0;x<width;x++){const h=height-nextTop[x];sum+=top[x]-nextTop[x];holes+=(h-nextCounts[x])-(height-top[x]-counts[x]);peak=Math.max(peak,h);if(x)roughness+=Math.abs(h-previous);previous=h}return evaluate([0,holes,sum,roughness,peak])+taskScore(botPolicy,game,choice,0,top,width,height);
   }
   const copy=rows.slice();for(const [row,bits]of additions)copy[row]|=bits;
   let holes=0,sum=0,peak=0,roughness=0,previous=0,clears=0;const removedBelow=new Uint8Array(height);
   for(let row=height-1;row>=0;row--){if(copy[row]===full)clears++;removedBelow[row]=clears;}
   for(let x=0;x<width;x++){
    let columnHeight=0;
    for(let row=0;row<height;row++){const bits=copy[row];if(bits===full)continue;if(bits&(1<<x)){if(!columnHeight)columnHeight=height-row-removedBelow[row]}else if(columnHeight)holes++}
    sum+=columnHeight;peak=Math.max(peak,columnHeight);if(x)roughness+=Math.abs(columnHeight-previous);previous=columnHeight;
   }
   return evaluate([clears,holes,sum,roughness,peak])+taskScore(botPolicy,game,choice,clears,top,width,height);
  }
  return {step(limit=4){for(let count=0;count<limit&&cursor<choices.length;count++,cursor++){
   const choice=choices[cursor],y=landing(choice);if(y===null)continue;
   const value=score(choice,y),candidate={rotation:choice.rotation,x:choice.x,y,score:value,features:candidateFeatures};if(game._collectCandidates){const placed=board.map(r=>r.slice());for(const [dx,dy]of choice.cells)placed[y+dy][choice.x+dx]='ai';candidate.chainBoard=placed.filter(row=>!row.every(c=>c!==null));while(candidate.chainBoard.length<board.length)candidate.chainBoard.unshift(Array(width).fill(null));candidate.holdType=game.state.hold;candidate.setupScore=window.LocalCombatAI?3*LocalCombatAI.quadReady(placed)+(candidate.features[0]===4?18:0):0;collected.push(candidate)}if(!best||value>best.score)best=candidate;
  }return {done:cursor===choices.length,best}},get candidates(){return choices.length},get choices(){return collected}};
 }
 function plan(game,botPolicy=null){const search=createSearch(game,botPolicy);try{let result;do{result=search.step(100)}while(!result.done);return result.best}finally{search.dispose?.()}}
 function tap(game,key){
  if(window.LocalAIPlayerSettings)return window.LocalAIPlayerSettings.tap(game,key);
  game.source.Push('keydown',{key,subframe:0});game.source.Push('keyup',{key,subframe:.5});return true;
 }
 function releaseKeys(game,target){
  // Never leave a DAS or soft-drop key held after a plan is dropped.
  if(game._aiHeldKey){game.source.Push('keyup',{key:game._aiHeldKey,subframe:0});game._aiHeldKey=null}
  if(game.state?.inputSoftdrop)game.source.Push('keyup',{key:'softDrop',subframe:.5});
 }
 function requestLock(game){
  if(tap(game,'hardDrop'))return true;
  if(window.LocalAIPlayerSettings?.canUse?.(game,'softDrop')&&game._aiAllowSoftDrop!==false){
   if(!game.state.inputSoftdrop)game.source.Push('keydown',{key:'softDrop',subframe:0});
  }
  return false;
 }
 function timing(game){const f=game.state.falling,e=game.source.self,gravity=Math.max(0,Number(e.fm.GetEffectiveGravity?.()??game.state.g)||0),lock=Math.max(0,Number(game.options?.locktime??30)-Number(f.locking||0));if(!gravity)return {total:Infinity,lock,urgent:false};
  const board=game.state.board,definition=e.fm.GetPieceDefinition(f.type,f.r);let distance=0;
  if(definition){outer:for(let n=1;n<=board.length;n++){for(const [dx,dy]of definition.data){const x=f.x+dx-definition.dx,y=Math.ceil(f.y)+dy-definition.dy+n;if(x<0||x>=board[0].length||y>=board.length||y>=0&&board[y][x]!==null)break outer}distance=n}}
  const total=distance/gravity+lock;return {total,lock,urgent:total<80};
 }
 function attackTiming(game,target,strategy,frame,ready){
  if(game._aiMimicTiming||!game._localTLMatch||game._aiAttackTiming===false||!target?.features?.[0])return {hold:false,urgent:false};
  // A completed Quad is already the selected player's placement. Do not stop
  // on the floor just to synchronize a four-line attack.
  if(Number(target.features[0])===4)return {hold:false,urgent:true};
  const attack=target.features[5]||0,defense=target.features[6]||0;
  const incoming=(game.state.impendingdamage||[]).some(d=>d.active!==false&&d.amt>0)||(game.state.garbageareentries||[]).length>0;
  if((attack>0||defense>0)&&(incoming||strategy.ownDanger)){target.fireWaitSince=null;return {hold:false,urgent:true}}
  const peer=game._localTLPeer;if(!ready||attack<4||!peer?.isPlaying()||boardHeight(peer)>=(peer.options?.boardheight||20)-6)return {hold:false,urgent:false};
  target.fireWaitSince??=frame;const cap=Math.max(0,Math.min(120,Number(game._aiAttackWaitFrames)||45));
  return {hold:frame-target.fireWaitSince<cap,urgent:false};
 }
 function focusTSpinForGame(game,policy){
  if(game._aiTSpinFocus===false||game._aiAllowSoftDrop===false||policy?.ownDanger)return false;
  return !!window.LocalSpinLibrary?.knownPieces?.(game)?.some(p=>p.type==='t'&&(p.source==='HOLD'||p.source==='CURRENT'||Number(p.index)<=2));
 }
 // A piece-speed setting is a target cadence, not a command to stop
 // thinking after one frame. Budget the search in bounded native slices;
 // guarantee coverage of HOLD and spin routes before branching ahead.
 /* Lockstep with the player (Tab: プレーヤーと同時に置く, TL / CUSTOM vs a
    player): the BOT places one piece each time the player places one, so both
    run at the same PPS; it plans while it waits. */
 function syncPeer(game){
  let on=false;try{on=localStorage.getItem('qp-ai-sync-player')==='true'}catch{}
  const peer=game?._localTLPeer;if(!on||!peer||peer._localLiveBot||peer._localAIProfileId)return null;
  try{if(!peer.isPlaying?.())return null}catch{return null}
  const mine=()=>Number(game.state.stats?.piecesplaced)||0,theirs=()=>Number(peer.state.stats?.piecesplaced)||0;
  // the player's own pace (frames per piece) sizes the plan
  const pf=Number(peer.getFrame?.())||0,pp=theirs();
  return {ahead:()=>theirs()>mine(),interval:pp>2?Math.max(3,Math.min(120,pf/pp)):30};
 }
 function humanPlaying(game){
  const peer=game?._localTLPeer||game?.source?.self?.zthm?.duoOtherSideGame;
  if(peer?.isPlaying?.()&&!peer._localLiveBot&&!peer._localAIProfileId)return true;
  const player=window.OriginalReplay?.game?.();
  return !!player&&player!==game&&player.isPlaying?.()&&!player._localLiveBot&&!player._localAIProfileId;
 }
 function pacing(interval,urgent=false){
  const frames=Math.max(1,Number.isFinite(interval)?interval:30);
  const rootBudget=frames<=4?12:frames<=8?18:frames<=15?28:40;
  return {rootBudget,beamWidth:frames<=5?2:frames<=12?3:4,
   stepBudgetMs:urgent?2:frames<=5?2.5:frames<=12?3:4.5,
   stepLimit:frames<=5?12:frames<=12?20:32,
   maxDepth:7};
 }
 // Board after the garbage lines already rising (their holes are known).
 function futureKey(state){const en=state?.garbageareentries||[],b=state?.board;if(!en.length||!b)return boardKey(b);const W=b[0]?.length||10;
  const rows=en.map(e=>{const r=new Array(W).fill('gb'),c=Number(e.column)||0,z=Math.max(1,Number(e.size)||1);for(let x=c;x<c+z&&x<W;x++)r[x]=null;return r});return boardKey(b.slice(rows.length).concat(rows))}
 function boardKey(board){return board?.map(row=>row.map(c=>c===null?'0':'1').join('')).join('|')||''}
 function cachedNextMatches(game,cache){
  if(!cache?.plan?.pre||!cache?.plan?.route||!cache?.state)return false;
  const state=game.state,prev=cache.state,f=state?.falling,plan=cache.plan;
  if(!f||f.type!==plan.type||f.x!==plan.routeStart?.x||f.r!==plan.routeStart?.r)return false;
  if(boardKey(state.board)!==boardKey(prev.board))return false;
  if(LocalAIInformation.holdPiece(state.hold)!==LocalAIInformation.holdPiece(prev.hold))return false;
  // Do not reuse a simulated continuation if the observed NEXT or incoming
  // garbage changes after a lock; those are material search assumptions.
  if(cache.knownNext?.length&&cache.knownNext.some((type,i)=>state.bag?.[i]!==type))return false;
  if(JSON.stringify(state.impendingdamage||[])!==JSON.stringify(prev.impendingdamage||[]))return false;
  if(LocalAIInformation.holdLocked(state))return false;
  if(plan.hold&&!LocalAIInformation.holdAllowed({game:{...state,setoptions:game.options}},game._aiAllowHold!==false))return false;
  return true;
 }
 function drive(game,getPPS=()=>1){let mimicPiece=-1,mimicInterval=null;let target=null,search=null,lastPiece=-1,lastFrame=-1,attempts=0,lastDropFrame=null,policyKey='',lastHeldPiece=-1,rotations=0,forecastCache=null;
  const stats=game._localAIStats={plannedDrops:0,matchedDrops:0,mismatchedDrops:0,naturalLocks:0,routeFailures:0,emergencyDrops:0,spinLocks:0,spinRouteMisses:0,spinHeightMisses:0,holdCommands:0,holdPlannedDrops:0,holdBlocked:0,holdFailures:0,holdCandidates:0,holdSelected:0,reusedPlans:0,cacheRejected:0,rootCandidatesChecked:0,futureCandidatesChecked:0,forcedByPPS:0,searchTimeMs:0,searchSlices:0,maxSliceMs:0,budgetSkips:0,humanProtectedFrames:0};let expected=null,commanded=false;
  const observe=piece=>{if(!expected){if(!commanded)stats.naturalLocks++;commanded=false;return}commanded=false;if(piece.type===expected.type&&piece.x===expected.x&&Math.ceil(piece.y)===expected.y&&piece.r===expected.rotation)stats.matchedDrops++;else stats.mismatchedDrops++;expected=null};game.on?.('lock','local-bot-route-check',observe);
  const tick=()=>{
   if(!game.isPlaying()||game.state.pause||game.state.zenith?.incapacitated)return;
   if(game.state.falling.flags&128)return;
   const frame=game.getFrame();if(frame===lastFrame)return;lastFrame=frame;
   const pps=Math.min(20,Math.max(.1,Number(getPPS())||1));if(game._aiMimicTiming&&mimicPiece!==game.state.stats.piecesplaced){mimicPiece=game.state.stats.piecesplaced;mimicInterval=LocalAIBehavior.interval(game._aiBehavior,game.state)}const sync=syncPeer(game),interval=sync?sync.interval:game._aiMimicTiming&&mimicInterval!==null?mimicInterval:60/pps;const turnReady=(slack=0)=>sync?sync.ahead():frame-lastDropFrame>=interval-slack;
   if(lastDropFrame===null)lastDropFrame=frame;
   const deadline=timing(game),hurry=deadline.total<12,pace=pacing(interval,deadline.urgent),humanActive=humanPlaying(game);
   if(deadline.total<=2){releaseKeys(game,target);search?.dispose?.();search=null;expected=null;game._rlDecision=null;if(requestLock(game)){target=null;commanded=true;stats.emergencyDrops++;lastDropFrame=frame;game._localBotIntent='固定期限優先：探索・PPS待機を打ち切って配置'}return}
   const strategy=policy(game),task=strategy.prompt?.id,key=task+':'+strategy.protect+':'+strategy.ownDanger+':'+strategy.warlock+':'+strategy.lastClearSpin;
   game._localBotIntent=task?'蘇生課題: '+strategy.prompt.label.replace(/\n/g,' '):strategy.protect?'相方保護・攻撃抑制':strategy.warlock?'Warlock: 重複消去回避':'通常プレイ';
   const piece=game.state.stats.piecesplaced;
   if(task&&LocalAIInformation.holdAllowed({game:{...game.state,setoptions:game.options}},game._aiAllowHold!==false)&&lastHeldPiece!==piece){
    const wantsHold=['hold','holdconsecutive'].includes(task)||(task==='iholdlines'&&LocalAIInformation.holdPiece(game.state.hold)!=='i'&&game.state.falling.type==='i');
    if(wantsHold){if(!tap(game,'hold'))return;lastHeldPiece=piece;search=null;target=null;lastPiece=-1;return}
   }
   if(task==='rotate'&&!strategy.ownDanger&&rotations<16&&frame%2===0){if(tap(game,'rotateCW'))rotations++;return}
   if(key!==policyKey){if(game.state.inputSoftdrop)game.source.Push('keyup',{key:'softDrop',subframe:.5});policyKey=key;lastPiece=-1;search?.dispose?.();search=null;target=null;forecastCache=null}

   // v4.8272 (user: spins fail while garbage rises): rising garbage lines move the
   // board under a route planned on the old one. Wait for the rise before planning
   // (bounded by the lock deadline), and drop a plan whose board has changed.
   // v4.8273: the plan is made on the board after the rise (bot-ai), so moving in
   // the air goes on; only a drop waits until the rise is done (see 'drop' below).
   {const bk=futureKey(game.state);if(target&&!target.boardKey)target.boardKey=bk;
    if(target&&target.boardKey!==bk){releaseKeys(game,target);stats.boardMoved=(stats.boardMoved||0)+1;target=null;search?.dispose?.();search=null;lastPiece=-1}}
   if(game.state.stats.piecesplaced!==lastPiece){
    releaseKeys(game,target);
    lastPiece=game.state.stats.piecesplaced;search?.dispose?.();search=null;target=null;
    const cache=forecastCache;forecastCache=null;
    if(cache){if(cachedNextMatches(game,cache)){target={...cache.plan,held:false,turned:false,softHeld:false,routeIndex:0};stats.reusedPlans++}
     else stats.cacheRejected++}
    if(!target){
     // Emergency: prefer the existing lightweight, verified straight drop
     // over forcing a giant native branch on the final gravity frames.
     if(game._useLocalBotLearning&&deadline.total<=6){const quick=createSearch({...game,_useLocalBotLearning:false},strategy);target={...quick.step(100).best,fast:true};
      if(!humanActive)search=window.LocalCombatAI.createSearch(game,strategy,{fast:true,rootOnly:true,realtime:true,rootBudget:8,beamWidth:1,stepBudgetMs:1})
     }else search=createSearch(game,strategy,{realtime:true,humanActive,get dueAt(){return sync?(sync.ahead()?game.getFrame():Infinity):lastDropFrame+interval},interval,rootBudget:humanActive?Math.min(16,pace.rootBudget):pace.rootBudget,beamWidth:humanActive?2:pace.beamWidth,stepBudgetMs:humanActive?1:pace.stepBudgetMs,maxDepth:Math.min(humanActive?3:pace.maxDepth,Math.max(focusTSpinForGame(game,strategy)?3:1,game._aiDepth==='visible'?1+LocalAIInformation.nextCount(game.options,game._aiNextCount):Number(game._aiDepth)||(interval>=30?3:2)))})
    }
    attempts=0;rotations=0;
   }
   if(search){
    // One global renderer budget is shared by all BOTs, not one budget for
    // each BOT. When a human plays, yield search slices before frame input.
    let budget=window.LocalAIFrameBudget?.claim?.(humanActive,deadline.total<=8,game)??pace.stepBudgetMs;
    // An outside engine (vA private builds) searches in this thread: at least 6 ms a
    // frame, or its plan is never ready before the PPS clock (it then played nothing).
    if(game._aiEngine)budget=Math.max(6,budget);
    if(humanActive)stats.humanProtectedFrames++;
    if(budget<=0){stats.budgetSkips++;return}
    const started=performance.now();
    let result=search.step(Math.min(pace.stepLimit,humanActive?2:pace.stepLimit));
    const elapsed=performance.now()-started;
    window.LocalAIFrameBudget?.account?.(elapsed,game);
    stats.searchTimeMs+=elapsed;stats.searchSlices++;stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
    const audit=game._localSpinAudit;
    if(audit){stats.rootCandidatesChecked=audit.rootChecked||0;stats.futureCandidatesChecked=audit.lookaheadChecked||0}
    // Preview reconstruction is optional UI work. Keep 60fps input more
    // important than redrawing the same plan for every search slice.
    if(!humanActive||result.done||frame%6===0)window.LocalAIPreview?.set(game,result.best,{searching:!result.done,choices:result.previewChoices});
    const reserve=Math.min(8,Math.max(1,Math.floor(interval/4))),due=turnReady(reserve);
    // Only commit an actually verified native route, never a theoretical
    // straight-drop estimate merely to satisfy the PPS clock.
    if(!result.done&&(hurry||due)&&result.best?.route){
     result=search.finalize?.()||result;target=result.best||target;search=null;
     if(due&&!hurry)stats.forcedByPPS++;
    }else if(result.done){target=result.best||target;search=null}
    else return;
   }
   window.LocalAIPreview?.set(game,target);
   if(task==='spam'||task==='iclearspam'||task==='oclearspam'||(task==='tnorotate'&&game.state.falling.type==='t'))target=null;
   if(target?.hold&&!target.held){
    const legal=LocalAIInformation.holdAllowed({game:{...game.state,setoptions:game.options}},game._aiAllowHold!==false);
    if(!legal){stats.holdBlocked++;target=null;search?.dispose?.();search=null;lastPiece=-1;return}
    target.held=true;target.holdBeforeType=game.state.falling.type;target.holdBeforePiece=LocalAIInformation.holdPiece(game.state.hold);
    if(!tap(game,'hold'))return;stats.holdCommands++;stats.holdSelected++;return;
   }
   if(target?.held&&!target.holdVerified){
    const changed=game.state.falling.type!==target.holdBeforeType||LocalAIInformation.holdPiece(game.state.hold)!==target.holdBeforePiece||LocalAIInformation.holdLocked(game.state);
    if(!changed){stats.holdFailures++;target=null;lastPiece=-1;return}
    target.holdVerified=true;
   }
   if(target?.path&&window.LocalAIMoveGen){
    // v4.8243 executor: replays the exact native path found by the search.
    // A run of equal horizontal moves is ONE held key (native DAS/ARR) when it
    // ends at a wall or the ARR lets us release on the column; drops are a held
    // soft drop released on the floor. Every step is checked against the trace.
    const f=game.state.falling,fail=reason=>{releaseKeys(game,target);stats.routeFailures++;if(target?.spin)stats.spinRouteMisses++;game._localBotIntent='経路やり直し: '+reason;target=null;lastPiece=-1};
    // Lockstep with the player: wait at the spawn until the player has placed,
    // so a spin / soft-drop route never forces the lock early (2026-11-13: the BOT
    // locked up to 3 s before the player on floor routes).
    if(!target.exec&&sync&&!sync.ahead()&&deadline.total>20){game._localBotIntent='同時に置く: プレーヤー待ち';return}
    if(!target.exec){
     if(target.routeStart&&(f.x!==target.routeStart.x||f.r!==target.routeStart.r)){fail('開始位置');return}
     const path=target.path.slice(),trace=(target.trace||[]).slice();
     if(trace.length!==path.length){fail('経路データ');return}
     while(path.length&&path[path.length-1]==='sonicDrop'){path.pop();trace.pop()}
     const handling=game.options?.handling||{};
     target.exec={steps:LocalAIMoveGen.compile(path,trace,{arr:Number(handling.arr??2)}),i:0,wait:0,grounded:false,pending:null};
     stats.inputSteps=(stats.inputSteps||0);
    }
    const ex=target.exec;
    const matches=(to,checkY)=>!!to&&f.x===to.x&&f.r===to.r&&(!checkY||Math.ceil(f.y)===to.y);
    if(ex.pending){
     const step=ex.pending;
     if(step.kind==='tap'){
      if(!matches(step.to,ex.grounded&&step.key.startsWith('rotate'))){fail('入力 '+step.key);return}
      ex.pending=null;ex.i++;
     }else if(step.kind==='hold'){
      ex.wait++;
      const dir=step.key==='moveRight'?1:-1;
      if(f.x===step.to.x||(dir>0?f.x>step.to.x:f.x<step.to.x)){
       if(!step.released){game.source.Push('keyup',{key:step.key,subframe:0});game._aiHeldKey=null;step.released=true;return}
       // After release: correct a one-column overshoot with a tap.
       if(f.x!==step.to.x){const back=f.x>step.to.x?'moveLeft':'moveRight';if(!step.fixes)step.fixes=0;if(step.fixes++>3){fail('長押し位置');return}tap(game,back);return}
       if(f.r!==step.to.r){fail('長押し回転');return}
       ex.pending=null;ex.i++;stats.dasHolds=(stats.dasHolds||0)+1;
      }else if(ex.wait>90){fail('長押し停止');return}
      else return;
     }else if(step.kind==='drop'){
      ex.wait++;

      if(Math.ceil(f.y)<step.to.y&&ex.wait<=150)return;
      game.source.Push('keyup',{key:'softDrop',subframe:0});
      if(!matches(step.to,true)){fail('ソフトドロップ');return}
      ex.grounded=true;ex.pending=null;ex.i++;
     }
    }
    if(ex.i<ex.steps.length){
     const step=ex.steps[ex.i];
     if(step.kind==='tap'){if(tap(game,step.key))ex.pending=step;return}
     if(step.kind==='hold'){game.source.Push('keydown',{key:step.key,subframe:0});game._aiHeldKey=step.key;ex.pending={...step,released:false};ex.wait=0;return}
     if(step.kind==='drop'){
      // rising garbage moves the floor: soft drop only after the rise
      if((game.state.garbageareentries||[]).length&&deadline.total>12){stats.waitRise=(stats.waitRise||0)+1;game._localBotIntent='ゴミのせり上がり待ち（落下前）';return}
      if(window.LocalAIPlayerSettings?.canUse?.(game,'softDrop')===false||game._aiAllowSoftDrop===false){fail('ソフトドロップ不可');return}
      game.source.Push('keydown',{key:'softDrop',subframe:0});ex.pending=step;ex.wait=0;return;
     }
    }
    if(f.x!==target.final.x||f.r!==target.final.rotation||(ex.grounded&&Math.ceil(f.y)!==target.final.y)||(target.spin&&!(f.flags&8))){fail('最終位置');return}
    const ready=turnReady(),spinNow=!!(target.spin&&(f.flags&8)),fire=spinNow?{hold:false,urgent:true}:attackTiming(game,target,strategy,frame,ready);if(fire.hold){game._localBotIntent='TL: 火力待機（上限あり・被弾時解除）';return}
    if((ready||fire.urgent)&&!((game.state.garbageareentries||[]).length&&deadline.total>12)||deadline.total<=2){search?.dispose?.();search=null;if(!requestLock(game))return;expected=target?.final?{type:target.type,...target.final}:null;if(expected){stats.plannedDrops++;if(target?.hold)stats.holdPlannedDrops++}if(spinNow)stats.spinLocks++;if(target?.next?.path&&target?.snapshot?.game)forecastCache={plan:target.next,state:target.snapshot.game,knownNext:(target.snapshot._aiKnownNext||[]).slice(0,2)};game._rlDecision=target?.rl||null;commanded=true;lastDropFrame=frame;game._localBotIntent='vAI: '+(target.hold?'HOLD・':'')+(target.spin?'スピン・':'')+(game._aiSeedAccess?'シード参照ON・':'')+'NEXT '+target.depth+'手評価 / '+(target.features[10]?'サージ放出':target.features[9]?'B2B蓄積':'盤面構築');target=null}
    return;
   }
   if(target?.pre){ // legacy route format (fast/cached plans)
    const f=game.state.falling;
    if(target.route&&!target.turned){
     if(target.pendingRoute){const previous=target.pendingRoute;target.pendingRoute=null;if(f.x===previous.x&&f.r===previous.r){stats.routeFailures++;target=null;lastPiece=-1;return}target.routeIndex=previous.at+1}
     const at=target.routeIndex||0;if(at===0&&target.routeStart&&(f.x!==target.routeStart.x||f.r!==target.routeStart.r)){stats.routeFailures++;target=null;lastPiece=-1;return}
     if(at<target.route.length){if(tap(game,target.route[at]))target.pendingRoute={x:f.x,r:f.r,at};return}
    }

    if(target.hold&&!target.held){if(!tap(game,'hold'))return;target.held=true;stats.holdCommands++;return}
    if(!target.turned){
     if(!target.spinStarted){
      if(f.r!==target.rotation){tap(game,'rotateCW');return}
      if(f.x!==target.x){tap(game,f.x<target.x?'moveRight':'moveLeft');return}
      if(target.turn){
       if(Math.ceil(f.y)<target.pre.y){
        if(!target.softHeld){game.source.Push('keydown',{key:'softDrop',subframe:0});target.softHeld=true}
        return;
       }
       if(Math.ceil(f.y)>target.pre.y){
        game.source.Push('keyup',{key:'softDrop',subframe:.5});
        stats.spinHeightMisses++;target=null;lastPiece=-1;stats.routeFailures++;return;
       }
       game.source.Push('keyup',{key:'softDrop',subframe:.5});
       target.spinStarted=true;target.spinStepIndex=0;
      }
     }
     if(target.turn){
      const steps=target.spinSteps||[target.turn===2?'rotate180':target.turn===1?'rotateCW':'rotateCCW'];
      if(target.pendingSpinStep){
       const pending=target.pendingSpinStep,trace=target.spinTrace?.[pending.at];
       if(pending.key==='sonicDrop'){
        if(!trace){stats.spinRouteMisses++;target=null;lastPiece=-1;return}
        if(Math.ceil(f.y)<trace.y){
         target.spinDropWait=(target.spinDropWait||0)+1;
         if(target.spinDropWait<=25)return; // Respect the player's finite SDF.
         game.source.Push('keyup',{key:'softDrop',subframe:.5});
         stats.spinHeightMisses++;target=null;lastPiece=-1;return;
        }
        game.source.Push('keyup',{key:'softDrop',subframe:.5});
       }
       target.pendingSpinStep=null;
       const valid=(!trace||f.x===trace.x&&f.r===trace.r)&&
        (pending.key==='sonicDrop'?!!trace&&Math.ceil(f.y)===trace.y:!trace||Math.ceil(f.y)<=trace.y+1);
       if(!valid){
        stats.spinRouteMisses++;stats.routeFailures++;game.source.Push('keyup',{key:'softDrop',subframe:.5});target=null;lastPiece=-1;return;
       }
       target.spinStepIndex=pending.at+1;
      }
      if(target.spinStepIndex<steps.length){
       const at=target.spinStepIndex,key=steps[at];
       target.pendingSpinStep={at,key};
       if(key==='sonicDrop')game.source.Push('keydown',{key:'softDrop',subframe:0});
       else if(!tap(game,key)){target.pendingSpinStep=null;return}
       return;
      }
      target.turned=true;
     }
    }
    if(target.turn&&(f.r!==target.final.rotation||f.x!==target.final.x||Math.ceil(f.y)!==target.final.y||(target.spin&&!(f.flags&8)))){if(target.spin)stats.spinRouteMisses++;target=null;lastPiece=-1;stats.routeFailures++;return}
    const ready=turnReady(),spinNow=!!(target.turn&&target.spin&&(f.flags&8)),fire=spinNow?{hold:false,urgent:true}:attackTiming(game,target,strategy,frame,ready);if(fire.hold){game._localBotIntent='TL: 火力待機（上限あり・被弾時解除）';return}
    if((ready||fire.urgent)&&!((game.state.garbageareentries||[]).length&&deadline.total>12)||deadline.total<=2){search?.dispose?.();search=null;if(!requestLock(game))return;expected=target?.final?{type:target.type,...target.final}:null;if(expected){stats.plannedDrops++;if(target?.hold)stats.holdPlannedDrops++}if(spinNow)stats.spinLocks++;if(target?.next?.pre&&target?.snapshot?.game)forecastCache={plan:target.next,state:target.snapshot.game,knownNext:(target.snapshot._aiKnownNext||[]).slice(0,2)};game._rlDecision=target?.rl||null;commanded=true;lastDropFrame=frame;game._localBotIntent='vAI: '+(target.hold?'HOLD・':'')+(target.spin?'スピン・':'')+(game._aiSeedAccess?'シード参照ON・':'')+'NEXT '+target.depth+'手評価 / '+(target.features[10]?'サージ放出':target.features[9]?'B2B蓄積':'盤面構築');target=null}
    return;
   }
   if(target&&attempts++<24){const f=game.state.falling;
    if(f.r!==target.rotation){tap(game,task==='norotateclockwise'?'rotateCCW':'rotateCW');return}
    if(f.x<target.x){tap(game,'moveRight');return}
    if(f.x>target.x){tap(game,'moveLeft');return}
   }
   if(deadline.total<=2||(!game._useLocalBotLearning&&turnReady())){
    search?.dispose?.();search=null;expected=target?.final?{type:target.type,...target.final}:null;
    if(expected)stats.plannedDrops++;else stats.emergencyDrops++;
    game._rlDecision=target?.rl||null;if(!requestLock(game))return;commanded=true;lastDropFrame=frame;target=null;
   }
  };tick.dispose=()=>{releaseKeys(game,null);game.remove?.('lock','local-bot-route-check');search?.dispose?.();game.source.Push('keyup',{key:'softDrop',subframe:.5})};return tick;
 }

 Object.assign(api,{grade,plan,createSearch,drive,timing,attackTiming,policy,taskScore});
 window.LocalLegacyAI={grade,plan,createSearch,drive,timing,attackTiming,policy,taskScore,pacing,cachedNextMatches,humanPlaying};
})();
