/* v5.16 (user: Custom ルームを正常に追加する / 見た目を似せるのではなく): the native CUSTOM room lobby,
   run offline by a local room server. The native lobby code is driven through the ribbon
   (client.js fix_local_room): qpFire('room.join' / 'room.update' / 'room.chat' ...) plays the server,
   and every room message the native UI emits (START, SAVE of the ROOM / MATCH / GAME tabs, chat,
   leave, PLAYING/SPECTATING) comes to __qpRoomEmit here instead of the network.
   Private room (user: 非公開ルーム = 上の「#ルームID」を出さない): body.hideroomids, the same look as
   CONFIG > hide room IDs, while the room is private.
   Chat commands (user: /bot add <AI名> / /bot remove / /set <項目> <値> / /help): __qpRoomCmd, only
   while this local room is open (online it is never set, so online chat is untouched). */
(() => {
 const DEFAULT_PRESET='match.modename=VERSUS;match.gamemode=versus;match.ft=1;match.wb=1;match.gp=0;options.presets=default;options.stock=0;options.bagtype=7-bag;options.spinbonuses=all-mini+;options.allow180=1;options.kickset=SRS+;options.allow_harddrop=1;options.display_next=1;options.display_hold=1;options.nextcount=5;options.display_shadow=1;options.are=0;options.lineclear_are=0;options.room_handling=0;options.room_handling_arr=2;options.room_handling_das=10;options.room_handling_sdf=6;options.g=0.02;options.gincrease=0.0025;options.gmargin=3600;options.garbagemultiplier=1;options.garbageblocking=combo blocking;options.garbagemargin=10800;options.garbagecapmargin=0;options.garbageincrease=0.008;options.locktime=30;options.garbagespeed=20;options.garbagecap=8;options.garbagecapincrease=0;options.garbagecapmax=40;options.manual_allowed=0;options.b2bchaining=0;options.combotable=multiplier;options.clutch=1;options.passthrough=zero;options.nolockout=1;options.boardwidth=10;options.boardheight=20;options.allclears=1;options.usebombs=0;options.openerphase=14;options.b2bcharging=1;options.allclear_garbage=5;options.allclear_b2b=1;options.roundmode=down;options.garbagespecialbonus=1';
 const EXTRA={'options.infinite_movement':0,'options.infinite_hold':0,'options.messiness_change':1,'options.messiness_inner':0,'options.messiness_nosame':0,'options.messiness_timeout':0,'options.garbageabsolutecap':0,'options.garbagephase':0,'options.garbagetargetbonus':'none','options.garbageentry':'instant','options.garbageare':5,'options.garbagearebump':0,'options.garbagequeue':0};
 const KEY='qp-local-custom-room-v1';
 // v5.16 (user: AI の設定もルームの設定に / 元のタブと値を共有): room rows "qp.*" read and write the same
 // localStorage keys as the Tab panel (qp-ai-options.js listens to qp-ai-settings-changed and refreshes).
 // PRE-MATCH INTRO (user: TL のような対戦前の演出、stats を出すが TR は出さない版を ON/OFF).
 const SETTINGS=[
  {k:'intro',tab:'ui',label:'PRE-MATCH INTRO',title:'TETRA LEAGUE style intro before the match (records instead of TR)',type:'bool',key:'qp-local-room-intro',def:false},
  {k:'pps',label:'BOT TARGET PPS',title:'Pieces per second of the BOTs (shared with the Tab panel)',type:'num',key:'qp-local-bot-pps',def:2,min:.1,max:20},
  {k:'gravity',label:'BOT GRAVITY',title:'NORMAL / OFF FOR BOTS / OFF FOR BOTH',type:'pick',key:'qp-ai-no-gravity',def:'off',items:[['off','NORMAL'],['bot','OFF FOR BOTS'],['both','OFF FOR BOTH']]},
  {k:'power',label:'AI COMPUTE POWER',title:'Planning effort of the vA AI',type:'pick',key:'qp-ai-power',def:'auto',items:[['auto','AUTO'],['low','LOW'],['mid','MID'],['high','HIGH'],['max','MAX']]},
  {k:'tspin',label:'AI T-SPIN B2B',title:'vA AI keeps B2B with T-spins',type:'bool',key:'qp-local-ai-tspin-b2b',def:true,off:'false'},
  {k:'ternbase',label:'TERNBASE',title:'BOTs place in step with the player (formerly PtoP; shared with the Tab panel)',type:'bool',key:'qp-ai-sync-player',def:false,on:'true',off:'false'},
  {k:'ratio',label:'TERNBASE RATIO',title:'Player : BOT pieces for TERNBASE, e.g. 1:1',type:'text',key:'qp-ai-sync-ratio',def:'1:1'},
  {k:'mute',tab:'ui',label:'MUTE ROOM SOUNDS',title:'Mission shout, countdown, join / leave, chat and lobby music',type:'bool',key:'qp-local-room-mute',def:false},
  {k:'warnsound',tab:'ui',label:'DANGER SOUND',title:'Warning sound when garbage is about to top you out',type:'bool',key:'qp-local-warn-sound',def:false},
  {k:'warnpiece',tab:'ui',label:'DANGER PIECE',title:'Warning (red) piece when the next piece would top out',type:'bool',key:'qp-local-warn-piece',def:false},
  {k:'garbageline',tab:'ui',label:'GARBAGE PREVIEW LINE',title:'Line that shows where incoming garbage will rise to',type:'bool',key:'qp-local-rise-line',def:false},
  {k:'tlplus',tab:'ui',label:'TL SCORE +1 EFFECT',title:'TETRA LEAGUE style +1 score pop after each round',type:'bool',key:'qp-local-tl-score-rise',def:false},
  {k:'tlscore',tab:'ui',label:'TL SCORE SCREEN',title:'TETRA LEAGUE style score screen after a round is won / lost',type:'bool',key:'qp-local-tl-scoreslide',def:false},
  {k:'tlmusic',tab:'ui',label:'TL MUSIC',title:'TETRA LEAGUE music during the match (shared with the Tab panel)',type:'bool',key:'qp-local-tl-music',def:false},
  {k:'split',label:'SEPARATE PIECE ORDER',title:'Each board gets its own seed (off = same queue like TETRA LEAGUE)',type:'bool',key:'qp-local-ai-seed-split',def:false}];
 const readSetting=s=>{const v=localStorage.getItem(s.key);if(v===null)return s.def;if(s.type==='bool')return s.on?v===s.on:s.off?v!==s.off:v==='1';if(s.type==='text')return v;if(s.type==='num'){const n=Number(v);return Number.isFinite(n)?n:s.def}return s.items.some(i=>i[0]===v)?v:s.def};
 const writeSetting=(s,value)=>{let v=value;if(s.type==='bool'){const on=v===true||/^(1|true|on|yes)$/i.test(String(v));localStorage.setItem(s.key,s.off?(on?(s.on||'true'):s.off):(on?'1':'0'))}else if(s.type==='text'){const m=/^\s*(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(v));if(!m||!(+m[1]>0)||!(+m[2]>0))throw Error(s.label+': 例 1:1');localStorage.setItem(s.key,m[1]+':'+m[2])}else if(s.type==='num'){const n=Math.max(s.min,Math.min(s.max,Number(v)));if(!Number.isFinite(n))throw Error(s.label+': 数で指定');localStorage.setItem(s.key,String(n))}else{const it=s.items.find(i=>i[0]===String(v).toLowerCase()||i[1]===String(v).toUpperCase());if(!it)throw Error(s.label+': '+s.items.map(i=>i[0]).join(' / '));localStorage.setItem(s.key,it[0])}window.dispatchEvent(new CustomEvent('qp-ai-settings-changed',{detail:{key:s.key}}))};
 const qpValues=()=>Object.fromEntries(SETTINGS.map(s=>{const v=readSetting(s);return [s.k,s.type==='pick'?s.items.find(i=>i[0]===v)[1]:v]}));
 // UI tab (user: ROOM / MATCH / GAME とは別に UI タブ): a fourth native-looking tab whose page holds the
 // LOCAL UI rows; the other tabs' pages are hidden while it is selected.
 function uiTab(){
  const src=document.getElementById('room_opts_room'),tabs=src?.parentElement,box=document.getElementById('room_content_room')?.parentElement;if(!tabs||!box)return null;
  let page=document.getElementById('room_content_qpui');if(page)return page;
  const t=src.cloneNode(false);t.id='room_tab_qpui';t.dataset.target='room_content_qpui';t.textContent='UI';t.classList.remove('active','selected','hidden');tabs.appendChild(t);
  page=document.getElementById('room_content_room').cloneNode(false);page.id='room_content_qpui';page.classList.add('hidden');page.style.display='none';const rc=document.getElementById('room_content_room');box.insertBefore(page,rc.nextSibling);
  const show=on=>{page.style.display=on?'':'none';page.classList.toggle('hidden',!on);t.classList.toggle('active',on);t.classList.toggle('selected',on);for(const c of box.children)if(c!==page&&/^room_content_(welcome|room|match|game)$/.test(c.id))c.style.display=on?'none':''};
  tabs.addEventListener('click',ev=>{const x=ev.target.closest('.room_tab');if(!x)return;if(x===t){ev.preventDefault();ev.stopImmediatePropagation();for(const o of tabs.querySelectorAll('.room_tab'))if(o!==t)o.classList.remove('active','selected');show(true)}else show(false)},true);
  return page;
 }
 // Presets (user: AI もまとめて preset): the room's options / match plus every LOCAL AI and LOCAL UI value,
 // saved by name and loaded back (also /set preset <name>, /set savepreset <name>).
 const PKEY='qp-local-room-presets-v1';
 const BUILTIN={'TL S1 + vA 3.5PPS':{preset:'tetra league (season 1)',qp:{pps:3.5}},'TL + Butter 2PPS':{preset:'tetra league',qp:{pps:2}}};
 const presets=()=>{let u={};try{u=JSON.parse(localStorage.getItem(PKEY)||'{}')||{}}catch{}return {...BUILTIN,...u}};
 function savePreset(name){name=String(name||'').trim();if(!name)throw Error('使い方: /set savepreset <名前>');let u={};try{u=JSON.parse(localStorage.getItem(PKEY)||'{}')||{}}catch{}u[name]={options:{...room.options},match:{ft:room.match.ft,wb:room.match.wb,gp:room.match.gp},qp:Object.fromEntries(SETTINGS.map(s=>[s.k,readSetting(s)]))};localStorage.setItem(PKEY,JSON.stringify(u));sys('プリセットを保存しました: '+name);refreshPresets()}
 function loadPreset(name){const all=presets(),q=String(name||'').trim().toLowerCase(),key=Object.keys(all).find(k=>k.toLowerCase()===q)||Object.keys(all).find(k=>k.toLowerCase().includes(q));if(!q||!key)throw Error('プリセット: '+Object.keys(all).join(' / '));const p=all[key];
  if(p.preset){const opts=window.__qpRoomOpts?.()?.[p.preset];if(opts&&typeof opts==='object')for(const [k,v] of Object.entries(opts))setPath(room,k.includes('.')?k:'options.'+k,v);else if(typeof opts==='string')for(const pair of opts.split(';')){const at=pair.indexOf('=');if(at>0)setPath(room,pair.slice(0,at).trim(),num(pair.slice(at+1)))}}
  if(p.options)Object.assign(room.options,p.options);if(p.match)Object.assign(room.match,p.match);
  for(const [k,v] of Object.entries(p.qp||{})){const s=SETTINGS.find(x=>x.k===k);if(s)try{writeSetting(s,v)}catch{}}
  persist();update();configUpdated();sys('プリセット: '+key)}
 function presetBlock(){const b=document.createElement('div');b.className='scroller_block light';b.id='qp-room-preset-block';b.innerHTML='<h2 class="ns">LOCAL PRESETS (ROOM + AI + UI)</h2><div class="room_config_row flex-row imp" title="Load a saved set of room, AI and UI settings"><div class="room_config_label flex-item ns">preset</div><select class="room_config_item flex-item" id="qp-preset-pick"></select></div><div class="room_config_row flex-row imp" title="Save the current room, AI and UI settings under a name"><div class="room_config_label flex-item ns">save as</div><input type="text" class="room_config_item flex-item" id="qp-preset-name" placeholder="name + Enter"></div>';
  const pick=b.querySelector('select'),nm=b.querySelector('input');pick.addEventListener('change',ev=>{ev.stopImmediatePropagation();if(pick.value)try{loadPreset(pick.value)}catch(error){sys(error.message)}pick.value=''},true);nm.addEventListener('keydown',ev=>{if(ev.key!=='Enter')return;ev.preventDefault();ev.stopImmediatePropagation();try{savePreset(nm.value);nm.value=''}catch(error){sys(error.message)}},true);setTimeout(refreshPresets);return b}
 function refreshPresets(){const pick=document.getElementById('qp-preset-pick');if(!pick)return;pick.replaceChildren(new Option('— choose —',''),...Object.keys(presets()).map(k=>new Option(k,k)))}
 function configUpdated(){if(!room)return;fire('room.chat',{content:'Room configuration updated',user:{username:'[CMD]',_id:null},system:false,id:'local-'+Date.now()+Math.random()});
  document.getElementById('qp-cfgtoast')?.remove();const t=document.createElement('div');t.id='qp-cfgtoast';t.innerHTML='<span>✓</span>ROOM CONFIGURATION UPDATED!';document.body.appendChild(t);setTimeout(()=>t.classList.add('out'),2600);setTimeout(()=>t.remove(),3200)}
 function injectRows(){
  const host=document.getElementById('room_content_room');if(!host||document.getElementById('qp-room-ai-block'))return;
  const ui=uiTab();const mk=(id,title)=>{const b=document.createElement('div');b.className='scroller_block light';b.id=id;const h=document.createElement('h2');h.className='ns';h.textContent=title;b.appendChild(h);return b};
  const blocks={ai:mk('qp-room-ai-block','LOCAL AI'),ui:mk('qp-room-ui-block','LOCAL UI'),preset:presetBlock()};
  for(const s of SETTINGS){const block=blocks[s.tab||'ai'];const row=document.createElement('div');row.className='room_config_row flex-row imp';row.title=s.title;const lab=document.createElement('div');lab.className='room_config_label flex-item ns';lab.textContent=s.label.toLowerCase();row.appendChild(lab);let item;
   if(s.type==='bool'){const sw=document.createElement('label');sw.className='rc_switch flex-item';item=document.createElement('input');item.type='checkbox';item.className='room_config_item';const knob=document.createElement('span');knob.className='rc_switch_knob';sw.append(item,knob);row.appendChild(sw);item.addEventListener('change',ev=>{ev.stopImmediatePropagation();apply(s,item.checked)},true)}
   else if(s.type==='text'){item=document.createElement('input');item.type='text';item.className='room_config_item flex-item';row.appendChild(item);item.addEventListener('change',ev=>{ev.stopImmediatePropagation();apply(s,item.value)},true)}
   else if(s.type==='num'){item=document.createElement('input');item.type='number';item.className='room_config_item flex-item';item.min=s.min;item.max=s.max;item.step='0.1';row.appendChild(item);item.addEventListener('change',ev=>{ev.stopImmediatePropagation();apply(s,item.value)},true)}
   else{item=document.createElement('div');item.className='room_config_item room_config_spinner flex-item ns';row.appendChild(item);item.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();const cur=readSetting(s),i=s.items.findIndex(x=>x[0]===cur);apply(s,s.items[(i+1)%s.items.length][0])},true)}
   item.dataset.index='qp.'+s.k;block.appendChild(row)}
  host.insertBefore(blocks.ai,host.querySelector('.scroller_block'));host.insertBefore(blocks.preset,blocks.ai);if(ui)ui.append(blocks.ui);
 }
 const syncWarn=()=>{window.__qpWarn={sound:localStorage.getItem('qp-local-warn-sound')==='1',piece:localStorage.getItem('qp-local-warn-piece')==='1'}};
 function apply(s,value){try{writeSetting(s,value);syncWarn();if(room){update();sys(s.label+' = '+qpValues()[s.k])}}catch(error){sys(error.message)}}
 let room=null,cfg=null,pendingReturn=false,botSeq=0;
 const ribbon=()=>window.__qpRibbon;
 const fire=(event,data)=>{try{ribbon()?.qpFire?.(event,data)}catch(error){console.warn('[local room]',event,error)}};
 const me=()=>{const m=window.__qpMe?.()||{};return {id:m.id||'',username:(m.username||localStorage.getItem('qp-local-username')||'LOCAL').toLowerCase()}};
 const num=v=>{if(v===true||v===false)return v;const s=String(v).trim();if(/^(true|on|yes)$/i.test(s))return true;if(/^(false|off|no)$/i.test(s))return false;return s!==''&&Number.isFinite(Number(s))?Number(s):s};
 const getPath=(o,p)=>p.split('.').reduce((a,k)=>a?.[k],o);
 const setPath=(o,p,v)=>{const ks=p.split('.');let a=o;for(const k of ks.slice(0,-1))a=a[k]??={};a[ks.at(-1)]=v};
 const player=(id,username,bot,side,engine)=>({_id:id,username,anon:false,bot,role:bot?'bot':'user',xp:0,badges:[],record:{games:0,wins:0,streak:0},bracket:'player',supporter:false,verified:false,country:null,side,engine:engine||null});
 const aiChoices=()=>{const out=[];for(const p of window.LocalBotLearning?.profiles?.()||[])out.push({name:p.name,side:'ai:'+p.id,engine:null});for(const id of window.LocalExternalAI?.engines?.()||[])out.push({name:window.LocalExternalAI.label(id),side:null,engine:id});return out};
 const labelOf=c=>c.engine?(/^va-tree/.test(c.engine)?'Butter':c.name):c.name;
 function makeRoom(){
  const m=me(),r={id:'LOCAL',public:false,name:'LOCAL CUSTOM ROOM',name_safe:'LOCAL CUSTOM ROOM',type:'custom',owner:m.id,creator:m.id,state:'lobby',topic:{},info:{},auto:{enabled:false,status:'',time:0,maxtime:0},options:{},userLimit:0,autoStart:0,allowAnonymous:true,allowQueued:false,allowUnranked:true,userRankLimit:'z',useBestRankAsLimit:false,forceRequireXPToChat:false,gamebgm:'RANDOMbattle',lobbybgm:'RANDOMcalm',match:{},players:[],bgmList:[],lobbybg:null,allowChat:true};
  for(const pair of DEFAULT_PRESET.split(';')){const at=pair.indexOf('=');setPath(r,pair.slice(0,at),num(pair.slice(at+1)))}
  for(const [k,v] of Object.entries(EXTRA))setPath(r,k,v);
  Object.assign(r.match,{winningKey:'wins',record_replays:true,keys:{},extra:{}});
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object'){for(const k of ['name','public','gamebgm','userLimit'])if(k in saved)r[k]=saved[k];Object.assign(r.match,saved.match||{});Object.assign(r.options,saved.options||{})}}catch{}
  r.name_safe=r.name;return r;
 }
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({name:room.name,public:room.public,gamebgm:room.gamebgm,userLimit:room.userLimit,match:{...room.match,keys:undefined,extra:undefined},options:room.options}))}catch{}};
 const hideIds=()=>{let base=false;try{base=!!JSON.parse(localStorage.getItem('userConfig')||'{}')?.video?.hideroomids}catch{}document.body.classList.toggle('hideroomids',room?(!room.public||base):base)};
 const update=()=>{document.body.classList.toggle('qp-room-ingame',room.state==='ingame'||room.state==='intro');room.name_safe=room.name;room.qp=qpValues();hideIds();fire('room.update',structuredClone(room));renderVsAi();sortPlayers()};
 const sys=content=>fire('room.chat',{content,system:true,id:'local-'+Date.now()+Math.random()});
 const say=(user,content)=>fire('room.chat',{content,user:{_id:user._id,username:user.username,role:user.role,supporter:false,type:'user'},ts:new Date().toISOString()});
 function addBot(name){
  const list=aiChoices();if(!list.length)throw Error('AI がありません');
  const q=String(name||'').trim().toLowerCase();const c=q?list.find(x=>x.name.toLowerCase()===q)||list.find(x=>x.name.toLowerCase().includes(q)):list[0];
  if(!c)throw Error('AI が見つかりません: '+name+'(/bot list で一覧)');
  const side=c.side||('ai:'+(window.LocalBotLearning?.profiles?.()?.[0]?.id||''));
  const b=player('bot-'+(++botSeq),labelOf(c).toLowerCase(),true,side,c.engine);room.players.push(b);fire('room.player.add',structuredClone(b));update();sys(labelOf(c)+' を追加しました');
 }
 function removeBot(name){
  const q=String(name||'').trim().toLowerCase();const bots=room.players.filter(p=>p.bot);const b=q?bots.find(p=>p._id===q)||bots.find(p=>p.username===q)||bots.find(p=>p.username.includes(q)):bots.at(-1);
  if(!b)throw Error('外す BOT がいません');room.players=room.players.filter(p=>p!==b);fire('room.player.remove',b._id);update();sys(b.username.toUpperCase()+' を外しました');
 }
 function setOption(key,value){
  if(!key||value===undefined)throw Error('使い方: /set <項目> <値>(例: /set ft 7、/set g 0.02、/set public on)');
  if(/^preset$/i.test(key))return loadPreset(value);if(/^savepreset$/i.test(key))return savePreset(value);
  const qs=SETTINGS.find(s=>s.k===key.toLowerCase()||s.label.toLowerCase().replace(/[^a-z0-9]/g,'')===key.toLowerCase().replace(/[^a-z0-9]/g,''));if(qs){writeSetting(qs,value);syncWarn();update();sys(qs.label+' = '+qpValues()[qs.k]);return}
  const short={ft:'match.ft',wb:'match.wb',gp:'match.gp',gamemode:'match.gamemode',name:'name',public:'public',limit:'userLimit',music:'gamebgm'};
  let path=short[key]||key;if(!path.includes('.')&&!(path in room))path='options.'+path;
  if(getPath(room,path)===undefined&&!(path.startsWith('options.')&&path.slice(8) in EXTRA))throw Error('知らない項目: '+key);
  setPath(room,path,path==='name'?String(value):num(value));persist();update();configUpdated();sys(path+' = '+getPath(room,path));
 }
 const HELP=['/bot list … 呼べる AI の一覧','/bot add <AI名> … AI を入れる(名前の一部でも可、省略で先頭)','/bot remove [名前] … AI を外す(省略で最後に入れた AI)','/set <項目> <値> … 設定を変える(ft wb gp name public limit music、ほか options の名前: g gincrease garbagecap spinbonuses b2bcharging など)','/set pps 3.5 … LOCAL AI(pps gravity power tspin ternbase ratio split)','/set intro on|off … UI タブ(intro mute warnsound warnpiece garbageline tlplus tlscore tlmusic)','/set preset <名前> … プリセットを呼ぶ(ルーム + AI + UI)/ /set savepreset <名前> … 今の設定を保存','/start … 開始(START ボタンと同じ)','/abort … 試合を止めてルームに戻る','/vsai … AI の招待一覧(右上の人アイコン / Tab の PEOPLE)を出す / しまう','/help … この一覧'];
 function command(text){
  if(!room||!String(text).startsWith('/'))return false;
  const [cmd,...args]=String(text).trim().split(/\s+/);const c=cmd.toLowerCase();
  if(!['/bot','/set','/help','/start','/abort','/vsai'].includes(c))return false;
  const m=room.players.find(p=>p._id===me().id);if(m)say(m,text);
  try{
   if(c==='/help')HELP.forEach(sys);
   else if(c==='/start')start();
   else if(c==='/abort')abort();
   else if(c==='/vsai'){room.vsai=!room.vsai;renderVsAi();if(room.vsai)window.__qpSocialOpen?.();sys(room.vsai?'VS AI: 右の一覧の招待マークで AI を呼べます':'VS AI の一覧をしまいました')}
   else if(c==='/set')setOption(args[0],args.slice(1).join(' ')||undefined);
   else{const sub=(args[0]||'').toLowerCase(),rest=args.slice(1).join(' ');if(sub==='add')addBot(rest);else if(sub==='remove'||sub==='rm')removeBot(rest);else sys('AI: '+aiChoices().map(labelOf).join(', ')+'(/bot add <AI名>)')}
  }catch(error){sys(error.message)}
  return true;
 }
 function start(){
  const inRoom=room.players.filter(p=>p.bracket==='player');if(inRoom.length!==2)throw Error('プレーヤー(BOT を含む)はちょうど2人にしてください(今 '+inRoom.length+' 人)');
  const sides=inRoom.map(p=>p.bot?p.side:'player'),engines=inRoom.map(p=>p.bot?p.engine:null),labels=inRoom.map(p=>p.bot?p.username.toUpperCase():null);
  if(!sides.includes('player')&&!sides.every(Boolean))throw Error('AI を選び直してください');
  // The native options validator wants booleans for the room's checkbox rows (allow180 ...).
  const options={...room.options};delete options.presets;
  const bools=new Set([...document.querySelectorAll('#room_content_container .room_config_item[data-index^="options."][type="checkbox"]')].map(e=>e.dataset.index.slice(8)));
  for(const k of ['allow180','allow_harddrop','display_next','display_hold','display_shadow','room_handling','manual_allowed','b2bchaining','b2bcharging','clutch','nolockout','allclears','usebombs','garbagespecialbonus','infinite_movement','infinite_hold','messiness_nosame','garbagequeue'])bools.add(k);
  for(const k of bools)if(k in options)options[k]=!!options[k];
  window.LocalAIRoom.ft?.(Math.max(1,Math.min(99,Number(room.match.ft)||1)));
  pendingReturn=false;
  const go=()=>{if(!room||room.state!=='intro')return;window.LocalAIRoom.start({left:sides[0],right:sides[1],engines,labels,mode:'custom',options,customRoom:true,firstTo:Math.max(1,Math.min(99,Math.round(Number(room.match.ft))||1))});room.state='ingame';document.body.classList.add('qp-room-ingame');const m=room.players.find(p=>p._id===me().id);fire('room.chat',{content:'started the game',user:{_id:m?._id||'',username:m?.username||me().username,role:'user',supporter:false,type:'user'},system:true,id:'local-'+Date.now()})};
  room.state='intro';window.__qpSocialClose?.();
  if(readSetting(SETTINGS[0])&&typeof window.DEVHOOK_PAIRED==='function'){
   // native TETRA LEAGUE match intro (pair screen) with TR hidden (-1); the rank line shows the room record.
   const names=inRoom.map(p=>p.username),ft=Math.round(Number(room.match.ft))||1;
   try{window.LocalNative?.resetResults?.();window.DEVHOOK_PAIRED(names[0],names[1],-1,-1,'z','z',-1,-1,ft);inRoom.forEach((p,i)=>{const el=document.getElementById('pair_rank_p'+(i+1));if(el)el.innerHTML=(p.bot?'BOT · ':'')+p.record.wins+'<span>W</span> / '+p.record.games+'<span>G</span>'})}catch(error){console.warn('[local room] intro',error)}
   introTimer=setTimeout(go,12800);
  }else go();
 }
 let introTimer=0;
 function abort(){
  clearTimeout(introTimer);if(!room)return;const was=room.state;room.state='lobby';pendingReturn=false;document.getElementById('pair')?.classList.add('hidden');
  try{window.LocalAIRoom?.stop?.()}catch{}
  const go=()=>{try{window.LocalNative?.resetResults?.();window.LocalNative?.view?.('lobby')}catch{}update()};go();setTimeout(go,60);sys(was==='lobby'?'試合中ではありません':'試合を止めました');
 }
 function emit(event,data){
  if(!room)return false;
  try{
   switch(event){
    case 'room.start':start();break;
    case 'room.abort':abort();break;
    case 'room.setconfig':for(const {index,value} of data||[]){const s=String(index).startsWith('qp.')&&SETTINGS.find(x=>'qp.'+x.k===index);if(s){writeSetting(s,s.type==='pick'?(s.items.find(i=>i[1]===value)?.[0]??value):value);continue}setPath(room,index,index==='name'?String(value):num(value))}persist();update();configUpdated();break;
    case 'room.chat.send':{const m=room.players.find(p=>p._id===me().id)||player(me().id,me().username,false,'player');say(m,data?.content??'');break}
    case 'room.bracket.switch':{const m=room.players.find(p=>p._id===me().id);if(m){m.bracket=data==='spectator'||m.bracket==='player'?'spectator':'player';fire('room.update.bracket',{uid:m._id,bracket:m.bracket})}break}
    case 'room.leave':close();break;
   }
  }catch(error){sys(error.message)}
  return true; // every room message stays local while the room is open
 }
 function open(config={}){
  if(typeof ribbon()?.qpFire!=='function')throw Error('カスタムルームにはパッチの再適用が必要です');
  cfg=config;room=makeRoom();botSeq=0;const m=me();room.vsai=!!config.vsai;if(config.vsai){room.name=room.name_safe='VS AI';}
  try{window.__qpRoomOpts?.();injectRows();window.LocalAIRoom?.installMute?.()}catch(error){console.warn('[local room]',error)}
  const sides=config.vsai?['player']:[config.left??'player',config.right??'ai'];
  room.players.push({...player(m.id,m.username,false,'player'),bracket:sides.includes('player')?'player':'spectator'});
  sides.forEach((s,i)=>{if(s==='player')return;const engine=config.engines?.[i]||null,c=aiChoices().find(x=>engine?x.engine===engine:x.side===s);const name=(config.labels?.[i]||(c&&labelOf(c))||'BOT').toLowerCase();room.players.push(player('bot-'+(++botSeq),name,true,s,engine))});
  fire('room.join',{id:room.id,banner:{content:'LOCAL CUSTOM ROOM(オフライン)。/help でコマンド一覧。',banner:true}});
  update();
  if(config.vsai)setTimeout(()=>window.__qpSocialOpen?.(),300);
 }
 // VS AI (user: VS AI のルームに入った瞬間、右の一覧に AI と招待マーク / フレンド一覧と同じ見た目): the native
 // PEOPLE panel (#social) shows one native-styled row per AI; the invite button adds that AI to the room.
 // VS AI (user: 右上の人 / ベルのマーク、Tab でも出る PEOPLE と NOTIFICATIONS の一覧に AI と招待マーク): the
 // native sidebar (#social, opened by local-shell.js __qpSocialOpen) gets one native friend row per AI in
 // #social_relationships; the OFFLINE cover of the PEOPLE side is hidden while the VS AI room is open.
 function renderVsAi(){
  const list=document.getElementById('social_relationships');
  document.body.classList.toggle('qp-vsai-social',!!room?.vsai);
  if(!document.getElementById('qp-vsai-style')){const st=document.createElement('style');st.id='qp-vsai-style';st.textContent='body.qp-vsai-social #social .social_bar_content_offline,body.qp-vsai-social #social_top,body.qp-vsai-social #social_bottom,body.qp-vsai-social #social_dm,body.qp-vsai-social #social_relationships_tabs_pending{display:none!important}body.qp-vsai-social #social_people .social_bar_content,body.qp-vsai-social #social_notifications_content{display:block!important}body.qp-vsai-social #social_relationships>:not(.qp-vsai){display:none!important}body.qp-vsai-social #social_relationships .qp-vsai{--pri:#7df27d}body.qp-vsai-social #social_relationships .qp-vsai p{font-family:PFW,sans-serif}body.qp-vsai-social #social_relationships .qp-vsai.qp-in .social_relationship_button_invite{opacity:.35}body.qp-vsai-social #social_relationships .qp-vsai .social_relationship_button_invite{display:inline-flex!important}#qp-botpop{position:fixed;inset:0;z-index:10000000;background:#000a;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:HUN,sans-serif}#qp-botpop .b{width:min(940px,90vw);background:#2c4a2c;border:3px solid #3d6b3d;color:#c8f5c8;padding:14px 20px 22px}#qp-botpop .h{display:flex;align-items:center;justify-content:space-between}#qp-botpop .h b{font-size:44px;color:#c8f5c8;letter-spacing:1px}#qp-botpop .x{cursor:pointer;color:#8fc98f;font-size:26px}#qp-botpop .x:hover{color:#fff}#qp-botpop .c{background:#1e361e;margin-top:10px;padding:26px 30px;text-align:center}#qp-botpop .c h2{font-size:42px;margin:0 0 40px;color:#d8ffd8;font-weight:400}#qp-botpop .c p{font-size:22px;letter-spacing:2px;margin:0 0 18px}#qp-botpop .a{width:min(940px,90vw);background:#2c4a2c;border:3px solid #3d6b3d;margin-top:16px;padding:10px 22px;display:flex;gap:8px}#qp-botpop .a div{background:#3d6b3d;color:#c8f5c8;padding:8px 22px;font-size:24px;letter-spacing:2px;cursor:pointer;flex:auto;text-align:center}#qp-botpop .a div:hover{background:#4f8a4f;color:#fff}#qp-botpop .a div.off{opacity:.4;cursor:default;background:#3d6b3d;color:#c8f5c8}#qp-cfgtoast{position:fixed;right:10px;bottom:10px;z-index:10000001;background:#000d;border:1px solid #fff8;color:#fff;font-family:HUN,sans-serif;font-size:18px;letter-spacing:1px;padding:12px 60px 12px 16px;display:flex;gap:12px;align-items:center;transition:opacity .5s}#qp-cfgtoast span{font-size:26px}#qp-cfgtoast.out{opacity:0}body.qp-room-ingame:not(.noingamechat) #ingame_chat_container,body.qp-room-ingame.chatfocus #ingame_chat_container{opacity:1;transform:none;pointer-events:auto}';;document.head.appendChild(st)}
  list?.querySelectorAll('.qp-vsai').forEach(e=>e.remove());
  if(!room?.vsai||!list)return;
  for(const c of aiChoices()){const name=labelOf(c),inRoomNow=room.players.some(p=>p.bot&&p.username===name.toLowerCase());
   const n=document.createElement('div');n.className='social_relationship qp-vsai'+(inRoomNow?' qp-in':'');const img=document.createElement('img');img.className='social_relationship_img';img.src='/res/avatar.png';n.appendChild(img);
   const h1=document.createElement('h1'),sp=document.createElement('span');sp.textContent=name.toUpperCase();h1.appendChild(sp);n.appendChild(h1);
   const p=document.createElement('p'),pi=document.createElement('img');pi.src='/res/status/online.png';p.append(pi,' '+(inRoomNow?'In your room':'In Menus'));n.appendChild(p);n.appendChild(document.createElement('h2'));
   const holder=document.createElement('div');holder.className='social_relationship_button_holder';const b=document.createElement('div');b.title='Invite to your game';b.className='social_relationship_button social_relationship_button_invite';const bi=document.createElement('img');bi.src='/res/icon/invite.svg';b.append(bi,document.createElement('span'));
   b.addEventListener('click',ev=>{ev.stopPropagation();b.classList.add('activated');setTimeout(()=>b.classList.remove('activated'),300);try{addBot(c.name)}catch(error){sys(error.message)}});holder.appendChild(b);n.appendChild(holder);list.appendChild(n)}
 }
 // PLAYERS row click: a bot opens a native-looking BOT card whose KICK removes it; the own row opens nothing
 // (no profile popup offline).
 function botPopup(b){document.getElementById('qp-botpop')?.remove();const w=document.createElement('div');w.id='qp-botpop';
  w.innerHTML='<div class="b"><div class="h"><b></b><span class="x">CLOSE</span></div><div class="c"><h2>BOT</h2><p>THIS IS A LOCAL AI. IT RUNS ON THIS COMPUTER ONLY AND NEVER GOES ONLINE.</p><p>INVITE MORE FROM THE PEOPLE LIST (TAB OR THE BELL).</p></div></div><div class="a"><div data-k="kick">KICK</div><div data-k="kick">BAN</div><div data-m="1">'+(b.bracket==='player'?'MOVE TO SPECTATORS':'MOVE TO PLAYERS')+'</div><div class="off">TRANSFER OWNERSHIP</div></div>';
  w.querySelector('.h b').textContent=b.username.toUpperCase();const shut=()=>w.remove();
  w.addEventListener('click',ev=>{if(ev.target.closest('[data-m]')){setBracket(b,b.bracket==='player'?'spectator':'player');shut();return}const k=ev.target.closest('[data-k]');if(k){try{removeBot(b._id)}catch(error){sys(error.message)}shut()}else if(ev.target===w||ev.target.closest('.x'))shut()});document.body.appendChild(w)}
 document.addEventListener('click',ev=>{if(!room)return;const r=ev.target?.closest?.('#room_players .scroller_player');if(!r)return;ev.preventDefault();ev.stopImmediatePropagation();const b=room.players.find(p=>p.bot&&p._id===r.dataset.id);if(b)botPopup(b)},true);
 function close(){if(!room)return;document.body.classList.remove('qp-room-ingame');document.getElementById('qp-botpop')?.remove();clearTimeout(introTimer);room=null;renderVsAi();pendingReturn=false;try{window.LocalAIRoom?.stop?.()}catch{}fire('room.leave');hideIds();setTimeout(()=>{try{window.LocalNative?.view?.('play1p')}catch{}},50)}
 const backToLobby=()=>{if(!room)return;pendingReturn=false;room.state='lobby';const go=()=>{try{window.LocalNative?.resetResults?.();window.LocalNative?.view?.('lobby')}catch{}update()};go();setTimeout(go,60)};
 window.addEventListener('local-ai-match-end',ev=>{
  if(!room||!ev.detail?.result?.done)return;const w=ev.detail.winner;
  room.players.filter(p=>p.bracket==='player').forEach((p,i)=>{p.record.games++;if(i===w){p.record.wins++;p.record.streak++}else p.record.streak=0});
  pendingReturn=true;sys('game finished');sortPlayers();
 });
 const setBracket=(p,b)=>{p.bracket=b;fire('room.update.bracket',{uid:p._id,bracket:b});if(p._id===me().id)document.getElementById('roomview')?.classList.toggle('spectating',b==='spectator');update()};
 // PLAYERS order like online: most wins first (#sp_<id> containers are flex items).
 function sortPlayers(){if(!room)return;setTimeout(()=>{for(const p of room.players){const e=document.getElementById('sp_'+p._id);if(e)e.style.order=String(-(p.record.wins*1000+p.record.games))}},80)}
 // EXIT and PLAYING / SPECTATING: their native click wiring never reaches the local room (user: EXIT が使えない /
 // 左下の SPECTATING / PLAYING が使えない).
 document.addEventListener('click',ev=>{if(!room)return;const t=ev.target;if(t?.closest?.('#leaveroom')){ev.preventDefault();ev.stopImmediatePropagation();close();return}
  if(t?.closest?.('#room_switchbracket')){ev.preventDefault();ev.stopImmediatePropagation();const m=room.players.find(p=>p._id===me().id);if(m&&room.state==='lobby')setBracket(m,m.bracket==='player'?'spectator':'player')}},true);
 // In-game chat (user: プレイ中も左にログと入力欄 / 表示を出さない設定でも T で入力欄): T opens and focuses
 // #ingame_chat_input, Enter sends (commands too), Escape closes it again.
 document.addEventListener('keydown',ev=>{if(!room||room.state!=='ingame'&&room.state!=='intro')return;const inp=document.getElementById('ingame_chat_input'),box=document.getElementById('ingame_chat_container');if(!inp)return;
  if(ev.target===inp){if(ev.key==='Escape'){ev.preventDefault();inp.blur();document.body.classList.remove('qp-chat-typing');return}if(ev.key!=='Enter'||ev.isComposing)return;ev.preventDefault();ev.stopImmediatePropagation();const v=inp.value;inp.value='';inp.blur();document.body.classList.remove('qp-chat-typing');if(v.trim()&&!command(v))emit('room.chat.send',{content:v,pinned:false});return}
  if((ev.code==='KeyT'||ev.key==='t'||ev.key==='T')&&!ev.ctrlKey&&!ev.metaKey&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){ev.preventDefault();ev.stopImmediatePropagation();document.body.classList.add('qp-chat-typing');box?.classList.remove('hidden');setTimeout(()=>inp.focus())}},true);
 // Sidebar clock (user: PEOPLE 欄中央の時計が 0:00:00 のまま): wall clock and session time, offline only.
 if(location.protocol==='tetrio-local:'||window.__qpLocalOffline===true){const t0=Date.now();setInterval(()=>{const c=document.getElementById('social_top_clock');if(!c||document.getElementById('social')?.classList.contains('hidden'))return;const d=new Date(),h=d.getHours();let tn=[...c.childNodes].find(n=>n.nodeType===3);if(!tn){tn=document.createTextNode('');c.prepend(tn)}tn.nodeValue=((h%12)||12)+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+' ';const sp=c.querySelector('span');if(sp)sp.textContent=h>=12?'PM':'AM';const st=document.getElementById('social_top_sessiontime'),sec=Math.floor((Date.now()-t0)/1000);if(st)st.textContent=sec<60?sec+' seconds this session':sec<3600?Math.floor(sec/60)+' minutes this session':(sec/3600).toFixed(1)+' hours this session'},1000)}
 // BACK on the match results returns to the room (online: the room after the match).
 document.addEventListener('click',ev=>{if(!pendingReturn||!room)return;const b=ev.target?.closest?.('#back');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();backToLobby()},true);
 // The native chat Enter handler is in a startup callback the offline page does not run; while the
 // local room is open its own input sends here (commands, or a chat line through the native path).
 document.addEventListener('keydown',ev=>{if(!room||ev.target?.id!=='chat_input'||ev.isComposing||(ev.code!=='Enter'&&ev.code!=='NumpadEnter'&&ev.key!=='Enter'))return;ev.preventDefault();ev.stopImmediatePropagation();const v=ev.target.value;ev.target.value='';if(!v.trim())return;if(!command(v))emit('room.chat.send',{content:v,pinned:false})},true);
 window.__qpRoomEmit=emit;window.__qpRoomCmd=command;
 window.LocalCustomRoom={open,close,active:()=>!!room,room:()=>room,command,start};
})();
