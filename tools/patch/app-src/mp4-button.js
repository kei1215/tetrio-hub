function qpReplayMp4Button(document, window) {
 /* qp-replay-mp4-button-v1 (v4.8260): patch only. Replay → MP4 (tetrio-hub replay-video) from
  *  - the results screen REPLAY row, between X and download (solo results and 2-player match results), and
  *  - CONFIG > QP PATCH TOOLS > REPLAY → MP4 (opens the panel to choose a file).
  * The replay is taken from TETR.IO's own download button (its file is captured, nothing is saved),
  * then handed to the MP4 tool, which runs in this page and shows only its progress panel. */
 if(window.location.protocol!=='https:')return;
 const TOOL='https://kei1215.github.io/tetrio-hub/replay-video/tetrio-replay-video.js';
 const loadTool=()=>new Promise((ok,ng)=>{
  if(window.__trvLoad)return ok();
  const s=document.createElement('script');s.src=TOOL+'?v='+Date.now();
  s.onload=()=>window.__trvLoad?ok():ng(Error('MP4 tool did not start'));s.onerror=()=>ng(Error('MP4 tool could not be loaded'));
  document.head.appendChild(s);
 });
 // Click TETR.IO's download button but keep the file instead of saving it.
 const capture=download=>new Promise((ok,ng)=>{
  const make=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob=null,name=null;
  URL.createObjectURL=function(b){blob=b;return make.call(URL,b)};
  HTMLAnchorElement.prototype.click=function(){name=this.download||null};
  try{download.click()}catch(e){ng(e)}finally{URL.createObjectURL=make;HTMLAnchorElement.prototype.click=click}
  if(!blob)return ng(Error('no replay on this screen'));
  blob.text().then(text=>ok({text,name:name||'replay.ttr'}),ng);
 });
 const run=async download=>{
  try{
   const [r]=await Promise.all([download?capture(download):null,loadTool()]);
   if(r)window.__trvLoad(r.text,r.name);else window.__trvLoad&&document.getElementById('trv-headless')&&(document.getElementById('trv-headless').hidden=false);
  }catch(e){console.warn('[replay mp4]',e);window.alert('MP4 変換を開けません: '+(e.message||e))}
 };
 const button=(id,download)=>{
  if(!download||document.getElementById(id))return;
  const b=document.createElement('div');
  b.id=id;b.className='ns rg_target_pri watchreplay';b.title='この リプレイ を MP4 動画にする';
  b.setAttribute('data-hover','hover');b.setAttribute('data-hit','hit3');
  // same box as X / download (48px wide, 22.4px gap), text instead of an icon glyph
  b.style.cssText='width:48px;padding-left:0;padding-right:0;text-align:center;margin-right:22.4px';
  b.innerHTML='<span style="font-size:16px;font-weight:900;line-height:37px;display:inline-block;vertical-align:top;letter-spacing:0">MP4</span>';
  b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();run(download)},true);
  download.parentNode.insertBefore(b,download); // between X and download
 };
 // Replays opened from a file: TETR.IO hides the whole REPLAY row (no replay id), so the MP4 button
 // inside it is hidden too. Then show our own MP4 button on the screen (same capture, same tool).
 const shown=e=>!!(e&&e.offsetParent!==null&&e.getBoundingClientRect().width>0);
 const floating=()=>{
  let f=document.getElementById('qp-mp4-float');
  const views=[['results','downloadreplay_results','qp-mp4-results'],['multilogview','downloadreplay_multilog','qp-mp4-multilog']];
  const v=views.find(([view,,inRow])=>shown(document.getElementById(view))&&!shown(document.getElementById(inRow)));
  if(!v){if(f)f.style.display='none';return}
  if(!f){
   f=document.createElement('div');f.id='qp-mp4-float';f.title='このリプレイを MP4 動画にする';f.setAttribute('role','button');
   // outside the REPLAY row TETR.IO's button styles do not apply: own look, under BACK, on top
   f.style.cssText='position:fixed;left:16px;top:150px;z-index:2147483000;cursor:pointer;background:rgba(10,12,20,.82);color:#fff;border:2px solid rgba(255,255,255,.55);border-radius:4px;padding:4px 14px;font-family:HUN,sans-serif;font-size:20px;font-weight:900;letter-spacing:.04em;user-select:none';
   f.textContent='\u25b6 MP4';
   f.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();run(document.getElementById(f.dataset.download))},true);
   document.body.appendChild(f);
  }
  f.dataset.download=v[1];f.style.display='';
 };
 const install=()=>{
  button('qp-mp4-results',document.getElementById('downloadreplay_results'));
  button('qp-mp4-multilog',document.getElementById('downloadreplay_multilog'));
  floating();
  if(!document.getElementById('qp-mp4-config')){
   const account=document.getElementById('config_account');
   const config=account?.closest?.('[data-menuview="config"]')||document.querySelector('[data-menuview="config"]');
   if(config){
    const template=document.getElementById('config_export')||account;
    const node=document.createElement('div');node.id='qp-mp4-config';
    node.className=template?.className||'scroller_item scroller_item_config has_description ns rg_target_pri';
    node.setAttribute('role','button');node.tabIndex=0;
    const h=document.createElement('h1'),p=document.createElement('p');h.textContent='REPLAY → MP4';p.textContent='リプレイ(.ttr / .ttrm)を MP4 動画にする';node.append(h,p);
    const go=e=>{e.preventDefault();e.stopImmediatePropagation();run(null)};
    node.addEventListener('click',go,true);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')go(e)},true);
    let footer=document.getElementById('qp-patch-tools-footer');
    if(!footer){footer=document.createElement('div');footer.id='qp-patch-tools-footer';footer.className='scroller_block zero';const hd=document.createElement('h2');hd.className='ns';hd.textContent='QP PATCH TOOLS';hd.style.cssText='margin:.8em 0 .25em;color:#ff9866';footer.appendChild(hd);config.append(footer);}
    footer.after(node);
   }
  }
 };
 // CONFIG can be rebuilt by other patch entries: keep putting ours back (cheap id checks)
 const start=()=>{install();setInterval(install,500)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
