/* vA 4.9 entry-point to the original AI's frame-driven BOT controller.
   AI-manager, RL launcher, room UI and transport remain vA 4.9. The actual
   plan/search/timing/hold/rotation/movement/hard-drop logic is the original
   LocalTestQP.drive algorithm and sends native keydown/keyup events. */
(() => {
 const toast = message => {
  let node=document.getElementById('local-learning-toast');
  if(!node){node=document.createElement('div');node.id='local-learning-toast';node.setAttribute('aria-live','polite');node.style.cssText='position:fixed;left:18px;bottom:18px;z-index:2147483647;max-width:min(440px,calc(100vw - 36px));padding:10px 14px;border:1px solid #9fe9bd;border-radius:7px;background:#123a25ef;color:#eafff1;font:600 14px system-ui;box-shadow:0 4px 18px #0009;opacity:0;transform:translateY(8px);transition:opacity .18s,transform .18s';document.body.appendChild(node)}
  node.textContent='学習成功 · '+message;node.style.opacity='1';node.style.transform='translateY(0)';clearTimeout(node._timer);node._timer=setTimeout(()=>{node.style.opacity='0';node.style.transform='translateY(8px)'},5000);
 };
 window.LocalLearningToast={show:toast};
 window.LocalNative??={};
 if(typeof window.LocalNative.notifyLearning!=='function')window.LocalNative.notifyLearning=name=>toast(String(name||'AI')+' の学習を保存しました');

 function attach(game,profile,model,onEnd){
  if(!game?.source?.self?.fm||!game?.on||!game?.getFrame)throw Error('BOT操作用のゲーム状態を取得できませんでした');
  if(game._localLiveBot)return game._localLiveBot;
  if(typeof window.LocalTestQP?.drive!=='function')throw Error('旧版AI操作器が読み込まれていません');
  if(!model||!profile)throw Error('AIプロフィールの学習モデルが見つかりません');
  // Mirror the exact per-game bindings used by the original ai-profiles.js.
  // Do not attach that older module: its UI is not compatible with vA 4.9.
  game._useLocalBotLearning=true;
  game._localLearningMode=profile.model?.mode||'qp';
  game._aiProfileId=profile.id||null;
  game._localAIProfileId=profile.id||null;
  game._aiDepth=profile.lookaheadDepth??3;
  game._aiSeedAccess=profile.seedAccess===true;
  game._aiChainFocus=model.snapshot().chainFocus===true;
  game._aiWeights=model.combatWeights();
  game._aiPolicy=model.policy();
  game._aiBehavior=model.behavior();
  game._aiExploration=!!profile.training;
  game._aiAllowHold=profile.allowHold!==false&&game.options?.display_hold!==false&&game.options?.display_hold!==0&&!['nohold','nohold_reversed'].some(m=>(game.options?.zenith_mods||[]).includes(m));
  game._aiAllowSoftDrop=profile.allowSoftDrop!==false;
  const playerSettings=window.LocalAIPlayerSettings?.sync?.(game);
  if(playerSettings){
   game._aiAllowHold=game._aiAllowHold&&playerSettings.allowHold;
   game._aiAllowSoftDrop=game._aiAllowSoftDrop&&playerSettings.allowSoftDrop;
  }
  game._aiMimicTiming=!!profile.mimicPlay;
  // Spin B2B mode (vA option panel): read again every piece so the checkbox
  // applies without restarting the room.
  // ON unless the player turned it off. Also in TL / CUSTOM versus rooms (2026-11-13: with the
  // normal evaluation there the AI made no T-Spins at all in a real 6-round TL replay).
  const syncB2B=()=>{let on=true;try{on=localStorage.getItem('qp-local-ai-tspin-b2b')!=='false'}catch{}game._aiTSpinB2B=on};syncB2B();
  game._aiNextCount=profile.nextCount??null;
  game._localTLMatch=!!game._localTLPeer;
  game._rlState=game._rlState||model.reinforcement();
  if(!profile.training)game._rlState.enabled=false;
  game._rlKey=window.LocalRLCore.sharedKey(game._rlState,window.LocalRLCore.key(game._localLearningMode,game.options?.zenith_mods||[]));

  let stopped=false,moves=0,plans=0,lastError='',lastFrame=-1,lastSync=-1;
  const speed=()=>Math.max(.1,Math.min(20,Number(localStorage.getItem('qp-local-bot-pps'))||1));
  const tick=window.LocalTestQP.drive(game,speed);
  const status=(state,message='')=>{
   const detail={state,message,plans,moves,error:lastError,profile:profile.id||'',at:Date.now()};
   game._localBotStatus=detail;
   window.dispatchEvent(new CustomEvent('local-bot-status',{detail}));
  };
  const stop=()=>{
   if(stopped)return;
   stopped=true;
   game.remove?.('frame','local-legacy-ai-frame');
   game.remove?.('end','local-legacy-ai-end');
   try{tick.dispose?.()}catch(error){console.warn('[Legacy AI disposal]',error)}
   window.LocalAIPlayerSettings?.release?.(game);
   delete game._localLiveBot;
   if(!lastError)status('stopped');
  };
  const begin=()=>{
   if(stopped||!game.isPlaying?.()||!game.state?.falling)return;
   const frame=game.getFrame();if(frame===lastFrame)return;lastFrame=frame;
   try{
    if(game.state.stats?.piecesplaced!==lastSync){lastSync=game.state.stats?.piecesplaced;syncB2B()}
    tick();
    if(profile.training&&game.state.stats?.piecesplaced%16===0){
     game._aiWeights=model.combatWeights();game._aiPolicy=model.policy();game._aiBehavior=model.behavior();
    }
    const st=game._localAIStats;
    const next=st?.plannedDrops+st?.emergencyDrops||0;
    if(next>moves){moves=next;plans=st.plannedDrops;status('moved',game._localBotIntent||`#${moves}`)}
   }catch(error){lastError=error?.message||String(error);status('error',lastError);window.LocalUIHealth?.fail?.('旧版BOT操作',error);stop()}
  };
  game._localLiveBot={stop,begin,getStatus:()=>game._localBotStatus};
  game.on('frame','local-legacy-ai-frame',begin);
  game.on('end','local-legacy-ai-end',reason=>{stop();onEnd?.(reason)});
  status('waiting','ゲーム開始待機');
  begin();return game._localLiveBot;
 }
 window.LocalLiveBot={attach};
})();
