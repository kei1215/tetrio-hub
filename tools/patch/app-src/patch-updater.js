
/* qp-patch-updater-v1 (v4.8241): CONFIG > QP PATCH TOOLS > PATCH UPDATE.
   Reads the installed patch record (kind A/R/O and update number), compares it with the
   published latest.json, downloads the launcher for this OS and the same kind, checks its
   SHA-256, quits TETR.IO and runs the launcher once the app has exited (the installer
   refuses to patch a running app and relaunches TETR.IO when it is done).
   macOS, Windows and Linux; nothing runs without the player's click. */
(()=>{
 const {app,ipcMain,net}=require('electron');
 const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn}=require('child_process');
 const MANIFEST='https://kei1215.github.io/tetrio-hub/patch/latest.json';
 const DOWNLOAD_BASE='https://github.com/kei1215/tetrio-hub/releases/download/';
 const RESOURCE='TETRIO-Resources-1.0.zip';
 const OS_NAME={darwin:'Mac',win32:'Windows',linux:'Linux'}[process.platform]||null;
 const EXT={Mac:'.command',Windows:'.cmd',Linux:'.sh'};
 const statePath=()=>path.join(app.getPath('userData'),'qp-patch-update.json');
 const allowed=event=>{
  if(event.senderFrame?.parent)return false;
  try{const u=new URL(event.senderFrame?.url||event.sender.getURL());return u.origin==='https://tetr.io'||u.protocol==='tetrio-local:'&&u.host==='app'}catch{return false}
 };
 const installRecord=()=>{try{return JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'qp-replay-patch-install.json'),'utf8'))}catch{return null}};
 const readState=()=>{try{return JSON.parse(fs.readFileSync(statePath(),'utf8'))}catch{return {}}};
 const writeState=value=>{try{fs.mkdirSync(path.dirname(statePath()),{recursive:true});fs.writeFileSync(statePath(),JSON.stringify(value))}catch{}};
 async function manifest(){
  const response=await net.fetch(MANIFEST+'?t='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('更新情報を取得できません('+response.status+')');
  const m=await response.json();
  if(!/^4\.\d{4}$/.test(String(m?.version))||typeof m.files!=='object')throw Error('更新情報が正しくありません');
  return m;
 }
 const updateNumber=version=>Number(String(version).split('.')[1]);
 function resourceFolder(){
  const downloads=(()=>{try{return app.getPath('downloads')}catch{return path.join(os.homedir(),'Downloads')}})();
  const dirs=[...new Set([downloads,path.join(downloads,'all-tetrio-patch'),path.join(os.homedir(),'Downloads'),path.join(os.homedir(),'Downloads','all-tetrio-patch')])];
  return {dirs,found:dirs.find(dir=>{try{return fs.statSync(path.join(dir,RESOURCE)).isFile()}catch{return false}})||null,downloads};
 }
 const tail=file=>{try{return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).slice(-4).join('\n')}catch{return ''}};
 ipcMain.handle('qp-patch-update-check',async event=>{
  try{
   if(!allowed(event))throw Error('Unsupported page');
   const record=installRecord();if(!record||!['A','R','O'].includes(record.kind))throw Error('パッチのインストール記録が見つかりません');
   const m=await manifest(),latest=updateNumber(m.version),state=readState();
   const failed=state.target&&record.update<state.target?(tail(state.log)||'更新が完了しませんでした'):'';
   return {ok:true,kind:record.kind,installed:record.update,latest,version:m.version,available:latest>record.update&&!!OS_NAME,os:OS_NAME,failed};
  }catch(error){return {ok:false,error:error.message}}
 });
 let running=false;
 ipcMain.handle('qp-patch-update-run',async event=>{
  try{
   if(!allowed(event))throw Error('Unsupported page');
   if(running)throw Error('更新の準備中です');
   if(!OS_NAME)throw Error('この OS では自動更新できません');
   const record=installRecord();if(!record||!['A','R','O'].includes(record.kind))throw Error('パッチのインストール記録が見つかりません');
   const m=await manifest(),latest=updateNumber(m.version);
   if(!(latest>record.update))throw Error('すでに最新です');
   const name=`tetrio-patch-${OS_NAME}-v${record.kind}${m.version}${EXT[OS_NAME]}`;
   const entry=m.files[name];
   if(!entry||!/^[0-9a-f]{64}$/.test(String(entry.sha256)))throw Error('この OS・種類のファイルがありません: '+name);
   const base=String(m.base||'');if(!base.startsWith(DOWNLOAD_BASE))throw Error('更新ファイルの場所が正しくありません');
   // O / A need the resource pack next to the launcher (or one folder up / in Downloads).
   const where=resourceFolder();
   const folder=record.kind==='R'?(where.found||where.downloads):where.found;
   if(!folder)throw Error(RESOURCE+' が「ダウンロード」(または ダウンロード/all-tetrio-patch)に見つかりません');
   running=true;
   const response=await net.fetch(base+name,{cache:'no-store'});
   if(!response.ok)throw Error('ダウンロードに失敗しました('+response.status+')');
   const data=Buffer.from(await response.arrayBuffer());
   if(crypto.createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('ダウンロードしたファイルの確認(SHA-256)に失敗しました');
   const launcher=path.join(folder,name);
   fs.writeFileSync(launcher,data,{mode:0o755});
   // The waiter is a file, so its command line never matches the installer's own
   // "is TETR.IO running?" check.
   const work=fs.mkdtempSync(path.join(os.tmpdir(),'tetrio-patch-update-'));
   const log=path.join(work,'update.log');
   const env={...process.env,QP_PID:String(process.pid),QP_LAUNCHER:launcher,QP_LOG:log};
   let child;
   if(OS_NAME==='Windows'){
    const script=path.join(work,'update.ps1');
    fs.writeFileSync(script,[
     '$p=[int]$env:QP_PID',
     'while(Get-Process -Id $p -ErrorAction SilentlyContinue){Start-Sleep -Milliseconds 500}',
     '$i=0;while((Get-Process -Name "TETR.IO","tetrio","tetrio-desktop" -ErrorAction SilentlyContinue) -and $i -lt 120){Start-Sleep -Milliseconds 500;$i++}',
     '& cmd.exe /d /c "`"$env:QP_LAUNCHER`"" *> $env:QP_LOG'
    ].join('\r\n'),'utf8');
    child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',script],{detached:true,stdio:'ignore',windowsHide:true,env});
   }else{
    const script=path.join(work,'update.sh');
    const busy=OS_NAME==='Mac'?'/usr/bin/pgrep -f "[/]TETR.IO.app/Contents/MacOS/" >/dev/null 2>&1':'{ pgrep -x tetrio-desktop >/dev/null 2>&1 || pgrep -x tetrio >/dev/null 2>&1; }';
    fs.writeFileSync(script,[
     '#!/bin/sh',
     'while kill -0 "$QP_PID" 2>/dev/null; do sleep 0.5; done',
     'i=0; while '+busy+' && [ $i -lt 120 ]; do sleep 0.5; i=$((i+1)); done',
     '/bin/sh "$QP_LAUNCHER" > "$QP_LOG" 2>&1'
    ].join('\n')+'\n',{mode:0o755});
    child=spawn('/bin/sh',[script],{detached:true,stdio:'ignore',env});
   }
   child.unref();
   writeState({target:latest,from:record.update,kind:record.kind,launcher,log,at:Date.now()});
   setTimeout(()=>app.quit(),800);
   return {ok:true,version:m.version,launcher};
  }catch(error){running=false;return {ok:false,error:error.message}}
 });
})();
