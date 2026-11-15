/* vA: separate native-verified learned spin templates from AI alternative
 * placements. Replay AI alternatives are analyzed read-only in a native
 * sandbox and shown as numbered future placements (up to visible horizon).
 * Neither suggestion is a claim of what the human player actually placed. */
(()=>{
 'use strict';
 let canvas,ctx,menu,caption,selector,lastGame=null,plans=[],lastUpdate=0,lastDraw=0,lastKey='',enabledBefore=false,forecast=null,lastForecastStep=0;
 const MAX=5;
 const replayActive=()=>{try{return !!window.LocalNative?.replayActive?.()}catch{return false}};
 const active=()=>{try{const v=localStorage.getItem('qp-ai-preview-mode');return v==='both'||v==='game'&&!replayActive()||v==='replay'&&replayActive()}catch{return false}};
 const played=g=>!!g&&Array.isArray(g.state?.board)&&(replayActive()||!!g.isPlaying?.()&&!g.state?.pause);
 const findGame=()=>{
  if(replayActive())return window.OriginalReplay?.game?.();
  const games=window.LocalAIRoom?.active?.()||[];
  return games.find(g=>!g._localAIProfileId&&!g._localLiveBot)||window.OriginalReplay?.game?.()||games[0]||null;
 };
 // The AI depth setting belongs to a BOT profile. Replay analysis must
 // explicitly read it: historically the replay Spin Plan never did.
 const profile=()=>{try{return window.LocalBotLearning?.getProfile?.(window.LocalAIManager?.selected?.())||null}catch{return null}};
 function horizon(game){
  const available=Math.max(0,Math.min(6,window.LocalAIInformation?.nextCount?.(game.options,profile()?.nextCount)??5));
  const requested=profile()?.lookaheadDepth??'visible';
  const wanted=requested==='visible'?1+available:Math.max(1,Math.min(7,Number(requested)||3));
  return Math.min(7,1+available,wanted);
 }
 function replayKey(game){const s=game.state||{};return [s.stats?.piecesplaced??0,s.falling?.type||'',s.hold||'',s.bag?.slice(0,6).join('')||'',s.board?.map(r=>r.map(c=>c==null?'.':'#').join('')).join('/')||''].join('|')}
 function disposeForecast(){try{forecast?.search?.dispose?.()}catch{}forecast=null}
 function ensureForecast(game){
  if(!replayActive()||!active()||!played(game)){disposeForecast();return}
  const key=replayKey(game),limit=horizon(game);
  if(forecast?.game===game&&forecast.key===key&&forecast.limit===limit)return;
  disposeForecast();
  forecast={game,key,limit,depth:0,best:null,done:false,error:'',search:null};
  try{
   if(!window.LocalCombatAI?.createSearch||!window.LocalNative?.createAISandbox||typeof game.ejectState!=='function')throw Error('リプレイ用のnative探索機能がありません');
   if(Number(game.options?.version)!==19)throw Error('TTRのエンジンバージョンが19ではありません');
   forecast.search=window.LocalCombatAI.createSearch(game,null,{realtime:true,maxDepth:limit});
  }catch(err){forecast.error=String(err?.message||err);forecast.done=true}
 }
 function advanceForecast(time){
  if(!forecast?.search||forecast.done||time-lastForecastStep<45)return;
  lastForecastStep=time;
  try{
   const result=forecast.search.step(24);if(result.best){forecast.best=result.best;forecast.depth=Math.max(forecast.depth,Number(result.best.depth)||1)}
   if(result.done){forecast.done=true;forecast.search=null}
  }catch(err){forecast.error=String(err?.message||err);forecast.done=true;try{forecast.search?.dispose?.()}catch{}forecast.search=null}
 }
 function forecastSteps(){
  const steps=[],seen=new Set();let p=forecast?.best;
  while(p&&steps.length<(forecast?.limit||0)&&!seen.has(p)){
   seen.add(p);if(!Array.isArray(p.cells)||p.cells.length!==4)break;
   steps.push({cells:p.cells,type:String(p.type||'?').toUpperCase(),spin:!!p.spin,clear:Number(p.features?.[0]||0)});
   p=p.nextPlan||p.next;
  }return steps;
 }
 const sourceRect=()=>{const source=document.querySelector('#pixi canvas')||document.querySelector('canvas:not(#qp-spin-canvas)');return source?.getBoundingClientRect()||null};
 function ensure(){
  if(!canvas){canvas=document.createElement('canvas');canvas.id='qp-spin-canvas';canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:10001;pointer-events:none;contain:layout paint';document.body.appendChild(canvas);ctx=canvas.getContext('2d',{alpha:true})}
  if(!menu){menu=document.createElement('div');menu.id='qp-spin-candidate-bar';menu.style.cssText='position:fixed;z-index:10002;display:none;align-items:center;gap:6px;background:rgba(11,16,24,.88);border:1px solid #7ddce3;border-radius:6px;color:#fff;font:11px system-ui;padding:4px 7px;max-width:min(740px,95vw);pointer-events:auto;box-shadow:0 3px 12px #0008';
   const label=document.createElement('span');label.textContent='SPIN PLAN';label.style.cssText='color:#ffcb74;font-weight:bold;white-space:nowrap';menu.appendChild(label);
   selector=document.createElement('select');selector.setAttribute('aria-label','Spin予測候補');selector.style.cssText='color:#fff;background:#15222d;border:1px solid #547b88;border-radius:4px;min-width:42px;max-width:80px;font:inherit';selector.addEventListener('change',()=>{lastKey=plans[Number(selector.value)]?.key||'';draw()});menu.appendChild(selector);
   caption=document.createElement('span');caption.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';menu.appendChild(caption);document.body.appendChild(menu);
  }
  return !!ctx;
 }
 function hide(){if(ctx&&canvas)ctx.clearRect(0,0,canvas.width,canvas.height);if(menu)menu.style.display='none'}
 function geometry(game){let geom=null;try{geom=window.LocalNative?.previewGeometry?.(game)}catch{}if(!geom)return null;
  const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1)),rect=sourceRect();
  const source=document.querySelector('#pixi canvas')||document.querySelector('canvas:not(#qp-spin-canvas)');
  const scale=rect&&source?.width?rect.width/(source.width/dpr):1;
  const px=(x,y)=>({x:(rect?.left||0)+scale*(geom.a.x+x*(geom.b.x-geom.a.x)+(y-geom.buffer)*(geom.c.x-geom.a.x)),y:(rect?.top||0)+scale*(geom.a.y+x*(geom.b.y-geom.a.y)+(y-geom.buffer)*(geom.c.y-geom.a.y))});
  const size=Math.hypot((geom.b.x-geom.a.x)*scale,(geom.b.y-geom.a.y)*scale);
  return {px,size,buffer:geom.buffer,top:px(0,geom.buffer)};
 }
 function drawShape(points,g,{fill,stroke,width=2,dash=[],alpha=1,tag=''}){
  if(!points?.length)return;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.strokeStyle=stroke;ctx.fillStyle=fill;
  for(const [x,y] of points){if(y<g.buffer)continue;const a=g.px(x,y),b=g.px(x+1,y),c=g.px(x+1,y+1),d=g.px(x,y+1);
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();if(fill)ctx.fill();ctx.stroke();}
  ctx.setLineDash([]);ctx.globalAlpha=1;
  if(tag){const p=points.find(([x,y])=>y>=g.buffer);if(p){const pt=g.px(p[0]+.5,p[1]+.5);ctx.font=`bold ${Math.max(10,Math.min(18,g.size*.8))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#101015';ctx.fillStyle='#fff';ctx.strokeText(tag,pt.x,pt.y);ctx.fillText(tag,pt.x,pt.y)}}
 }
 function draw(){
  if(!active()||!played(lastGame)||!ensure()){hide();return}
  const g=geometry(lastGame);if(!g){hide();return}
  const dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),w=Math.round(innerWidth*dpr),h=Math.round(innerHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);
  if(g.size<4||g.size>240){hide();return}
  menu.style.display='flex';menu.style.left=Math.max(6,Math.min(innerWidth-325,g.top.x))+'px';menu.style.top=Math.max(5,Math.min(innerHeight-36,g.top.y-32))+'px';
  // Human-learned Spin Plan and AI's forecast are independent layers.
  const steps=replayActive()?forecastSteps():[];
  const depth=forecast?.limit||0;
  const analysis=replayActive()?`｜AI別案 ${steps.length}/${depth}手${forecast?.done?'・探索終了':'・探索中'}${forecast?.error?'・'+forecast.error:''}`:'';
  if(!plans.length){selector.style.display='none';caption.textContent='検証済みSpin候補なし'+analysis}
  else {
  selector.style.display='inline';selector.replaceChildren();plans.slice(0,MAX).forEach((_,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1}/${plans.length}`;selector.appendChild(option)});
  let index=plans.findIndex(p=>p.key===lastKey);if(index<0)index=0;selector.value=String(index);
  const p=plans[index];lastKey=p.key;
  const noun=p.type.toUpperCase()+'-SPIN';
  const source=p.setup?p.setup.type.toUpperCase()+'('+p.setup.source+')':'完成済みの壁';
  const future=p.type.toUpperCase()+'('+p.finish?.source+'・回転検証済)';
  caption.textContent=`${source} → ${future}｜${noun} ${p.used||0}成功 / ${p.attempts||0}回転候補${replayActive()?'・別案':''}`+analysis;
  // Only one selected construction plan. Native cells never overlap filled stack.
  // Pale cyan: already-built wall, bright violet: missing roof/wall,
  // solid lime: actual straight-drop setup piece, amber dashed: later spin.
  drawShape(p.walls.filter(c=>lastGame.state.board[c[1]]?.[c[0]]!=null),g,{stroke:'#58bfff',fill:'rgba(55,147,210,.13)',alpha:.75,width:1.4});
  drawShape(p.roof.filter(c=>lastGame.state.board[c[1]]?.[c[0]]!=null),g,{stroke:'#e782ff',fill:'rgba(167,92,222,.12)',width:2});
  const pending=p.missing.filter(([x,y])=>!p.setup?.cells.some(([a,b])=>a===x&&b===y));
  drawShape(pending,g,{stroke:'#ff7af1',fill:'rgba(230,76,195,.08)',width:2,dash:[4,3]});
  if(p.setup)drawShape(p.setup.cells,g,{stroke:'#85f8aa',fill:'rgba(29,202,105,.32)',width:2.5,tag:p.setup.type.toUpperCase()});
  drawShape(p.final,g,{stroke:'#ffb452',fill:'rgba(255,168,56,.10)',width:2.3,dash:[5,3],tag:p.type.toUpperCase()});
  }
  // All reachable continuation steps that the native AI has *actually*
  // evaluated are drawn. A later step is not a simultaneous placement on
  // the current stack and may temporarily overlap a still-filled row.
  // Dashed numbering is intentionally distinct from verified Spin plans.
  const colors=['#89ddff','#b7a7ff','#8dffc7','#ffe18a','#ffacdd','#a4e5f6','#e9ff9f'];
  for(let i=steps.length-1;i>=0;i--){
   const step=steps[i];drawShape(step.cells,g,{
    stroke:colors[i%colors.length],fill:'',width:i===0?2.8:1.7,
    dash:i===0?[4,2]:[2,5],alpha:i===0?.98:Math.max(.27,.82-i*.08),
    tag:`${i+1}${step.type}${step.spin?'*':''}`});
  }
 }
 function scan(){
  if(!active()){disposeForecast();hide();return}
  const game=findGame();if(!played(game)){disposeForecast();hide();return}
  lastGame=game;
  ensureForecast(game);
  if(!replayActive()&&!game._localLiveBot&&!game._localAIProfileId)window.LocalSpinLibrary?.attach?.(game,'player');
  if(!window.LocalSpinLibrary){hide();return}
  const next=window.LocalSpinLibrary.opportunities(game,{replay:replayActive()});
  plans=next.filter(p=>p.verified===true);draw();
 }
 function loop(time){if(time-lastUpdate>135){lastUpdate=time;try{scan()}catch(e){hide();if(time-lastDraw>5000){console.warn('[QP spin preview]',e?.message||e);lastDraw=time}}}advanceForecast(time);if(replayActive()&&forecast&&time-lastDraw>140){lastDraw=time;draw()}requestAnimationFrame(loop)}
 // Accept BOT data for compatibility, but never render fake multi-ghost
 // predictions. This is deliberately a read-only observer of human plans.
 function set(game){if(game?.state?.board)lastGame=game}
 window.LocalAIPreview={set,refresh:scan,clear:hide,getCandidates:()=>plans.slice(),replayForecastStatus:()=>({active:!!forecast,limit:forecast?.limit??0,depth:forecast?.depth??0,shown:forecastSteps().length,done:forecast?.done??false,error:forecast?.error||''})};
 window.addEventListener('local-game-ended',()=>{disposeForecast();hide()});window.addEventListener('resize',draw);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(loop),{once:true});else requestAnimationFrame(loop);
})();
