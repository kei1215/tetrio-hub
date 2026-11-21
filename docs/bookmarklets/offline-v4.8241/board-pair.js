(() => {
 // Keep the exact native QP DUO anchors.  The renderer then derives HOLD and
 // NEXT from each holder, so they stay joined to their own board for every
 // board size / Boardwise setting.  The old ±.5 override detached both HUDs.
 function fit(mode='duo'){
  // On TL, keep identical orientation on both boards; separate the two
  // complete HOLD / BOARD / NEXT units instead of swapping HUD sides.
  // v5.16 (user: AI対戦で盤面が小さい): full size like the native 1v1 (room spectating and the
  // TTRM replay both place the two boards at x -0.4 / 0.4, scale 1); was 0.88.
  return mode==='tl'?[{x:-.40,y:0,scale:1},{x:.40,y:0,scale:1}]:[{x:-.32,y:0,scale:1},{x:.32,y:0,scale:1}];
 }
 window.LocalBoardPair={fit,attach(games,settings={}){let stopped=false,pending=0;const timers=[];
  // Keep the two holders on their own left/right halves like live QP DUO.
  // Revive chains and prompts must not pull either board back toward the centre.
  function layout(animate=true){if(stopped||games.some(g=>!g.source.self.hm.H.holder?.parent))return;const plans=fit(settings.mode);games.forEach((game,index)=>{const plan=plans[index];game.location(plan.x,plan.y,plan.scale,animate)})}
  function request(){cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>layout(true))}
  const resize=()=>request();window.addEventListener('resize',resize);
  for(const delay of [0,100,500,1200])timers.push(setTimeout(()=>layout(delay!==0),delay));
  return()=>{stopped=true;cancelAnimationFrame(pending);for(const timer of timers)clearTimeout(timer);window.removeEventListener('resize',resize)}
 }};
})();
