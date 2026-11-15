/* Shared room-setting presets: no network writes, works on official/local pages. */
(() => {
 const key='qp-local-room-presets-fallback-v1';
 const defaults={
  name:'TETRA LEAGUE',userLimit:2,gamebgm:'RANDOMbattle',
  match:{gamemode:'versus',ft:5,wb:1,gp:0},
  options:{stock:0,bagtype:'7-bag',spinbonuses:'all-mini+',combotable:'multiplier',allow180:1,kickset:'SRS+',allow_harddrop:1,display_next:1,display_hold:1,nextcount:5,display_shadow:1,boardwidth:10,boardheight:20,g:.02,gincrease:.0035,gmargin:7200,locktime:30,garbagecap:8,b2bcharging:1,allclears:1,passthrough:'zero',roundmode:'down'}
 };
 const copy=value=>structuredClone(value);
 const valid=data=>data&&data.schema===1&&Array.isArray(data.presets)&&data.presets.length<=64;
 function read(){try{const value=window.QPLocalStorage?.readRoomPresets?.();if(valid(value))return value}catch(error){console.warn('[Room presets]',error)}try{const value=JSON.parse(localStorage.getItem(key)||'{"schema":1,"presets":[]}');return valid(value)?value:{schema:1,presets:[]}}catch{return {schema:1,presets:[]}}}
 function write(data){if(!valid(data))throw Error('ルーム設定の保存形式が不正です');try{if(window.QPLocalStorage?.writeRoomPresets){window.QPLocalStorage.writeRoomPresets(data);return}}catch(error){throw Error('共通ルーム設定を保存できません: '+error.message)}localStorage.setItem(key,JSON.stringify(data))}
 function save(name,settings){const data=read(),item={id:crypto.randomUUID(),name:String(name||'ルーム設定').trim().slice(0,64)||'ルーム設定',settings:copy(settings)};data.presets.push(item);write(data);return item}
 function remove(id){const data=read();data.presets=data.presets.filter(p=>p.id!==id);write(data)}
 window.LocalRoomPresets={defaults:copy(defaults),read,write,save,remove};
 const attach=()=>{
  const panel=document.getElementById('local-panel');if(!panel||document.getElementById('local-room-presets'))return;
  const section=document.createElement('details');section.id='local-room-presets';const title=document.createElement('summary');title.textContent='ルーム設定の保存・共有（vAI）';section.appendChild(title);
  const note=document.createElement('p');note.textContent='公式ルームへ自動送信しません。オンラインとオフラインで同じ端末保存枠を共有します。JSONには貼り付けたルーム仕様の options.* / match.* をそのまま保存できます。';section.appendChild(note);
  const name=document.createElement('input');name.placeholder='設定名';name.maxLength=64;section.appendChild(name);
  const editor=document.createElement('textarea');editor.rows=13;editor.style.width='100%';editor.value=JSON.stringify(defaults,null,2);editor.setAttribute('aria-label','ルーム設定JSON');section.appendChild(editor);
  const list=document.createElement('select');list.setAttribute('aria-label','保存済みルーム設定');section.appendChild(list);
  const status=document.createElement('p');section.appendChild(status);
  const refresh=()=>{const prior=list.value;list.replaceChildren();for(const item of read().presets){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;list.appendChild(option)}if([...list.options].some(o=>o.value===prior))list.value=prior;status.textContent=`保存済み ${list.options.length}件`};
  const button=(text,action)=>{const item=document.createElement('button');item.textContent=text;item.onclick=()=>{try{action();refresh()}catch(error){status.textContent=error.message}};section.appendChild(item)};
  button('現在のJSONを保存',()=>save(name.value,JSON.parse(editor.value)));
  button('選択を読み込む',()=>{const item=read().presets.find(p=>p.id===list.value);if(!item)throw Error('設定を選択してください');name.value=item.name;editor.value=JSON.stringify(item.settings,null,2)});
  button('選択を削除',()=>{if(!list.value)throw Error('設定を選択してください');remove(list.value)});
  panel.appendChild(section);refresh();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
