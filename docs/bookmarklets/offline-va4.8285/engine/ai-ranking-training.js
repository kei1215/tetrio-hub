// Teacher decisions compete with native legal alternatives from the SAME board.
(() => {
 const score=(features,weights)=>features.reduce((n,v,i)=>n+v*weights[i],0);
 // Ranking/replay training must yield to gameplay input and rendering.
 // requestIdleCallback without a timeout does not force a main-thread stall.
 function yieldForDisplay(){
  const human=window.OriginalReplay?.game?.();
  if(human?.isPlaying?.()&&!human._localLiveBot&&!human._localAIProfileId&&
     typeof window.requestIdleCallback==='function')
   return new Promise(resolve=>window.requestIdleCallback(()=>resolve()));
  return new Promise(resolve=>setTimeout(resolve,16));
 }
 const matches=(candidate,teacher)=>candidate.type===teacher.type&&candidate.final.x===teacher.x&&candidate.final.y===teacher.y&&candidate.final.rotation===teacher.rotation&&!!candidate.hold===teacher.hold&&candidate.spin===teacher.spin;
 function accuracy(samples,weights){if(!samples.length)return 0;return samples.filter(example=>score(example.chosen,weights)>=Math.max(...example.alternatives.map(a=>score(a,weights)))-1e-7).length/samples.length}
 function neuralAccuracy(samples,weights,policy){if(!samples.length)return 0;return samples.filter(e=>score(e.chosen,weights)+LocalAIModel.score(policy,e.chosenInput)>=Math.max(...e.alternatives.map((a,i)=>score(a,weights)+LocalAIModel.score(policy,e.alternativeInputs[i])))-1e-7).length/samples.length}
 async function fit(model,examples,report,isCancelled=()=>false,onProgress=()=>{}){
  const training=examples.filter((_,i)=>i%5!==0),validation=examples.filter((_,i)=>i%5===0);
  if(training.length<8||validation.length<2)throw Error('比較学習に使える配置が足りません（探索できる配置を10件以上含むTTRを選んでください）。保存していません');
  const originalWeights=model.combatWeights(),initial=model.policy(),beforeTrain=neuralAccuracy(training,originalWeights,initial),beforeValidation=neuralAccuracy(validation,originalWeights,initial);let selectedWeights=originalWeights.slice(),bestLinearValidation=beforeValidation,bestLinearTrain=beforeTrain;for(let epoch=0;epoch<6;epoch++){for(let i=0;i<training.length;i++){if(isCancelled())throw Error('TTR学習をキャンセルしました');const e=training[i],current=model.combatWeights(),hard=e.alternatives.map(a=>({a,s:score(a,current)})).sort((a,b)=>b.s-a.s).slice(0,3).map(v=>v.a);model.preference(e.chosen,hard,.12);if(i%8===0)await yieldForDisplay()}const w=model.combatWeights(),valid=neuralAccuracy(validation,w,initial),train=neuralAccuracy(training,w,initial);if(valid>bestLinearValidation+1e-8||Math.abs(valid-bestLinearValidation)<1e-8&&train>bestLinearTrain){selectedWeights=w;bestLinearValidation=valid;bestLinearTrain=train}}model.setCombatWeights(selectedWeights);const weights=model.combatWeights(),network=initial?LocalAIModel.validate(initial):LocalAIModel.create(),linearTrain=neuralAccuracy(training,weights,initial),linearValidation=neuralAccuracy(validation,weights,initial);let best=initial,bestTrain=linearTrain,bestValidation=linearValidation,comparisons=0;
  let seed=79301;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let epoch=0;epoch<16;epoch++){
   const order=training.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
   for(let i=0;i<order.length;i++){if(isCancelled())throw Error('TTR学習をキャンセルしました。学習データは変更していません');const example=order[i],indices=example.alternatives.map((features,j)=>({j,value:score(features,weights)+LocalAIModel.score(network,example.alternativeInputs[j])})).sort((a,b)=>b.value-a.value).slice(0,3);const fireWeight=1+Math.min(3,(example.credit?.futureFire||0)/12);
    for(const {j}of indices){LocalAIModel.trainPair(network,example.chosenInput,example.alternativeInputs[j],score(example.chosen,weights)-score(example.alternatives[j],weights),.02*fireWeight/(1+epoch*.07));comparisons++}
    if(i%4===0)await yieldForDisplay();
   }
   const compact=LocalAIModel.compact(network),train=neuralAccuracy(training,weights,compact),valid=neuralAccuracy(validation,weights,compact);if(valid>bestValidation+1e-8||Math.abs(valid-bestValidation)<1e-8&&train>bestTrain){best=compact;bestTrain=train;bestValidation=valid}
   onProgress(epoch+1,16);
  }
  model.setPolicy(best);model.recordPolicyTraining(comparisons);const result={method:'ranked-native-v2',trainSamples:training.length,validationSamples:validation.length,trainBefore:beforeTrain,trainAfter:bestTrain,validationBefore:beforeValidation,validationAfter:bestValidation,covered:report.covered,considered:report.considered};model.setTrainingReport(result);return result;
 }
 function createCollector(model,expectedPieces,isCancelled=()=>false){
  const queue=[],examples=[],credits=[];let index=0,considered=0,covered=0;const stride=Math.max(1,Math.ceil((expectedPieces||480)/480));
  return {enqueue(example){for(const credit of credits){credit.futureFire+=Math.pow(.8,credit.age)*Math.max(0,example.fire||0);credit.age++}while(credits.length&&credits[0].age>=8)credits.shift();if(index++%stride===0){example.credit={futureFire:Math.max(0,example.fire||0),age:1};credits.push(example.credit);if(queue.length>=64)throw Error('学習キューが大きすぎます。保存せず停止します');queue.push(example)}},
   async drain(){while(queue.length){if(isCancelled())throw Error('TTR学習をキャンセルしました。学習データは変更していません');const example=queue.shift(),state=example.context.game,game={options:state.setoptions,ejectState:()=>example.context,_aiWeights:model.combatWeights(),_aiPolicy:model.policy(),_aiAllowSoftDrop:true};const search=LocalCombatAI.createSearch(game,null,{rootOnly:true,collect:true});let result;
    try{do{if(isCancelled())throw Error('TTR学習をキャンセルしました。学習データは変更していません');result=search.step(3);await yieldForDisplay()}while(!result.done)}finally{search.dispose()}
    considered++;const choices=result.choices.filter(c=>c.score> -100000),teacher=choices.find(c=>matches(c,example.teacher));if(!teacher)continue;covered++;
    const seen=new Set([JSON.stringify(teacher.input)]),alternatives=[],alternativeInputs=[];for(const candidate of choices.sort((a,b)=>b.score-a.score)){const key=JSON.stringify(candidate.input);if(seen.has(key))continue;seen.add(key);alternatives.push(candidate.features.slice());alternativeInputs.push(candidate.input.slice());if(alternatives.length===32)break}
    if(alternatives.length&&examples.length<480)examples.push({chosen:teacher.features.slice(),chosenInput:teacher.input.slice(),alternatives,alternativeInputs,credit:example.credit});
   }},
   async finish(onProgress){return fit(model,examples,{considered,covered},isCancelled,onProgress)},get diagnostics(){return {considered,covered,samples:examples.length}}
  };
 }
 window.LocalAIRanking={score,accuracy,neuralAccuracy,fit,createCollector};
})();
