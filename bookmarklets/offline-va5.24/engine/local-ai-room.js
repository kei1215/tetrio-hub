/* Local TL/CUSTOM match runner.
   v4.8276: stop() ends both boards natively (endNow) so the keyboard board does not stay
   on screen after 終了.
   v4.8279 (user: 火力の待ちが一切ない / すぐ赤くなる): a garbage packet without cid is active at
   once in the native engine; active:false makes it wait garbagespeed (TL 20 frames) like
   online TL before it can enter.
   v4.8280 (user: TLの上に数字 / 点数上昇の演出, オンオフ可): the native #referee score box above the
   boards shows the match score; on a round win the winner's number flashes with a "+1"
   (qp-local-tl-score-rise, Tab panel). Same look as the replay presentation in client.js.
   Round end: boards hidden and the native score slide (#scoreslide, client.js fix_scoreslide)
   shown; next round 6.3 s later (qp-local-tl-scoreslide, Tab panel).
   v4.8281 (user: 基本オフ): +1 and the score slide are off unless the toggle is '1'.
   v4.8282 (user: AIの全試合終了後statsを表示する画面に移動 / リプレイの画面と同じ): when the match is
   decided the boards close and the native results page of the saved match TTRM opens
   (LocalNative.replay, same page as opening a TTRM). 3,2,1,GO shout every round. */
