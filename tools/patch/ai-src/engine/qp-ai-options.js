/* vA-only options shown inside the native QP settings panel.
   These flags are read by the local version-19 game setup; they do not alter
   online play or send any configuration to the network. */
(() => {
 const attach=()=>{
  const settings=document.getElementById('qp-local-settings');if(!settings||document.getElementById('qp-ai-options'))return;
  const section=document.createElement('div');section.id='qp-ai-options';
  const heading=document.createElement('p');heading.textContent='vAI テスト設定（ローカルQPのみ）';section.appendChild(heading);
  const flag=(key,label,defaultValue)=>{
   const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=localStorage.getItem(key)===null?defaultValue:localStorage.getItem(key)==='true';input.addEventListener('change',()=>localStorage.setItem(key,String(input.checked)));row.append(input,document.createTextNode(label));section.appendChild(row);
  };
  flag('qp-local-allow-i5','I5の出現を許可（元の発生条件に従う）',true);
  flag('qp-local-extra-o','Oミノの増加を許可（元の発生条件に従う）',true);
  flag('qp-local-ai-tspin-b2b','BOT: Spin B2B モード（既定ON。QP・40L・TL・CUSTOMで、T-Spin多めのSpinだけでB2Bをつなぐ。攻撃が来たら相殺か受けるかを高さで決める）',true);
  const ppsLabel=document.createElement('label');ppsLabel.append(document.createTextNode('BOT目標PPS（0.1〜20・ゲーム内時間基準）'));
  const pps=document.createElement('input');pps.type='number';pps.min='0.1';pps.max='20';pps.step='0.1';pps.value=localStorage.getItem('qp-local-bot-pps')||'2';pps.addEventListener('change',()=>{const value=Math.max(.1,Math.min(20,Number(pps.value)||2));pps.value=String(value);localStorage.setItem('qp-local-bot-pps',String(value))});ppsLabel.appendChild(pps);section.appendChild(ppsLabel);
  const previewMode=document.createElement('label');previewMode.textContent='配置予測の表示 ';
  const previewSelect=document.createElement('select');previewSelect.setAttribute('aria-label','AI配置予測表示');
  for(const [value,name] of [['off','非表示（既定）'],['game','ゲーム中に表示'],['replay','リプレイ中のみ'],['both','ゲーム中とリプレイ中']]){const option=document.createElement('option');option.value=value;option.textContent=name;previewSelect.appendChild(option)}
  previewSelect.value=['game','replay','both'].includes(localStorage.getItem('qp-ai-preview-mode'))?localStorage.getItem('qp-ai-preview-mode'):'off';
  previewSelect.addEventListener('change',()=>{localStorage.setItem('qp-ai-preview-mode',previewSelect.value);window.LocalAIPreview?.refresh?.()});
  previewMode.appendChild(previewSelect);section.appendChild(previewMode);
  const contentLabel=document.createElement('label');contentLabel.textContent='予測情報 ';
  const contentSelect=document.createElement('select');contentSelect.setAttribute('aria-label','AI予測の内容');
  for(const [value,name] of [['both','配置番号＋火力'],['place','配置番号のみ'],['power','火力のみ']]){const option=document.createElement('option');option.value=value;option.textContent=name;contentSelect.appendChild(option)}
  contentSelect.value=['both','place','power'].includes(localStorage.getItem('qp-ai-preview-content'))?localStorage.getItem('qp-ai-preview-content'):'both';
  contentSelect.addEventListener('change',()=>{localStorage.setItem('qp-ai-preview-content',contentSelect.value);window.LocalAIPreview?.refresh?.()});
  contentLabel.appendChild(contentSelect);section.appendChild(contentLabel);
  const importRow=document.createElement('label');importRow.textContent='自分のTTRからSpin・型（組み方）・好みを取り込む ';const replayFile=document.createElement('input');replayFile.type='file';replayFile.accept='.ttr,.json';replayFile.setAttribute('aria-label','Spin学習用TTR');importRow.appendChild(replayFile);section.appendChild(importRow);
  const spinStatus=document.createElement('small');spinStatus.style.display='block';const tplCount=()=>window.LocalAITemplates?.list?.().length||0;spinStatus.textContent='記録済みSpin: '+(window.LocalSpinLibrary?.load?.().length||0)+'種類 / 型: '+tplCount()+'種類。自分のプレイ中も保存します。BOTはミノ順と盤面に合う型を優先します。';section.appendChild(spinStatus);
  replayFile.multiple=true;replayFile.addEventListener('change',async()=>{const files=[...(replayFile.files||[])];if(!files.length)return;replayFile.disabled=true;spinStatus.textContent='TTR内のSpinを解析中…';try{let result;for(const [i,file] of files.entries())result=window.LocalAITemplates?await window.LocalAITemplates.importTTR(file,(n,total)=>{spinStatus.textContent=(files.length>1?(i+1)+'/'+files.length+' ':'')+'解析 '+Math.round(n/total*100)+'%'}):await window.LocalSpinLibrary.importTTR(file,(n,total)=>{spinStatus.textContent='Spin解析 '+Math.round(n/total*100)+'%'});spinStatus.textContent='取り込み Spin '+result.count+'回 / 保存済み '+result.total+'種類'+(result.templates!==undefined?' / 型 +'+result.templates+'（合計'+result.templateTotal+'）':'')+'。';window.LocalAIPreview?.refresh?.()}catch(error){spinStatus.textContent='取込失敗：'+(error.message||error)}finally{replayFile.disabled=false;replayFile.value=''}});
  const openings=document.createElement('small');openings.style.display='block';
  const openingStats=window.LocalSpinLibrary?.openingStats?.()||[];
  openings.textContent='記録した開幕配置: '+openingStats.length+'種類'+(openingStats.length?' / 最多'+openingStats[0].uses+'回':'');section.appendChild(openings);
  const previewNote=document.createElement('small');previewNote.textContent='プレイヤーの実際のSpin直前の構造から、壁・屋根と後続の回転候補を1案ずつ描きます（最大5案切替）。同じミノの配置違いで候補を埋めず、CURRENT/HOLD/NEXTで確定した2手と将来構想を区別します。Spin成功の保証はありません。学習データがなければ予測は表示しません。';section.appendChild(previewNote);
  const note=document.createElement('p');note.textContent='保存AI・相方AI・攻撃設定はAI管理の「プレイ・対戦」にあります。vOにはこの項目を表示しません。';section.appendChild(note);
  settings.appendChild(section);
 };
 new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
