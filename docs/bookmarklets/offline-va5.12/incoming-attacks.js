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
   game._localAttackConfig={mode:config.attackMode,lines,seconds,floor10:!!config.floor10,lull:config.attackLull!==false};
   // Floor attack: the speed changes by itself too (2026-11-14) - higher floors come faster
   // (x1.2 at 1F .. x0.6 at 10F+), each wait drawn at random (x0.5-1.5) like real targeting.
   const floorOf=()=>config.floor10?Math.max(10,game.state.stats.zenith?.floor||1):(game.state.stats.zenith?.floor||1);
   // v5.07 (user: 10F相当で本来火力が来ない時がある・最大30秒来ない・30秒はなかなか起きない様に): like real QP
   // targeting, sometimes nobody sends for a while: 6% of waits are stretched toward 30 s by r^4,
   // so the whole wait never passes 30 s and long ones are rare (per attack: over 10 s ~2%,
   // over 20 s ~0.7%, near 30 s ~0.1%).
   // v5.07 (user: 最大10秒に変更): 火力が来ない猶予は足して最大10秒、長いほど起きにくい
   const lull=()=>config.attackLull!==false&&Math.random()<.06?Math.round(10*60*Math.random()**4):0;
   const wait=()=>{if(config.attackMode!=='floor')return Math.round(seconds*60);const b=Math.min(30*60,Math.max(30,Math.round(seconds*60*(1.2-.6*Math.min(1,(floorOf()-1)/9))*(.5+Math.random()))));return b+lull()};
   let next=game.getFrame()+wait();
   const tick=()=>{
    if(!game.isPlaying()||game.state.zenith?.incapacitated||game.getFrame()<next)return;
    next=game.getFrame()+wait();
    for(const target of [game,window.LocalTestQP?.getAlly()].filter(Boolean)){
     if(!target.isPlaying()||target.state.zenith?.incapacitated)continue;
     target.source.Push('ige',{id:'local-training-'+ ++id,type:'interaction',data:{type:'garbage',gameid:8000,username:'LOCAL TRAINING',...floorDelay(target),amt:config.attackMode==='floor'?(lines+Math.max(0,(config.floor10?Math.max(10,target.state.stats.zenith.floor||1):(target.state.stats.zenith.floor||1))-1)):lines,zthalt:target.getZenithAltitude(),x:4.5,y:30}});
    }
   };
   // Floor-10 garbage from the start, kept replayable (2026-11-21, user: 穴バラは標準の messiness = messy の穴バラで):
   // the old per-frame zthm.Update hook (messiness / garbagefavor / garbagephase / targeting grace) lived only
   // in the live game, so every replay - native, MP4 - lost the scattered holes and the short delay.
   //  - holes: local-shell.js starts the run with the native zenith_messy flag (saved in the replay options;
   //    messiness 0.25+0.03/floor, no grace reduction, garbagefavor -25 - about floor 9-10 from 1F).
   //  - delay: the 10F garbagephase (15F, expert 6F, halved at cancel streak 25+) goes in the ige data
   //    itself (native AddPendingGarbage: delay = n.delay ?? garbagephase), so the replay carries it too.
   function floorDelay(target){
    if(!config.floor10)return {};
    const S=target.source?.self?.gsm;let d=S?.setoptions?.zenith_expert?6:15;
    if(Number(S?.cancelstreak)>=25&&!S?.setoptions?.zenith_volatile)d=Math.floor(d/2);
    return {delay:d};
   }
   const unhook=null;
   active={game,unhook};game.on('frame','local-training-attacks',tick);game.on('end','local-training-stop',()=>api.stop());
  },
  stop(){if(!active)return;const {game,unhook}=active;active=null;try{unhook?.()}catch{}game.remove('frame','local-training-attacks');game.remove('end','local-training-stop')}
 };
})();
