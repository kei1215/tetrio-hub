/* Player handling/rule bridge. Physical key bindings are intentionally not
   copied: BOT input uses the game's semantic actions (moveLeft, rotateCW...). */
(() => {
 const timing = new WeakMap();
 const number = (value, fallback=0) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
 const readConfig = () => {
  try { const value=JSON.parse(localStorage.getItem('userConfig')||'{}');return value&&typeof value==='object'?value:{} } catch { return {} }
 };
 const firstObject = values => values.find(value=>value&&typeof value==='object'&&!Array.isArray(value))||{};
 const millisecondsToFrames = value => Math.max(0, Math.ceil(number(value)*60/1000));
 function read(game){
  const config=readConfig();
  const handling=firstObject([game?.options?.handling,game?.state?.setoptions?.handling,config.handling,config.gameoptions?.handling]);
  const options=game?.options||game?.state?.setoptions||{};
  const arr=number(handling.arr??handling.ARR,0),das=number(handling.das??handling.DAS,100);
  // Older/local exports have used DSS for the post-direction delay. Keep it
  // as an accepted alias while retaining the current DCD name.
  const dcd=number(handling.dcd??handling.DCD??handling.dss??handling.DSS,0);
  const sdf=number(handling.sdf??handling.SDF??handling.softDropFactor,20);
  return Object.freeze({
   arr,das,dcd,dss:number(handling.dss??handling.DSS,dcd),sdf,
   arrFrames:millisecondsToFrames(arr),dasFrames:millisecondsToFrames(das),dcdFrames:millisecondsToFrames(dcd),
   kickset:String(options.kickset||options.rotation_system||'native'),
   allow180:options.allow180!==false&&options.allow180!==0,
   allowHold:options.display_hold!==false&&options.display_hold!==0&&!['nohold','nohold_reversed'].some(mod=>(options.zenith_mods||[]).includes(mod)),
   allowSoftDrop:options.allow_softdrop!==false&&options.allow_softdrop!==0,
   allowHardDrop:options.allow_harddrop!==false&&options.allow_harddrop!==0,
  });
 }
 function sync(game){const value=read(game);game._aiPlayerSettings=value;timing.delete(game);return value}
 function settings(game){return game._aiPlayerSettings||sync(game)}
 function canUse(game,key){const value=settings(game);if(key==='hold')return value.allowHold;if(key==='softDrop')return value.allowSoftDrop;if(key==='hardDrop')return value.allowHardDrop;if(key==='rotate180')return value.allow180;return true}
 function tap(game,key){
  if(!canUse(game,key))return false;
  const frame=Number(game.getFrame?.()??0),horizontal=key==='moveLeft'||key==='moveRight';
  let state=timing.get(game);if(!state){state={lastFrame:-1e9,lastKey:'',horizontalRepeats:0};timing.set(game,state)}
  let wait=0;
  if(horizontal){
   if(state.lastKey===key)wait=state.horizontalRepeats===1?settings(game).dasFrames:settings(game).arrFrames;
   else if(state.lastKey==='moveLeft'||state.lastKey==='moveRight')wait=settings(game).dcdFrames;
  }
  if(frame-state.lastFrame<wait)return false;
  game.source.Push('keydown',{key,subframe:0});game.source.Push('keyup',{key,subframe:.5});
  if(horizontal)state.horizontalRepeats=state.lastKey===key?state.horizontalRepeats+1:1;else state.horizontalRepeats=0;
  state.lastFrame=frame;state.lastKey=key;return true;
 }
 function release(game){timing.delete(game)}
 window.LocalAIPlayerSettings={read,sync,settings,canUse,tap,release};
})();

