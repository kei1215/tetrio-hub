function qpPatchUpdateConfig(document, window) {
 /* qp-patch-update-config-v1 (v4.8241): CONFIG > QP PATCH TOOLS > PATCH UPDATE */
 if(window.location.protocol!=='https:'||!window.IPC?.invoke)return;
 const install=()=>{
  if(document.getElementById('qp-patch-update-entry'))return;
  const account=document.getElementById('config_account');
  const config=account?.closest?.('[data-menuview="config"]')||document.querySelector('[data-menuview="config"]');
  if(!config)return;
  const template=document.getElementById('config_export')||account;
  const node=document.createElement('div');node.id='qp-patch-update-entry';
  node.className=template?.className||'scroller_item scroller_item_config has_description ns rg_target_pri';
  node.setAttribute('role','button');node.tabIndex=0;
  const title=document.createElement('h1'),detail=document.createElement('p');
  node.append(title,detail);
  let state={available:false,busy:false};
  const show=(head,text)=>{title.textContent=head;detail.textContent=text};
  const check=()=>{
   show('PATCH UPDATE: 確認中…','最新のパッチがあるか確認しています');
   window.IPC.invoke('qp-patch-update-check').then(r=>{
    if(!r?.ok){state={available:false,busy:false,error:true};show('PATCH UPDATE: 確認できません',(r?.error||'')+'(クリックで再確認)');return}
    state={...r,error:false};
    const now='v4.'+r.installed+' ('+r.kind+')';
    if(r.available)show('PATCH UPDATE: v'+r.version+' に更新できます','今は '+now+'。クリックで更新します(TETR.IO を終了して新しいパッチを入れ、自動で起動し直します)'+(r.failed?'\n前回の更新は完了しませんでした: '+r.failed:''));
    else show('PATCH UPDATE: 最新です','今は '+now+(r.failed?'\n前回の更新は完了しませんでした: '+r.failed:''));
   }).catch(error=>{state={available:false,busy:false,error:true};show('PATCH UPDATE: 確認できません',String(error?.message||error))});
  };
  const run=()=>{
   if(state.busy)return;
   if(!state.available){if(state.error)check();return} // latest: nothing to do
   if(!window.confirm('パッチを v'+state.version+' に更新します。\nTETR.IO を終了して新しいパッチを入れ、自動で起動し直します。よろしいですか?'))return;
   state.busy=true;show('PATCH UPDATE: ダウンロード中…','完了すると TETR.IO を終了して更新します');
   window.IPC.invoke('qp-patch-update-run').then(r=>{
    if(!r?.ok){state={available:false,busy:false,error:true};show('PATCH UPDATE: 更新できません',(r?.error||'')+'(クリックで再確認)');return}
    show('PATCH UPDATE: 更新します','TETR.IO を終了して v'+r.version+' を入れています…');
   }).catch(error=>{state={available:false,busy:false,error:true};show('PATCH UPDATE: 更新できません',String(error?.message||error))});
  };
  node.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();run()},true);
  node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();run()}},true);
  let footer=document.getElementById('qp-patch-tools-footer');
  if(!footer){footer=document.createElement('div');footer.id='qp-patch-tools-footer';footer.className='scroller_block zero';const heading=document.createElement('h2');heading.className='ns';heading.textContent='QP PATCH TOOLS';heading.style.cssText='margin:.8em 0 .25em;color:#ff9866';footer.appendChild(heading);config.append(footer);}
  footer.after(node);
  check();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
}
