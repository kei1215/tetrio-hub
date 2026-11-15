(function(root){
 const INPUTS=146,HIDDEN=16,TYPES=['i','j','l','o','s','t','z'],SCALES=[4,4,40,20,20,12,12,1,4,16,16,4,4,8,20,1,1,1];
 function validate(p){if(p===null||p===undefined)return null;if(p.format!=='native-board-policy-v1'||p.inputs!==INPUTS||p.hidden!==HIDDEN)throw Error('AIネットワーク形式が不正です');const out={format:p.format,inputs:INPUTS,hidden:HIDDEN};for(const [key,n]of [['w',INPUTS*HIDDEN],['b',HIDDEN],['v',HIDDEN]]){if(!Array.isArray(p[key])||p[key].length!==n||p[key].some(x=>!Number.isFinite(x)||Math.abs(x)>4))throw Error('AIネットワークの重みが不正です');out[key]=p[key].slice()}return out}
 function create(){let seed=42199;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};return {format:'native-board-policy-v1',inputs:INPUTS,hidden:HIDDEN,w:Array.from({length:INPUTS*HIDDEN},()=>.1*(random()-.5)),b:Array(HIDDEN).fill(0),v:Array.from({length:HIDDEN},()=>.1*(random()-.5))}}
 function encode(before,after,features){const input=features.map((v,i)=>Math.max(-2,Math.min(2,v/SCALES[i]))),board=after.board,h=board.length,heights=[],holes=[];let top=h;
  for(let x=0;x<10;x++){let first=h,count=0;for(let y=0;y<h;y++){if(board[y][x]!==null)first=Math.min(first,y);else if(first<h)count++}top=Math.min(top,first);heights.push((h-first)/20);holes.push(count/10)}
  const start=Math.max(0,Math.min(top,h-8));for(let y=start;y<start+8;y++)for(let x=0;x<10;x++)input.push(board[y]?.[x]!==null?1:0);input.push(...heights,...holes);for(const type of [before.falling.type,after.hold,after.falling.type,after.bag[0]])for(const t of TYPES)input.push(type===t?1:0);return input;
 }
 function forward(p,input){const hidden=Array(HIDDEN);for(let j=0;j<HIDDEN;j++){let sum=p.b[j];for(let i=0;i<INPUTS;i++)sum+=p.w[j*INPUTS+i]*input[i];hidden[j]=Math.tanh(sum)}return {hidden,raw:hidden.reduce((n,h,j)=>n+h*p.v[j],0)}}
 function score(p,input){return p?6*Math.tanh(forward(p,input).raw):0}
 function trainPair(p,positive,negative,baselineDifference,rate=.015){const a=forward(p,positive),b=forward(p,negative),logit=Math.max(-30,Math.min(30,baselineDifference/6+Math.tanh(a.raw)-Math.tanh(b.raw))),gain=rate/(1+Math.exp(logit)),oldV=p.v.slice();
  for(let j=0;j<HIDDEN;j++){p.v[j]=Math.max(-4,Math.min(4,p.v[j]+gain*((1-Math.tanh(a.raw)**2)*a.hidden[j]-(1-Math.tanh(b.raw)**2)*b.hidden[j])-.00001*p.v[j]));const da=(1-Math.tanh(a.raw)**2)*oldV[j]*(1-a.hidden[j]**2),db=(1-Math.tanh(b.raw)**2)*oldV[j]*(1-b.hidden[j]**2);p.b[j]=Math.max(-4,Math.min(4,p.b[j]+gain*(da-db)));for(let i=0;i<INPUTS;i++){const k=j*INPUTS+i;p.w[k]=Math.max(-4,Math.min(4,p.w[k]+gain*(da*positive[i]-db*negative[i])-.000001*p.w[k]))}}
 }
 function compact(p){if(!p)return null;const copy=validate(p);for(const key of ['w','b','v'])copy[key]=copy[key].map(x=>Math.round(x*1e6)/1e6);return copy}
 const api={INPUTS,HIDDEN,validate,create,encode,score,trainPair,compact};if(typeof module!=='undefined')module.exports=api;else root.LocalAIModel=api;
})(typeof window==='undefined'?globalThis:window);
