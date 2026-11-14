(function(root){
 const Policy=typeof module!=='undefined'?require('./ai-policy-model.js'):root.LocalAIModel;
 const RL=typeof module!=='undefined'?require('./reinforcement-core.js'):root.LocalRLCore;
 const Behavior=typeof module!=='undefined'?require('./ai-behavior.js'):root.LocalAIBehavior;
 const FEATURES=['lines','holes','heightSum','bumpiness','peakHeight'];
 const BASE=[12,-11,-.6,-.8,-1.5],LIMITS=[[0,40],[-30,-.1],[-4,-.01],[-4,0],[-8,-.05]];
 const COMBAT=[8,-11,-.55,-.85,-1.6,4,5,6,3,1.1,1.5,3,1.2,1,-2.5,0,2,0];
 const BOUNDS=[[0,12],[-30,-4],[-4,-.05],[-4,0],[-8,-.5],[4,15],[4,15],[0,20],[0,15],[0,6],[0,10],[0,12],[0,8],[0,8],[-12,0],[-4,4],[0,12],[-4,4]];
 const canonicalMode=mode=>mode==='tl'?'qp':mode;
 function create(storage,mode='qp'){
  mode=canonicalMode(mode);
  if(!['qp','qp-mod','40l','blitz'].includes(mode))throw Error('学習モードが不正です');
  const backend=storage;storage={getItem:key=>backend.getItem(mode==='qp'?key:key+':'+mode),setItem:(key,value)=>backend.setItem(mode==='qp'?key:key+':'+mode,value)};
  const key='qp-local-bot-learning-v1',fresh=()=>({format:'tetrio-local-learning-test',schema:2,model:'native-combat-vAI',client:'9628c0bbd',engineOptionsVersion:19,test:true,mode,features:FEATURES.slice(),weights:BASE.slice(),combatWeights:COMBAT.slice(),placements:0,updates:0,penalties:0,rewards:0,comparisons:0,chainFocus:false,trainingRevision:3,lastTraining:null,policy:null,rl:RL.fresh(),behavior:Behavior.fresh()});
  function validate(value){
   // v4.8249: AIs are not split by mode; data learned in any mode fits.
   if(value?.schema===2&&canonicalMode(value.mode)!==mode)value.mode=mode;
   const legacy=value?.schema===1&&value.model==='linear-placement-v1';
   
   if(!value||value.format!=='tetrio-local-learning-test'||(!legacy&&(value.schema!==2||value.model!=='native-combat-vAI'||value.client!=='9628c0bbd'))||value.engineOptionsVersion!==19||JSON.stringify(value.features)!==JSON.stringify(FEATURES))throw Error('対応しない学習データです（vAI・現バージョン専用）');
   if(!Array.isArray(value.weights)||value.weights.length!==5||value.weights.some((w,i)=>!Number.isFinite(w)||w<LIMITS[i][0]||w>LIMITS[i][1]))throw Error('学習の評価値が不正です');
   const result=fresh();result.chainFocus=value.chainFocus===true;result.weights=value.weights.slice();for(const name of ['placements','updates','penalties']){if(!Number.isSafeInteger(value[name])||value[name]<0||value[name]>1e9)throw Error('学習件数が不正です');result[name]=value[name]}
   if(!legacy){if(!Array.isArray(value.combatWeights)||value.combatWeights.length!==18||value.combatWeights.some((v,i)=>!Number.isFinite(v)||v<[-30,-30,-4,-4,-8,0,0,0,0,0,0,0,0,0,-12,-4,0,-4][i]||v>[40,0,0,0,0,15,15,20,15,6,10,12,8,8,0,4,12,4][i]))throw Error('火力学習の評価値が不正です');result.combatWeights=value.combatWeights.map((v,i)=>Math.max(BOUNDS[i][0],Math.min(BOUNDS[i][1],v)));if(!Number.isSafeInteger(value.rewards)||value.rewards<0||value.rewards>1e9)throw Error('学習報酬件数が不正です');result.rewards=value.rewards}
   result.comparisons=Number.isSafeInteger(value.comparisons)&&value.comparisons>=0&&value.comparisons<=1e9?value.comparisons:0;
   result.trainingRevision=value.trainingRevision===3?3:0;result.policy=Policy.validate(value.policy);
   if(['ranked-native-v1','ranked-native-v2'].includes(value.lastTraining?.method)){const report={method:value.lastTraining.method};for(const key of ['trainSamples','validationSamples','trainBefore','trainAfter','validationBefore','validationAfter','covered','considered']){const n=value.lastTraining[key];if(!Number.isFinite(n)||n<0||n>1e9)throw Error('学習診断が不正です');report[key]=n}result.lastTraining=report}
   result.rl=RL.validate(value.rl);result.behavior=Behavior.validate(value.behavior);return result;
  }
  let state=fresh(),enabled=storage.getItem(key+'-enabled')==='true',dirty=0;
  const raw=storage.getItem(key);if(raw)state=validate(JSON.parse(raw));
  const flush=()=>{if(dirty){storage.setItem(key,JSON.stringify(state));dirty=0}};
  function score(features,weights=state.weights){return features.reduce((sum,value,i)=>sum+value*weights[i],0)}
  function update(chosen,alternative,negative){
   if(![chosen,alternative].every(v=>Array.isArray(v)&&v.length===5&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=10000)))throw Error('学習用の盤面特徴が不正です');
   state.placements+=negative?0:1;state.penalties+=negative?1:0;
   const diff=chosen.map((v,i)=>(v-alternative[i])*(negative?-1:1)),norm=1+diff.reduce((n,v)=>n+v*v,0),margin=.5-score(diff);
   if(margin>0&&diff.some(Boolean)){const step=Math.min(.2,margin/norm);state.weights=state.weights.map((w,i)=>Math.max(LIMITS[i][0],Math.min(LIMITS[i][1],w+step*diff[i])));const previous=state.combatWeights.slice();state.combatWeights=state.combatWeights.map((w,i)=>i<5?Math.max(BOUNDS[i][0],Math.min(BOUNDS[i][1],w+step*diff[i])):w);if(state.combatWeights.some((v,i)=>Math.abs(v-previous[i])>1e-10))state.updates++}
   dirty++;if(dirty>=8)flush();return state.updates;
  }
  return {enabled:()=>enabled,setEnabled(value){enabled=!!value;storage.setItem(key+'-enabled',String(enabled))},snapshot:()=>JSON.parse(JSON.stringify(state)),weights:()=>state.weights.slice(),combatWeights:()=>state.combatWeights.slice(),policy:()=>state.policy?Policy.validate(state.policy):null,setPolicy(policy){state.policy=Policy.compact(policy);dirty++},score,observe:(chosen,best)=>update(chosen,best,false),penalize:(chosen,best)=>update(chosen,best,true),flush,
   behavior:()=>Behavior.validate(state.behavior),recordInputEvents(events){Behavior.observeEvents(state.behavior,events);dirty++},recordBehavior(before,after,options){Behavior.record(state.behavior,before,after,options);dirty++},
   reinforcement:()=>RL.validate(state.rl),setReinforcement(value){state.rl=RL.validate(value);dirty++},
   recordReinforcementReward(changed,reward){if(!Number.isFinite(reward))throw Error('報酬が不正です');if(Math.abs(reward)>1e-8)state.rewards++;if(changed)state.updates++;dirty++},
   recordPolicyTraining(count){if(!Number.isSafeInteger(count)||count<0||count>1e7)throw Error('更新件数が不正です');state.comparisons+=count;state.updates+=count;state.trainingRevision=3;dirty++},
   recordPlacement(){state.placements++;dirty++},
   preference(chosen,alternatives,rate=1){
    if(!Array.isArray(chosen)||chosen.length!==18||chosen.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||!Array.isArray(alternatives))throw Error('比較学習データが不正です');
    let changed=false;const scales=[4,4,30,15,15,8,8,1,4,12,12,4,4,8,20,1,1,1];
    for(const other of alternatives){if(!Array.isArray(other)||other.length!==18||other.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error('比較候補が不正です');const d=chosen.map((v,i)=>v-other[i]);if(!d.some(v=>Math.abs(v)>1e-8))continue;state.comparisons++;
     const margin=1-d.reduce((n,v,i)=>n+v*state.combatWeights[i],0);if(margin<=0)continue;
     const denom=.01+d.reduce((n,v,i)=>n+v*v/(scales[i]*scales[i]),0),step=Math.min(4,margin/denom)*Math.max(0,Math.min(1,rate));
     const next=state.combatWeights.map((w,i)=>Math.max(BOUNDS[i][0],Math.min(BOUNDS[i][1],w+step*d[i]/(scales[i]*scales[i]))));
     if(next.some((v,i)=>Math.abs(v-state.combatWeights[i])>1e-10)){state.combatWeights=next;state.updates++;changed=true}
    }if(changed){state.trainingRevision=3;dirty++}return changed;
   },
   imitate(chosen,alternative){return this.preference(chosen,[alternative],.25)},
   setCombatWeights(weights){if(!Array.isArray(weights)||weights.length!==18||weights.some((v,i)=>!Number.isFinite(v)||v<BOUNDS[i][0]||v>BOUNDS[i][1]))throw Error('評価値が不正です');state.combatWeights=weights.slice();dirty++},
   setTrainingReport(report){state.lastTraining=report;state.trainingRevision=3;validate(state);dirty++},
   reward(features,reward){if(!Array.isArray(features)||features.length!==18||features.some(v=>!Number.isFinite(v)||v< -10000||v>10000)||!Number.isFinite(reward))throw Error('学習報酬が不正です');if(Math.abs(reward)<1e-8||!features.some(v=>Math.abs(v)>1e-8))return;const norm=1+features.reduce((n,v)=>n+v*v,0),amount=Math.max(-8,Math.min(8,reward))*.0015/Math.sqrt(norm),next=state.combatWeights.map((v,i)=>Math.max(BOUNDS[i][0],Math.min(BOUNDS[i][1],v+amount*features[i])));state.rewards++;if(next.some((v,i)=>Math.abs(v-state.combatWeights[i])>1e-10)){state.combatWeights=next;state.updates++;state.trainingRevision=3;dirty++;if(dirty>=8)flush()}},
   export(){flush();return JSON.stringify(validate(state),null,2)},
   import(text){if(typeof text!=='string'||text.length>65536)throw Error('学習ファイルが大きすぎます（64KBまで）');const next=validate(JSON.parse(text));storage.setItem(key,JSON.stringify(next));state=next;dirty=0},
   reset(){state=fresh();dirty=1;flush()}
  };
 }
 create.canonicalMode=canonicalMode;
 if(typeof module!=='undefined')module.exports=create;else root.createLocalBotLearner=create;
})(typeof window==='undefined'?globalThis:window);