(() => {
 let session=null,packetId=0,scoreSnap=null,scoreHide=0;
 const scoreStyle=()=>{if(document.getElementById('qp-local-score-style'))return;const st=document.createElement('style');st.id='qp-local-score-style';st.textContent='@keyframes qp-ls-flash{0%{filter:brightness(1);transform:scale(1)}28%{filter:brightness(2.35);text-shadow:0 0 .16em #fff,0 0 .42em currentColor;transform:scale(1.13)}100%{filter:brightness(1);transform:scale(1)}}@keyframes qp-ls-rise{0%{opacity:0;transform:translate(-50%,.45em) scale(.7)}18%{opacity:1;transform:translate(-50%,0) scale(1.1)}100%{opacity:0;transform:translate(-50%,-1.8em) scale(.92)}}#referee_points .referee_point{position:relative}#referee_points .referee_point h1.qp-ls-flash{animation:qp-ls-flash .58s ease-out!important;transform-origin:center}.qp-ls-gain{position:absolute;left:50%;top:-.65em;z-index:3;color:#fff;font-size:clamp(18px,2.2vw,38px);font-weight:900;text-shadow:0 0 .2em #fff,0 0 .5em currentColor;pointer-events:none;animation:qp-ls-rise 1.15s ease-out forwards}';document.head.appendChild(st)};
 function showScore(values,names,title,gain=-1){
  clearTimeout(scoreHide);const referee=document.getElementById('referee'),top=document.getElementById('referee_top'),points=document.getElementById('referee_points');if(!referee||!top||!points)return;scoreStyle();
  if(!scoreSnap)scoreSnap={className:referee.className,top:top.textContent,points:points.innerHTML};
  referee.classList.remove('hidden','hiding','disabled');referee.classList.add('duel');top.textContent=title;referee.style.top='48px'; // below the local win gauge (top:6px), which appears a moment after the round starts
  points.replaceChildren();
  names.forEach((name,index)=>{if(index){const sep=document.createElement('div');sep.className='referee_sep';sep.textContent='-';points.appendChild(sep)}const point=document.createElement('div');point.className='referee_point';point.style.cssText=index?'--r: 205; --g: 38; --b: 38;':'--r: 38; --g: 109; --b: 205;';const h=document.createElement('h1'),p=document.createElement('p');h.textContent=String(values[index]??0);p.textContent=String(name).toUpperCase();point.append(h,p);points.appendChild(point)});
  if(gain<0||localStorage.getItem('qp-local-tl-score-rise')!=='1')return;const h=points.querySelectorAll('.referee_point h1')[gain];if(!h)return;
  h.classList.add('qp-ls-flash');setTimeout(()=>h.classList.remove('qp-ls-flash'),650);const g=document.createElement('span');g.className='qp-ls-gain';g.textContent='+1';h.parentElement.appendChild(g);g.addEventListener('animationend',()=>g.remove(),{once:true});
 }
 function hideScore(delay=60){clearTimeout(scoreHide);scoreHide=setTimeout(()=>{if(!scoreSnap||session)return;const referee=document.getElementById('referee'),top=document.getElementById('referee_top'),points=document.getElementById('referee_points');if(referee){referee.className=scoreSnap.className;referee.style.top=''}if(top)top.textContent=scoreSnap.top;if(points)points.innerHTML=scoreSnap.points;scoreSnap=null},delay)}
 // v4.8281 (user: TLの曲を流せる様に / 音量0だったら考慮しない): Tab toggle qp-local-tl-music (off
 // unless '1'); skipped when the music volume in userConfig is 0 (read only). One RANDOMbattle
 // track per match like online TL: kept across rounds, faded at match end and on 終了.
 const musicOn=()=>{if(localStorage.getItem('qp-local-tl-music')!=='1')return false;try{const v=JSON.parse(localStorage.getItem('userConfig')||'{}')?.volume;if(v&&(Number(v.music)===0||v.disable===true))return false}catch{}return true};
 const fadeMusic=t=>{try{window.__qpBgmFade?.(t)}catch{}};
 const scoreTitle=(config,room)=>(config.mode==='custom'?'CUSTOM':config.mode==='s1'?'TETRA LEAGUE S1':'TETRA LEAGUE')+' FT'+(room?.match?.ft||1);
 // v5.16 (user: ルームの音を消す設定): Tab 'qp-local-room-mute' = '1' silences the room sounds (mission
 // shout, 3-2-1-GO, room shout, join/leave, chat, lobby music) during a local AI match or in the local
 // CUSTOM room. All of them go through the native Sa.SePlay / BgmPlaySmoothly (client.js __qpSa).
 const ROOM_SE=/^(mission|countdown|go$|rsg|userjoin|userleave|chat|matchintro|cutin)/;
 const roomMuted=()=>localStorage.getItem('qp-local-room-mute')==='1'&&(!!session||!!window.LocalCustomRoom?.active?.());
 function installMute(){const sa=window.__qpSa?.();if(!sa||sa._qpRoomMute)return;sa._qpRoomMute=true;const se=sa.SePlay,bgm=sa.BgmPlaySmoothly;sa.SePlay=function(name,...a){if(roomMuted()&&ROOM_SE.test(String(name)))return;return se.call(this,name,...a)};if(bgm)sa.BgmPlaySmoothly=function(name,...a){if(roomMuted()&&!session&&/calm|^RANDOM$/.test(String(name)))return Promise.resolve();return bgm.call(this,name,...a)}}
 // v5.16 (user: リザルト画面の左右の位置ずれ / MP4 のように上から順に出す演出): the player cards were wider
 // than their half (-87..731 / 869..1687 on 1600 px) and did not line up with the round rows. Each card
 // now fills its half of the row block (outer edges = the rows' edges). Cards slide in from the sides,
 // then the rows appear top to bottom (MP4 tool timing: 0.25 s + 0.06 s per row, 0.3 s each).
 function decorateResults(){
  if(!document.getElementById('qp-ai-results-style')){const st=document.createElement('style');st.id='qp-ai-results-style';st.textContent='body.qp-ai-results #multilogplayers{display:flex;justify-content:center;align-items:center;width:calc(6px + 70vw);margin-left:0;margin-right:0}body.qp-ai-results #multilogplayers #multilog_self,body.qp-ai-results #multilogplayers #multilog_opponent{flex:none;width:calc((100% - 7em) / 2)!important;max-width:calc((100% - 7em) / 2);min-width:0;box-sizing:border-box;overflow:hidden}body.qp-ai-results #multilogplayers .leagueplayer_vs{flex:none}@keyframes qp-ml-l{from{opacity:0;transform:translateX(-10vw)}to{opacity:1;transform:none}}@keyframes qp-ml-r{from{opacity:0;transform:translateX(10vw)}to{opacity:1;transform:none}}@keyframes qp-ml-row{from{opacity:0;transform:translateY(1em)}to{opacity:1;transform:none}}body.qp-ai-results.qp-ai-anim #multilogplayers #multilog_self{animation:qp-ml-l .5s cubic-bezier(.2,.8,.3,1) both}body.qp-ai-results.qp-ai-anim #multilogplayers #multilog_opponent{animation:qp-ml-r .5s cubic-bezier(.2,.8,.3,1) both}body.qp-ai-results.qp-ai-anim #multilog .multilog_result{animation:qp-ml-row .3s ease-out both;animation-delay:calc(.25s + var(--qp-i) * .06s)}';document.head.appendChild(st)}
  let tries=0;const go=()=>{const rows=document.querySelectorAll('#multilog .multilog_result');if(!rows.length&&++tries<40)return setTimeout(go,50);rows.forEach((r,i)=>r.style.setProperty('--qp-i',String(i)));document.body.classList.add('qp-ai-results');document.body.classList.remove('qp-ai-anim');void document.body.offsetWidth;document.body.classList.add('qp-ai-anim');
   const off=()=>{if(document.getElementById('multilogview')?.offsetParent)return setTimeout(off,500);document.body.classList.remove('qp-ai-results','qp-ai-anim')};setTimeout(off,1000)};go();
 }
 const asSide=value=>value==='player'?'player':'ai';
 const profileFor=(value,fallback)=>{if(value==='player')return null;const id=String(value||'');return window.LocalBotLearning?.getProfile?.(id.startsWith('ai:')?id.slice(3):fallback)};
 const safePlaying=game=>{try{return !!game?.isPlaying?.()}catch{return false}};
 // v4.8283 (user: リプレイと実際のプレイがずれる): the room no longer writes the sender's
 // interactionid / garbageacknowledgements.outgoing. Those writes are not in the replay, so when both
 // sides attacked within a frame the live game cancelled the crossing garbage (passthrough zero) and
 // the replay did not (native replay of the 08:01 TTRM: off from that frame on). The packet id is
 // counted by the room; ackiid = all acknowledged, so nothing is cancelled live or in the replay.
 function send(source,target,amount){if(!safePlaying(target)||!Number.isFinite(amount)||amount<=0)return;const iid=source._localIgeIid=(source._localIgeIid||0)+1,ackiid=Number.MAX_SAFE_INTEGER;target.source.Push('ige',{id:'local-tl-'+(++packetId),type:'interaction',data:{type:'garbage',gameid:source.id,username:source.options.username,iid,ackiid,amt:amount,x:4.5,y:30,active:false}})}
 function noGravity(g){try{g.options.g=0;g.options.gincrease=0;if(g.state)g.state.g=0;const ro=g.replay?.options;if(ro&&ro!==g.options){ro.g=0;ro.gincrease=0}g._localNoGravity=true}catch{}}
 function stop(){const old=session;if(!old)return;session=null;old.stopped=true;for(const dispose of old.cleanup.splice(0))try{dispose()}catch{}for(const game of old.games){try{game._localLiveBot?.stop?.();game.source?.Push?.('keyup',{key:'softDrop',subframe:.5})}catch{}try{if(safePlaying(game))game.endNow?.()}catch{}try{game.state.playing=false}catch{}}try{old.games[1]?.destroy?.()}catch{}hideScore()}
 function attachBot(game,profile,state,external){
  try{window.LocalReplayLibrary?.trackBot?.(game)}catch{}
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
  stop();installMute();if(!config._continuing){window.LocalRoomUI?.reset?.();if(Number.isInteger(config.firstTo))window.LocalAIRoom.ft(config.firstTo)}const fallback=config.profileId,leftValue=config.left??'ai',rightValue=config.right??'ai';if(leftValue==='player'&&rightValue==='player')throw Error('ローカル1台では両側をプレーヤーにできません。片側をAIにしてください');
  const profiles=[profileFor(leftValue,fallback),profileFor(rightValue,fallback)];for(let i=0;i<2;i++)if(asSide([leftValue,rightValue][i])==='ai'&&!profiles[i])throw Error((i?'右':'左')+'側のAIを選択してください');
  const names=profiles.map((profile,i)=>config.labels?.[i]||profile?.name||localStorage.getItem('qp-local-username')||('PLAYER '+(i+1)));if(typeof window.LocalNative?.tlRound!=='function')throw Error('TL対戦エンジンを読み込めませんでした。パッチを再適用してください');
  const roomOptions=config.options||window.LocalRoomUI?.read?.()?.options||{};
  // v5.16 (user: シードを変える): every round already gets a new random seed (tlRound); the Tab option
  // 'qp-local-ai-seed-split' gives the right board its own seed too (own piece order; off = same
  // queue for both like TETRA LEAGUE). Each board's replay keeps its own seed.
  const seed=Number.isInteger(config.seed)?config.seed:Math.floor(Math.random()*2147483646)+1;
  const music=musicOn(),games=window.LocalNative.tlRound({names,left:asSide(leftValue),right:asSide(rightValue),seed,seed2:localStorage.getItem('qp-local-ai-seed-split')==='1'?(seed*7919+104729)%2147483646+1:undefined,mode:config.mode,options:roomOptions,keepBgm:music&&!!config._continuing}),state=session={games,cleanup:[],stopped:false,finished:false,config};
  // One TTRM per match: rounds are added as they finish (config._match survives auto-advance).
  if(!config._continuing||!config._match)config._match={key:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),mode:config.mode==='custom'?'custom':'league',rule:config.mode||'league',names,ai:profiles.map(p=>p?.id||null),engines:[...(config.engines||[])],rounds:[],wins:[0,0],recordId:null};
  state.match=config._match;
  // TL creates two independent game instances. Apply the selected clock speed
  // to BOTH boards, including BOT vs BOT and the non-keyboard side.
  const configuredSpeed=Number(localStorage.getItem('qp-local-game-speed')??1);
  const gameSpeed=[0,.25,.5,1,1.5,2,3,4,8].includes(configuredSpeed)?configuredSpeed:1;
  for(const board of games){board.playbackSpeed(gameSpeed);board._localSpeedChanges??=[];board._localSpeedChanges.push({frame:board.getFrame(),speed:gameSpeed})}
  // TL/CUSTOM: two copies of the same HOLD → BOARD → NEXT layout, with extra
  // spacing between P1 NEXT and P2 HOLD. QP DUO keeps its original layout.
  state.cleanup.push(window.LocalBoardPair?.attach?.(games,{mode:'tl'})||(()=>{}));
  games.forEach((game,index)=>{const peer=games[1-index];game._localTLPeer=peer;game._localAIProfileId=profiles[index]?.id||null;if(profiles[index])attachBot(game,profiles[index],state,!!(config.engines?.[0]||config.engines?.[1]));else window.LocalBotLearning?.attachHuman?.(game);let sent=Number(game.state.stats?.garbage?.sent)||0;const forward=()=>{const now=Number(game.state.stats?.garbage?.sent);if(!Number.isFinite(now))return;if(now>sent)send(game,peer,now-sent);sent=now};game.on?.('frame','local-ai-room-transport',forward);state.cleanup.push(()=>game.remove?.('frame','local-ai-room-transport'));game.on?.('end','local-ai-room-end',reason=>{if(state.stopped||state.finished||['retry','dropnow','stop'].includes(reason))return;state.finished=true;const winner=reason==='winner'?index:1-index;try{if(safePlaying(peer))peer.endWin?.()}catch{}const result=window.LocalRoomUI?.record?.(winner);const slide=localStorage.getItem('qp-local-tl-scoreslide')==='1'&&typeof window.__qpScoreSlide==='function';if(slide)setTimeout(()=>{if(session!==state)return;try{for(const g of games){const h=g.source?.self?.hm?.H?.holder;if(h)h.visible=false}const room=window.LocalRoomUI?.read?.(),sc=result?.scores||[0,0],tag=n=>String(n)+'\u200b';window.__qpScoreSlide([{username:tag(names[winner])}],{modename:config.mode==='custom'?'CUSTOM':'TETRA LEAGUE',rb:{leaderboard:names.map((n,i)=>({username:tag(n),wins:sc[i]||0,naturalorder:i})),options:{ft:room?.match?.ft||1,wb:1,gp:0}}});setTimeout(()=>{if(session===state)for(const g of games){const h=g.source?.self?.hm?.H?.holder;if(h)h.visible=true}},5200)}catch(error){probeLog('スコア演出: '+error.message)}},900);try{const room=window.LocalRoomUI?.read?.(),prev=(result?.scores||[0,0]).map((v,i)=>i===winner?v-1:v);showScore(prev,names,scoreTitle(config,room));setTimeout(()=>{if(session===state)showScore(result?.scores||[0,0],names,scoreTitle(config,room),winner)},700)}catch{}window.dispatchEvent(new CustomEvent('local-ai-match-end',{detail:{winner,names,games,result,reason}}));try{const match=state.match;match.rounds.push({winner,replays:games.map(g=>{const r=g.replay.Export();try{const st=g._localAIStats||{};r.aiDebug={plan:g._aiPlanStats?{...g._aiPlanStats}:null,drive:{plannedDrops:st.plannedDrops,mismatchedDrops:st.mismatchedDrops,emergencyDrops:st.emergencyDrops,routeFailures:st.routeFailures,forcedByPPS:st.forcedByPPS,budgetSkips:st.budgetSkips,spinRouteMisses:st.spinRouteMisses},speed:window.LocalAIPlanSpeed?{msPerWidth:window.LocalAIPlanSpeed.msPerWidth,samples:window.LocalAIPlanSpeed.samples}:null,power:window.LocalAIPower?.level||null,external:g._aiExternalStats?{...g._aiExternalStats}:null};g._aiPlanStats=null}catch{}return r}).map((r,i,all)=>window.LocalReplayLibrary?.humanize?window.LocalReplayLibrary.humanize(games[i],r,all[1-i]&&!(games[1-i]._localAIPlayerName||games[1-i]._localAIProfileId)?all[1-i]:null):r)});match.wins[winner]++;window.LocalReplayLibrary?.saveMatch?.(match,reason)}catch(error){probeLog('TLリプレイ保存: '+error.message)}if(result?.done||config.autoAdvance===false)setTimeout(()=>fadeMusic(1),slide?5200:1500);if(result?.done){const show=setTimeout(()=>{if(session!==state)return;const file=window.LocalReplayLibrary?.matchFile?.(state.match);stop();try{if(file){window.LocalNative?.replay?.(file);decorateResults()}}catch(error){probeLog('試合結果: '+error.message)}},slide?6000:2500);state.cleanup.push(()=>clearTimeout(show))};if(!result?.done&&config.autoAdvance!==false){const next=setTimeout(()=>{if(session===state&&!state.stopped)begin({...config,_continuing:true,seed:Number.isInteger(config.seed)?config.seed+1:undefined})},slide?6300:1500);state.cleanup.push(()=>clearTimeout(next))}})});
  try{const room=window.LocalRoomUI?.read?.();showScore(room?.scores||[0,0],names,scoreTitle(config,room))}catch{}
  // v4.8283 (user: customroomの3,2,1,goが動いてる / AI戦): the board countdown of a custom room
  // (3, 2, 1, GO! zooming on each board, countdown sounds) every round, instead of the room shout
  // (v4.8282 __qpRsg, a flat text). tlPreset has countdown off; _StartCountdown reads the options
  // only after prestart (850 ms), so setting them here is in time. Nothing in the replay changes
  // (the countdown runs before frame 0).
  // v5.16 (user: ルーム表示が消えていないのに音とカウントダウンが始まる): the first round's mission shout
  // ("LOCAL TETRA LEAGUE", CSS missionExpand 4 s, gone at 4.0 s) was still on screen when 3 and its
  // sound came (precountdown 500 ms after the shout). The countdown now starts when it is gone.
  for(const g of games){try{Object.assign(g.options,{countdown:true,countdown_count:3,countdown_interval:1000,precountdown:config._continuing?0:4000})}catch{}}
  // v4.8280 (user: 毎回ゲーム開始時の演出と音): the mission shout + mission_versus sound play in the
  // native countdown (after prestart); only the first round of a match keeps them.
  if(config._continuing)for(const g of games){try{g.options.mission=''}catch{}}
  // v4.8283 (user: BOT だけ / 両方 ミノの落下をなし): Tab 'ミノの落下' sets gravity 0 before the
  // countdown (no piece has fallen yet). The replay options get it too, so the saved round
  // plays back the same.
  {const ng=localStorage.getItem('qp-ai-no-gravity');games.forEach((g,i)=>{if(!(ng==='both'||ng==='bot'&&profiles[i]))return;noGravity(g)})}
  if(music){for(const g of games){try{g.options.neverstopbgm=true}catch{}}if(!config._continuing){const lead=games.find(g=>g._localTestMode==='solo')||games[0];try{lead.options.song='RANDOMbattle'}catch{}}}
  window.dispatchEvent(new CustomEvent('local-ai-match-start',{detail:{games,names,config}}));return games;
 }
 const stopAll=()=>{stop();fadeMusic(.5)};window.LocalAIRoom={getGames:()=>session?.games||[],active:()=>session?.games?.filter(safePlaying)||[],add:game=>game,remove:()=>{},clear:stopAll,stop:stopAll,start:begin,send,installMute,ft(firstTo){const value=Number(firstTo);if(!Number.isInteger(value)||value<1||value>11)throw Error('FTは1〜11で指定してください');const room=window.LocalRoomUI?.read?.();if(room){room.match.ft=value;window.LocalRoomUI.write(room);return {firstTo:value,wins:[...room.scores],complete:room.scores.some(score=>score>=value)}}return {firstTo:value,wins:[0,0],complete:false}}};
})();
