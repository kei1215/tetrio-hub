(() => {
 let learner;try{learner=createLocalBotLearner(localStorage)}catch(error){probeLog('学習データを読み込めません: '+error.message);return}
 const models=new Map([['qp',learner]]);const modeLearner=mode=>{mode=createLocalBotLearner.canonicalMode(mode);if(!models.has(mode))models.set(mode,createLocalBotLearner(localStorage,mode));return models.get(mode)};
 function features(game,piece){
  const board=game.state.board.map(row=>row.slice()),width=board[0].length,height=board.length,definition=game.source.self.fm.GetPieceDefinition(piece.type,piece.r);
  if(!definition)return null;for(const [dx,dy]of definition.data){const x=piece.x+dx-definition.dx,y=Math.ceil(piece.y)+dy-definition.dy;if(!board[y]||x<0||x>=width||board[y][x]!==null)return null;board[y][x]=piece.type}
  const filtered=board.filter(row=>!row.every(cell=>cell!==null)),lines=height-filtered.length;const g=LocalCombatAI.geometry(filtered.length?filtered:[Array(width).fill(null)]);return [lines,g.holes,g.sum,g.rough,g.peak];
 }
 function attach(game,options={}){
  const selfplay=!!options.selfplay,model=options.learner||modeLearner(game?._localLearningMode||'qp');
  if(!game||game.options.version!==19||game.options.zenlevels||(!selfplay&&!options.replay&&game._localTestMode==='bot')||game._botLearningAttached)return;game._botLearningAttached=true;
  const learnedSignature=()=>{const s=model.snapshot();return JSON.stringify([s.weights,s.combatWeights,s.policy,s.behavior,Object.fromEntries(Object.entries(s.rl?.banks||{}).map(([k,b])=>[k,b.weights]))])};const initialLearning=learnedSignature();let learningNotified=false;
  const rl=selfplay?(game._rlSharedState||model.reinforcement()):null,rlEnabled=!!rl?.enabled,rlTrace=[];let rlReturn=0,rlSummary=null,historySaved=false;const rlTotals={};const trackRL=metrics=>{for(const [k,n]of Object.entries(metrics))rlTotals[k]=(rlTotals[k]||0)+n};const rlDistance={altitude:0,safeAltitude:0};let lastAltitude=game.state.stats?.zenith?.altitude||0,lastBothAlive=false;
  const rlContext=rl?LocalRLCore.key(game._localLearningMode||'qp',game.options.zenith_mods||[]):null,rlKey=rl?LocalRLCore.sharedKey(rl,rlContext):null;
  if(rl){game._rlState=rl;game._rlKey=rlKey}
  const rlRule=rl?LocalRLCore.rewards(rl,rlContext):null;
  if(rlEnabled)game.on('frame','local-rl-distance',()=>{const altitude=game.state.stats?.zenith?.altitude||0,ally=game.source.self.zthm?.duoOtherSideGame,bothAlive=!!ally&&!ally.state.zenith?.incapacitated&&!game.state.zenith?.incapacitated;const delta=altitude-lastAltitude;rlDistance.altitude+=delta;if(bothAlive&&lastBothAlive)rlDistance.safeAltitude+=delta;lastAltitude=altitude;lastBothAlive=bothAlive});
  if(rlEnabled)game._rlAllyEvent=caused=>{const metrics={allyDown:1,allyKO:caused?1:0};trackRL(metrics);const r=LocalRLCore.reward(rlRule,metrics);rlReturn+=r;model.recordReinforcementReward(rlTrace.length?LocalRLCore.update(rl,rlKey,rlTrace,r):false,r);model.setReinforcement(rl)};
  let lastLockFrame=null;let pending=null,trace=[],lastStats=null,spawn=null,spawnPiece=-1;
  const enabled=()=>options.replay||selfplay||options.profileHuman||model.enabled();
  function settle(){if(!pending)return;const record=pending;pending=null;if(!enabled()){trace=[];return}
   const now=game.state,actual=LocalCombatAI.vector(record.before,now,record.spin,record.soft,record.held),g=LocalCombatAI.geometry(record.before.board),reference=[0,g.holes,g.sum,g.rough,g.peak,0,0,0,0,LocalCombatAI.charge(record.before),0,g.slots,g.well,Math.min(20,record.before.stats.combo||0),LocalCombatAI.pressure(record.before),0,0,0];
   if(!selfplay)model.recordBehavior(record.before,now,{spin:record.spin,soft:record.soft,held:record.held,interval:record.interval});
   if(options.onExample&&record.context)options.onExample({context:record.context,teacher:record.teacher,fire:actual[5]+actual[6]});
   const delta=actual.map((v,i)=>v-reference[i]);trace.push(delta);if(trace.length>8)trace.shift();
   const attack=Math.max(0,now.stats.garbage.attack-record.before.stats.garbage.attack),received=Math.max(0,now.stats.garbage.received-record.before.stats.garbage.received),reward=attack*.4+actual[6]*.35-received*.25-(now.zenith?.lastclearwasdupe?6:0);
   if(!options.replay&&!rlEnabled)for(let i=0;i<trace.length;i++)model.reward(trace[i],reward*Math.pow(.72,trace.length-1-i));if(rlEnabled){
    if(record.rl){rlTrace.push(record.rl.gradient);if(rlTrace.length>8)rlTrace.shift()}
    const lines=actual[0],isSpin=record.spin,duplicate=LocalRLCore.duplicate(record.before.zenith,record.teacher.type,lines,isSpin,(game.options.zenith_mods||[]).includes('allspin_reversed'));
    const metrics={...LocalRLCore.comboMetrics(record.before,now),...LocalRLCore.btbMetrics(record.before,now),...LocalRLCore.clearMetrics(lines,isSpin,record.teacher.type,record.mini),attack,defense:actual[6],line:lines,garbageLine:Math.max(0,(now.stats.garbage.cleared||0)-(record.before.stats.garbage.cleared||0)),tspin:isSpin&&lines>0&&!record.mini&&record.teacher.type==='t'?1:0,allspin:isSpin&&lines>0&&!record.mini&&record.teacher.type!=='t'?1:0,mini:isSpin&&lines>0&&record.mini?1:0,spinNoClear:isSpin&&!lines?1:0,survive:1,holes:Math.max(0,actual[1]-g.holes),duplicate:duplicate||now.zenith?.lastclearwasdupe&&(lines||isSpin)?1:0,revive:Math.max(0,(now.stats.zenith?.revives||0)-(record.before.stats.zenith?.revives||0)),altitude:(now.stats.zenith?.altitude||0)-(record.before.stats.zenith?.altitude||0),score:Math.max(0,(now.stats.score||0)-(record.before.stats.score||0))};
    metrics.altitude=rlDistance.altitude;metrics.safeAltitude=rlDistance.safeAltitude;rlDistance.altitude=0;rlDistance.safeAltitude=0;
    trackRL(metrics);const r=LocalRLCore.reward(rlRule,metrics);rlReturn+=r;model.recordReinforcementReward(rlTrace.length?LocalRLCore.update(rl,rlKey,rlTrace,r):false,r);model.setReinforcement(rl);
   }lastStats=now.stats.piecesplaced;
  }
  game.on('lock','local-learning-lock',function(piece){if(!enabled())return;
   try{settle();const chosen=features(this,piece);if(!chosen)return;
    if(options.replay||rlEnabled)model.recordPlacement();
    else if(!selfplay){const decision={state:{...this.state,falling:{...piece,y:(this.options.boardbuffer||20)-2}},source:this.source,options:this.options,_useLocalBotLearning:false};const best=LocalTestQP.plan(decision)?.features;if(best)model.observe(chosen,best)}
    let context=null;
    if(options.onExample){context=this.ejectState();if(spawn&&spawnPiece===this.state.stats.piecesplaced){for(const key of ['falling','hold','holdlocked','bag','bagex','bagid','lastGenerated','rng'])context.game[key]=structuredClone(spawn.game[key]);context.game.stats.holds=spawn.game.stats.holds}else{const fm=this.source.self.cm,r=fm.GetPieceSpawnRotation(piece.type),[dx,dy]=fm.GetPieceOffset(piece.type)[r];Object.assign(context.game.falling,{x:Math.ceil(context.game.board[0].length/2)-1+dx,y:(this.options.boardbuffer||20)-2.04+dy,r,flags:0,skip:[]})}}
    let decision=this._rlDecision;this._rlDecision=null;if(decision){const e=decision.expected;if(e.type!==piece.type||e.x!==piece.x||e.y!==Math.ceil(piece.y)||e.r!==piece.r)decision=null}
    const interval=lastLockFrame===null?null:this.getFrame()-lastLockFrame;lastLockFrame=this.getFrame();
    pending={interval,rl:decision,mini:!!this.source.self.fm.IsSpinMini?.(),before:structuredClone(this.state),context,teacher:{type:piece.type,x:piece.x,y:Math.ceil(piece.y),rotation:piece.r,hold:!!this.state.holdlocked,spin:!!(piece.flags&8)},spin:!!(piece.flags&8),soft:!!(piece.flags&4096),held:!!this.state.holdlocked};
   }catch(error){options.onError?.(error);probeLog('学習処理: '+error.message)}
  });
  game.on('piece','local-learning-outcome',function(){try{settle();if(options.onExample&&spawnPiece!==this.state.stats.piecesplaced){spawn=this.ejectState();spawnPiece=this.state.stats.piecesplaced}}catch(error){options.onError?.(error);probeLog('火力学習: '+error.message)}});
  game.on('end','local-learning-end',function(reason){try{settle();if(!options.replay&&!rlEnabled&&enabled()&&!['retry','dropnow','drop','forfeit','rl-limit'].includes(reason)){const outcome=LocalRLCore.terminal(this.state,reason,this.options),reward=outcome.win||outcome.floor10?5:-5;for(let i=0;i<trace.length;i++)model.reward(trace[i],reward*Math.pow(.72,trace.length-1-i))}if(rlEnabled&&!['retry','dropnow','drop','forfeit'].includes(reason)){
     const metrics={altitude:rlDistance.altitude,safeAltitude:rlDistance.safeAltitude,...LocalRLCore.terminal(this.state,reason,this.options),resultAltitude:this.state.stats.zenith?.altitude||0,resultScore:this.state.stats.score||0};trackRL(metrics);const r=LocalRLCore.reward(rlRule,metrics);rlReturn+=r;
     model.recordReinforcementReward(rlTrace.length?LocalRLCore.update(rl,rlKey,rlTrace,r):false,r);const bank=LocalRLCore.bank(rl,rlKey);bank.episodes++;bank.lastReturn=Math.max(-1e9,Math.min(1e9,rlReturn));model.setReinforcement(rl);rlSummary={context:rlContext,episode:bank.episodes,reward:bank.lastReturn,metrics:rlTotals,parts:Object.fromEntries(Object.entries(rlRule).map(([k,w])=>[k,w*(rlTotals[k]||0)])),reason,placements:this.state.stats.piecesplaced};
     probeLog('強化学習 '+rlKey+' · 試行 '+bank.episodes+' / 更新 '+bank.updates+' / 報酬 '+bank.lastReturn.toFixed(2));
    }model.flush();options.onEnd?.(model.snapshot());if(rlSummary&&!historySaved){historySaved=true;try{window.LocalRLHistory?.record(this._aiProfileId,rlSummary)}catch(error){probeLog('グラフ履歴保存: '+error.message)}}if(!options.replay&&!learningNotified&&enabled()&&learnedSignature()!==initialLearning){learningNotified=true;window.LocalNative?.notifyLearning(selfplay?this.options.username:'現在の'+(this._localLearningMode||'qp')+' AI')}}catch(error){options.onError?.(error);probeLog('学習保存: '+error.message)}finally{pending=null;trace=[]}});
 }
 const key='qp-local-ai-profiles-vAI';
 // Player-facing AI names are intentionally ASCII-English only. The learner IDs
 // and learned weights never change when the display name is migrated.
 function englishAIName(raw,mode='qp',index=0){
  const original=String(raw||'');
  if(original.includes('実戦')&&original.includes('B2B'))return 'Combat Learning AI B2B';
  const ascii=original.replace(/[^A-Za-z0-9 _-]+/g,' ').replace(/\s+/g,' ').trim().slice(0,32);
  if(ascii&&/[A-Za-z]/.test(ascii))return ascii;
  const type=({'qp':'QP','qp-mod':'QP MOD','40l':'40L','blitz':'BLITZ'})[mode]||'LOCAL';
  return type+' Learning AI '+String(index+1).padStart(2,'0');
 }
 function englishOnly(value){
  const name=String(value||'').trim();
  if(!name||name.length>32||!/^[A-Za-z][A-Za-z0-9 _-]*$/.test(name))throw Error('AI name must use English letters, numbers, spaces, _ or - (1-32 chars).');
  return name;
 }
 let profiles=[];try{profiles=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(profiles)||profiles.length>64)throw Error('AI一覧が不正です');profiles=profiles.map((p,i)=>{const isolated=createLocalBotLearner({getItem:()=>null,setItem:()=>{}},p.model?.mode||'qp');isolated.import(JSON.stringify(p.model));return {lookaheadDepth:[3,5,'visible'].includes(p.lookaheadDepth)?p.lookaheadDepth:3,seedAccess:p.seedAccess===true,nextCount:Number.isInteger(p.nextCount)&&p.nextCount>=0&&p.nextCount<=6?p.nextCount:null,mimicPlay:!!p.mimicPlay,allowHold:p.allowHold!==false,allowSoftDrop:p.allowSoftDrop!==false,training:!!p.training,id:String(p.id).slice(0,80),name:englishAIName(p.name,p.model?.mode,i),model:isolated.snapshot()}})}catch(error){probeLog('保存AI一覧: '+error.message);profiles=[]}
 try{const raw=localStorage.getItem(key);if(raw&&raw!==JSON.stringify(profiles)){
  const backup='qp-local-ai-profiles-vAI-before-english-names';
  try{if(localStorage.getItem(backup)===null)localStorage.setItem(backup,raw)}catch(e){console.warn('[AI name backup]',e)}
  localStorage.setItem(key,JSON.stringify(profiles));
 }}catch(e){console.warn('[AI name migration]',e)}
 const save=()=>localStorage.setItem(key,JSON.stringify(profiles));
 function add(name,model){if(profiles.length>=64)throw Error('保存AIは64体までです');const validator=createLocalBotLearner({getItem:()=>null,setItem:()=>{}},model?.mode||'qp');validator.import(JSON.stringify(model));const item={lookaheadDepth:3,seedAccess:false,nextCount:null,mimicPlay:false,allowHold:true,allowSoftDrop:true,training:false,id:crypto.randomUUID(),name:englishAIName(name,model?.mode,profiles.length),model:validator.snapshot()};profiles.push(item);save();window.dispatchEvent(new Event('local-ai-profiles'));return item.id}
 const api=window.LocalBotLearning={learner,modeLearner,features,attachReplay(game,model,onExample){let failure=null;attach(game,{replay:true,learner:model,onExample,onError:error=>failure=error});return()=>{if(failure)throw failure}},attachHuman:game=>attach(game),attachProfileHuman:(game,model,onEnd)=>attach(game,{profileHuman:true,learner:model,onEnd}),attachSelfplay:(game,model,onEnd)=>attach(game,{selfplay:true,learner:model,onEnd}),weights:game=>game?._useLocalBotLearning?modeLearner(game._localLearningMode||'qp').weights():null,combatPolicy:game=>modeLearner(game?._localLearningMode||'qp').policy(),combatWeights:game=>modeLearner(game?._localLearningMode||'qp').combatWeights(),profiles:()=>structuredClone(profiles),addProfile:add,
  saveSettings(id,settings){const index=profiles.findIndex(p=>p.id===id);if(index<0)throw Error('AIを選択してください');const value=Number(settings.imitation),next=settings.nextCount,depth=settings.lookaheadDepth??3;if(![3,5,'visible'].includes(depth))throw Error('先読みは3手・5手・表示全てです');if(!Number.isFinite(value)||value<0||value>1)throw Error('模倣の優先度は0〜1です');if(next!==null&&(!Number.isInteger(next)||next<0||next>6))throw Error('NEXTは0〜6個です');const updated=structuredClone(profiles[index]);Object.assign(updated,{name:englishOnly(settings.name),training:!!settings.training,mimicPlay:!!settings.mimicPlay,allowHold:!!settings.allowHold,allowSoftDrop:!!settings.allowSoftDrop,nextCount:next,lookaheadDepth:depth,seedAccess:settings.seedAccess===true});updated.model.chainFocus=settings.chainFocus===true;updated.model.rl.imitation=value;const all=profiles.slice();all[index]=updated;localStorage.setItem(key,JSON.stringify(all));profiles=all;window.dispatchEvent(new Event('local-ai-profiles'));return structuredClone(updated)},
  renameProfile(id,value){const p=profiles.find(p=>p.id===id);if(!p)throw Error('AIを選択してください');p.name=englishOnly(value);save();window.dispatchEvent(new Event('local-ai-profiles'))},
  setPlanning(id,depth,seed){if(![3,5,'visible'].includes(depth))throw Error('先読み設定が不正です');const p=profiles.find(p=>p.id===id);if(p){p.lookaheadDepth=depth;p.seedAccess=seed===true;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  setMimic(id,value){const p=profiles.find(p=>p.id===id);if(p){p.mimicPlay=!!value;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  setNextCount(id,value){if(value!==null&&(!Number.isInteger(value)||value<0||value>6))throw Error('NEXTは表示範囲内の0〜6個です');const p=profiles.find(p=>p.id===id);if(p){p.nextCount=value;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  setHold(id,value){const p=profiles.find(p=>p.id===id);if(p){p.allowHold=!!value;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  setSoftDrop(id,value){const p=profiles.find(p=>p.id===id);if(p){p.allowSoftDrop=!!value;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  setTraining(id,value){const p=profiles.find(p=>p.id===id);if(p){p.training=!!value;save();window.dispatchEvent(new Event('local-ai-profiles'))}},
  getProfile:id=>structuredClone(profiles.find(p=>p.id===id)||null),
  updateProfile(id,model){const found=profiles.find(p=>p.id===id);if(!found)throw Error('AIが見つかりません');const valid=createLocalBotLearner({getItem:()=>null,setItem:()=>{}},model?.mode||'qp');valid.import(JSON.stringify(model));found.model=valid.snapshot();save();window.dispatchEvent(new Event('local-ai-profiles'))},
  removeProfile(id){profiles=profiles.filter(p=>p.id!==id);save();window.dispatchEvent(new Event('local-ai-profiles'))},
  exportProfile(id){const found=api.getProfile(id);if(!found)throw Error('AIを選択してください');return JSON.stringify({format:'tetrio-ai-profile-vAI',schema:1,name:found.name,lookaheadDepth:found.lookaheadDepth??3,seedAccess:found.seedAccess===true,nextCount:found.nextCount,mimicPlay:found.mimicPlay,allowHold:found.allowHold,allowSoftDrop:found.allowSoftDrop,model:found.model},null,2)},
  importProfile(text){if(typeof text!=='string'||text.length>65536)throw Error('AIファイルは64KBまでです');const data=JSON.parse(text);if(data.format==='tetrio-ai-profile-vAI'&&data.schema===1){const id=add(data.name,data.model);api.setSoftDrop(id,data.allowSoftDrop!==false);api.setHold(id,data.allowHold!==false);api.setMimic(id,!!data.mimicPlay);api.setNextCount(id,Number.isInteger(data.nextCount)?data.nextCount:null);api.setPlanning(id,[3,5,'visible'].includes(data.lookaheadDepth)?data.lookaheadDepth:3,data.seedAccess===true);return id;}return add('Imported AI',data)},
  cloneLearner(model){const isolated=createLocalBotLearner({getItem:()=>null,setItem:()=>{}},model?.mode||'qp');isolated.import(JSON.stringify(model));return isolated}
 };
 window.addEventListener('pagehide',()=>{for(const model of models.values())model.flush()});
 const panel=document.getElementById('local-panel'),section=document.createElement('details'),heading=document.createElement('summary');section.id='local-ai-learning-section';heading.textContent='学習BOT vAI（テスト段階・完全ローカル）';section.appendChild(heading);panel.appendChild(section);
 const note=document.createElement('p');note.textContent='現クライアント専用。元ゲームでHOLD・NEXT・スピン・B2B・蓄積／放出を評価します。2手の探索と8配置までの報酬反映。複雑な定形や強さの向上を保証するものではありません。';section.appendChild(note);
 const modeSelect=document.createElement('select');for(const [value,label]of [['qp','QP NOMOD / TL（共通）'],['qp-mod','QP MODあり'],['40l','40 LINES'],['blitz','BLITZ']]){const o=document.createElement('option');o.value=value;o.textContent=label;modeSelect.appendChild(o)}section.appendChild(modeSelect);modeSelect.onchange=()=>{learner=modeLearner(modeSelect.value);toggle.checked=learner.enabled();refresh()};
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=learner.enabled();const label=document.createElement('label');label.appendChild(toggle);label.appendChild(document.createTextNode('自分のローカルプレイから学習（ZEN・BOT自動プレイを除く）'));toggle.onchange=()=>learner.setEnabled(toggle.checked);section.appendChild(label);
 const status=document.createElement('p');section.appendChild(status);const refresh=()=>{const s=learner.snapshot();status.textContent=`現在の${modeSelect.value}学習：配置例 ${s.placements} / 実更新 ${s.updates} / 候補比較 ${s.comparisons} / 有効報酬 ${s.rewards}`+(s.lastTraining?` · 検証盤面の教示1位率 ${(s.lastTraining.validationBefore*100).toFixed(1)}% → ${(s.lastTraining.validationAfter*100).toFixed(1)}%（${s.lastTraining.validationSamples}件）`:'')};refresh();section.addEventListener('toggle',refresh);window.addEventListener('local-ai-model-update',refresh);
 function button(text,action){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{try{await action();refresh()}catch(error){probeLog('学習: '+error.message);status.textContent=error.message}};section.appendChild(b);return b}
 function download(text,filename){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 button('現在の学習を書き出す',()=>download(learner.export(),'tetrio-learning-'+modeSelect.value+'-vAI.json'));
 const input=document.createElement('input');input.type='file';input.accept='.json';input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>65536)throw Error('64KBまでのファイルを選択してください');learner.import(await file.text());refresh()}catch(error){status.textContent=error.message}finally{input.value=''}};section.appendChild(input);button('現在の学習に読み込む（置き換え）',()=>input.click());
 button('現在の学習をリセット',()=>{if(window.confirm('現在の学習を初期化します。必要なら先に書き出してください。'))learner.reset()});
 const name=document.createElement('input');name.placeholder='AIの名前';name.maxLength=40;section.appendChild(name);
 button('現在の学習を別のAIとして保存',()=>add(name.value,learner.snapshot()));
 const list=document.createElement('select');list.setAttribute('aria-label','保存AI');section.appendChild(list);
 const savedStatus=document.createElement('p');savedStatus.id='local-ai-selected-stats';section.appendChild(savedStatus);function refreshSelected(){const p=api.getProfile(list.value);if(!p){savedStatus.textContent='保存AIを選択してください';return}const s=p.model;savedStatus.textContent=`選択AI「${p.name}」：配置例 ${s.placements} / 評価更新 ${s.updates} / 候補比較 ${s.comparisons} / ニューラルネット ${s.policy?'あり':'なし'}`+(s.lastTraining?` / 検証の教示1位率 ${(s.lastTraining.validationBefore*100).toFixed(1)}% → ${(s.lastTraining.validationAfter*100).toFixed(1)}%`:'')}list.addEventListener('change',refreshSelected);window.addEventListener('local-ai-profiles',refreshSelected);window.addEventListener('local-ai-show-profile',event=>{const p=api.getProfile(event.detail.id);if(!p)return;list.value=p.id;modeSelect.value=p.model.mode;learner=modeLearner(p.model.mode);toggle.checked=learner.enabled();refresh();refreshSelected();list.dispatchEvent(new Event('change'));section.open=true});
 function refreshList(){const selected=list.value;list.replaceChildren();for(const profile of profiles){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.name;list.appendChild(option)}if(profiles.some(p=>p.id===selected))list.value=selected}
 refreshList();refreshSelected();window.addEventListener('local-ai-profiles',()=>{refreshList();refreshSelected()});
 try{const legacy=localStorage.getItem('qp-local-bot-learning-v1:tl');if(legacy&&!localStorage.getItem('qp-local-tl-shared-migrated-v1')){const old=createLocalBotLearner({getItem:()=>null,setItem:()=>{}},'qp');old.import(legacy);add('以前のTL学習（共通AI）',old.snapshot());localStorage.setItem('qp-local-tl-shared-migrated-v1','true')}}catch(error){probeLog('旧TL学習の保管: '+error.message)}
 button('選んだAIを書き出す（友達と共有）',()=>download(api.exportProfile(list.value),'tetrio-ai-vAI.json'));
 button('選んだAIを現在の学習へコピー',()=>{const p=api.getProfile(list.value);if(!p)throw Error('AIを選択してください');modeSelect.value=p.model.mode;learner=modeLearner(p.model.mode);toggle.checked=learner.enabled();learner.import(JSON.stringify(p.model))});
 button('選んだAIを削除',()=>{if(list.value&&confirm('この保存AIを削除しますか？'))api.removeProfile(list.value)});
 const aiTrain=document.createElement('input');aiTrain.type='checkbox';const trainLabel=document.createElement('label');trainLabel.appendChild(aiTrain);trainLabel.appendChild(document.createTextNode('このAIをプレイ中に学習させる（テスト）'));section.appendChild(trainLabel);list.addEventListener('change',()=>aiTrain.checked=!!api.getProfile(list.value)?.training);window.addEventListener('local-ai-profiles',()=>aiTrain.checked=!!api.getProfile(list.value)?.training);aiTrain.onchange=()=>api.setTraining(list.value,aiTrain.checked);
 const soft=document.createElement('input');soft.type='checkbox';soft.checked=true;const softLabel=document.createElement('label');softLabel.appendChild(soft);softLabel.appendChild(document.createTextNode('この保存AIにソフトドロップを許可'));section.appendChild(softLabel);const syncSoft=()=>soft.checked=api.getProfile(list.value)?.allowSoftDrop!==false;list.addEventListener('change',syncSoft);window.addEventListener('local-ai-profiles',syncSoft);soft.onchange=()=>api.setSoftDrop(list.value,soft.checked);
 const file=document.createElement('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>65536)throw Error('AIファイルは64KBまでです');api.importProfile(await f.text());refreshList()}catch(error){status.textContent=error.message}finally{file.value=''}};section.appendChild(file);button('友達のAIを読み込む（別AIとして追加）',()=>file.click());

 // The original pretrained profile is a normal portable profile JSON.
 // Never replace or upgrade a user's existing storage key.
 // v4.8249: the bundled trained AI is added once for every player, also when
 // they already made their own AIs (before, only an empty list got it).
 const starterKey='qp-local-ai-starter-installed-v1';
 if(localStorage.getItem(starterKey)===null){
  fetch('https://kei1215.github.io/tetrio-hub/bookmarklets/offline-va4.8283/engine/ai-starter-profile.json').then(r=>{if(!r.ok)throw Error('初期モデルを読み込めません');return r.text()})
   .then(json=>{if(localStorage.getItem(starterKey)!==null)return;const name=JSON.parse(json).name;if(!api.profiles().some(p=>p.name===name))api.importProfile(json);localStorage.setItem(starterKey,'1');window.dispatchEvent(new Event('local-ai-profiles'))})
   .catch(error=>probeLog('初期AIモデル: '+error.message));
 }
})();
