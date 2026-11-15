function qpCcFixConfig(document, window) {
 /* qp-cc-fix-config-v1 (vA only, online client): CONFIG > QP PATCH TOOLS > CC 盤面修正.
  * Loads the tool (docs/cc-fix/tetrio-cc-fix.js on tetrio-hub Pages) and opens its panel:
  * a .ttr / .ttrm + a player name in, the same file out with that player's board replayed by
  * Cold Clear (results.qp_replay_edit, played by REPLAY BOARD EDIT). The AI installed in vA's 外部AI is used;
  * a missing one is installed first like かんたんインストール (ext-ai/catalog.json). The patch carries no outside AI. */
 if(window.location.protocol!=='https:')return;
 const TOOL='https://kei1215.github.io/tetrio-hub/cc-fix/tetrio-cc-fix.js';
 const loadTool=()=>new Promise((ok,ng)=>{
  if(window.__qpCcFix)return ok();
  const s=document.createElement('script');s.src=TOOL+'?v='+Date.now();
  s.onload=()=>window.__qpCcFix?ok():ng(Error('CC 盤面修正が起動しません'));s.onerror=()=>ng(Error('CC 盤面修正を読み込めません'));
  document.head.appendChild(s);
 });
 const run=async()=>{try{await loadTool();window.__qpCcFix.open()}catch(e){console.warn('[cc fix]',e);window.alert(e.message||e)}};
 const install=()=>{
  if(document.getElementById('qp-cc-fix-config'))return;
  const account=document.getElementById('config_account');
  const config=account?.closest?.('[data-menuview="config"]')||document.querySelector('[data-menuview="config"]');
  if(!config)return;
  const template=document.getElementById('config_export')||account;
  const node=document.createElement('div');node.id='qp-cc-fix-config';
  node.className=template?.className||'scroller_item scroller_item_config has_description ns rg_target_pri';
  node.setAttribute('role','button');node.tabIndex=0;
  const h=document.createElement('h1'),p=document.createElement('p');h.textContent='CC 盤面修正';
  p.textContent='リプレイ(.ttr / .ttrm)とプレイヤーを選ぶと、その盤面を Cold Clear が置き直した .ttrm を作る(見るには REPLAY BOARD EDIT を ON)';node.append(h,p);
  const go=e=>{e.preventDefault();e.stopImmediatePropagation();run()};
  node.addEventListener('click',go,true);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')go(e)},true);
  let footer=document.getElementById('qp-patch-tools-footer');
  if(!footer){footer=document.createElement('div');footer.id='qp-patch-tools-footer';footer.className='scroller_block zero';const hd=document.createElement('h2');hd.className='ns';hd.textContent='QP PATCH TOOLS';hd.style.cssText='margin:.8em 0 .25em;color:#ff9866';footer.appendChild(hd);config.append(footer);}
  footer.after(node);
 };
 const start=()=>{install();setInterval(install,500)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
