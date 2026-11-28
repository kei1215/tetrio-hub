/* Local room controller.  It keeps the official room vocabulary (ROOM,
   MATCH, GAME and FT) but persists only on this device.  This object is also
   the single place that launches a local CUSTOM match from the AI manager. */
(() => {
 const KEY='qp-local-room-session-v2', validSide=v=>v==='player'||v==='ai'||(/^ai:[0-9a-f-]{8,80}$/i.test(String(v)));
 const defaults=()=>({schema:2,name:'LOCAL TETRA LEAGUE',room:{type:'private',userLimit:2},match:{gamemode:'versus',ft:2,wb:1,gp:0},options:{bagtype:'7-bag',spinbonuses:'all-mini+',combotable:'multiplier',allow180:1,kickset:'SRS+',allow_harddrop:1,display_next:1,display_hold:1,nextcount:5,boardwidth:10,boardheight:20},players:{left:'player',right:'ai'},scores:[0,0],round:0});
 const normalize=data=>{const d=defaults(),v={...d,...(data||{}),room:{...d.room,...(data?.room||{})},match:{...d.match,...(data?.match||{})},options:{...d.options,...(data?.options||{})},players:{...d.players,...(data?.players||{})}};v.match.ft=Math.max(1,Math.min(99,Number(v.match.ft)||2));v.scores=Array.isArray(data?.scores)?data.scores.map(n=>Math.max(0,Number(n)||0)).slice(0,2):[0,0];while(v.scores.length<2)v.scores.push(0);if(!validSide(v.players.left)||!validSide(v.players.right))throw Error('参加者設定が不正です');return v};
 const read=()=>{try{return normalize(JSON.parse(localStorage.getItem(KEY)||''))}catch{return defaults()}};
 const write=v=>{const clean=normalize(v);localStorage.setItem(KEY,JSON.stringify(clean));window.dispatchEvent(new CustomEvent('local-room-session',{detail:clean}));return clean};
 const reset=()=>write({...read(),scores:[0,0],round:0});
 const record=winner=>{const s=read();if(winner===0||winner===1)s.scores[winner]++;s.round++;const done=Math.max(...s.scores)>=s.match.ft;write(s);return {...s,done}};
 const exportJSON=()=>JSON.stringify(read(),null,2);
 const importJSON=text=>write(JSON.parse(text));
 window.LocalRoomUI={read,write,reset,record,exportJSON,importJSON};
})();
