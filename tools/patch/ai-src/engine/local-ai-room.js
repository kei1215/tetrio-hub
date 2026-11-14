/* Local TL/CUSTOM match runner.
   v4.8276: stop() ends both boards natively (endNow) so the keyboard board does not stay
   on screen after 終了. */
(() => {
 let session=null,packetId=0;
 const asSide=value=>value==='player'?'player':'ai';
 const profileFor=(value,fallback)=>{if(value==='player')return null;const id=String(value||'');return window.LocalBotLearning?.getProfile?.(id.startsWith('ai:')?id.slice(3):fallback)};
 const safePlaying=game=>{try{return !!game?.isPlaying?.()}catch{return false}};
 function send(source,target,amount){if(!safePlaying(target)||!Number.isFinite(amount)||amount<=0)return;const ack=source.state.garbageacknowledgements;if(!ack?.incoming||!ack?.outgoing)return;const iid=source.state.interactionid=(Number(source.state.interactionid)||0)+1,ackiid=ack.incoming[target.id]||0,pending=ack.outgoing;(pending[target.id]??=[]).push({iid,amt:amount});target.source.Push('ige',{id:'local-tl-'+(++packetId),type:'interaction',data:{type:'garbage',gameid:source.id,username:source.options.username,iid,ackiid,amt:amount,x:4.5,y:30}})}
 function stop(){const old=session;if(!old)return;session=null;old.stopped=true;for(const dispose of old.cleanup.splice(0))try{dispose()}catch{}for(const game of old.games){try{game._localLiveBot?.stop?.();game.source?.Push?.('keyup',{key:'softDrop',subframe:.5})}catch{}try{if(safePlaying(game))game.endNow?.()}catch{}try{game.state.playing=false}catch{}}try{old.games[1]?.destroy?.()}catch{}}
 function attachBot(game,profile,state,external){
  const model=window.LocalBotLearning?.cloneLearner?.(profile.model);if(!model)throw Error('AI学習データを読み込めませんでした');
  const save=snapshot=>{try{window.LocalBotLearning.updateProfile(profile.id,snapshot);window.LocalLearningToast?.show(profile.name+' の学習を保存')}catch(error){probeLog('AI保存: '+error.message)}};
  // The original AI binds its live controller before recording selfplay.
  // This route mirrors that order; the controller provides the same weights and
  // key mappings as the original Mac build.
  let attempts=0,timer=0;
  const connect=()=>{
   if(state.stopped)return;
   // A freshly constructed local game can still be counting down.  Returning
   // without a retry here left BOTs permanently disconnected in TL/CUSTOM.
   if(!safePlaying(game)||!game.source?.self?.fm){
    if(++attempts<100)timer=setTimeout(connect,50);
    else window.LocalUIHealth?.fail?.('TL BOT開始',Error('ゲームの開始または盤面初期化を確認できませんでした'));
    return;
   }
   try{
    const driver=window.LocalLiveBot?.attach?.(game,profile,model);
    if(!driver)throw Error('BOT操作器を開始できませんでした');
    // v4.8276 (user: 外部AIは学習を基本入れないでほしい): no learning in a match with an
    // outside AI on either side. The outside side only borrows this profile for the keys,
    // and the vA side is not trained on games against it.
    if(profile.training&&!external&&!game._aiEngine)window.LocalBotLearning?.attachSelfplay?.(game,model,save);
    driver.begin?.();
   }catch(error){if(++attempts<8)timer=setTimeout(connect,100);else window.LocalUIHealth?.fail?.('TL BOT開始',error)}
  };
  connect();state.cleanup.push(()=>clearTimeout(timer));
 }
 function begin(config={}){
  stop();if(!config._continuing)window.LocalRoomUI?.reset?.();const fallback=config.profileId,leftValue=config.left??'ai',rightValue=config.right??'ai';if(leftValue==='player'&&rightValue==='player')throw Error('ローカル1台では両側をプレーヤーにできません。片側をAIにしてください');
  const profiles=[profileFor(leftValue,fallback),profileFor(rightValue,fallback)];for(let i=0;i<2;i++)if(asSide([leftValue,rightValue][i])==='ai'&&!profiles[i])throw Error((i?'右':'左')+'側のAIを選択してください');
  const names=profiles.map((profile,i)=>config.labels?.[i]||profile?.name||localStorage.getItem('qp-local-username')||('PLAYER '+(i+1)));if(typeof window.LocalNative?.tlRound!=='function')throw Error('TL対戦エンジンを読み込めませんでした。パッチを再適用してください');
  const roomOptions=window.LocalRoomUI?.read?.()?.options||{};
  const games=window.LocalNative.tlRound({names,left:asSide(leftValue),right:asSide(rightValue),seed:config.seed,mode:config.mode,options:roomOptions}),state=session={games,cleanup:[],stopped:false,finished:false,config};
  // One TTRM per match: rounds are added as they finish (config._match survives auto-advance).
  if(!config._continuing||!config._match)config._match={key:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),mode:config.mode==='custom'?'custom':'league',names,ai:profiles.map(p=>p?.id||null),rounds:[],wins:[0,0],recordId:null};
  state.match=config._match;
  // TL creates two independent game instances. Apply the selected clock speed
  // to BOTH boards, including BOT vs BOT and the non-keyboard side.
  const configuredSpeed=Number(localStorage.getItem('qp-local-game-speed')??1);
  const gameSpeed=[0,.25,.5,1,1.5,2,3,4,8].includes(configuredSpeed)?configuredSpeed:1;
  for(const board of games){board.playbackSpeed(gameSpeed);board._localSpeedChanges??=[];board._localSpeedChanges.push({frame:board.getFrame(),speed:gameSpeed})}
  // TL/CUSTOM: two copies of the same HOLD → BOARD → NEXT layout, with extra
  // spacing between P1 NEXT and P2 HOLD. QP DUO keeps its original layout.
  state.cleanup.push(window.LocalBoardPair?.attach?.(games,{mode:'tl'})||(()=>{}));
  games.forEach((game,index)=>{const peer=games[1-index];game._localTLPeer=peer;game._localAIProfileId=profiles[index]?.id||null;if(profiles[index])attachBot(game,profiles[index],state,!!(config.engines?.[0]||config.engines?.[1]));else window.LocalBotLearning?.attachHuman?.(game);let sent=Number(game.state.stats?.garbage?.sent)||0;const forward=()=>{const now=Number(game.state.stats?.garbage?.sent);if(!Number.isFinite(now))return;if(now>sent)send(game,peer,now-sent);sent=now};game.on?.('frame','local-ai-room-transport',forward);state.cleanup.push(()=>game.remove?.('frame','local-ai-room-transport'));game.on?.('end','local-ai-room-end',reason=>{if(state.stopped||state.finished||['retry','dropnow','stop'].includes(reason))return;state.finished=true;const winner=reason==='winner'?index:1-index;try{if(safePlaying(peer))peer.endWin?.()}catch{}const result=window.LocalRoomUI?.record?.(winner);window.dispatchEvent(new CustomEvent('local-ai-match-end',{detail:{winner,names,games,result,reason}}));try{const match=state.match;match.rounds.push({winner,replays:games.map(g=>{const r=g.replay.Export();try{const st=g._localAIStats||{};r.aiDebug={plan:g._aiPlanStats?{...g._aiPlanStats}:null,drive:{plannedDrops:st.plannedDrops,mismatchedDrops:st.mismatchedDrops,emergencyDrops:st.emergencyDrops,routeFailures:st.routeFailures,forcedByPPS:st.forcedByPPS,budgetSkips:st.budgetSkips,spinRouteMisses:st.spinRouteMisses},speed:window.LocalAIPlanSpeed?{msPerWidth:window.LocalAIPlanSpeed.msPerWidth,samples:window.LocalAIPlanSpeed.samples}:null,power:window.LocalAIPower?.level||null,external:g._aiExternalStats?{...g._aiExternalStats}:null};g._aiPlanStats=null}catch{}return r})});match.wins[winner]++;window.LocalReplayLibrary?.saveMatch?.(match,reason)}catch(error){probeLog('TLリプレイ保存: '+error.message)}if(!result?.done&&config.autoAdvance!==false){const next=setTimeout(()=>{if(session===state&&!state.stopped)begin({...config,_continuing:true,seed:config.seed===undefined?undefined:config.seed+1})},1500);state.cleanup.push(()=>clearTimeout(next))}})});
  window.dispatchEvent(new CustomEvent('local-ai-match-start',{detail:{games,names,config}}));return games;
 }
 window.LocalAIRoom={getGames:()=>session?.games||[],active:()=>session?.games?.filter(safePlaying)||[],add:game=>game,remove:()=>{},clear:stop,stop,start:begin,send,ft(firstTo){const value=Number(firstTo);if(!Number.isInteger(value)||value<1||value>99)throw Error('FTは1〜99で指定してください');const room=window.LocalRoomUI?.read?.();if(room){room.match.ft=value;window.LocalRoomUI.write(room);return {firstTo:value,wins:[...room.scores],complete:room.scores.some(score=>score>=value)}}return {firstTo:value,wins:[0,0],complete:false}}};
})();
