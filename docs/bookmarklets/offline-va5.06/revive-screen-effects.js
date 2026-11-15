/* Offline QP mission screen effects v4.8233. */
(()=>{
 'use strict';
 const live=new WeakMap();
 const app=()=>window.OriginalReplay?.renderer?.();
 const holderOf=game=>game?.getHolderData?.()?.holder||game?.source?.self?.hm?.H?.holder||null;
 const extractor=renderer=>renderer?.extract||renderer?.plugins?.extract||null;
 function probe(game){const renderer=app()?.renderer,holder=holderOf(game);return {ready:!!(renderer&&holder&&typeof renderer.render==='function'&&typeof extractor(renderer)?.canvas==='function'),revision:'4.8233'}}
 function stop(game){
  const state=live.get(game);if(!state)return;live.delete(game);cancelAnimationFrame(state.raf);
  for(const [node,saved]of state.guards){if(node._destroyed)continue;if(node.render===saved.guard){if(saved.own)node.render=saved.render;else delete node.render}}
  state.texture?.destroy(true);window.removeEventListener('resize',state.onResize);state.root.remove();
 }
 function start(game,mode){
  stop(game);if(!['vertical','horizontal','quad','orbit'].includes(mode))throw Error('不明な画面効果です。');
  if(!probe(game).ready)throw Error('TETR.IO描画器のスナップショット機能を取得できませんでした。');
  const holder=holderOf(game),renderer=app().renderer,extract=extractor(renderer);
  const types=window.LocalNative?.screenCaptureTypes?.();
  if(!types?.RenderTexture||!types?.Matrix)throw Error('描画本体が4.8233に更新されていません。');
  const box=holder.getBounds(),rect={x:box.x,y:box.y,width:box.width,height:box.height};
  const inverse=new types.Matrix().copyFrom(holder.worldTransform).invert();
  const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>inverse.apply({x,y}));
  const geometry=window.LocalNative?.previewGeometry?.(game);
  if(!geometry)throw Error('プレーヤー盤面の分割位置を取得できませんでした。');
  // Board coordinates (0..W, 0..H), independent of the asymmetric HUD.
  const boardCentre=inverse.apply({x:geometry.a.x+(geometry.b.x-geometry.a.x)*geometry.width/2+(geometry.c.x-geometry.a.x)*geometry.height/2,y:geometry.a.y+(geometry.b.y-geometry.a.y)*geometry.width/2+(geometry.c.y-geometry.a.y)*geometry.height/2});
  const minX=Math.min(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y));
  const bounds={x:minX,y:minY,width:Math.max(...corners.map(p=>p.x))-minX,height:Math.max(...corners.map(p=>p.y))-minY};
  if(![bounds.width,bounds.height,rect.width,rect.height].every(v=>Number.isFinite(v)&&v>1))throw Error('盤面サイズを取得できませんでした。');
  const root=document.createElement('div');root.className='qp-mission-screen-effect';root.dataset.mode=mode;root.dataset.revision='4.8233';
  root.style.cssText='position:fixed;inset:0;z-index:70;pointer-events:none;overflow:hidden';
  root.style.perspective=Math.max(4000,window.innerWidth*4)+'px';root.style.perspectiveOrigin='50% 50%';document.body.append(root);
  const canvases=Array.from({length:mode==='orbit'?5:mode==='quad'?4:2},()=>{const canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;transform-origin:center;backface-visibility:visible;opacity:1';root.append(canvas);return canvas});
  const state={root,holder,guards:new Map(),capturing:false,texture:null,raf:0,source:null,last:-Infinity,started:null,onResize:()=>stop(game)};
  // Guard the native render call itself. Game updates may change renderable,
  // visibility, alpha or cache state; none may reveal the original board.
  function guard(node,primary=false){
   if(!node||node._destroyed||state.guards.has(node))return;
   const render=node.render,own=Object.prototype.hasOwnProperty.call(node,'render');
   if(typeof render!=='function')throw Error('盤面の描画関数を取得できませんでした。');
   const wrapped=function(...args){if(primary&&state.capturing)return render.apply(this,args)};
   state.guards.set(node,{render,own,guard:wrapped});node.render=wrapped;
  }
  function hidePartner(){
   const partner=game.source?.self?.zthm?.duoOtherSideGame||window.LocalTestQP?.getAlly?.();
   if(partner&&partner!==game)guard(holderOf(partner));
  }
  live.set(game,state);window.addEventListener('resize',state.onResize);
  function snapshot(){
   // Keep the live display tree in world coordinates. Inverse projection
   // removes holder bounce/rotation/scale without modifying any live node.
   holder.getBounds();
   if(!state.texture)state.texture=types.RenderTexture.create({width:Math.ceil(bounds.width),height:Math.ceil(bounds.height),resolution:renderer.resolution||1});
   const transform=new types.Matrix().copyFrom(holder.worldTransform).invert();
   transform.tx-=bounds.x;transform.ty-=bounds.y;
   state.capturing=true;
   try{renderer.render(holder,{renderTexture:state.texture,clear:true,transform,skipUpdateTransform:true});state.source=extract.canvas(state.texture)}
   finally{state.capturing=false}
  }
  function paint(canvas,source,sx,sy,sw,sh){
   if(canvas.width!==sw)canvas.width=sw;if(canvas.height!==sh)canvas.height=sh;
   const ctx=canvas.getContext('2d');ctx.clearRect(0,0,sw,sh);ctx.drawImage(source,sx,sy,sw,sh,0,0,sw,sh);
  }
  function draw(time){
   if(live.get(game)!==state)return;
   if(!game.isPlaying?.()||holderOf(game)!==holder||holder._destroyed){stop(game);return}
   try{
    hidePartner();snapshot();state.last=time;
    const source=state.source;
    if(mode==='vertical'||mode==='horizontal'||mode==='quad'){
     root.style.transformOrigin='50% 50%';root.style.transform=`rotateZ(${Number(game.getHolderData?.()?.holderstate?.br??game.source?.self?.hm?.H?.holderstate?.br)||0}deg)`;
     const fx=Math.max(.01,Math.min(.99,(boardCentre.x-bounds.x)/bounds.width));
     const fy=Math.max(.01,Math.min(.99,(boardCentre.y-bounds.y)/bounds.height));
     const splitX=Math.max(1,Math.min(source.width-1,Math.round(source.width*fx)));
     const splitY=Math.max(1,Math.min(source.height-1,Math.round(source.height*fy)));
     if(mode==='quad'){
      const crops=[[0,0,splitX,splitY],[splitX,0,source.width-splitX,splitY],[0,splitY,splitX,source.height-splitY],[splitX,splitY,source.width-splitX,source.height-splitY]];
      const gapX=rect.width*.035,gapY=rect.height*.018;
      for(let i=0;i<4;i++){
       const [sx,sy,sw,sh]=crops[i],width=rect.width*sw/source.width,height=rect.height*sh/source.height,canvas=canvases[i],col=i%2,row=i>1?1:0;
       paint(canvas,source,sx,sy,sw,sh);canvas.style.width=width+'px';canvas.style.height=height+'px';
       canvas.style.left=(window.innerWidth/2+(col?gapX/2:-gapX/2)+(col?0:-width))+'px';
       canvas.style.top=(window.innerHeight/2+(row?gapY/2:-gapY/2)+(row?0:-height))+'px';
       canvas.style.transform='none';canvas.style.zIndex=String(72+i);
      }
     }else{
      const horizontal=mode==='horizontal',split=horizontal?splitY:splitX;
      for(let i=0;i<2;i++){
       const sx=horizontal?0:i*split,sy=horizontal?i*split:0,sw=horizontal?source.width:(i?source.width-split:split),sh=horizontal?(i?source.height-split:split):source.height;
       const width=rect.width*sw/source.width,height=rect.height*sh/source.height,canvas=canvases[i];paint(canvas,source,sx,sy,sw,sh);
       canvas.style.width=width+'px';canvas.style.height=height+'px';
       canvas.style.left=(window.innerWidth/2-(boardCentre.x-bounds.x)/bounds.width*rect.width+sx/source.width*rect.width+(horizontal?0:(i?1:-1)*rect.width*.225))+'px';
       canvas.style.top=(window.innerHeight/2-(boardCentre.y-bounds.y)/bounds.height*rect.height+sy/source.height*rect.height+(horizontal?(i?1:-1)*rect.height*.11:0))+'px';
       canvas.style.transform='none';
      }
     }
    }else{
     if(state.started===null)state.started=time;
     const t=(time-state.started)/1000,cx=window.innerWidth/2,cy=window.innerHeight/2;
     const radiusX=window.innerWidth/2+rect.width*.35,radiusZ=Math.min(240,rect.width*.5);
     for(let i=0;i<canvases.length;i++){
      const canvas=canvases[i],angle=t*.25+i*Math.PI*2/canvases.length,z=Math.cos(angle)*radiusZ;
      paint(canvas,source,0,0,source.width,source.height);
      canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
      canvas.style.left=(cx-rect.width/2)+'px';canvas.style.top=(cy-rect.height/2)+'px';
      // Upright carousel around a vertical centre axis. At the far side the
      // back of the canvas faces the viewer; no roll or pitch is applied.
      canvas.style.transform=`translate3d(${Math.sin(angle)*radiusX}px,0px,${z}px) rotateY(${angle*180/Math.PI}deg)`;
      canvas.style.zIndex=String(Math.round(z+radiusZ));
     }
    }
   }catch(error){stop(game);window.LocalUIHealth?.fail?.('ミッション画面効果 4.8233',error);return}
   state.raf=requestAnimationFrame(draw);
  }
  try{guard(holder,true);hidePartner();state.raf=requestAnimationFrame(draw)}catch(error){stop(game);throw error}
  return ()=>stop(game);
 }
 window.LocalReviveScreenEffects={probe,start,stop,revision:'4.8233'};
})();
