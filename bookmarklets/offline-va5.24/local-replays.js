(() => {
 // Room replays saved with the same name every time: name them by players, score and the time of saving instead
 {const prev=window.__qpReplayDownloadName;if(prev&&!prev.__qpNamed){
  const safe=(v,max)=>String(v??'').replace(/[\\/:*?"<>|\s]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,max);
  const p2=n=>String(n).padStart(2,'0');
  const named=(data,extension)=>{try{
   const ext=extension==='ttrm'?'ttrm':'ttr',v=data&&typeof data==='object'?data:{};
   const scope=window.__qpLocalOffline||location.protocol==='tetrio-local:'?'offline':'online';
   const mode=safe(v.gamemode||v.mode||'match',22)||'match';
   const lb=Array.isArray(v.replay?.leaderboard)?v.replay.leaderboard:[];
   const names=(lb.length?lb:(v.users||[])).map(u=>safe(u.username||u.id||'',16)).filter(Boolean).slice(0,4);
   const score=lb.length>=2&&lb.every(u=>Number.isFinite(u.wins))?lb.map(u=>u.wins).join('-'):'';
   const d=new Date(),now=d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'-'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds());
   return ['tetrio',scope,mode,names.join('-vs-'),score,now].filter(Boolean).join('_')+'.'+ext;
  }catch(e){return prev(data,extension)}};
  named.__qpNamed=true;window.__qpReplayDownloadName=named;
 }}
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
 // BOT replay pacing (user 2026-11-29): the bot thinks, then sends its whole route in a few frames ("inhuman finesse").
 // Only in the saved replay, move the free part of each route (hold / rotate / move before any soft drop) back into the
 // think time and space it at a human pace, so the replay shows the piece being moved while the bot thinks.
 // Lock frames, soft-drop/spin finishes and the hard drop keep their exact frames, so the game result does not change.
 function humanizeReplay(rep,opt){
  opt=opt||{};
  if(!rep||!Array.isArray(rep.events)||rep.__humanized)return rep;
  const o=rep.options||{},delay=Math.max(0,Number(o.are)||0)+Math.max(0,Number(o.lineclear_are)||0);
  const gap=Math.max(2,Math.min(12,Math.round(Number(opt.gap)||5)));
  const ev=rep.events,T=e=>e.frame+(Number(e.data?.subframe)||0);
  const keys=ev.filter(e=>e.type==='keydown'||e.type==='keyup');
  const track=Array.isArray(opt.track)?opt.track:null,maxH=Number(opt.maxH)||13,maxG=Number(opt.maxG)||0.1;
  let prevDrop=-Infinity,seg=[],moved=new Map(),piece=0;
  const flush=drop=>{
   // pair keydown/keyup in order; a press still held at the drop stops the free part
   const acts=[];const open=new Map();
   for(const e of seg){
    if(e===drop)break;
    if(e.data.key==='softDrop'&&e.type==='keydown')break;
    if(e.type==='keydown'){if(open.has(e.data.key))return;const a={down:e,up:null};open.set(e.data.key,a);acts.push(a)}
    else{const a=open.get(e.data.key);if(!a)return;a.up=e;open.delete(e.data.key)}
   }
   if(open.size)return;
   if(!acts.length)return;
   // the bot waited inside its route (gravity / lock timing): leave it
   // presses must not overlap (a rotate during a DAS hold is one motion)
   for(let i=1;i<acts.length;i++)if(T(acts[i].down)<T(acts[i-1].up))return;
   for(let i=1;i<acts.length;i++)if(acts[i].down.frame-Math.ceil(T(acts[i-1].up))>1)return;
   const lastUp=Math.max(...acts.map(a=>T(a.up)));
   const after=seg.find(e=>!acts.some(a=>a.down===e||a.up===e)&&T(e)>=lastUp);
   const end=after?after.frame:drop.frame;            // next fixed input frame (soft drop or hard drop)
   if(!Number.isFinite(prevDrop))return; // first piece: its spawn frame is not in the replay
   // a high stack or fast gravity makes the row the piece is at matter: keep the bot's own frames there
   const info=track&&track[piece];if(!info||!(info.h<=maxH)||Number(info.g)>maxG)return;
   const earliest=prevDrop+2+delay; // a frame of margin after the last drop's release
   if(!(earliest<end))return;
   // lay the presses back from the fixed input: each takes its own hold time, then a human gap
   const plan=[];let t=end;
   for(let i=acts.length-1;i>=0;i--){
    const a=acts[i],held=Math.max(T(a.up)-T(a.down),0.5);
    const upF=t-gap,startF=Math.ceil(upF-held);
    plan.unshift({a,start:startF,held});t=startF;
   }
   if(plan[0].start<earliest){
    // not enough think time: squeeze evenly into [earliest, end)
    const total=acts.reduce((s,a)=>s+Math.max(T(a.up)-T(a.down),0.5),0),free=end-earliest-total;
    const g=Math.floor(free/(acts.length));if(g<1)return;
    let s=earliest;for(const p of plan){p.start=s;s=Math.ceil(s+p.held)+g}
    if(Math.ceil(plan[plan.length-1].start+plan[plan.length-1].held)>=end)return;
   }
   for(const p of plan){
    const d=p.a.down,u=p.a.up,ds=Number(d.data.subframe)||0,us=Number(u.data.subframe)||0;
    const shift=p.start-d.frame;if(shift>0)return; // never later than the bot pressed
    moved.set(d,shift);moved.set(u,shift);
   }
  };
  for(const e of keys){
   if(e.type==='keyup'&&e.data.key==='hardDrop'){prevDrop=Math.max(prevDrop,Math.ceil(T(e)));continue}
   seg.push(e);
   if(e.type==='keydown'&&e.data.key==='hardDrop'){flush(e);prevDrop=e.frame;seg=[];piece++}
  }
  const mark=()=>{try{Object.defineProperty(rep,'__humanized',{value:true,enumerable:false,configurable:true})}catch{}};
  if(!moved.size){mark();return rep}
  const out=ev.map((e,i)=>{const s=moved.get(e);return {e:s?{...e,frame:e.frame+s}:e,i,k:s?1:0}});
  out.sort((a,b)=>a.e.frame-b.e.frame||a.k-b.k||a.i-b.i);
  rep.events=out.map(x=>x.e);
  mark();
  return rep;
 }
 // median gap (frames) between a human's presses before a drop, for matching the bot's pace to them
 function humanGap(rep){
  if(!rep||!Array.isArray(rep.events))return 0;
  const ds=rep.events.filter(e=>e.type==='keydown'&&e.data.key!=='softDrop');const g=[];
  for(let i=1;i<ds.length;i++){const d=ds[i].frame-ds[i-1].frame;if(ds[i-1].data.key!=='hardDrop'&&d>0&&d<30)g.push(d)}
  if(g.length<10)return 0;g.sort((a,b)=>a-b);return g[g.length>>1];
 }

 // user 2026-11-29: ON/OFF for the bot's "human finesse" in saved replays (default ON). Tab panel / replay settings.
 const humanOn=()=>localStorage.getItem('qp-bot-human-finesse')!=='0';
 const isBot=game=>!!(game&&(game._localAIPlayerName||game._localAIProfileId));
 // board height (rows from the bottom) and gravity each time the bot gets a new piece; humanizeReplay keeps the
 // bot's own frames for a piece on a high stack or with fast gravity
 function trackBot(game){
  if(!game||game._humanTrack)return;game._humanTrack=[];let placed=-1;
  const look=()=>{try{const st=game.state;const n=Number(st?.stats?.piecesplaced);if(!Number.isFinite(n)||n===placed)return;placed=n;
   const b=st.board;let h=0;if(Array.isArray(b))for(let y=0;y<b.length;y++)if(b[y].some(c=>c!==null&&c!==undefined)){h=b.length-y;break}
   const g=Number(game.source?.self?.fm?.GetEffectiveGravity?.()??st.g)||0;game._humanTrack[n]={h,g}}catch{}};
  game.on?.('frame','replay-humanize-track',look);
 }
 function humanize(game,replay,peerReplay){
  try{if(!humanOn()||!isBot(game)||!replay)return replay;
   const gap=humanGap(peerReplay)||Number(localStorage.getItem('qp-human-gap'))||5;
   return humanizeReplay(replay,{gap,track:game._humanTrack||null});
  }catch(error){console.warn('[replay] humanize',error);return replay}
 }
 function rememberHumanGap(game,replay){try{if(isBot(game))return;const g=humanGap(replay);if(g)localStorage.setItem('qp-human-gap',String(g))}catch{}}
 // AI room / TL match: every finished round goes into one TTRM (official multi-round shape).
 const matchFile=match=>{
  const users=match.names.map((name,i)=>({id:'0'.repeat(23)+(i+2),username:String(name).slice(0,32),avatar_revision:0,banner_revision:0,flags:0,country:null}));
  const stat=play=>{const agg=play.results?.aggregatestats||{},st=play.results?.stats||{};return {apm:agg.apm||0,pps:agg.pps||0,vsscore:agg.vsscore||0,garbagesent:st.garbage?.sent||0,garbagereceived:st.garbage?.received||0,kills:st.kills||0,altitude:0,rank:1,targetingfactor:3,targetinggrace:0,btb:st.btb||0,revives:0}};
  const base=(user,i)=>({id:user.id,username:user.username,active:true,naturalorder:i,shadows:[],shadowedBy:[null,null]});
  const avg=i=>{const all=match.rounds.map(r=>stat(r.replays[i])),n=all.length||1,out=stat({});for(const k of ['apm','pps','vsscore'])out[k]=all.reduce((a,s)=>a+s[k],0)/n;for(const k of ['garbagesent','garbagereceived','kills'])out[k]=all.reduce((a,s)=>a+s[k],0);return out};
  const leaderboard=users.map((user,i)=>({...base(user,i),wins:match.wins[i],stats:avg(i)})).sort((a,b)=>b.wins-a.wins);
  const rounds=match.rounds.map(r=>users.map((user,i)=>({...base(user,i),alive:i===r.winner,lifetime:Math.round(r.replays[i].frames/60*1000),stats:stat(r.replays[i]),replay:r.replays[i]})));
  return {version:1,gamemode:match.mode,ts:new Date().toISOString(),users,replay:{leaderboard,rounds},local:{source:'ai-room',matchKey:match.key,ai:match.ai,wins:[...match.wins],frames:Math.max(...match.rounds.map(r=>Math.max(r.replays[0].frames,r.replays[1].frames))),requiresPatch:false}};
 };
 const api=window.LocalReplayLibrary={portable,duo,matchFile,humanizeReplay,humanGap,trackBot,humanize,rememberHumanGap,
  // A long match (FT99 between two Cold Clears) crashed the renderer (2026-11-28): every round rebuilt and wrote
  // the TTRM of the whole match, ~3 MB a round, so by round 60 each save copied hundreds of MB several times.
  // Now a long match is saved in parts of PART rounds: only the open part is rewritten, and the replays of a closed
  // part are dropped from memory (its TTRM is already saved).
  saveMatch(match,reason){
   // user 2026-11-29: FTは11まで(ルーム側で上限)、試合は分けない — FT11 is at most 21 rounds, one TTRM. PART is kept only
   // as a guard for a match that somehow runs past that
   const PART=21,from=match.partFrom||0,rounds=match.rounds.slice(from),part=Math.floor(from/PART)+1;
   const wins=[0,0];for(const r of rounds)if(r.winner===0||r.winner===1)wins[r.winner]++;
   const file=matchFile({...match,rounds,wins});
   if(match.recordId)try{QPLocalZen.deleteRecord(match.recordId)}catch(error){console.warn('[AI room] old match record',error)}
   const long=match.rounds.length>=PART||from>0;
   QPLocalZen.record(match.mode,{localMatch:{key:match.key,names:match.names,wins:long?wins:[...match.wins],rounds:rounds.length,...(long?{part,total:[...match.wins]}:{})},localEndReason:reason},file);
   const mine=QPLocalZen.records().filter(r=>r.result?.localMatch?.key===match.key);match.recordId=mine.length?mine[mine.length-1].id:null;
   if(rounds.length>=PART){for(const r of rounds)r.replays=null;match.partFrom=match.rounds.length;match.recordId=null}
   return file;
  },
  save(game,reason){
   let replay=game.replay.Export();if(!(replay.frames>0))return;
   rememberHumanGap(game,replay);replay=humanize(game,replay,null);
   const gamemode=mode(game),mods=game.options.zenith_mods||[];
   const local={testMode:game._localTestMode||'solo',duoSide:game._localReplaySide||(game.options.zenith_duo?'player':null),speedChanges:game._localSpeedChanges||[],incomingAttacks:game._localAttackConfig||null,missions:game._localMissionConfig||null,requiresPatch:mods.filter(x=>x.endsWith('_reversed')).length>1||!!game._localCustomMissionUsed,bot:!!game._localAIPlayerName,engine:game._aiEngine||null};
   const file=portable({version:1,gamemode,ts:new Date().toISOString(),local,users:[{username:game.options.username||localStorage.getItem('qp-local-username')||'LOCAL'}],replay});
   // QP DUO: save both sides as one TTRM, once per run (falls back to the player-only TTR).
   let saved=file;
   if(game.options.zenith_duo&&game._localDuoPartner){
    if(game._localDuoSaved)return;game._localDuoSaved=true;
    try{
     let partner=game._localDuoPartnerReplay||game._localDuoPartner.replay.Export();
     if(partner&&!game._localDuoPartnerReplay)partner=humanize(game._localDuoPartner,partner,replay);
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
    const heading=document.createElement('h2');const lm=record.result?.localMatch;heading.textContent=record.mode.toUpperCase()+(lm?' · '+lm.names.join(' vs ')+' '+lm.wins.join('-')+(lm.part?' (PART '+lm.part+' · '+lm.total.join('-')+')':''):record.replay?.local?.duoMerged?' · DUO':record.replay?.local?.duoSide==='partner'?' · PARTNER':'');
    const date=document.createElement('p');date.textContent=new Date(record.date).toLocaleString();row.append(heading,date);
    if(record.replay?.local?.requiresPatch){const note=document.createElement('p');note.textContent='ローカル拡張ルール使用：完全再現には対応パッチが必要です。';row.appendChild(note)}
    const controls=document.createElement('div');controls.className='control_group flex-row';row.appendChild(controls);
    function button(text,action){const node=document.createElement('button');node.className='control_button';node.textContent=text;node.onclick=async()=>{try{await action()}catch(error){LocalUIHealth.fail('ローカル記録',error)}};controls.appendChild(node);return node}
    if(record.replay){
     button('REPLAY',()=>play(QPLocalZen.replay(record)));
     const multi=!!record.replay?.local?.duoMerged||!!record.result?.localMatch;button(multi?'↓ TTRM':'↓ TTR',()=>{const data=portable(QPLocalZen.replay(record)),ext=Array.isArray(data.replay?.rounds)?'ttrm':'ttr',url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=window.__qpReplayDownloadName?window.__qpReplayDownloadName(data,ext):'local-'+record.mode+'-'+record.id+'.'+ext;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)});
    }
    // v5.07 (user: PBデータを全て取る・githubにPBのランキング): QP SOLO records go to the ranking on
    // tetrio-hub (an Issue form with the record filled in; a GitHub Action adds it to the ranking page).
    // user 2026-11-16: ランキングは「最初から10F相当」の記録(猶予あり / なし)だけ
    if(['zenith','zenithex'].includes(record.mode)&&!record.result?.localMatch&&!(record.replay?.local?.bot||record.replay?.local?.engine)&&record.replay?.local?.incomingAttacks?.floor10){const send=button('ランキングに送る',()=>{
     const res=record.result||{},r=res.results||res,st=r.stats||{},agg=r.aggregatestats||{},z=st.zenith||{};
     let file=null;try{file=QPLocalZen.replay(record)}catch{}
     const local=file?.local||record.replay?.local||{},opts=res.options?.zenith_mods?res.options:file?.replay?.options||{};
     // 5.07 より前の記録は BOT の印がないので、AI の名前(自作AIのプロフィール名・"AI" を含む名前)でも断る
     const pname=String(file?.users?.[0]?.username||''),aiNames=new Set((window.LocalBotLearning?.profiles?.()||[]).map(p=>String(p.name)));
     if(local.bot||local.engine||aiNames.has(pname)||(local.bot===undefined&&/\bAI\b/i.test(pname)))throw Error('BOT・外部AIの記録はランキングに送れません');
     if(!local.incomingAttacks?.floor10)throw Error('ランキングに送れるのは「最初から10F相当」の記録だけです');
     if(!(Number(z.altitude)>0))throw Error('高度が記録されていないので送れません');
     const data={v:1,name:file?.users?.[0]?.username||localStorage.getItem('qp-local-username')||'LOCAL',mode:record.mode,altitude:+Number(z.altitude).toFixed(2),floor:Number(z.floor)||1,revives:Number(z.revives??z.revivesTotal??0)||0,
      time:Math.round(Number(st.finaltime)||Number(file?.replay?.frames)/60*1000||0),apm:+(Number(agg.apm)||0).toFixed(2),pps:+(Number(agg.pps)||0).toFixed(2),mods:Array.isArray(opts.zenith_mods)?opts.zenith_mods:[],hyper:(z.speedrun===true||z.speedrun_seen===true)&&Number(z.floor)>=10,
      floor10:!!local.incomingAttacks?.floor10,lull:local.incomingAttacks?.lull!==false,test:local.testMode||'solo',bot:!!local.bot,engine:local.engine||null,patch:String(window.__qpPatchVersion||''),date:record.date};
     const url='https://github.com/kei1215/tetrio-hub/issues/new?template=pb.yml&title='+encodeURIComponent('PB: '+data.name+' '+data.altitude+'m')+'&data='+encodeURIComponent(JSON.stringify(data));
     // v5.07 (user: ゲーム内からapiで送れる様に・送信するのはオフライン版の記録のみ): GAS 中継に記録と TTR を送る
     // (中継の URL は ranking/api.json から読むので、URL が変わってもパッチを作り直さなくてよい)。
     // 送れないとき(中継なし・通信が止められた)は GitHub の登録ページを開き、TTR を保存してドラッグしてもらう
     const ttr=file?JSON.stringify(portable(file)):null;
     const viaIssue=why=>{
      if(ttr){try{const u=URL.createObjectURL(new Blob([ttr],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='PB-'+Math.round(data.altitude)+'m-'+record.id+'.ttr.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}catch(e){console.warn('[PB replay]',e)}}
      if(why)alert(why+'\nGitHub の登録ページを開きます。保存されたリプレイ(.ttr.json)を「リプレイ」欄にドラッグしてから送ってください。');
      window.open(url,'_blank','noopener');
     };
     if(!ttr)return viaIssue('リプレイを読めませんでした。');
     if(!confirm('ランキングに送りますか？\n名前: '+data.name+'\n高さ: '+data.altitude+'m (F'+data.floor+')'+(data.mods.length?'\nMOD: '+data.mods.join(', '):'')+'\n記録とリプレイが公開されます。'))return;
     const btn=send;if(btn){btn.disabled=true;btn.textContent='送信中…'}
     (async()=>{
      let api='';try{api=(await (await fetch('https://kei1215.github.io/tetrio-hub/ranking/api.json',{cache:'no-store'})).json()).url||''}catch{}
      if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api))return viaIssue('ゲームからの送信がまだ使えません。');
      let res;try{res=await (await fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({data,ttr}),redirect:'follow'})).json()}catch(e){console.warn('[PB send]',e);return viaIssue('送信できませんでした。')}
      if(res?.ok)alert(res.text||'送りました');else alert('送れませんでした: '+(res?.text||'不明なエラー'));
     })().finally(()=>{if(btn){btn.disabled=false;btn.textContent='ランキングに送る'}});
    })}
    const remove=button('🗑',()=>{if(!confirm('このローカル記録とTTRを削除しますか？'))return;QPLocalZen.deleteRecord(record.id);api.show(host,play,filter)});remove.setAttribute('aria-label','記録とTTRを削除');remove.title='記録とTTRを削除';
    host.appendChild(row);
   }
  }
 };
})();
