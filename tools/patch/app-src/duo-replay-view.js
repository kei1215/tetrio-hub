/* qp-duo-replay-view-v1 (v4.8260): TETR.IO's own replay screen for a 2-player QP DUO .ttrm
 * (made with QP DUO REPLAYS → 2人の TTR を合成). Only when BOTH players have zenith_duo:
 *  - boards locked to the DUO sides (left = duoleft skin, right = duoright skin) at the live DUO
 *    positions (-0.32 / +0.32) instead of the TL replay positions (-0.35 / +0.45);
 *  - background = TETR.IO's tower floor pictures (the "minimal graphics" QP backgrounds), by altitude;
 *    the user's own background comes back when the replay screen closes.
 * Other replays (TL, rooms, solo) are not touched. Minified names are read from the client itself,
 * so a TETR.IO rebuild that renames them still works; if an anchor is missing the client is unchanged. */
function patchQPDuoReplayView(src){
 if(src.includes('/* qp-duo-replay-view-v1 */'))return src;
 // positions are kept for other replays (TETR.IO: -.35/.45; the patch's replay effects: -.4/.4)
 const play=/(\w+)\.setGame\((\w+)\[0\]\.options\),\1\.createGameHolder\(\),\1\.location\((-?[\d.]+),(-?[\d.]+),1,!0\),\1\.startGame\(\),\2\[1\]\.options\.nosound=!0,(\w+)\.setGame\(\2\[1\]\.options\),\5\.createGameHolder\(\),\5\.location\((-?[\d.]+),(-?[\d.]+),1,!0\),\5\.startGame\(\)/;
 const bgCls=/(\w+)\.GetApplicableBg\(/.exec(src), bgObj=/(\w+)\.setBackground\("\/res\/bg\/zenith\/1fa\.jpg"\)/.exec(src);
 const setter=/\{setBackground:\((\w+),(\w+)\)=>\{/;
 const m=play.exec(src), sm=setter.exec(src);
 if(!m||!bgCls||!bgObj||!sm){console.warn('[QP DUO replay view] anchors not found; client unchanged.');return src;}
 const [R,K,RX,RY,L,LX,LY]=[m[1],m[2],m[3],m[4],m[5],m[6],m[7]], ME=bgCls[1], VL=bgObj[1];
 const duo=`(${K}[0].options.zenith_duo&&${K}[1].options.zenith_duo)`;
 const to=`${R}.setGame(${K}[0].options),${R}.createGameHolder(),${duo}&&${R}.updateDuoSide("left",!0),${R}.location(${duo}?-.32:${RX},${RY},1,!0),${R}.startGame(),`+
  `${K}[1].options.nosound=!0,${L}.setGame(${K}[1].options),${L}.createGameHolder(),${duo}&&${L}.updateDuoSide("right",!0),${L}.location(${duo}?.32:${LX},${LY},1,!0),${L}.startGame(),`+
  `${duo}&&window.__qpDuoReplayBg&&window.__qpDuoReplayBg(${R},${L},function(a){return ${ME}.GetApplicableBg(a)},function(b,s){${VL}.setBackground(b,s)})`;
 let out=src.replace(play,to);
 // remember the background the user had (not the ones this view sets) so it can come back
 out=out.replace(setter,`{setBackground:(${sm[1]},${sm[2]})=>{window.__qpDuoBgLock||(window.__qpBgLast=[${sm[1]},${sm[2]}]);`);
 return ';('+installQPDuoReplayView.toString()+')(window);\n'+out+'\n/* qp-duo-replay-view-v1 */';
}
function installQPDuoReplayView(window){
 window.__qpDuoReplayBg=function(r,l,getBg,setBg){
  try{
   const last=window.__qpBgLast;let cur=null;
   const set=function(b,s){window.__qpDuoBgLock=true;try{setBg(b,s)}finally{window.__qpDuoBgLock=false}};
   const update=function(){
    const alt=Math.max(r.state?.stats?.zenith?.altitude||0,l.state?.stats?.zenith?.altitude||0),bg=getBg(alt);
    if(bg&&bg!==cur){cur=bg;set(bg)}
   };
   update();
   r.on('frame',function(f){if(f%30===0)update()});
   clearInterval(window.__qpDuoBgTimer);
   window.__qpDuoBgTimer=setInterval(function(){
    const view=document.getElementById('replay');
    if(view&&!view.classList.contains('hidden'))return;
    clearInterval(window.__qpDuoBgTimer);
    if(last)set(last[0],last[1]);
   },500);
  }catch(e){console.warn('[QP DUO replay view]',e)}
 };
}
