
/* qp-mission-editor-window-v1 (v4.8240): the TETR.IO app hands same-origin window.open()
   to the operating system, which cannot open tetrio-local:// URLs (macOS, Windows, Linux).
   The offline page asks for this window instead. Only the bundled mission editor page is
   opened, in the same session (same storage as the game), with no Node access. */
(()=>{
 const {BrowserWindow,dialog}=require('electron');
 const EDITOR_PATH='/mission-editor.html';
 const isEditor=value=>{try{const u=new URL(value);return u.protocol==='tetrio-local:'&&u.host==='app'&&u.pathname===EDITOR_PATH}catch{return false}};
 let editorWindow=null;
 ipcMain.handle('qp-open-mission-editor',(event,url)=>{
  try{
   if(event.senderFrame?.parent)throw Error('Top-level page only');
   const from=new URL(event.senderFrame?.url||event.sender.getURL());
   if(from.protocol!=='tetrio-local:'||from.host!=='app')throw Error('Offline page only');
   if(typeof url!=='string'||url.length>2*1024*1024||!isEditor(url))throw Error('Invalid editor address');
   if(editorWindow&&!editorWindow.isDestroyed()){
    editorWindow.loadURL(url).catch(error=>console.error('[QP editor window]',error));
    if(editorWindow.isMinimized())editorWindow.restore();
    editorWindow.show();editorWindow.focus();
    return {ok:true};
   }
   const win=new BrowserWindow({width:1200,height:860,minWidth:720,minHeight:520,show:false,autoHideMenuBar:true,backgroundColor:'#0b0e14',title:'QP 復活ミッションエディタ',
    webPreferences:{session:event.sender.session,contextIsolation:true,nodeIntegration:false,sandbox:true}});
   editorWindow=win;
   try{win.setMenu(null)}catch{}
   const contents=win.webContents;
   contents.setWindowOpenHandler(()=>({action:'deny'}));
   contents.on('will-navigate',(e,next)=>{if(!isEditor(next))e.preventDefault()});
   // The editor asks before leaving with unsaved changes; Electron would otherwise just
   // cancel the close without any prompt.
   contents.on('will-prevent-unload',e=>{
    const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['閉じる','キャンセル'],defaultId:1,cancelId:1,title:'ミッションエディタ',message:'保存していない変更があります。閉じますか?'});
    if(choice===0)e.preventDefault();
   });
   win.once('ready-to-show',()=>win.show());
   win.on('closed',()=>{if(editorWindow===win)editorWindow=null});
   win.loadURL(url).catch(error=>console.error('[QP editor window]',error));
   return {ok:true};
  }catch(error){return {ok:false,error:error.message}}
 });
})();
