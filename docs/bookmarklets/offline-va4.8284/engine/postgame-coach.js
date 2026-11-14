/* Post-game coach: deliberately uses only the final board and displayed NEXT. */
(() => {
 const key='qp-local-postgame-coach-v1';
 function cells(board){return Array.isArray(board)?board.flat().filter(v=>v!==null).length:0}
 function holes(board){let total=0;for(let x=0;x<(board?.[0]?.length||0);x++){let seen=false;for(const row of board){if(row[x]!==null)seen=true;else if(seen)total++}}return total}
 function report(game){
  const state=game?.state;if(!state?.board)return [];
  const next=(state.bag||[]).slice(0,Math.max(0,Math.min(6,Number(state.setoptions?.nextcount??5))));
  const out=[], gap=holes(state.board), placed=state.stats?.piecesplaced||0, lines=state.stats?.lines||0;
  if(gap>=4)out.push(`穴が${gap}個あります。次の配置では穴の上を塞がず、掘りやすい片側を残す候補を優先できます。`);
  if(state.setoptions?.display_hold!==false&&state.hold===null&&next.includes('T'))out.push('HOLDが空で、表示NEXTにTがあります。TをHOLDしてT-Spin用の屋根を探す選択肢があります。');
  if(state.setoptions?.display_hold!==false&&state.hold==='I'&&next.includes('T'))out.push('IをHOLDに確保できています。T-Spinを優先しつつ、4ライン消去用の縦穴を残せます。');
  if(next.includes('T')&&placed>=8)out.push('表示NEXTにTがあります。Tの3マス屋根と角を作れる形なら、通常消去よりT-Spinの候補も比較してください。');
  if(lines===0&&placed>=12)out.push('配置数に対して消去が少なめです。高さを増やしすぎず、まず1〜2ラインの安全な消去を作る候補も有効です。');
  if(!out.length)out.push(`最終盤面は大きな穴が少なめです。表示NEXT ${next.length}個の範囲では、安定した積みを維持できています。`);
  return out.slice(0,4);
 }
 function attach(){
  const panel=document.getElementById('local-panel');if(!panel||document.getElementById('local-postgame-coach'))return;
  const section=document.createElement('details');section.id='local-postgame-coach';const summary=document.createElement('summary');summary.textContent='対戦後の積み・HOLD・T-Spinヒント（vAI・ローカル）';section.appendChild(summary);const body=document.createElement('ol');section.appendChild(body);panel.appendChild(section);
  const render=game=>{body.replaceChildren(...report(game).map(text=>{const item=document.createElement('li');item.textContent=text;return item}));section.open=true};
  window.addEventListener('local-game-ended',event=>{try{render(event.detail.game)}catch(error){console.warn('postgame coach',error)}});
  window.LocalPostgameCoach={report};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
