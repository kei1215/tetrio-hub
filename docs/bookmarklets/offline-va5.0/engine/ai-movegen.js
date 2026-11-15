/* vA 4.8243 native move generator.
   One breadth-first search over the piece states that the REAL engine can
   reach from the spawn position: left / right, CW / CCW / 180 (native kicks)
   and a non-locking drop to the floor. Every grounded state becomes a
   placement, with the shortest key sequence that reaches it and the native
   spin flag of its last rotation. Nothing is teleported and no spin flag is
   ever assigned by hand; the live BOT replays the same keys. */
(function(root){
 const ROT={rotateCW:1,rotateCCW:-1,rotate180:2};
 function snap(f){return {x:f.x,y:f.y,r:f.r,flags:f.flags,kick:f.kick,locking:f.locking,lockresets:f.lockresets,rotresets:f.rotresets,hy:f.hy,irs:f.irs,keys:f.keys,safelock:f.safelock,skip:Array.isArray(f.skip)?f.skip.slice():f.skip}}
 function makeIO(engine,state){
  const fm=engine.fm,bm=engine.bm;
  const get=()=>snap(state.falling);
  const set=s=>{const f=state.falling;Object.assign(f,s);if(Array.isArray(s.skip))f.skip=s.skip.slice();bm.ClearIsLegalAtPosMemo()};
  const legal=(x,y,r)=>bm.IsLegalAtPos(state.falling.type,x,y,r);
  const grounded=()=>{const f=state.falling;return !legal(f.x,Math.ceil(f.y)+1,f.r)&&!legal(f.x,f.y+1,f.r)};
  const apply=key=>{
   const f=state.falling,before=f.x+':'+f.y+':'+f.r;
   if(key in ROT){fm.Rotate(ROT[key]);bm.ClearIsLegalAtPosMemo()}
   else if(key==='sonicDrop'){fm.ClearFlags(63|64);fm.SlamToFloor();bm.ClearIsLegalAtPosMemo()}
   else{
    const dx=key==='moveRight'?1:key==='moveLeft'?-1:0;
    if(!dx||!legal(f.x+dx,f.y,f.r))return false;
    f.x+=dx;f.lockresets++;f.locking=0;fm.ClearFlags(63|64);bm.ClearIsLegalAtPosMemo();
    if(fm.Is20G?.())fm.SlamToFloor();
   }
   return f.x+':'+f.y+':'+f.r!==before;
  };
  return {get,set,apply,legal,grounded};
 }
 /* options: allow180, allowDrop (soft drop usable), maxKeys, maxNodes.
    Returns [{path,x,y,r,spin,flags,keys}] (y is the integer row). */
 function generate(engine,state,options={}){
  const io=makeIO(engine,state),start=io.get();
  const allow180=options.allow180!==false,allowDrop=options.allowDrop!==false;
  // Keys after the first drop (tucks / spins). Three covers TSD/TST/STSD and
  // S/Z/L/J spins; longer floor walks are rare and cost most of the search.
  const maxTail=allowDrop?Math.max(1,Math.min(6,options.maxTail||3)):0,maxNodes=Math.max(64,options.maxNodes||1600);
  const rotations=['rotateCW','rotateCCW',...(allow180?['rotate180']:[])],moves=['moveLeft','moveRight'];
  const out=[],finals=new Map();
  const record=(path,spin)=>{
   const f=state.falling,y=Math.ceil(f.y),key=f.x+':'+y+':'+f.r+':'+(spin?1:0);
   if(finals.has(key))return;
   const item={path:path.slice(),x:f.x,y,r:f.r,spin,flags:f.flags};
   finals.set(key,item);out.push(item);
  };
  // Phase 1: every column / orientation reachable at the spawn height. This
  // phase is never cut by the node budget, so all straight drops exist even
  // on a tall, messy stack.
  const top=[{s:start,path:[]}],seenTop=new Set([start.x+':'+start.r+':'+Math.ceil(start.y)]);
  for(let i=0;i<top.length;i++){
   for(const key of [...rotations,...moves]){
    io.set(top[i].s);if(!io.apply(key))continue;
    const f=state.falling,id=f.x+':'+f.r+':'+Math.ceil(f.y);if(seenTop.has(id))continue;seenTop.add(id);
    top.push({s:io.get(),path:[...top[i].path,key]});
   }
  }
  // Phase 2: drop each one; Phase 3: short tails (tucks and spins) from the floor.
  const ground=[];
  for(const node of top){
   io.set(node.s);io.apply('sonicDrop');
   const path=[...node.path,'sonicDrop'];record(path,false);
   if(maxTail)ground.push({s:io.get(),path,tail:0});
  }
  const seen=new Set(ground.map(n=>n.s.x+':'+Math.ceil(n.s.y)+':'+n.s.r+':0'));
  const tailKeys=[...rotations,...moves,'sonicDrop'];
  for(let i=0,nodes=0;i<ground.length&&nodes<maxNodes;i++){
   const node=ground[i];if(node.tail>=maxTail)continue;
   for(const key of tailKeys){
    io.set(node.s);
    if(key==='sonicDrop'&&io.grounded())continue;
    if(!io.apply(key))continue;nodes++;
    const f=state.falling,spin=key in ROT&&!!(f.flags&8),id=f.x+':'+Math.ceil(f.y)+':'+f.r+':'+(spin?1:0);
    if(seen.has(id))continue;seen.add(id);
    const path=[...node.path,key];
    if(io.grounded())record(path,spin);
    ground.push({s:io.get(),path,tail:node.tail+1});
   }
  }
  io.set(start);
  return out;
 }
 /* Split a path into executable steps. A run of equal horizontal moves is a
    single DAS/ARR hold when the run ends at a wall (the native auto-repeat
    stops there by itself) or when the ARR is slow enough to release on the
    exact column. Otherwise the run stays as single taps. */
 function compile(path,trace,handling={}){
  const steps=[];let i=0;
  const arr=Number(handling.arr??2),slowArr=arr>=1;
  while(i<path.length){
   const key=path[i];
   if(key==='moveLeft'||key==='moveRight'){
    let j=i;while(j+1<path.length&&path[j+1]===key)j++;
    const n=j-i+1,end=trace[j],wall=!!end?.wall;
    if(n>=2&&(wall||slowArr))steps.push({kind:'hold',key,count:n,to:end,wall});
    else for(let k=i;k<=j;k++)steps.push({kind:'tap',key,to:trace[k]});
    i=j+1;continue;
   }
   if(key==='sonicDrop'){steps.push({kind:'drop',key:'softDrop',to:trace[i]});i++;continue}
   steps.push({kind:'tap',key,to:trace[i]});i++;
  }
  return steps;
 }
 /* Replay a path natively from the current falling state, returning the
    per-key trace (position after each key, plus wall flag after moves). */
 function trace(engine,state,path){
  const io=makeIO(engine,state),start=io.get(),out=[];
  for(const key of path){
   if(!io.apply(key)){io.set(start);return null}
   const f=state.falling,item={x:f.x,y:Math.ceil(f.y),r:f.r,spin:!!(f.flags&8)};
   if(key==='moveLeft'||key==='moveRight')item.wall=!io.legal(f.x+(key==='moveRight'?1:-1),f.y,f.r);
   out.push(item);
  }
  io.set(start);return out;
 }
 const api={generate,compile,trace,makeIO};
 if(typeof module!=='undefined')module.exports=api;else root.LocalAIMoveGen=api;
})(typeof window==='undefined'?globalThis:window);
