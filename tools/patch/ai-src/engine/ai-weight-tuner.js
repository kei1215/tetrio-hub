/* vA planner weight self-tuning (2026-11-13).
   Plays on in the local AI room: after every round the vA Spin B2B BOT gets a
   reward from what we want it to do (win, APM above the opponent, TSD / TST,
   long B2B, no needless minis / plain breaks, survive). The weights are tuned
   with a (1+1) evolution strategy: the incumbent and one perturbed candidate
   are each played for N rounds, the better average stays, the step size grows
   on success and shrinks on failure. Reward weights are editable in the Tab
   panel so they can be re-tuned after looking at results. Learns only when
   exactly one side is the vA spin planner (not the outside AI, not a mirror). */
(function(root){
 'use strict';
 const KEY='qp-ai-tuner-v1';
 // name: [min, max, initial step]; arrays of the planner are split per entry.
 const SPACE={tShape:[0,20,2],tsdReady:[0,60,5],tstReady:[0,120,10],slotReady:[0,4,.5],sealed:[4,30,2],trap:[0,20,2],tuck:[0,15,1.5],tuckReady:[-8,4,1.2],
  bump:[0,8,.6],bumpSq:[0,1,.08],height:[-4,4,.6],peak:[0,10,1],top:[0,15,1.5],well:[-12,4,1.5],takeMax:[10,20,1],dig:[0,8,1],wastedT:[5,50,4],
  breakClear:[-50,-5,4],tsd:[25,80,5],tst:[50,140,10],tmini:[0,4,.5],mini1:[0,4,.5],mini2:[0,12,1],quad:[4,30,3]};
 const REWARD={win:10,apmDiff:.05,app:4,tsd:.4,tst:1,b2b:.05,mini:-.3,plain:-.4,pieces:.01};
 const LABELS={win:'勝ち(+1) / 負け(-1)',apmDiff:'相手とのAPM差 1あたり',app:'APP(1ミノの火力)',tsd:'TSD 100ミノあたり1回',tst:'TST 100ミノあたり1回',b2b:'最大B2B 1あたり',mini:'Tミニ 100ミノあたり1回',plain:'普通消し(B2B切れ) 100ミノあたり1回',pieces:'生存ミノ1つ'};
 const defaults=()=>({v:1,enabled:false,rounds:4,reward:{...REWARD},base:null,cand:null,sigma:1,gen:0,baseRuns:[],candRuns:[],phase:'base',history:[]});
 let state=null;
 function load(){if(state)return state;try{state={...defaults(),...JSON.parse(root.localStorage?.getItem(KEY)||'{}')}}catch{state=defaults()}state.reward={...REWARD,...state.reward};return state}
 function save(){try{root.localStorage?.setItem(KEY,JSON.stringify(state))}catch{}}
 // Flat weights <-> planner options.
 function toPlanner(w){const o={};for(const k in w){if(k==='tsd'||k==='tst'||k==='tmini'||k==='mini1'||k==='mini2')continue;o[k]=w[k]}
  if(w.tsd!=null||w.tst!=null)o.tFull=[0,10,w.tsd??45,w.tst??90];if(w.tmini!=null)o.tMini=[0,w.tmini,3,4];if(w.mini1!=null||w.mini2!=null)o.mini=[0,w.mini1??1,w.mini2??8,14];return o}
 function fromStyle(style){const w={};for(const k in SPACE){if(k in style)w[k]=style[k]}
  const P=root.LocalSpinPlanner?.DEFAULTS||{};for(const k in SPACE)if(w[k]==null&&typeof P[k]==='number')w[k]=P[k];
  const tf=style.tFull||P.tFull||[0,10,45,90],mi=style.mini||P.mini||[0,1,8,14],tm=style.tMini||P.tMini||[0,1,3,4];
  w.tsd=tf[2];w.tst=tf[3];w.mini1=mi[1];w.mini2=mi[2];w.tmini=tm[1];for(const k in SPACE)if(w[k]==null)w[k]=(SPACE[k][0]+SPACE[k][1])/2;return w}
 function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
 function perturb(w,sigma){const c={...w};for(const k in SPACE){const [lo,hi,st]=SPACE[k];c[k]=+Math.max(lo,Math.min(hi,w[k]+gauss()*st*sigma)).toFixed(3)}return c}
 /* What the BOT should do, scored from one finished round. */
 function reward(game,peer,won,R){
  const st=game.state?.stats||{},ps=peer?.state?.stats||{},c=st.clears||{};
  const frames=Math.max(600,Number(game.getFrame?.())||0),pieces=Math.max(1,Number(st.piecesplaced)||0);
  const apm=(Number(st.garbage?.attack)||0)/frames*3600,papm=(Number(ps.garbage?.attack)||0)/frames*3600;
  const per=n=>100*(Number(n)||0)/pieces;
  const parts={win:won?1:-1,apmDiff:apm-papm,app:(Number(st.garbage?.attack)||0)/pieces,tsd:per(c.tspindoubles),tst:per(c.tspintriples),
   b2b:Number(st.topbtb)||0,mini:per((c.minitspinsingles||0)+(c.minitspindoubles||0)+(c.minitspins||0)),plain:per((c.singles||0)+(c.doubles||0)+(c.triples||0)),pieces};
  let r=0;for(const k in R)r+=(R[k]||0)*(parts[k]||0);
  return {r:+r.toFixed(3),parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,+(+v).toFixed(2)]))};
 }
 const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:-Infinity;
 function step(sample){
  const s=load();
  (s.phase==='base'?s.baseRuns:s.candRuns).push(sample.r);
  if(s.phase==='base'&&s.baseRuns.length>=s.rounds){s.phase='cand';s.cand=perturb(s.base,s.sigma)}
  else if(s.phase==='cand'&&s.candRuns.length>=s.rounds){
   const b=avg(s.baseRuns),c=avg(s.candRuns),take=c>b;s.gen++;
   s.history.push({gen:s.gen,base:+b.toFixed(3),cand:+c.toFixed(3),took:take,sigma:+s.sigma.toFixed(3),w:take?s.cand:s.base});
   if(s.history.length>300)s.history=s.history.slice(-300);
   if(take){s.base=s.cand;s.baseRuns=s.candRuns.slice();s.sigma=Math.min(3,s.sigma*1.25)}else s.sigma=Math.max(.15,s.sigma*.85);
   // The incumbent keeps its newest results only, so an old lucky streak cannot hold forever.
   s.baseRuns=s.baseRuns.slice(-s.rounds);s.candRuns=[];s.cand=perturb(s.base,s.sigma);
  }
  save();root.dispatchEvent?.(new CustomEvent('local-ai-tuner',{detail:status()}));
 }
 function status(){const s=load();return {enabled:s.enabled,gen:s.gen,phase:s.phase,sigma:s.sigma,baseAvg:avg(s.baseRuns),candAvg:avg(s.candRuns),baseN:s.baseRuns.length,candN:s.candRuns.length,rounds:s.rounds}}
 const api={
  SPACE,REWARD,LABELS,reward,status,
  enabled:()=>load().enabled,
  /* Planner options for the BOT now (incumbent or the candidate under test), or null. */
  params(style){const s=load();if(!s.enabled)return null;if(!s.base){s.base=fromStyle(style||{});save()}return toPlanner(s.phase==='cand'&&s.cand?s.cand:s.base)},
  setEnabled(on){const s=load();s.enabled=!!on;save()},
  setRounds(n){const s=load();s.rounds=Math.max(1,Math.min(50,Math.round(Number(n)||4)));save()},
  setReward(r){const s=load();s.reward={...s.reward,...r};save()},
  reset(){const on=load().enabled,rw=load().reward;state={...defaults(),enabled:on,reward:rw};save()},
  exportJSON:()=>JSON.stringify(load(),null,1),
  best:()=>{const s=load();return s.base?toPlanner(s.base):null},
  get:()=>load()
 };
 root.LocalAITuner=api;
 if(typeof module!=='undefined')module.exports=api;
 // Round results from the local AI room.
 root.addEventListener?.('local-ai-match-end',e=>{try{
  const s=load();if(!s.enabled||!s.base)return;const {games,winner}=e.detail||{};if(!games||games.length!==2)return;
  // v4.8276: no tuning from matches with an outside AI (user: 外部AIは学習を基本入れない)
  if(games.some(g=>g?._aiEngine||g?._aiExternalStats))return;
  const va=games.map((g,i)=>g?._aiPlanStats&&!g._aiExternalStats?i:-1).filter(i=>i>=0);
  if(va.length!==1)return;const i=va[0],sample=reward(games[i],games[1-i],winner===i,s.reward);
  sample.phase=s.phase;step(sample);root.LocalAITuner.last=sample;
 }catch(error){console.warn('tuner',error)}});
 // Tab panel.
 function ui(){
  const panel=root.document?.getElementById('local-panel');if(!panel||root.document.getElementById('qp-ai-tuner'))return;
  const d=document.createElement('details');d.id='qp-ai-tuner';const sm=document.createElement('summary');sm.textContent='vAI 重みの自動調整';d.appendChild(sm);
  const p=document.createElement('p');p.textContent='ローカルAI対戦の各ラウンドの結果から報酬を出し、vAの評価の重みを少しずつ変えて良い方を残します（片側がvA Spin B2B BOTのときだけ）。報酬の値は結果を見て変えられます。';d.appendChild(p);
  const row=(label,input)=>{const l=document.createElement('label');l.style.display='block';l.append(label+' ',input);d.appendChild(l);return input};
  const s=load();
  const on=row('自動調整する',Object.assign(document.createElement('input'),{type:'checkbox',checked:s.enabled}));on.onchange=()=>{api.setEnabled(on.checked);show()};
  const rounds=row('1候補あたりのラウンド数',Object.assign(document.createElement('input'),{type:'number',min:1,max:50,value:s.rounds}));rounds.onchange=()=>{api.setRounds(rounds.value);show()};
  const rw={};for(const k in REWARD)rw[k]=row('報酬: '+LABELS[k],Object.assign(document.createElement('input'),{type:'number',step:'any',value:s.reward[k]}));
  const btn=(t,f)=>{const b=document.createElement('button');b.textContent=t;b.onclick=f;d.appendChild(b);return b};
  btn('報酬を保存',()=>{api.setReward(Object.fromEntries(Object.entries(rw).map(([k,i])=>[k,Number(i.value)||0])));show()});
  btn('学習をリセット',()=>{if(confirm('調整した重みと履歴を消しますか？'))api.reset();show()});
  btn('履歴を書き出す',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([api.exportJSON()],{type:'application/json'}));a.download='vA-weight-tuner.json';a.click()});
  const out=document.createElement('pre');out.style.cssText='white-space:pre-wrap;font-size:11px';d.appendChild(out);
  function show(){const st=status(),L=root.LocalAITuner.last;out.textContent=`世代 ${st.gen} / ${st.phase==='base'?'現在の重み':'候補'}を試験中 (${st.phase==='base'?st.baseN:st.candN}/${st.rounds})\n現在の平均報酬 ${Number.isFinite(st.baseAvg)?st.baseAvg.toFixed(2):'-'} / 候補 ${Number.isFinite(st.candAvg)?st.candAvg.toFixed(2):'-'} / 変化幅 ${st.sigma.toFixed(2)}`+(L?`\n前回の報酬 ${L.r} ${JSON.stringify(L.parts)}`:'')}
  show();root.addEventListener('local-ai-tuner',show);
  const after=root.document.getElementById('qp-ai-test-settings');if(after)after.after(d);else panel.appendChild(d);
 }
 if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',ui);else setTimeout(ui,0);root.addEventListener('local-ai-profiles',ui)}
})(typeof window==='undefined'?globalThis:window);
