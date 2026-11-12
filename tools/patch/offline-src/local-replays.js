(() => {
 function mode(game){return game.options.zenith?(game.options.zenith_expert?'zenithex':'zenith'):game.options.zenlevels?'zen':game.options.levels?'blitz':game.options.objective_type==='lines'?'40l':'custom'}
 function portable(file){
  if(!file||!file.replay)throw Error('TTRの再生データがありません。');
  const copy=structuredClone(file),multi=Array.isArray(copy.replay.rounds);
  const plays=multi?copy.replay.rounds.flatMap(round=>round.map(player=>player.replay)):[copy.replay];
  if(!plays.length||plays.some(play=>!play.options||!Array.isArray(play.events)||!Number.isFinite(play.frames)))throw Error('TTRの構造が不正です。');
  // Keep options, events and seeds intact; never relabel local rules as official.
  const result={version:1,gamemode:copy.gamemode,ts:copy.ts||new Date().toISOString(),users:(copy.users||[]).map((user,i)=>({id:user.id||String(i).padStart(24,'0'),username:user.username||'LOCAL',avatar_revision:user.avatar_revision||0,banner_revision:user.banner_revision||0,flags:user.flags||0,country:user.country??null})),replay:copy.replay};
  if(copy.local)result.local=copy.local;
  if(!multi&&['zenith','zenithex'].includes(copy.gamemode))result.replay.options.zenith_mods??=[];
  return result;
 }
 const duo=(file,partner,name)=>{
  // Same shape as an official multiplayer TTRM (leaderboard + rounds of players).
  const plays=[structuredClone(file.replay),structuredClone(partner)];
  const users=[{...file.users[0]},{id:'0'.repeat(23)+'1',username:String(name).slice(0,32),avatar_revision:0,banner_revision:0,flags:0,country:null}];
  const stat=play=>{const agg=play.results?.aggregatestats||{},st=play.results?.stats||{};return {apm:agg.apm||0,pps:agg.pps||0,vsscore:agg.vsscore||0,garbagesent:st.garbage?.sent||0,garbagereceived:st.garbage?.received||0,kills:st.kills||0,altitude:st.zenith?.altitude||0,rank:st.zenith?.rank||1,targetingfactor:st.zenith?.targetingfactor||3,targetinggrace:st.zenith?.targetinggrace||0,btb:st.btb||0,revives:st.zenith?.revives||0}};
  const base=(user,i)=>({id:user.id,username:user.username,active:true,naturalorder:i,shadows:[],shadowedBy:[null,null]});
  const leaderboard=users.map((user,i)=>({...base(user,i),wins:0,stats:stat(plays[i])}));
  const round=users.map((user,i)=>({...base(user,i),alive:false,lifetime:Math.round(plays[i].frames/60*1000),stats:stat(plays[i]),replay:plays[i]}));
  return {version:1,gamemode:file.gamemode,ts:file.ts,users,replay:{leaderboard,rounds:[round]},local:{...file.local,duoSide:null,duoMerged:true,source:'auto-duo',frames:Math.max(plays[0].frames,plays[1].frames),requiresPatch:true}};
 };
 const api=window.LocalReplayLibrary={portable,duo,
  save(game,reason){
   const replay=game.replay.Export();if(!(replay.frames>0))return;
   const gamemode=mode(game),mods=game.options.zenith_mods||[];
   const local={testMode:game._localTestMode||'solo',duoSide:game._localReplaySide||(game.options.zenith_duo?'player':null),speedChanges:game._localSpeedChanges||[],incomingAttacks:game._localAttackConfig||null,missions:game._localMissionConfig||null,requiresPatch:mods.filter(x=>x.endsWith('_reversed')).length>1||!!game._localCustomMissionUsed};
   const file=portable({version:1,gamemode,ts:new Date().toISOString(),local,users:[{username:game.options.username||localStorage.getItem('qp-local-username')||'LOCAL'}],replay});
   // QP DUO: save both sides as one TTRM, once per run (falls back to the player-only TTR).
   let saved=file;
   if(game.options.zenith_duo&&game._localDuoPartner){
    if(game._localDuoSaved)return;game._localDuoSaved=true;
    try{
     const partner=game._localDuoPartnerReplay||game._localDuoPartner.replay.Export();
     if(partner&&partner.frames>0)saved=api.duo(file,partner,game._localDuoPartner.options?.username||'LOCAL PARTNER');
    }catch(error){console.warn('[QP DUO] partner replay not saved',error)}
   }
   QPLocalZen.record(gamemode,{...game.export(),localEndReason:reason},saved);
  },
  show(host,play,filter='any'){
   host.replaceChildren();
   const actions=document.createElement('div');actions.className='scroller_block';
   const picker=document.createElement('input');picker.type='file';picker.accept='.ttr,.ttrm,.json';picker.hidden=true;
   const load=document.createElement('button');load.className='control_button';load.textContent='TTRを開く';load.onclick=()=>picker.click();
   picker.onchange=async()=>{try{const file=picker.files?.[0];if(file)await play(JSON.parse(await file.text()))}catch(error){LocalUIHealth.fail('TTR読み込み',error)}finally{picker.value=''}};
   const clearAll=document.createElement('button');clearAll.className='control_button';clearAll.textContent='🗑 TTRを一括削除';clearAll.title='この端末のローカルTTR・記録をすべて削除';clearAll.onclick=()=>{const records=QPLocalZen.records();if(!records.length)return;if(!confirm('ローカルTTR・記録を'+records.length+'件すべて削除しますか？ この操作は戻せません。'))return;for(const record of records)QPLocalZen.deleteRecord(record.id);api.show(host,play,filter)};
   const mergeLeft=document.createElement('input'),mergeRight=document.createElement('input');for(const input of [mergeLeft,mergeRight]){input.type='file';input.accept='.ttr,.json';input.hidden=true;actions.appendChild(input)}
   const merge=document.createElement('button');merge.className='control_button';merge.textContent='DUOの2TTRを合成';merge.title='同じQP DUOプレイで保存した左右の単独TTRを選択し、TTRMを書き出します';merge.onclick=async()=>{try{mergeLeft.click();const left=await new Promise(resolve=>mergeLeft.onchange=()=>resolve(mergeLeft.files?.[0]||null));if(!left)return;mergeRight.click();const right=await new Promise(resolve=>mergeRight.onchange=()=>resolve(mergeRight.files?.[0]||null));if(!right)return;const data=LocalDuoReplay.merge(JSON.parse(await left.text()),JSON.parse(await right.text()));LocalDuoReplay.download(data)}catch(error){LocalUIHealth.fail('DUO TTR合成',error)}finally{mergeLeft.value='';mergeRight.value=''}};
   const sort=document.createElement('select');sort.setAttribute('aria-label','リプレイの並び順');for(const [value,label] of [['newest','新しい順'],['oldest','古い順'],['mode','モード順']])sort.add(new Option(label,value));sort.value=localStorage.getItem('qp-local-replay-sort-v1')||'newest';sort.onchange=()=>{localStorage.setItem('qp-local-replay-sort-v1',sort.value);api.show(host,play,filter)};
   actions.append(load,merge,sort,clearAll,picker);host.appendChild(actions);
   const time=record=>Number(new Date(record.date)),sorter=sort.value,records=QPLocalZen.records().filter(record=>filter==='any'||record.mode===filter).sort((a,b)=>sorter==='oldest'?time(a)-time(b):sorter==='mode'?String(a.mode).localeCompare(String(b.mode))||time(b)-time(a):time(b)-time(a));
   if(!records.length){const empty=document.createElement('div');empty.className='scroller_block';empty.textContent='ローカル記録はまだありません。';host.appendChild(empty)}
   for(const record of records){
    const row=document.createElement('div');row.className='scroller_block';row.dataset.recordId=record.id;
    const heading=document.createElement('h2');heading.textContent=record.mode.toUpperCase()+(record.replay?.local?.duoMerged?' · DUO':record.replay?.local?.duoSide==='partner'?' · PARTNER':'');
    const date=document.createElement('p');date.textContent=new Date(record.date).toLocaleString();row.append(heading,date);
    if(record.replay?.local?.requiresPatch){const note=document.createElement('p');note.textContent='ローカル拡張ルール使用：完全再現には対応パッチが必要です。';row.appendChild(note)}
    const controls=document.createElement('div');controls.className='control_group flex-row';row.appendChild(controls);
    function button(text,action){const node=document.createElement('button');node.className='control_button';node.textContent=text;node.onclick=async()=>{try{await action()}catch(error){LocalUIHealth.fail('ローカル記録',error)}};controls.appendChild(node);return node}
    if(record.replay){
     button('REPLAY',()=>play(QPLocalZen.replay(record)));
     const multi=!!record.replay?.local?.duoMerged;button(multi?'↓ TTRM':'↓ TTR',()=>{const data=portable(QPLocalZen.replay(record)),ext=Array.isArray(data.replay?.rounds)?'ttrm':'ttr',url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=window.__qpReplayDownloadName?window.__qpReplayDownloadName(data,ext):'local-'+record.mode+'-'+record.id+'.'+ext;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)});
    }
    const remove=button('🗑',()=>{if(!confirm('このローカル記録とTTRを削除しますか？'))return;QPLocalZen.deleteRecord(record.id);api.show(host,play,filter)});remove.setAttribute('aria-label','記録とTTRを削除');remove.title='記録とTTRを削除';
    host.appendChild(row);
   }
  }
 };
})();
