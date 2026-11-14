/* vA win gauge (2026-11-13): who is likely to win a 1v1 (local TL / CUSTOM,
   AI or player on either side), from both boards. Logistic model on the
   difference of simple board / state features; weights fitted on Node
   versus games (tools/ai-sim, TETRA LEAGUE rules, 4 PPS). The same features
   say how good a board is, so the gauge also checks the AI's terrain sense.
   side: {board: rows top-down (40 x 10, null = empty), incoming, b2b, combo, apm} */
(function(root){
 'use strict';
 const NAMES=['maxH','avgH','holes','bump','incoming','danger','b2b','combo','apm','tSlot'];
 // fitted weights (tools/ai-sim/win-gauge-fit.mjs, 88 Node versus games, held-out
 // accuracy 71% over all snapshots); positive = good for that side
 let W=[-0.1399,0.0381,-0.0056,-0.0348,-0.0628,-0.193,0.1843,-0.1142,-0.0279,-0.1051];
 function features(s){
  const b=s.board||[],H=b.length,w=b[0]?.length||10,heights=new Array(w).fill(0);let holes=0;
  for(let x=0;x<w;x++){let top=-1;for(let y=0;y<H;y++){const f=b[y][x]!==null&&b[y][x]!==undefined;if(f&&top<0){top=y;heights[x]=H-y}else if(!f&&top>=0)holes++}}
  let maxH=0,sum=0,bump=0;for(let x=0;x<w;x++){maxH=Math.max(maxH,heights[x]);sum+=heights[x];if(x)bump+=Math.abs(heights[x]-heights[x-1])}
  const inc=Math.max(0,Number(s.incoming)||0);
  // a T-slot (three corners, the middle reachable) near the surface: attack ready
  let tSlot=0;for(let x=1;x<w-1&&!tSlot;x++){const h=heights[x],l=heights[x-1],r=heights[x+1];if(h<l&&h<r&&Math.abs(l-r)===1&&Math.min(l,r)-h===1)tSlot=1}
  return [maxH,sum/w,holes,bump,inc,Math.max(0,maxH+inc-12),Math.min(20,Number(s.b2b)||0),Math.min(10,Number(s.combo)||0),Number(s.apm)||0,tSlot];
 }
 // P(side a wins)
 function predict(a,b){
  const fa=features(a),fb=features(b);let z=0;for(let i=0;i<W.length;i++)z+=W[i]*(fa[i]-fb[i]);
  return 1/(1+Math.exp(-z));
 }
 const api={NAMES,features,predict,get weights(){return W.slice()},setWeights(v){if(Array.isArray(v)&&v.length===W.length)W=v.slice()}};
 if(typeof module!=='undefined'){module.exports=api;return}
 root.LocalWinGauge=api;
 /* The bar: top centre of the screen during a local TL / CUSTOM match (AI vs
    AI or player vs AI), left side's share in its colour. Smoothed so one
    piece does not swing it; hidden when the match ends. */
 const sideOf=game=>{const st=game.state,frame=Math.max(600,Number(game.getFrame?.())||0);
  const inc=Math.min(40,(st.impendingdamage||[]).reduce((n,d)=>n+(d.active===false?0:Math.max(0,d.amt||0)),0)+(st.garbageareentries||[]).length);
  return {board:st.board,incoming:inc,b2b:Math.max(0,st.stats?.btb||0),combo:Math.max(0,st.stats?.combo||0),apm:(Number(st.stats?.garbage?.attack)||0)/frame*3600}};
 let bar=null,raf=0,shown=.5;
 const enabled=()=>{try{return localStorage.getItem('qp-win-gauge')!=='false'}catch{return true}};
 function ensureBar(names){
  if(!bar){bar=document.createElement('div');bar.id='local-win-gauge';
   bar.style.cssText='position:fixed;top:6px;left:50%;transform:translateX(-50%);width:min(560px,70vw);z-index:2147483646;font:600 13px/1 system-ui,sans-serif;color:#fff;pointer-events:none;text-shadow:0 1px 2px #000';
   bar.innerHTML='<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span data-l></span><span data-t style="opacity:.8">勝率予測</span><span data-r></span></div><div style="height:12px;border-radius:6px;background:#d2475a;overflow:hidden;border:1px solid #0008"><div data-f style="height:100%;width:50%;background:#3d8bff;transition:width .25s"></div></div>';
   document.body.appendChild(bar)}
  bar.dataset.names=JSON.stringify(names||[]);bar.hidden=false;return bar}
 function draw(p,names){const b=ensureBar(names);shown+=(p-shown)*.15;const pct=Math.round(shown*100);
  b.querySelector('[data-f]').style.width=pct+'%';b.querySelector('[data-l]').textContent=(names?.[0]||'LEFT')+' '+pct+'%';b.querySelector('[data-r]').textContent=(100-pct)+'% '+(names?.[1]||'RIGHT')}
 function watch(games,names){
  cancelAnimationFrame(raf);shown=.5;let n=0,started=false;
  const loop=()=>{
   const playing=games.every(g=>{try{return g.isPlaying()}catch{return false}});
   // countdown: wait (up to 15 s); after the round: hide and stop
   if(!playing){if(started){if(bar)bar.hidden=true;return}if(n++<60*15)raf=requestAnimationFrame(loop);return}
   started=true;
   // Tab panel switch (qp-ai-options.js): off hides the bar at once
   if(!enabled()){if(bar)bar.hidden=true;n++;raf=requestAnimationFrame(loop);return}
   if(n++%6===0){try{draw(predict(sideOf(games[0]),sideOf(games[1])),names)}catch(error){}}
   raf=requestAnimationFrame(loop)};
  raf=requestAnimationFrame(loop)}
 root.addEventListener?.('local-ai-match-start',e=>{const d=e.detail||{};if(d.games?.length===2)watch(d.games,d.names)});
 api.watch=watch;
})(typeof window==='undefined'?globalThis:window);
