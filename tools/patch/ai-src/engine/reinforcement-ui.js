(() => {
 const core=LocalRLCore,api=LocalBotLearning,section=document.createElement('details'),title=document.createElement('summary');title.textContent='強化学習・MOD別報酬（vAI・テスト）';section.id='local-rl-settings';section.appendChild(title);document.getElementById('local-panel').appendChild(section);
 const note=document.createElement('p');note.textContent='保存AIで強化学習をONにすると、合法候補を確率的に試し、直近8配置の選択を報酬から更新します。MOD・複合MOD別に学習値を保存します。QP NOMODとTLは同じ学習枠、QP MOD・40L・BLITZは別枠です。回転・スピン成立・HOLD・ソフトドロップも個別に採点できます。';section.appendChild(note);
 function field(label,type='number',value=''){const row=document.createElement('label');row.style.display='block';row.appendChild(document.createTextNode(label+' '));const input=document.createElement('input');input.type=type;input.value=value;input.setAttribute('aria-label',label);row.appendChild(input);section.appendChild(row);return input}
 const select=document.createElement('select');select.setAttribute('aria-label','強化学習AI');section.appendChild(select);
 const enabled=field('このAIで強化学習する','checkbox'),rate=field('学習率（0.001〜0.2）','number','.03'),temperature=field('探索温度（0.2〜10）','number','3');rate.step='.001';temperature.step='.1';
 const imitation=field('プレーヤー模倣の優先度（0〜1）','number','.75');imitation.min='0';imitation.max='1';imitation.step='.05';
 const share=field('同じ報酬ならMOD間で学習値を共有（裏All-Spin・裏Double Holeは別系統）','checkbox');
 const mods=field('報酬設定のMOD（空欄=モード共通、複合は + 区切り）','text','');mods.placeholder='allspin_reversed+nohold';
 const picker=document.createElement('select');picker.setAttribute('aria-label','報酬MODプリセット');for(const value of ['',...core.mods.flatMap(m=>[m,m+'_reversed'])]){const o=document.createElement('option');o.value=value;o.textContent=value||'モード共通';picker.appendChild(o)}section.appendChild(picker);picker.onchange=()=>{mods.value=picker.value;loadRule()};
 const rewardDetails=document.createElement('details'),rewardTitle=document.createElement('summary');rewardDetails.open=true;rewardTitle.textContent='報酬の値（プラス=推奨・マイナス=罰）';rewardDetails.appendChild(rewardTitle);section.appendChild(rewardDetails);
 const labels={comboChain:'REN消去時のREN数 × この値',btbChain:'B2Bが伸びた消去時のB2B数 × この値',floor10:'QP 10F到達（終了時・死亡しても加点）',attack:'出した火力（攻撃ライン）× この値',defense:'相殺1ライン',line:'消去1ライン',garbageLine:'ゴミ消去1ライン',tspin:'Tスピン消去1回',allspin:'T以外のフルスピン消去1回',mini:'ミニスピン消去1回',spinNoClear:'消去なしスピン1回',rotation:'出現時から向きが変わった固定1回',spinAction:'スピン成立音相当の成立1回（消去なしも含む）',hold:'HOLDを使った固定1回',softDrop:'ソフトドロップを使った固定1回',survive:'1配置生存',holes:'新しく作った穴1個',duplicate:'All-Spin重複違反1回',goodPlay:'良いプレイ判定1回（火力・相殺・スピン・穴を作らない）',badPlay:'悪いプレイ判定1回（新しい穴・重複違反）',revive:'蘇生1回',allyDown:'仲間のダウン1回',allyKO:'自分の攻撃による仲間ダウン（追加減点）',safeAltitude:'仲間が生存中に伸ばした高度1m',altitude:'高度1mの増減',score:'得点1点',win:'クリア・勝利',loss:'死亡・敗北',resultAltitude:'終了時の到達高度1m',resultScore:'終了時の得点1点'};
 for(const [kind,label]of [['normal','通常消去'],['tspin','T-Spin（Mini以外）'],['allspin','All-Spin：T以外のスピン（Mini以外）'],['mini','Miniスピン']])for(let n=1;n<=5;n++)labels[kind+'Clear'+n]=label+' '+n+'ライン消去1回（追加報酬）';
 const clearNote=document.createElement('p');clearNote.textContent='良い／悪いプレイ判定は下の個別欄で設定します。良い=火力・相殺・スピンを出し、穴や重複違反を作らない配置。悪い=新しい穴またはAll-Spin重複違反です。ライン数別は追加点で、共通の「消去1ライン」「Tスピン消去1回」などと合算します。';rewardDetails.appendChild(clearNote);
 const inputs={};for(const [k,label]of Object.entries(labels)){const input=field(label,'number');input.min='-100';input.max='100';input.step='any';inputs[k]=input;rewardDetails.appendChild(input.parentElement)}
 const status=document.createElement('p');status.setAttribute('aria-live','polite');section.appendChild(status);let running=false,token=0;
 function report(error){status.textContent=error.message||String(error)}
 function current(){const p=api.getProfile(select.value);if(!p)throw Error('保存AIを選択してください');return p}
 function context(p){const names=mods.value.split('+').map(v=>v.trim()).filter(Boolean);return core.key(p.model.mode,names)}
 function loadRule(){try{const p=current(),r=core.rewards(p.model.rl,context(p));for(const [k,input]of Object.entries(inputs))input.value=r[k];const bank=p.model.rl.banks[core.sharedKey(p.model.rl,context(p))];status.textContent=bank?`このMOD: 試行${bank.episodes} / 報酬更新${bank.updates} / 前回報酬${bank.lastReturn.toFixed(2)}`:'このMODの強化学習は未実施です'}catch(error){report(error)}}
 function load(){try{const p=current();enabled.checked=p.model.rl.enabled;share.checked=p.model.rl.shareEquivalent;imitation.value=p.model.rl.imitation;rate.value=p.model.rl.rate;temperature.value=p.model.rl.temperature;loadRule()}catch(error){report(error)}}
 function refresh(){const previous=select.value;select.replaceChildren();for(const p of api.profiles()){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;select.appendChild(o)}if([...select.options].some(o=>o.value===previous))select.value=previous;if(!running)load()}
 select.onchange=load;mods.onchange=loadRule;window.addEventListener('local-ai-profiles',refresh);refresh();
 function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await fn()}catch(error){report(error)}};section.appendChild(b);return b}
 const activeLocalGames=()=>window.LocalAIRoom?.getGames?.()||[];
 button('報酬・強化学習設定を保存',()=>{if(OriginalReplay.game()?.isPlaying()||activeLocalGames().some(g=>g.isPlaying()))throw Error('設定はプレイ終了後に保存してください');const p=current(),rl=p.model.rl,k=context(p);rl.enabled=enabled.checked;rl.shareEquivalent=share.checked;rl.imitation=Number(imitation.value);rl.rate=Number(rate.value);rl.temperature=Number(temperature.value);rl.rules[k]=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,Number(input.value)]));p.model.rl=core.validate(rl);api.updateProfile(p.id,p.model);if(rl.enabled)api.setTraining(p.id,true);status.textContent='保存しました。強化学習ONの場合、AIごとのプレイ中学習もONになります。'});
 function saveRulesFile(all){const p=current(),text=core.exportRules(p.model.rl,p.model.mode,all?null:context(p)),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tetrio-reward-rules-'+p.model.mode+(all?'-all':'-mod')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='保存済みの報酬ルールを書き出しました。フォームの変更がある場合は先に設定を保存してください。'}
 button('このMODの報酬ルールを書き出す',()=>saveRulesFile(false));button('このAIの全報酬ルールを書き出す',()=>saveRulesFile(true));
 const rulesFile=document.createElement('input');rulesFile.type='file';rulesFile.accept='.json';rulesFile.hidden=true;section.appendChild(rulesFile);rulesFile.onchange=async()=>{try{if(OriginalReplay.game()?.isPlaying()||activeLocalGames().some(g=>g.isPlaying()))throw Error('プレイ終了後に読み込んでください');const f=rulesFile.files?.[0];if(!f)return;if(f.size>131072)throw Error('報酬ルールは128KBまでです');const p=current();p.model.rl=core.importRules(p.model.rl,p.model.mode,await f.text());api.updateProfile(p.id,p.model);load();status.textContent='報酬ルールを保存しました。同じMODのルールだけを上書きし、学習済みの重みは保持しています。'}catch(error){report(error)}finally{rulesFile.value=''}};button('報酬ルールを読み込む',()=>rulesFile.click());
 const attempts=field('自動試行回数（1〜1000）','number','10'),limit=field('1試行の上限ゲーム内秒（0＝制限なし／10〜3600）','number','0');
 button('自動試行を開始',async()=>{
  if(running||LocalTTRTraining.busy||OriginalReplay.game()?.isPlaying()||activeLocalGames().some(g=>g.isPlaying()))throw Error('プレイ・学習を終了してから開始してください');
  const p=current(),count=Number(attempts.value),speed=Number(localStorage.getItem('qp-local-bot-pps')||1),seconds=Number(limit.value),selected=mods.value.split('+').map(v=>v.trim()).filter(Boolean);context(p);
  if(!p.model.rl.enabled||!p.training)throw Error('強化学習ONの設定を保存してください');if(!Number.isInteger(count)||count<1||count>1000||!Number.isFinite(speed)||speed<.1||speed>20||!Number.isFinite(seconds)||seconds!==0&&(seconds<10||seconds>3600))throw Error('回数・PPS・上限秒を確認してください');if(selected.some(m=>m.startsWith('duo')))throw Error('DUOの自動試行は未対応です');
  running=true;const ticket=++token;let completed=0;try{for(let i=0;i<count&&ticket===token;i++){
   status.textContent=`自動試行 ${i+1}/${count} · ${p.name} · BOT操作を開始`;const launcher=window.LocalStartRL;if(typeof launcher!=='function')throw Error('AI開始器を読み込めません');// v4.8250: AIs are not split by mode: QP unless the AI was made for 40L / BLITZ;
    // an empty MOD field starts with the cards already chosen on the QP screen.
    const launchMode=['40l','blitz'].includes(p.model.mode)?p.model.mode:'qp',launchMods=selected.length?selected:[...document.querySelectorAll('#zenithmenu .zenith_card[data-card].active')].map(c=>c.dataset.card+(c.classList.contains('qp-local-reverse')?'_reversed':''));
    const game=await launcher(launchMode,p.id,speed,launchMods);if(!game)throw Error('試行を開始できませんでした');
   // Do not compare with OriginalReplay.game(): local QP and normal SOLO use
   // different holders, which made the old watcher cancel every first trial.
   const reason=await new Promise((resolve,reject)=>{let done=false,started=false;let watchdog=0,launchDeadline=0;
    const finish=value=>{if(done)return;done=true;clearInterval(watchdog);clearTimeout(launchDeadline);game.remove?.('frame','rl-trial-limit');game.remove?.('end','rl-trial-finish');resolve(value||'end')};
    const fail=error=>{if(done)return;done=true;clearInterval(watchdog);clearTimeout(launchDeadline);game.remove?.('frame','rl-trial-limit');game.remove?.('end','rl-trial-finish');reject(error)};
    game.on('end','rl-trial-finish',finish);
    game.on('frame','rl-trial-limit',()=>{if(seconds>0&&game.getFrame()>=seconds*60){status.textContent=`自動試行 ${i+1}/${count} · 時間上限で次へ`;probeLog('自動試行: '+seconds+'ゲーム内秒の時間上限に到達。');try{game.end('rl-limit')}catch(error){fail(error)}}});
    // LocalNative returns during 3-2-1/prestart, when isPlaying() is false.
    // Treat false as an end only after the game has genuinely begun.
    watchdog=setInterval(()=>{if(game.isPlaying())started=true;else if(started)finish('end')},250);
    launchDeadline=setTimeout(()=>{if(!started)fail(Error('試行の開始待機がタイムアウトしました。BOT・描画初期化を確認してください'))},20000);
   });
   completed++;window.LocalLearningToast?.show(`${p.name} · 試行 ${completed}/${count} を保存（${reason}）`);
   if(ticket!==token)break;await new Promise(resolve=>setTimeout(resolve,350));
  }status.textContent=ticket===token?`自動試行が完了しました。${completed}/${count}件を保存しました。`:`自動試行を停止しました。${completed}件を保存しました。`;}finally{running=false;loadRule()}
 });
 button('自動試行を停止（次の試行を開始しない）',()=>{token++;status.textContent='現在の試行終了後に停止します。すぐ終了する場合は通常の終了操作を使ってください'});
})();
