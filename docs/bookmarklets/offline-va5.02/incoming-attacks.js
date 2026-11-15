(() => {
 let active=null,id=0;
 const api=window.LocalQPAttacks={
  start(game,config={}){
   api.stop();
   // 最初から10F相当 (2026-11-14): with no attack chosen it means the floor attack.
   if(config.floor10&&!['periodic','floor'].includes(config.attackMode))config={...config,attackMode:'floor'};
   if(!['periodic','floor'].includes(config.attackMode))return;
   const lines=Number(config.attackLines),seconds=Number(config.attackSeconds);
   if(!Number.isInteger(lines)||lines<1||!Number.isFinite(seconds)||seconds<.5||seconds>60)throw Error('攻撃は1段以上、間隔は0.5〜60秒で指定してください');
   game._localAttackConfig={mode:config.attackMode,lines,seconds};
   // Floor attack: the speed changes by itself too (2026-11-14) - higher floors come faster
   // (x1.2 at 1F .. x0.6 at 10F+), each wait drawn at random (x0.5-1.5) like real targeting.
   const floorOf=()=>config.floor10?Math.max(10,game.state.stats.zenith?.floor||1):(game.state.stats.zenith?.floor||1);
   const wait=()=>config.attackMode==='floor'?Math.max(30,Math.round(seconds*60*(1.2-.6*Math.min(1,(floorOf()-1)/9))*(.5+Math.random()))):Math.round(seconds*60);
   let next=game.getFrame()+wait();
   const tick=()=>{
    if(!game.isPlaying()||game.state.zenith?.incapacitated||game.getFrame()<next)return;
    next=game.getFrame()+wait();
    for(const target of [game,window.LocalTestQP?.getAlly()].filter(Boolean)){
     if(!target.isPlaying()||target.state.zenith?.incapacitated)continue;
     target.source.Push('ige',{id:'local-training-'+ ++id,type:'interaction',data:{type:'garbage',gameid:8000,username:'LOCAL TRAINING',amt:config.attackMode==='floor'?(lines+Math.max(0,(config.floor10?Math.max(10,target.state.stats.zenith.floor||1):(target.state.stats.zenith.floor||1))-1)):lines,zthalt:target.getZenithAltitude(),x:4.5,y:30}});
    }
   };
   // Floor-10 garbage (holes, delay, targeting) from the start: QP recomputes messiness every
   // frame (zthm.Update: change 2.5*e, inner e, e = 0.03 (expert 0.05) x floor).
   let unhook=null;
   if(config.floor10){const engine=game.source?.self,z=engine?.zthm,S=engine?.gsm;
    if(z&&S&&typeof z.Update==='function'){const own=Object.hasOwn(z,'Update'),orig=z.Update;
     z.Update=function(...args){const r=orig.apply(this,args);try{const o=S.setoptions,e=(o.zenith_expert?.05:.03)*10;
      o.messiness_change=Math.max(Number(o.messiness_change)||0,Math.min(1,2.5*e));o.messiness_inner=Math.max(Number(o.messiness_inner)||0,e);o.messiness_center=false;
      // 10F garbage timing too: delay before garbage goes live (garbagephase 165-15F / expert 66-6F),
      // targeting (garbagefavor 33-3F / expert -3F, messy -25) and no targeting grace.
      o.garbagephase=Math.min(Number(o.garbagephase)||999,o.zenith_expert?6:15);
      o.garbagefavor=Math.min(Number(o.garbagefavor)||0,(o.zenith_expert?0:33)-30-(o.zenith_messy?25:0));
      if(S.stats?.zenith)S.stats.zenith.targetinggrace=0}catch{}return r};
     unhook=()=>{if(own)z.Update=orig;else delete z.Update}}}
   active={game,unhook};game.on('frame','local-training-attacks',tick);game.on('end','local-training-stop',()=>api.stop());
  },
  stop(){if(!active)return;const {game,unhook}=active;active=null;try{unhook?.()}catch{}game.remove('frame','local-training-attacks');game.remove('end','local-training-stop')}
 };
})();
