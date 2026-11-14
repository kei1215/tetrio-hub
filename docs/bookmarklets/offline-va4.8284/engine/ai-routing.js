(function(root){
 function find(io,goal,allow180=true,cost,limits={}){
  const maxNodes=Math.max(32,Math.min(512,Math.floor(Number(limits.maxNodes)||160)));
  const maxDepth=Math.max(8,Math.min(32,Math.floor(Number(limits.maxDepth)||16)));
  const fast=!cost;cost=cost||(()=>1);
  const start=io.get(),delta=(goal.rotation-start.r+4)%4,sequences=[Array(delta).fill('rotateCW'),Array((4-delta)%4).fill('rotateCCW')];if(delta===2&&allow180)sequences.push(['rotate180']);sequences.sort((a,b)=>a.length-b.length);let best=null,bestCost=Infinity;
  const move=(path)=>{for(let i=0;i<12;i++){const f=io.get();if(f.x===goal.x)return true;const key=f.x<goal.x?'moveRight':'moveLeft';if(!io.apply(key))return false;path.push(key)}return false};
  for(const rotations of sequences)for(const first of [true,false]){io.set(start);const path=[];let valid=true;if(!first)valid=move(path);if(valid)for(const key of rotations){if(!io.apply(key)){valid=false;break}path.push(key)}if(valid)valid=move(path);const f=io.get();if(valid&&f.x===goal.x&&f.r===goal.rotation&&path.reduce((n,k)=>n+cost(k),0)<bestCost){best=path;bestCost=path.reduce((n,k)=>n+cost(k),0)}if(best&&(best.length===0||fast&&first&&rotations===sequences[0])){io.set(start);return best}}
  if(!best){const queue=[{state:start,path:[]}],seen=new Set();for(let index=0;index<queue.length&&index<maxNodes;index++){const {state,path}=queue[index],id=state.x+':'+state.y+':'+state.r;if(seen.has(id))continue;seen.add(id);if(state.x===goal.x&&state.r===goal.rotation){best=path;break}if(path.length>=maxDepth)continue;for(const key of ['moveLeft','moveRight','rotateCW','rotateCCW',...(allow180?['rotate180']:[])]){io.set(state);if(io.apply(key))queue.push({state:io.get(),path:[...path,key]})}}}
  io.set(start);return best;
 }
 const api={find};if(typeof module!=='undefined')module.exports=api;else root.LocalAIRouting=api;
})(typeof window==='undefined'?globalThis:window);
