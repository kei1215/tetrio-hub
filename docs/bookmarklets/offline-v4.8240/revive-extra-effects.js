/* QP revive-mission extra effects (v4.8238).
   Unclearable rows, forced garbage (rise / terrain / hole rewrite / garbage bar,
   with seed-derived patterns and bombs), board height, garbage straightness,
   spin rule, piece frequency and I5 pieces.
   Game options touched here are layered: each effect is removed when its mission
   ends, when the revive finishes, or when the run ends (restoreAt). MOD changes
   are never kept here: revive-missions.js restores them at mission end. */
(() => {
 'use strict';
 const OPTION_KEYS=['spinbonuses','messiness_change','messiness_inner','usebombs'];
 const SHAPES={
  // Hole masks, top row first, as column offsets from the anchor column.
  tsd:[[-1,0,1],[0]],
  tst:[[1],[0,1],[1]],
  well4:[[0],[0],[0],[0]],
  stairs:[[0],[1],[2],[3]],
  zigzag:[[0],[1],[0],[1]]
 };
 function rngFrom(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
 function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}

 function attach(game){
  const engine=game.source?.self;if(!engine)return null;
  const S=engine.gsm;
  const isReplay=()=>!!engine.iom?.IsReplay?.();
  const optionObjects=()=>[...new Set([game.options,S.setoptions])];
  const W=()=>Number(S.setoptions.boardwidth)||10;
  // ---------- layered settings ----------
  const layers=[];            // {owner, restoreAt, key, value}
  const bases=new Map();      // key -> run value before the first layer
  let preMission=null;        // option values before the current mission's MOD values
  const read=key=>key==='boardheight'?Number(S.setoptions.boardheight):key==='pieces'?null:S.setoptions[key];
  function setBoardHeight(height){
   const bm=engine.bm,current=Number(S.setoptions.boardheight);
   if(!bm?.SetSize||!Number.isInteger(height)||height===current)return false;
   try{
    bm.SetSize(W(),height,Number(S.setoptions.boardbuffer)||20);
    bm.Resize?.();
    for(const object of optionObjects())object.boardheight=height;
    bm.ClearIsLegalAtPosMemo?.();bm.PushUpFallingIfNeeded?.();
    return true;
   }catch(error){window.LocalUIHealth?.fail?.('リバイブ効果: 盤面の高さ',error);return false}
  }
  let holderNeeded=false;
  function writeKey(key,value){
   if(key==='pieces')return;
   if(key==='boardheight'){if(setBoardHeight(value))holderNeeded=true;return}
   for(const object of optionObjects())object[key]=value;
  }
  function reassert(key){
   const top=[...layers].reverse().find(l=>l.key===key);
   if(top){writeKey(key,top.value);return}
   if(bases.has(key)){writeKey(key,bases.get(key));bases.delete(key)}
  }
  function push(owner,restoreAt,key,value){
   if(!bases.has(key)&&!layers.some(l=>l.key===key))bases.set(key,preMission&&key in preMission?preMission[key]:read(key));
   layers.push({owner,restoreAt,key,value});reassert(key);
  }
  function drop(test){
   const keys=new Set();
   for(let i=layers.length-1;i>=0;i--)if(test(layers[i])){keys.add(layers[i].key);layers.splice(i,1)}
   for(const key of keys)reassert(key);
   return keys.size>0;
  }
  // QP (zenith) rewrites messiness_change / messiness_inner while it runs. While a
  // straightness layer is active, adopt the engine's newest value as the value to
  // restore later and put the mission's value back.
  const ENGINE_DRIVEN=['messiness_change','messiness_inner'];
  function holdEngineDriven(){
   for(const key of ENGINE_DRIVEN){
    const top=[...layers].reverse().find(l=>l.key===key);if(!top)continue;
    const current=S.setoptions[key];
    if(current!==top.value){bases.set(key,current);writeKey(key,top.value)}
   }
  }
  // zthm.Update recomputes messiness every frame, so put the mission value back right after it.
  const zthm=engine.zthm,originalZUpdate=zthm?.Update,ownZUpdate=zthm&&Object.hasOwn(zthm,'Update');
  if(zthm&&typeof originalZUpdate==='function')zthm.Update=function(...args){const result=originalZUpdate.apply(this,args);try{holdEngineDriven()}catch{}return result};
  const pieceLayer=()=>[...layers].reverse().find(l=>l.key==='pieces')?.value||null;

  // ---------- bag (piece frequency / I5) ----------
  const bam=engine.bam;let bagRng=null;
  const ownPopulate=bam&&Object.hasOwn(bam,'PopulateBag'),originalPopulate=bam?.PopulateBag;
  if(bam&&typeof originalPopulate==='function')bam.PopulateBag=function(...args){
   const before=S.bag.length;const result=originalPopulate.apply(this,args);
   const rule=pieceLayer();
   if(rule&&S.bag.length>before)try{
    let added=S.bag.splice(before);
    for(const [piece,delta]of Object.entries(rule.delta||{})){
     const type=piece.toLowerCase();
     if(delta<0)for(let n=0;n<-delta;n++){const at=added.indexOf(type);if(at>=0&&added.length>1)added.splice(at,1)}
     else for(let n=0;n<delta;n++)added.push(type);
    }
    for(let n=0;n<(rule.i5||0);n++)added.push('i5');
    bagRng||=rngFrom(hash('bag:'+S.setoptions.seed));
    for(let i=added.length-1;i>0;i--){const j=Math.floor(bagRng()*(i+1));[added[i],added[j]]=[added[j],added[i]]}
    S.bag.push(...added);
   }catch(error){window.LocalUIHealth?.fail?.('リバイブ効果: ミノの増減',error)}
   return result;
  };

  // ---------- bombs ----------
  // Native bombs-style garbage: a placed mino turns the bomb ('gbd') cells right
  // below it into normal garbage, so the row clears. While bombs are on, other
  // garbage keeps normal holes and bottom unclearable rows are protected.
  let bombOwners=new Set(),permaRows=0;
  const bombsOn=()=>layers.some(l=>l.key==='usebombs');
  const bm=engine.bm,originalPushLine=bm?.PushLine,ownPushLine=bm&&Object.hasOwn(bm,'PushLine');
  if(bm&&typeof originalPushLine==='function')bm.PushLine=function(options={},...rest){
   if(!S.setoptions.usebombs||options?.neg==='gbd')return originalPushLine.call(this,options,...rest);
   const objects=optionObjects();for(const o of objects)o.usebombs=false;
   try{return originalPushLine.call(this,options,...rest)}finally{for(const o of objects)o.usebombs=true}
  };
  // Bomb look: the native '_bomb' skin for 'gbd' cells only (normal garbage keeps its skin).
  // A copy of minoskin is used so the player's own skin settings are never changed.
  let skinBefore=null;
  function bombSkin(on){
   if(on&&!skinBefore){
    skinBefore=S.setoptions.minoskin;
    const skin={...(skinBefore||{}),gbd:'_bomb'};
    for(const o of optionObjects())o.minoskin=skin;
   }else if(!on&&skinBefore){
    for(const o of optionObjects())o.minoskin=skinBefore;
    skinBefore=null;
   }else return;
   const H=engine.hm?.H;if(H){H.stackdirty=true;H.fallingdirty=true}
  }
  // Unclearable rows are 'gbd' cells too. While the bomb skin is on, draw the stack
  // twice and keep the normal-skin sprites for the bottom unclearable rows.
  const sdm=engine.sdm,originalDrawStack=sdm?.DrawStack,ownDrawStack=sdm&&Object.hasOwn(sdm,'DrawStack');
  if(sdm&&typeof originalDrawStack==='function')sdm.DrawStack=function(...args){
   const holder=engine.hm?.H?.stackobj;
   if(!skinBefore||!holder)return originalDrawStack.apply(this,args);
   const perma=countPerma(),top=S.board.length-perma;
   if(!perma)return originalDrawStack.apply(this,args);
   const isPerma=c=>c&&c.__mino==='gbd'&&c.__y>=top;
   const bombSkinObj=S.setoptions.minoskin;
   for(const o of optionObjects())o.minoskin=skinBefore;
   let kept=new Map();
   try{
    originalDrawStack.apply(this,args);
    for(const child of [...holder.children]){holder.removeChild(child);if(isPerma(child))kept.set(child.__x+':'+child.__y,child);else child.destroy?.()}
   }finally{for(const o of optionObjects())o.minoskin=bombSkinObj}
   const result=originalDrawStack.apply(this,args);
   for(const child of [...holder.children]){
    if(!isPerma(child))continue;
    const normal=kept.get(child.__x+':'+child.__y);if(!normal)continue;
    const at=holder.getChildIndex(child);holder.removeChild(child);child.destroy?.();holder.addChildAt(normal,at);kept.delete(child.__x+':'+child.__y);
   }
   for(const child of kept.values())child.destroy?.();
   return result;
  };
  const countPerma=()=>{const b=S.board;let n=0;for(let y=b.length-1;y>=0&&b[y].every(c=>c==='gbd');y--)n++;return n};
  const bombCellsLeft=()=>S.board.some(row=>row.includes('gbd')&&!row.every(c=>c==='gbd'))||(S.impendingdamage||[]).some(d=>d.neg==='gbd');
  function protectPerma(){
   if(!bombsOn())return;
   const b=S.board;
   for(let k=0;k<permaRows;k++){const row=b[b.length-1-k];if(row&&row.every(c=>c==='gb'||c==='gbd')&&row.includes('gb')){row.fill('gbd');engine.hm.H.stackdirty=true}}
  }

  // ---------- board helpers ----------
  const dirty=()=>{engine.bm.ClearIsLegalAtPosMemo?.();engine.bm.PushUpFallingIfNeeded?.();const H=engine.hm?.H;if(H){H.stackdirty=true;H.fallingdirty=true}};
  const blockFloor=()=>{const b=S.board;let y=b.length;while(y>0&&b[y-1].includes('gbd'))y--;return y}; // first row above unclearable rows
  function writeRow(y,holes,bombs){
   const w=W(),set=new Set(holes),row=[],edges=[];
   for(let c=0;c<w;c++){
    if(set.has(c)){row.push(bombs?'gbd':null);edges.push(255);continue}
    let e=68;if(set.has(c+1)||c===w-1)e|=16;if(set.has(c-1)||c===0)e|=1;
    row.push('gb');edges.push(e);
   }
   S.board[y]=row;S.boardedges[y]=edges;
  }
  function addUnclearable(n){for(let i=0;i<n;i++)engine.bm.PushLine({column:[],pos:'gbd',position:'bottom'});if(n)dirty()}
  function removeUnclearable(n){
   const w=W();let removed=0;
   for(let i=0;i<n;i++){
    const b=S.board,y=b.length-1;if(!b[y]?.every(c=>c==='gbd'))break;
    b.splice(y,1);S.boardedges.splice(y,1);b.unshift(new Array(w).fill(null));S.boardedges.unshift(new Array(w).fill(255));removed++;
   }
   if(removed)dirty();
  }

  // ---------- patterns ----------
  function makeState(task,entry,index){
   const p=entry.pattern;
   const seed=p.seedSource==='fixed'?p.seed:hash(['game',S.setoptions.seed,task.id,index].join(':'));
   return {rng:rngFrom(seed),row:0};
  }
  function rows(entry,state,count){
   const p=entry.pattern,w=W(),r=state.rng,out=[];
   const cols=p.columns.map(c=>c-1).filter(c=>c<w);
   const randomCol=()=>Math.floor(r()*w);
   const two=()=>{const a=randomCol();let b=Math.floor(r()*(w-1));if(b>=a)b++;return [a,b]};
   let alt=null;if(p.type==='alternate')alt=cols.length>=2?cols.slice(0,2):two();
   let shape=null,anchor=0,mirror=false;
   if(p.type==='shape'){
    shape=SHAPES[p.shape]||SHAPES.tsd;
    const offs=shape.flat(),min=Math.min(...offs),max=Math.max(...offs);
    anchor=cols.length?Math.max(-min,Math.min(w-1-max,cols[0])):-min+Math.floor(r()*(w-(max-min)));
   }
   let template=null;
   if(p.type==='template'){
    template=p.template.split('\n').map(s=>s.padEnd(w,'#').slice(0,w));
    mirror=p.mirror==='always'||(p.mirror==='random'&&r()<.5);
   }
   for(let i=0;i<count;i++){
    const k=state.row++;
    switch(p.type){
     case 'native':out.push(null);break;
     case 'random':out.push([randomCol()]);break;
     case 'fixed':out.push(cols);break;
     case 'alternate':out.push([alt[k%2]]);break;
     case 'twoHoles':out.push(two());break;
     case 'checker':out.push(Array.from({length:w},(_,c)=>c).filter(c=>(c+k)%2===0));break;
     case 'shape':out.push(shape[k%shape.length].map(o=>anchor+o));break;
     case 'template':{const line=template[k%template.length];const holes=[];for(let c=0;c<w;c++)if(/[._o ]/.test(line[c]))holes.push(mirror?w-1-c:c);out.push(holes);break}
     default:out.push(null);
    }
   }
   return out;
  }
  const visibleHeight=()=>Math.max(1,Number(S.setoptions.boardheight)||20);
  function fireGarbage(task,entry,state){
   if(isReplay())return;
   // A template is used whole (its own height), fitted to the current board: at most the
   // visible height, keeping its bottom rows. Other patterns use the row count.
   const templateRowsCount=entry.pattern.type==='template'?entry.pattern.template.split('\n').length:0;
   const n=Math.min(templateRowsCount||entry.rows,visibleHeight());
   if(templateRowsCount)state.row=templateRowsCount-n;
   const block=rows(entry,state,n);
   const concrete=block.map(h=>h||[Math.floor(state.rng()*W())]); // terrain needs real holes
   if(entry.bombs){bombOwners.add(task.id);if(!bombsOn())push('bombs','auto','usebombs',true);bombSkin(true)}
   for(const method of entry.methods){
    if(method==='rise'){
     engine.bm.AreWeToppedYet?.();
     for(const holes of block)engine.bm.PushLine(holes?{column:holes,...(entry.bombs?{neg:'gbd'}:{})}:(entry.bombs?{neg:'gbd'}:{}));
     dirty();engine.c?.OnClient?.(()=>{engine.sfx?.Play?.('garbagerise')});
    }else if(method==='terrain'){
     // Rewrite the bottom N rows above unclearable rows; no rise.
     const floor=blockFloor();
     const limit=Math.max(0,floor-(S.board.length-visibleHeight()));
     for(let i=0;i<n&&i<limit;i++)writeRow(floor-1-i,concrete[n-1-i],entry.bombs);
     dirty();
    }else if(method==='holes'){
     // Only move the holes of the garbage rows that are already on the board.
     const b=S.board;let y=blockFloor()-1,i=0;
     while(y>=0&&i<n&&b[y].every(c=>c===null||c==='gb'||c==='gbd')&&b[y].includes('gb')){writeRow(y,concrete[n-1-i],entry.bombs);y--;i++}
     if(i)dirty();
    }else if(method==='queue'){
     S.impendingdamage||=[];
     if(block.every(h=>h===null))S.impendingdamage.push({id:++S.garbageid,type:'garbage',amt:n,status:'spawn',active:true,delay:0,queued:false,...(entry.bombs?{neg:'gbd'}:{})});
     else for(const holes of block)S.impendingdamage.push({id:++S.garbageid,type:'garbage',amt:1,status:'spawn',active:true,delay:0,queued:false,column:holes??undefined,...(entry.bombs?{neg:'gbd'}:{})});
     engine.c?.OnClient?.(()=>engine.pbm?.UpdateGarbageBar?.('impending'));
    }
   }
  }

  // ---------- mission lifecycle ----------
  let active=null; // {task, timers:[{fire, seconds, pieces, frame, placed}]}
  const frame=()=>Number(game.getFrame?.()||0),placed=()=>Number(S.stats?.piecesplaced||0),received=()=>Number(S.stats?.garbage?.received||0);
  function beforeMods(){preMission=Object.fromEntries(OPTION_KEYS.map(k=>[k,S.setoptions[k]]));preMission.boardheight=Number(S.setoptions.boardheight)}
  function activate(task){
   holderNeeded=false;
   const x=task?.effects?.extra;
   if(!x){for(const key of new Set(layers.map(l=>l.key)))if(key!=='boardheight')reassert(key);preMission=null;return false}
   const owner=task.id;
   // Kept layers from an earlier mission win over this mission's MOD values.
   for(const key of new Set(layers.map(l=>l.key)))if(key!=='boardheight')reassert(key);
   if(x.board?.enabled&&!isReplay())push(owner,x.board.restoreAt,'boardheight',x.board.height);
   if(x.messiness?.enabled){push(owner,x.messiness.restoreAt,'messiness_change',1-x.messiness.straight/100);push(owner,x.messiness.restoreAt,'messiness_inner',1-x.messiness.innerStraight/100)}
   if(x.spin?.enabled)push(owner,x.spin.restoreAt,'spinbonuses',x.spin.rule);
   if(x.pieces?.enabled)push(owner,x.pieces.restoreAt,'pieces',{delta:x.pieces.delta,i5:x.pieces.i5});
   preMission=null;
   const timers=[];
   // Place single blocks on empty cells (column 1-10, row counted from the board bottom); no rise.
   if(x.stamp?.enabled&&x.stamp.cells?.length&&!isReplay()){
    const b=S.board;let changed=false;
    for(const [col,row]of x.stamp.cells){const yy=b.length-row,xx=col-1;if(b[yy]&&xx>=0&&xx<W()&&b[yy][xx]===null){b[yy][xx]='gb';S.boardedges[yy][xx]=255;changed=true}}
    if(changed)dirty();
   }
   if(x.unclearable?.enabled&&!isReplay()){
    const fire=()=>{removeUnclearable(x.unclearable.remove);addUnclearable(x.unclearable.add)};
    fire();timers.push({fire,...x.unclearable.repeat,frame:frame(),placed:placed()});
   }
   const onGarbage=[];
   (x.garbage||[]).forEach((entry,index)=>{
    if(!entry.enabled)return;
    const state=makeState(task,entry,index),fire=()=>fireGarbage(task,entry,state);
    if(entry.when==='garbage'){onGarbage.push(fire);return}
    fire();timers.push({fire,...entry.repeat,frame:frame(),placed:placed()});
   });
   active={task,timers,onGarbage,received:received()};
   return holderNeeded;
  }
  function missionEnd(){
   holderNeeded=false;preMission=null;
   if(active){const id=active.task.id;active=null;drop(l=>l.owner===id&&l.restoreAt==='mission')}
   return holderNeeded;
  }
  let wasIncapacitated=!!S.zenith?.allyincapacitated,lastBombCheck=0;
  function tick(){
   holderNeeded=false;
   holdEngineDriven();
   if(active&&game.isPlaying?.()&&!isReplay())for(const t of active.timers){
    const f=frame(),p=placed();
    if(t.seconds>0&&f-t.frame>=t.seconds*60){t.frame=f;t.fire()}
    if(t.pieces>0&&p-t.placed>=t.pieces){t.placed=p;t.fire()}
   }
   // "When garbage is received": once per frame in which an attack arrived.
   if(active&&active.onGarbage.length&&game.isPlaying?.()&&!isReplay()){const r=received();if(r>active.received){active.received=r;for(const fire of active.onGarbage)fire()}}
   const incap=!!S.zenith?.allyincapacitated;
   if(wasIncapacitated&&!incap)drop(l=>l.restoreAt==='revive'); // revive finished
   wasIncapacitated=incap;
   if(bombsOn()){
    protectPerma();permaRows=countPerma();
    const f=frame();
    if(f-lastBombCheck>=30){lastBombCheck=f;if(!active?.task||!bombOwners.has(active.task.id)){if(!bombCellsLeft()){bombOwners.clear();drop(l=>l.key==='usebombs');bombSkin(false)}}}
   }
   return holderNeeded;
  }
  function onLock(){protectPerma();permaRows=countPerma()}
  function cleanup(){
   holderNeeded=false;active=null;layers.length=0;bombSkin(false);
   // The run is over: put the option values back without resizing the finished board.
   for(const [key,value]of bases){if(key==='pieces')continue;for(const object of optionObjects())object[key]=value}
   bases.clear();
   if(bam&&originalPopulate){if(ownPopulate)bam.PopulateBag=originalPopulate;else delete bam.PopulateBag}
   if(sdm&&originalDrawStack){if(ownDrawStack)sdm.DrawStack=originalDrawStack;else delete sdm.DrawStack}
   if(zthm&&originalZUpdate){if(ownZUpdate)zthm.Update=originalZUpdate;else delete zthm.Update}
   if(bm&&originalPushLine){if(ownPushLine)bm.PushLine=originalPushLine;else delete bm.PushLine}
   return holderNeeded;
  }
  return {beforeMods,activate,missionEnd,tick,onLock,cleanup,_layers:layers};
 }
 window.LocalReviveExtraEffects={attach,SHAPES};
})();
