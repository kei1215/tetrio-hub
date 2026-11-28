(() => {
 let job=null,batch=null;
 const api=window.LocalTTRTraining={get busy(){return !!job||!!batch},cancel(){if(job)job.cancelled=true;if(batch)batch.cancelled=true},
  async trainMany(files,options={}){
   if(job||batch)throw Error('別のTTRを学習中です');
   const batchTarget=options.target||'new';const entries=Array.from(files);if(!entries.length)throw Error('TTRを選択してください');
   const state=batch={cancelled:false},profiles=new Map(),results=[];let profileId=options.profileId;
   try{for(let index=0;index<entries.length;index++){
    if(state.cancelled)break;const file=entries[index];
    options.onFile?.({index,total:entries.length,name:file.name});
    try{
     if(file.size>32*1024*1024)throw Error('TTRは1ファイル32MBまでです');
     const data=JSON.parse(await file.text());if(state.cancelled)break;
     const info=LocalTTRFormat.inspect(data),saved=profiles.get('all');
     const target=batchTarget==='new'?(saved?'profile':'new'):batchTarget;
     const result=await api.train(data,{...options,_batch:state,target,profileId:saved||profileId,name:options.name||'TTR学習AI'});
     if(result.profileId){profiles.set('all',result.profileId);profileId=batchTarget==='profile'?result.profileId:profileId}
     results.push({name:file.name,ok:true,...result});options.onResult?.(results.at(-1));
    }catch(error){if(state.cancelled)break;const result={name:file.name,ok:false,error:error.message};results.push(result);options.onResult?.(result)}
   }return {results,cancelled:state.cancelled,completed:results.filter(r=>r.ok).length,total:entries.length};
   }finally{if(batch===state)batch=null}
  },
  async train(data,options={}){
   if(job||batch&&options._batch!==batch)throw Error('別のTTRを学習中です');const info=LocalTTRFormat.inspect(data);
   if(OriginalReplay.game()?.isPlaying()||(window.LocalAIRoom?.getGames?.()||[]).some(game=>game.isPlaying()))throw Error('プレイ・リプレイ再生を終了してから学習してください');
   const target=options.target||'new',profile=target==='profile'?LocalBotLearning.getProfile(options.profileId):null;
   if(target==='profile'&&!profile)throw Error('保存先のAIが見つかりません');
   // Saved AI is intentionally portable: a QP-trained profile may be refined
   // with TL, 40L or BLITZ data.  The source mode remains in the imported
   // examples, but it must not prevent selecting the same AI elsewhere.
   if(!['new','current','profile'].includes(target))throw Error('保存先が不正です');
   const original=target==='current'?LocalBotLearning.modeLearner(info.mode):null;
   const baseline=profile?JSON.stringify(profile.model):original?.export();
   const model=target==='new'?createLocalBotLearner({getItem:()=>null,setItem:()=>{}},info.mode):LocalBotLearning.cloneLearner(JSON.parse(baseline));
   const initial=model.snapshot();model.recordInputEvents(info.replay.events);const state=job={cancelled:false};
   try{
    const collector=LocalAIRanking.createCollector(model,info.replay.results?.stats?.piecesplaced,()=>state.cancelled);
    const result=await LocalNative.learnReplay(data,game=>LocalBotLearning.attachReplay(game,model,example=>collector.enqueue(example)),options.onProgress,()=>state.cancelled,()=>collector.drain());
    const evaluation=await collector.finish(options.onFitProgress);
    if(state.cancelled)throw Error('TTR学習をキャンセルしました。学習データは変更していません');
    if(model.snapshot().placements<=initial.placements)throw Error('学習できる配置がありませんでした。保存先は変更していません');
    let profileId=null,conflict=false;
    if(target==='current'&&original.export()===baseline)original.import(model.export());
    else if(target==='profile'&&JSON.stringify(LocalBotLearning.getProfile(options.profileId)?.model)===baseline){LocalBotLearning.updateProfile(options.profileId,model.snapshot());profileId=options.profileId}
    else {conflict=target!=='new';profileId=LocalBotLearning.addProfile(options.name||(profile?.name||'TTR学習AI')+(conflict?'・取り込みコピー':''),model.snapshot());if(profile)LocalBotLearning.setSoftDrop(profileId,profile.allowSoftDrop)}
    window.dispatchEvent(new Event('local-ai-model-update'));if(profileId)window.dispatchEvent(new CustomEvent('local-ai-show-profile',{detail:{id:profileId}}));
    return {...result,profileId,conflict,totalPlacements:model.snapshot().placements,totalUpdates:model.snapshot().updates,placements:model.snapshot().placements-initial.placements,rewards:model.snapshot().rewards-initial.rewards,evaluation};
   }finally{if(job===state)job=null}
  }
 };
 const section=document.createElement('details');section.id='local-ttr-learning';const title=document.createElement('summary');title.textContent='TTRファイルから学習（vAI・テスト）';section.appendChild(title);document.getElementById('local-panel').appendChild(section);
 const note=document.createElement('p');note.textContent='複数TTR・現バージョン19専用。QP NOMODとTLは共通、MODありQP・40 LINES・BLITZは別に学習します。内部再生は画面・音・通信なし。順番に読み込み、1本ずつ保存します。中止時は完了分を残し、処理中の1本は保存しません。新しいAIはモードごとに分けます。';section.appendChild(note);
 const file=document.createElement('input');file.type='file';file.accept='.ttr,.json';file.multiple=true;file.setAttribute('aria-label','学習用TTR');section.appendChild(file);
 const target=document.createElement('select');target.setAttribute('aria-label','TTR学習の保存先');section.appendChild(target);
 const name=document.createElement('input');name.placeholder='新しいAIの名前';name.maxLength=40;name.value='TTR学習AI';section.appendChild(name);
 const start=document.createElement('button'),cancel=document.createElement('button');start.textContent='選択したTTRから学習する';start.disabled=true;cancel.textContent='学習を中止';cancel.disabled=true;section.appendChild(start);section.appendChild(cancel);
 let lastProfile=null;const useAI=document.createElement('button');useAI.textContent='保存したAIをBOTに設定';useAI.disabled=true;useAI.onclick=()=>window.dispatchEvent(new CustomEvent('local-ai-use-profile',{detail:{id:lastProfile}}));section.appendChild(useAI);
 const progress=document.createElement('progress');progress.max=1;progress.value=0;progress.style.width='100%';section.appendChild(progress);const status=document.createElement('p');status.textContent='TTRファイルを選択してください（32MB・1時間まで）';status.setAttribute('aria-live','polite');section.appendChild(status);
 let selected=[],info=null,selectionVersion=0;
 function refresh(){const previous=target.value;target.replaceChildren();for(const p of [{id:'new',name:'新しいAIとして保存'},{id:'current',name:'現在の学習へ追加'},...LocalBotLearning.profiles()]){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;target.appendChild(o)}if([...target.options].some(o=>o.value===previous))target.value=previous}
 refresh();window.addEventListener('local-ai-profiles',refresh);
 file.onchange=async()=>{const version=++selectionVersion;selected=Array.from(file.files);info=null;start.disabled=true;progress.value=0;useAI.disabled=true;lastProfile=null;if(!selected.length)return;try{const first=selected[0];if(first.size<=32*1024*1024)info=LocalTTRFormat.inspect(JSON.parse(await first.text()))}catch{}if(version!==selectionVersion)return;refresh();status.textContent=`${selected.length}本選択 · 1ファイル32MB・1時間まで · どのモードのTTRも同じAIに学習します。`;start.disabled=false};
 const details=document.createElement('pre');details.style.whiteSpace='pre-wrap';section.appendChild(details);
 cancel.onclick=()=>{api.cancel();cancel.disabled=true;status.textContent='中止しています…'};
 start.onclick=async()=>{
  if(!selected.length)return;const saved=target.value;start.disabled=true;file.disabled=true;target.disabled=true;name.disabled=true;cancel.disabled=false;useAI.disabled=true;progress.value=0;details.textContent='';let index=0,total=selected.length,currentName='';const learning=document.getElementById('local-ai-learning-section');if(learning)learning.inert=true;
  try{const report=await api.trainMany(selected,{target:saved==='new'||saved==='current'?saved:'profile',profileId:saved,name:name.value,
   onFile:item=>{index=item.index;total=item.total;currentName=item.name;progress.value=index/total;status.textContent=`${index+1}/${total} · ${currentName} · 読み込み中`},
   onFitProgress:(epoch,count)=>{progress.value=(index+.8+.2*epoch/count)/total;status.textContent=`${index+1}/${total} · ${currentName} · 比較学習 ${epoch}/${count} 周`},
   onProgress:(current,count)=>{progress.value=(index+.8*current/count)/total;status.textContent=`${index+1}/${total} · ${currentName} · 再生解析 ${(current/count*100).toFixed(1)}%`},
   onResult:result=>{details.textContent+=(result.ok?`✓ ${result.name} · ${result.mode} · 追加${result.placements.toLocaleString()}配置 / 合計${result.totalPlacements.toLocaleString()}配置・評価更新${result.totalUpdates.toLocaleString()}`:`失敗 ${result.name} · ${result.error}`)+'\n';if(result.ok){lastProfile=result.profileId;useAI.disabled=!lastProfile}}
  });status.textContent=`${report.cancelled?'中止':'完了'} · 保存成功 ${report.completed}/${report.total}本 · 失敗 ${report.results.filter(r=>!r.ok).length}本。完了分は保存済みです。`;if(!report.cancelled)progress.value=1}
  catch(error){status.textContent=error.message;probeLog('TTR学習: '+error.message)}
  finally{start.disabled=false;file.disabled=false;target.disabled=false;name.disabled=false;cancel.disabled=true;if(learning)learning.inert=false}
 };
})();
