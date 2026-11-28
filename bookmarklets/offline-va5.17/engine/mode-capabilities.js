/* Human-readable local-only capability matrix.  This never changes an online room. */
(() => {
 const rows=[
  ['QP NOMOD','○','○','QP NOMOD / TL で共有','QP通常ルール。報酬はMODなし枠。'],
  ['QP MOD','○','○','MOD・複合MOD別','MODごとの報酬・学習値。'],
  ['TETRA LEAGUE','○','○','QP NOMOD / TL で共有','TLのTTRとローカルTLルールを対象。'],
  ['40 LINES','○','○','40L専用','対戦火力・QP高度の評価は使わない。'],
  ['BLITZ','○','○','BLITZ専用','得点・時間制限を含む評価。'],
  ['保存ルーム設定','設定の保存','ローカルTL / CUSTOM','ルーム設定ごと','FT・左右担当・基本GAME設定を端末内に保存。オンライン送信はしない。'],
  ['ZEN / Replay','—','—','対象外','エンドレス／再生はBOT実行・模倣学習の対象外。']
 ];
 const attach=()=>{
  const panel=document.getElementById('local-panel');if(!panel||document.getElementById('local-mode-capabilities'))return;
  const section=document.createElement('details');section.id='local-mode-capabilities';const summary=document.createElement('summary');summary.textContent='AI・模倣学習のモード別対応';section.appendChild(summary);
  const note=document.createElement('p');note.textContent='○はこのvAのローカル処理で利用できます。BOTは端末内のローカルゲームだけを操作し、オンライン対戦・公式ルームには接続しません。';section.appendChild(note);
  const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;text-align:left';const header=document.createElement('tr');for(const text of ['モード','本人模倣/TTR','BOT実行','学習データ','変更点']){const cell=document.createElement('th');cell.textContent=text;cell.style.borderBottom='1px solid #777';header.appendChild(cell)}table.appendChild(header);
  for(const row of rows){const tr=document.createElement('tr');for(const text of row){const cell=document.createElement('td');cell.textContent=text;cell.style.cssText='padding:.25em;border-bottom:1px solid #555';tr.appendChild(cell)}table.appendChild(tr)}section.appendChild(table);panel.appendChild(section);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
