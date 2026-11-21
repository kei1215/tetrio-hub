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
 const update=()=>{room.name_safe=room.name;hideIds();fire('room.update',structuredClone(room))};
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
  const short={ft:'match.ft',wb:'match.wb',gp:'match.gp',gamemode:'match.gamemode',name:'name',public:'public',limit:'userLimit',music:'gamebgm'};
  let path=short[key]||key;if(!path.includes('.')&&!(path in room))path='options.'+path;
  if(getPath(room,path)===undefined&&!(path.startsWith('options.')&&path.slice(8) in EXTRA))throw Error('知らない項目: '+key);
  setPath(room,path,path==='name'?String(value):num(value));persist();update();sys(path+' = '+getPath(room,path));
 }
 const HELP=['/bot list … 呼べる AI の一覧','/bot add <AI名> … AI を入れる(名前の一部でも可、省略で先頭)','/bot remove [名前] … AI を外す(省略で最後に入れた AI)','/set <項目> <値> … 設定を変える(ft wb gp name public limit music、ほか options の名前: g gincrease garbagecap spinbonuses b2bcharging など)','/start … 開始(START ボタンと同じ)','/help … この一覧'];
 function command(text){
  if(!room||!String(text).startsWith('/'))return false;
  const [cmd,...args]=String(text).trim().split(/\s+/);const c=cmd.toLowerCase();
  if(!['/bot','/set','/help','/start'].includes(c))return false;
  const m=room.players.find(p=>p._id===me().id);if(m)say(m,text);
  try{
   if(c==='/help')HELP.forEach(sys);
   else if(c==='/start')start();
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
  window.LocalAIRoom.start({left:sides[0],right:sides[1],engines,labels,mode:'custom',options,customRoom:true,firstTo:Math.max(1,Math.min(99,Math.round(Number(room.match.ft))||1))});
  room.state='ingame';
 }
 function emit(event,data){
  if(!room)return false;
  try{
   switch(event){
    case 'room.start':start();break;
    case 'room.setconfig':for(const {index,value} of data||[])setPath(room,index,index==='name'?String(value):num(value));persist();update();break;
    case 'room.chat.send':{const m=room.players.find(p=>p._id===me().id)||player(me().id,me().username,false,'player');say(m,data?.content??'');break}
    case 'room.bracket.switch':{const m=room.players.find(p=>p._id===me().id);if(m){m.bracket=data==='spectator'||m.bracket==='player'?'spectator':'player';fire('room.update.bracket',{uid:m._id,bracket:m.bracket})}break}
    case 'room.leave':close();break;
   }
  }catch(error){sys(error.message)}
  return true; // every room message stays local while the room is open
 }
 function open(config={}){
  if(typeof ribbon()?.qpFire!=='function')throw Error('カスタムルームにはパッチの再適用が必要です');
  cfg=config;room=makeRoom();botSeq=0;const m=me();
  try{window.__qpRoomOpts?.();window.LocalAIRoom?.installMute?.()}catch{}
  const sides=[config.left??'player',config.right??'ai'];
  room.players.push({...player(m.id,m.username,false,'player'),bracket:sides.includes('player')?'player':'spectator'});
  sides.forEach((s,i)=>{if(s==='player')return;const engine=config.engines?.[i]||null,c=aiChoices().find(x=>engine?x.engine===engine:x.side===s);const name=(config.labels?.[i]||(c&&labelOf(c))||'BOT').toLowerCase();room.players.push(player('bot-'+(++botSeq),name,true,s,engine))});
  fire('room.join',{id:room.id,banner:{content:'LOCAL CUSTOM ROOM(オフライン)。/help でコマンド一覧。',banner:true}});
  update();
 }
 function close(){if(!room)return;room=null;pendingReturn=false;try{window.LocalAIRoom?.stop?.()}catch{}fire('room.leave');hideIds();setTimeout(()=>{try{window.LocalNative?.view?.('play1p')}catch{}},50)}
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
