/* vA-only options. I5 / extra O stay in the native QP settings panel; the
   vAI test settings (BOT mode, PPS, placement preview, TTR import) live in
   the Tab panel (#local-panel), next to the AI target. These flags are read
   by the local version-19 game setup; they do not alter online play or send
   any configuration to the network. */
(() => {
 const flagIn=(section,key,label,defaultValue)=>{
  const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=localStorage.getItem(key)===null?defaultValue:localStorage.getItem(key)==='true';input.addEventListener('change',()=>localStorage.setItem(key,String(input.checked)));row.append(input,document.createTextNode(label));section.appendChild(row);return row;
 };
 const attachQP=()=>{
  const settings=document.getElementById('qp-local-settings');if(!settings||document.getElementById('qp-ai-options'))return;
  const section=document.createElement('div');section.id='qp-ai-options';
  flagIn(section,'qp-local-allow-i5','I5の出現を許可（元の発生条件に従う）',true);
  flagIn(section,'qp-local-extra-o','Oミノの増加を許可（元の発生条件に従う）',true);
  settings.appendChild(section);
 };
 const attach=()=>{
  attachQP();
  const panel=document.getElementById('local-panel');if(!panel||document.getElementById('qp-ai-test-settings'))return;
  const section=document.createElement('details');section.id='qp-ai-test-settings';section.open=false; // v4.8281 (user: 再起動しても常時開いてるのやめて): starts closed
  // v4.8281 (user: 文字が多いのは説明書のみに): short labels here; explanations are on the site manual.
  const heading=document.createElement('summary');heading.textContent='vAI 設定';section.appendChild(heading);
  const flag=(key,label,defaultValue)=>{flagIn(section,key,label,defaultValue).style.display='block'};
  flag('qp-local-ai-tspin-b2b','BOT: Spin B2B モード',true);
  flag('qp-win-gauge','勝率予測ゲージ',true);
  flag('qp-ai-sync-player','プレーヤーと同時に置く',false);
  // player:BOT piece ratio for the flag above (v4.8279)
  const ratioLabel=document.createElement('label');ratioLabel.style.display='block';ratioLabel.append(document.createTextNode('同時に置く比 プレーヤー:BOT '));
  const ratio=document.createElement('input');ratio.type='text';ratio.placeholder='1:1';ratio.style.width='6em';ratio.value=localStorage.getItem('qp-ai-sync-ratio')||'1:1';
  ratio.addEventListener('change',()=>{const m=/^\s*(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio.value);if(!m||!(+m[1]>0)||!(+m[2]>0)){ratio.value=localStorage.getItem('qp-ai-sync-ratio')||'1:1';return}ratio.value=m[1]+':'+m[2];localStorage.setItem('qp-ai-sync-ratio',ratio.value)});
  ratioLabel.appendChild(ratio);section.appendChild(ratioLabel);
  flag('qp-ai-misdrop','置きミスを再現',false);
  const ppsLabel=document.createElement('label');ppsLabel.style.display='block';ppsLabel.append(document.createTextNode('BOT目標PPS '));
  const pps=document.createElement('input');pps.type='number';pps.min='0.1';pps.max='20';pps.step='0.1';pps.value=localStorage.getItem('qp-local-bot-pps')||'2';pps.addEventListener('change',()=>{const value=Math.max(.1,Math.min(20,Number(pps.value)||2));pps.value=String(value);localStorage.setItem('qp-local-bot-pps',String(value))});ppsLabel.appendChild(pps);section.appendChild(ppsLabel);
  // Compute power: auto measures this PC and fits the plan to the target PPS.
  const powerLabel=document.createElement('label');powerLabel.style.display='block';powerLabel.textContent='計算量 ';
  const powerSelect=document.createElement('select');powerSelect.setAttribute('aria-label','AIの計算量');
  for(const [value,name] of [['auto','自動'],['low','低'],['mid','中'],['high','高'],['max','最大']]){const option=document.createElement('option');option.value=value;option.textContent=name;powerSelect.appendChild(option)}
  powerSelect.value=['low','mid','high','max'].includes(localStorage.getItem('qp-ai-power'))?localStorage.getItem('qp-ai-power'):'auto';
  powerSelect.addEventListener('change',()=>localStorage.setItem('qp-ai-power',powerSelect.value));
  const powerInfo=document.createElement('small');powerInfo.style.display='block';
  const showPower=()=>{const sp=window.LocalAIPlanSpeed;powerInfo.textContent=sp?.samples?'計画速度 '+sp.msPerWidth.toFixed(1)+' ms':''};showPower();powerSelect.addEventListener('focus',showPower);
  powerLabel.appendChild(powerSelect);section.appendChild(powerLabel);section.appendChild(powerInfo);
  const previewMode=document.createElement('label');previewMode.textContent='配置予測の表示 ';
  const previewSelect=document.createElement('select');previewSelect.setAttribute('aria-label','AI配置予測表示');
  for(const [value,name] of [['off','非表示'],['game','ゲーム中'],['replay','リプレイ中'],['both','両方']]){const option=document.createElement('option');option.value=value;option.textContent=name;previewSelect.appendChild(option)}
  previewSelect.value=['game','replay','both'].includes(localStorage.getItem('qp-ai-preview-mode'))?localStorage.getItem('qp-ai-preview-mode'):'off';
  previewSelect.addEventListener('change',()=>{localStorage.setItem('qp-ai-preview-mode',previewSelect.value);window.LocalAIPreview?.refresh?.()});
  previewMode.appendChild(previewSelect);section.appendChild(previewMode);
  const contentLabel=document.createElement('label');contentLabel.textContent='予測情報 ';
  const contentSelect=document.createElement('select');contentSelect.setAttribute('aria-label','AI予測の内容');
  for(const [value,name] of [['both','配置番号＋火力'],['place','配置番号のみ'],['power','火力のみ']]){const option=document.createElement('option');option.value=value;option.textContent=name;contentSelect.appendChild(option)}
  contentSelect.value=['both','place','power'].includes(localStorage.getItem('qp-ai-preview-content'))?localStorage.getItem('qp-ai-preview-content'):'both';
  contentSelect.addEventListener('change',()=>{localStorage.setItem('qp-ai-preview-content',contentSelect.value);window.LocalAIPreview?.refresh?.()});
  contentLabel.appendChild(contentSelect);section.appendChild(contentLabel);
  const importRow=document.createElement('label');importRow.textContent='TTRから型を取り込む ';const replayFile=document.createElement('input');replayFile.type='file';replayFile.accept='.ttr,.json';replayFile.setAttribute('aria-label','Spin学習用TTR');importRow.appendChild(replayFile);section.appendChild(importRow);
  const spinStatus=document.createElement('small');spinStatus.style.display='block';const tplCount=()=>window.LocalAITemplates?.list?.().length||0;spinStatus.textContent='記録済みSpin: '+(window.LocalSpinLibrary?.load?.().length||0)+'種類 / 型: '+tplCount()+'種類';section.appendChild(spinStatus);
  replayFile.multiple=true;replayFile.addEventListener('change',async()=>{const files=[...(replayFile.files||[])];if(!files.length)return;replayFile.disabled=true;spinStatus.textContent='TTR内のSpinを解析中…';try{let result;for(const [i,file] of files.entries())result=window.LocalAITemplates?await window.LocalAITemplates.importTTR(file,(n,total)=>{spinStatus.textContent=(files.length>1?(i+1)+'/'+files.length+' ':'')+'解析 '+Math.round(n/total*100)+'%'}):await window.LocalSpinLibrary.importTTR(file,(n,total)=>{spinStatus.textContent='Spin解析 '+Math.round(n/total*100)+'%'});spinStatus.textContent='取り込み Spin '+result.count+'回 / 保存済み '+result.total+'種類'+(result.templates!==undefined?' / 型 +'+result.templates+'（合計'+result.templateTotal+'）':'')+'。';window.LocalAIPreview?.refresh?.()}catch(error){spinStatus.textContent='取込失敗：'+(error.message||error)}finally{replayFile.disabled=false;replayFile.value=''}});
  const openings=document.createElement('small');openings.style.display='block';
  const openingStats=window.LocalSpinLibrary?.openingStats?.()||[];
  openings.textContent='記録した開幕配置: '+openingStats.length+'種類'+(openingStats.length?' / 最多'+openingStats[0].uses+'回':'');section.appendChild(openings);
  // Placement-preview explanation: site manual (v4.8281).
  
  // Right under the AI target box at the top of the Tab panel.
  const quick=document.getElementById('local-ai-quick');if(quick&&quick.parentNode===panel)quick.after(section);else panel.prepend(section);
 };
 new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
