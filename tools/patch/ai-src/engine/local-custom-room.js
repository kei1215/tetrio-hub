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
  {k:'intro',label:'PRE-MATCH INTRO',title:'TETRA LEAGUE style intro before the match (records instead of TR)',type:'bool',key:'qp-local-room-intro',def:false},
  {k:'pps',label:'BOT TARGET PPS',title:'Pieces per second of the BOTs (shared with the Tab panel)',type:'num',key:'qp-local-bot-pps',def:2,min:.1,max:20},
  {k:'gravity',label:'BOT GRAVITY',title:'NORMAL / OFF FOR BOTS / OFF FOR BOTH',type:'pick',key:'qp-ai-no-gravity',def:'off',items:[['off','NORMAL'],['bot','OFF FOR BOTS'],['both','OFF FOR BOTH']]},
  {k:'power',label:'AI COMPUTE POWER',title:'Planning effort of the vA AI',type:'pick',key:'qp-ai-power',def:'auto',items:[['auto','AUTO'],['low','LOW'],['mid','MID'],['high','HIGH'],['max','MAX']]},
  {k:'tspin',label:'AI T-SPIN B2B',title:'vA AI keeps B2B with T-spins',type:'bool',key:'qp-local-ai-tspin-b2b',def:true,off:'false'},
  {k:'mute',label:'MUTE ROOM SOUNDS',title:'Mission shout, countdown, join / leave, chat and lobby music',type:'bool',key:'qp-local-room-mute',def:false},
  {k:'split',label:'SEPARATE PIECE ORDER',title:'Each board gets its own seed (off = same queue like TETRA LEAGUE)',type:'bool',key:'qp-local-ai-seed-split',def:false}];
 const readSetting=s=>{const v=localStorage.getItem(s.key);if(v===null)return s.def;if(s.type==='bool')return s.off?v!==s.off:v==='1';if(s.type==='num'){const n=Number(v);return Number.isFinite(n)?n:s.def}return s.items.some(i=>i[0]===v)?v:s.def};
 const writeSetting=(s,value)=>{let v=value;if(s.type==='bool'){const on=v===true||/^(1|true|on|yes)$/i.test(String(v));localStorage.setItem(s.key,s.off?(on?'true':s.off):(on?'1':'0'))}else if(s.type==='num'){const n=Math.max(s.min,Math.min(s.max,Number(v)));if(!Number.isFinite(n))throw Error(s.label+': 数で指定');localStorage.setItem(s.key,String(n))}else{const it=s.items.find(i=>i[0]===String(v).toLowerCase()||i[1]===String(v).toUpperCase());if(!it)throw Error(s.label+': '+s.items.map(i=>i[0]).join(' / '));localStorage.setItem(s.key,it[0])}window.dispatchEvent(new CustomEvent('qp-ai-settings-changed',{detail:{key:s.key}}))};
 const qpValues=()=>Object.fromEntries(SETTINGS.map(s=>{const v=readSetting(s);return [s.k,s.type==='pick'?s.items.find(i=>i[0]===v)[1]:v]}));
 function injectRows(){
  const host=document.getElementById('room_content_room');if(!host||document.getElementById('qp-room-ai-block'))return;
  const block=document.createElement('div');block.className='scroller_block light';block.id='qp-room-ai-block';const h=document.createElement('h2');h.className='ns';h.textContent='LOCAL AI';block.appendChild(h);
  for(const s of SETTINGS){const row=document.createElement('div');row.className='room_config_row flex-row imp';row.title=s.title;const lab=document.createElement('div');lab.className='room_config_label flex-item ns';lab.textContent=s.label.toLowerCase();row.appendChild(lab);let item;
   if(s.type==='bool'){const sw=document.createElement('label');sw.className='rc_switch flex-item';item=document.createElement('input');item.type='checkbox';item.className='room_config_item';const knob=document.createElement('span');knob.className='rc_switch_knob';sw.append(item,knob);row.appendChild(sw);item.addEventListener('change',ev=>{ev.stopImmediatePropagation();apply(s,item.checked)},true)}
   else if(s.type==='num'){item=document.createElement('input');item.type='number';item.className='room_config_item flex-item';item.min=s.min;item.max=s.max;item.step='0.1';row.appendChild(item);item.addEventListener('change',ev=>{ev.stopImmediatePropagation();apply(s,item.value)},true)}
   else{item=document.createElement('div');item.className='room_config_item room_config_spinner flex-item ns';row.appendChild(item);item.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();const cur=readSetting(s),i=s.items.findIndex(x=>x[0]===cur);apply(s,s.items[(i+1)%s.items.length][0])},true)}
   item.dataset.index='qp.'+s.k;block.appendChild(row)}
  host.insertBefore(block,host.querySelector('.scroller_block'));
 }
 function apply(s,value){try{writeSetting(s,value);if(room){update();sys(s.label+' = '+qpValues()[s.k])}}catch(error){sys(error.message)}}
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
 const update=()=>{room.name_safe=room.name;room.qp=qpValues();hideIds();fire('room.update',structuredClone(room));renderVsAi()};
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
  const q=String(name||'').trim().toLowerCase();const bots=room.players.filter(p=>p.bot);const b=q?bots.find(p=>p.username===q)||bots.find(p=>p.username.includes(q)):bots.at(-1);
  if(!b)throw Error('外す BOT がいません');room.players=room.players.filter(p=>p!==b);fire('room.player.remove',b._id);update();sys(b.username.toUpperCase()+' を外しました');
 }
 function setOption(key,value){
  if(!key||value===undefined)throw Error('使い方: /set <項目> <値>(例: /set ft 7、/set g 0.02、/set public on)');
  const qs=SETTINGS.find(s=>s.k===key.toLowerCase()||s.label.toLowerCase().replace(/[^a-z0-9]/g,'')===key.toLowerCase().replace(/[^a-z0-9]/g,''));if(qs){writeSetting(qs,value);update();sys(qs.label+' = '+qpValues()[qs.k]);return}
  const short={ft:'match.ft',wb:'match.wb',gp:'match.gp',gamemode:'match.gamemode',name:'name',public:'public',limit:'userLimit',music:'gamebgm'};
  let path=short[key]||key;if(!path.includes('.')&&!(path in room))path='options.'+path;
  if(getPath(room,path)===undefined&&!(path.startsWith('options.')&&path.slice(8) in EXTRA))throw Error('知らない項目: '+key);
  setPath(room,path,path==='name'?String(value):num(value));persist();update();sys(path+' = '+getPath(room,path));
 }
 const HELP=['/bot list … 呼べる AI の一覧','/bot add <AI名> … AI を入れる(名前の一部でも可、省略で先頭)','/bot remove [名前] … AI を外す(省略で最後に入れた AI)','/set <項目> <値> … 設定を変える(ft wb gp name public limit music、ほか options の名前: g gincrease garbagecap spinbonuses b2bcharging など)','/set intro on|off … PRE-MATCH INTRO(ほか pps gravity power tspin mute split: ルーム設定の LOCAL AI)','/start … 開始(START ボタンと同じ)','/abort … 試合を止めてルームに戻る','/vsai … AI の招待一覧(右の PEOPLE)を出す / しまう','/help … この一覧'];
 function command(text){
  if(!room||!String(text).startsWith('/'))return false;
  const [cmd,...args]=String(text).trim().split(/\s+/);const c=cmd.toLowerCase();
  if(!['/bot','/set','/help','/start','/abort','/vsai'].includes(c))return false;
  const m=room.players.find(p=>p._id===me().id);if(m)say(m,text);
  try{
   if(c==='/help')HELP.forEach(sys);
   else if(c==='/start')start();
   else if(c==='/abort')abort();
   else if(c==='/vsai'){room.vsai=!room.vsai;renderVsAi();sys(room.vsai?'VS AI: 右の一覧の招待マークで AI を呼べます':'VS AI の一覧をしまいました')}
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
  const go=()=>{if(!room||room.state!=='intro')return;window.LocalAIRoom.start({left:sides[0],right:sides[1],engines,labels,mode:'custom',options,customRoom:true,firstTo:Math.max(1,Math.min(99,Math.round(Number(room.match.ft))||1))});room.state='ingame'};
  room.state='intro';
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
    case 'room.setconfig':for(const {index,value} of data||[]){const s=String(index).startsWith('qp.')&&SETTINGS.find(x=>'qp.'+x.k===index);if(s){writeSetting(s,s.type==='pick'?(s.items.find(i=>i[1]===value)?.[0]??value):value);continue}setPath(room,index,index==='name'?String(value):num(value))}persist();update();break;
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
 }
 // VS AI (user: VS AI のルームに入った瞬間、右の一覧に AI と招待マーク / フレンド一覧と同じ見た目): the native
 // PEOPLE panel (#social) shows one native-styled row per AI; the invite button adds that AI to the room.
 let socialSnap=null;
 function renderVsAi(){
  const social=document.getElementById('social'),list=document.getElementById('social_relationships');if(!social||!list)return;
  if(!room?.vsai){if(socialSnap){list.querySelectorAll('.qp-vsai').forEach(e=>e.remove());[...list.children].forEach(e=>e.style.display='');social.className=socialSnap;socialSnap=null}return}
  if(socialSnap===null)socialSnap=social.className;social.classList.remove('hidden','hiding');
  [...list.children].forEach(e=>{if(!e.classList.contains('qp-vsai'))e.style.display='none'});list.querySelectorAll('.qp-vsai').forEach(e=>e.remove());
  for(const c of aiChoices()){const name=labelOf(c),inRoomNow=room.players.some(p=>p.bot&&p.username===name.toLowerCase());
   const n=document.createElement('div');n.className='social_relationship qp-vsai';const img=document.createElement('img');img.className='social_relationship_img';img.src='/res/avatar.png';img.onerror=()=>{img.style.visibility='hidden'};n.appendChild(img);
   const h1=document.createElement('h1'),sp=document.createElement('span');sp.textContent=name.toUpperCase();h1.appendChild(sp);n.appendChild(h1);const p=document.createElement('p');p.textContent=inRoomNow?'IN YOUR ROOM':'BOT';n.appendChild(p);const h2=document.createElement('h2');h2.textContent='VS AI';n.appendChild(h2);
   const holder=document.createElement('div');holder.className='social_relationship_button_holder';const b=document.createElement('div');b.title='Invite to your game';b.className='social_relationship_button social_relationship_button_invite';const bi=document.createElement('img');bi.src='/res/icon/invite.svg';b.appendChild(bi);b.style.display='inline-block';
   b.addEventListener('click',ev=>{ev.stopPropagation();b.classList.add('activated');setTimeout(()=>b.classList.remove('activated'),300);try{addBot(c.name)}catch(error){sys(error.message)}});holder.appendChild(b);n.appendChild(holder);list.appendChild(n)}
 }
 function close(){if(!room)return;clearTimeout(introTimer);room=null;renderVsAi();pendingReturn=false;try{window.LocalAIRoom?.stop?.()}catch{}fire('room.leave');hideIds();setTimeout(()=>{try{window.LocalNative?.view?.('play1p')}catch{}},50)}
 const backToLobby=()=>{if(!room)return;pendingReturn=false;room.state='lobby';const go=()=>{try{window.LocalNative?.resetResults?.();window.LocalNative?.view?.('lobby')}catch{}update()};go();setTimeout(go,60)};
 window.addEventListener('local-ai-match-end',ev=>{
  if(!room||!ev.detail?.result?.done)return;const w=ev.detail.winner;
  room.players.filter(p=>p.bracket==='player').forEach((p,i)=>{p.record.games++;if(i===w){p.record.wins++;p.record.streak++}else p.record.streak=0});
  pendingReturn=true;
 });
 // BACK on the match results returns to the room (online: the room after the match).
 document.addEventListener('click',ev=>{if(!pendingReturn||!room)return;const b=ev.target?.closest?.('#back');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();backToLobby()},true);
 // The native chat Enter handler is in a startup callback the offline page does not run; while the
 // local room is open its own input sends here (commands, or a chat line through the native path).
 document.addEventListener('keydown',ev=>{if(!room||ev.target?.id!=='chat_input'||ev.isComposing||(ev.code!=='Enter'&&ev.code!=='NumpadEnter'&&ev.key!=='Enter'))return;ev.preventDefault();ev.stopImmediatePropagation();const v=ev.target.value;ev.target.value='';if(!v.trim())return;if(!command(v))emit('room.chat.send',{content:v,pinned:false})},true);
 window.__qpRoomEmit=emit;window.__qpRoomCmd=command;
 window.LocalCustomRoom={open,close,active:()=>!!room,room:()=>room,command,start};
})();
