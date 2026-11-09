
/* qp-patch-updater-v1 (v4.8241): CONFIG > QP PATCH TOOLS > PATCH UPDATE.
   Reads the installed patch record (kind A/R/O and update number), compares it with the
   published latest.json, downloads the launcher for this OS and the same kind, checks its
   SHA-256, quits TETR.IO and runs the launcher once the app has exited (the installer
   refuses to patch a running app and relaunches TETR.IO when it is done).
   macOS, Windows and Linux; nothing runs without the player's click. */
(()=>{
 const {app,ipcMain}=require('electron');
 const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),https=require('https'),{spawn}=require('child_process');
 // Node's https, not Electron net.fetch: the TETR.IO app filters its own sessions and
 // net.fetch failed there (net::ERR_UNEXPECTED). https only; follows GitHub's redirects.
 function get(url,redirects=5,headers={}){
  return new Promise((resolve,reject)=>{
   let target;try{target=new URL(url)}catch{return reject(Error('Invalid address'))}
   if(target.protocol!=='https:')return reject(Error('https only'));
   const request=https.get(target,{headers:{'User-Agent':'tetrio-patch-updater','Cache-Control':'no-cache',...headers},timeout:30000},response=>{
    const code=response.statusCode||0;
    if(code>=300&&code<400&&response.headers.location){response.resume();if(redirects<=0)return reject(Error('Too many redirects'));return resolve(get(new URL(response.headers.location,target).href,redirects-1))}
    const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:code,ok:code>=200&&code<300,body:Buffer.concat(chunks)}));response.on('error',reject);
   });
   request.on('timeout',()=>request.destroy(Error('通信がタイムアウトしました')));request.on('error',reject);
  });
 }
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
  const response=await get(MANIFEST+'?t='+Date.now());
  if(!response.ok)throw Error('更新情報を取得できません('+response.status+')');
  let m;try{m=JSON.parse(response.body.toString('utf8'))}catch{throw Error('更新情報が正しくありません')}
  if(!/^4\.\d{4}$/.test(String(m?.version))||typeof m.files!=='object')throw Error('更新情報が正しくありません');
  return m;
 }
 const updateNumber=version=>Number(String(version).split('.')[1]);
 function resourceFolder(){
  const downloads=(()=>{try{return app.getPath('downloads')}catch{return path.join(os.homedir(),'Downloads')}})();
  // all-tetrio-patch first: launchers are kept there, next to the resource pack.
  const dirs=[...new Set([path.join(downloads,'all-tetrio-patch'),downloads,path.join(os.homedir(),'Downloads','all-tetrio-patch'),path.join(os.homedir(),'Downloads')])];
  return {dirs,found:dirs.find(dir=>{try{return fs.statSync(path.join(dir,RESOURCE)).isFile()}catch{return false}})||null,downloads};
 }
 // The log is UTF-8 (a BOM from PowerShell is dropped); older Windows logs were UTF-16.
 const tail=file=>{try{const b=fs.readFileSync(file);const text=b[0]===0xff&&b[1]===0xfe?b.slice(2).toString('utf16le'):b.toString('utf8').replace(/^\ufeff/,'');return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(-4).join('\n')}catch{return ''}};
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
   // Direct release download first; when it fails (GitHub sometimes answers 5xx there),
   // fetch the same asset through the GitHub API (same file, checked by the same SHA-256).
   let response=await get(base+name).catch(error=>({ok:false,status:String(error.message||error)}));
   if(!response.ok){
    const first=response.status;
    const tag='patch-v'+m.version;
    const info=await get('https://api.github.com/repos/kei1215/tetrio-hub/releases/tags/'+tag,5,{Accept:'application/vnd.github+json'});
    let asset=null;try{asset=JSON.parse(info.body.toString('utf8')).assets?.find(a=>a.name===name)}catch{}
    if(!info.ok||!asset?.id)throw Error('ダウンロードに失敗しました('+first+' / API '+info.status+')');
    response=await get('https://api.github.com/repos/kei1215/tetrio-hub/releases/assets/'+Number(asset.id),5,{Accept:'application/octet-stream'});
    if(!response.ok)throw Error('ダウンロードに失敗しました('+first+' / API '+response.status+')');
   }
   const data=response.body;
   if(crypto.createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('ダウンロードしたファイルの確認(SHA-256)に失敗しました');
   const launcher=path.join(folder,name);
   fs.writeFileSync(launcher,data,{mode:0o755});
   // Remove only the launcher this updater downloaded last time (never other files).
   const previous=readState().launcher;
   if(previous&&previous!==launcher&&/^tetrio-patch-(Mac|Windows|Linux)-v[ARO]4\.\d{4}\.(command|cmd|sh)$/.test(path.basename(previous)))try{fs.unlinkSync(previous)}catch{}
   // The waiter is a file, so its command line never matches the installer's own
   // "is TETR.IO running?" check.
   const work=fs.mkdtempSync(path.join(os.tmpdir(),'tetrio-patch-update-'));
   const log=path.join(work,'update.log');
   // The app to start again if the update fails (on success the installer starts it).
   const appBundle=OS_NAME==='Mac'?path.resolve(process.execPath,'..','..','..'):'';
   const env={...process.env,QP_PID:String(process.pid),QP_LAUNCHER:launcher,QP_LOG:log,QP_APP_EXEC:process.execPath,QP_APP_BUNDLE:appBundle};
   let child;
   if(OS_NAME==='Windows'){
    const script=path.join(work,'update.ps1');
    // ASCII only (Windows PowerShell 5.1 reads a BOM-less script as ANSI). The launcher is
    // started with the call operator, which quotes paths with spaces / non-ASCII correctly.
    fs.writeFileSync(script,[
     '$ErrorActionPreference="Continue"',
     '$p=[int]$env:QP_PID',
     'while(Get-Process -Id $p -ErrorAction SilentlyContinue){Start-Sleep -Milliseconds 500}',
     '$i=0;while((Get-Process -Name "TETR.IO","tetrio","tetrio-desktop" -ErrorAction SilentlyContinue) -and $i -lt 360){Start-Sleep -Milliseconds 500;$i++}',
     '"waited " + ($i/2) + "s for TETR.IO to exit" | Out-File -FilePath $env:QP_LOG -Encoding utf8',
     '$code=1',
     'try{ & $env:QP_LAUNCHER 2>&1 | Out-File -FilePath $env:QP_LOG -Encoding utf8 -Append; $code=$LASTEXITCODE }catch{ ($_ | Out-String) | Out-File -FilePath $env:QP_LOG -Encoding utf8 -Append }',
     '"exit=" + $code | Out-File -FilePath $env:QP_LOG -Encoding utf8 -Append',
     'if($code -ne 0 -and $env:QP_APP_EXEC){ Start-Process -FilePath $env:QP_APP_EXEC }'
    ].join('\r\n'),'ascii');
    child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',script],{detached:true,stdio:'ignore',windowsHide:true,env});
   }else{
    const script=path.join(work,'update.sh');
    const busy=OS_NAME==='Mac'?'/usr/bin/pgrep -f "[/]TETR.IO.app/Contents/MacOS/" >/dev/null 2>&1':'{ pgrep -x tetrio-desktop >/dev/null 2>&1 || pgrep -x tetrio >/dev/null 2>&1; }';
    const relaunch=OS_NAME==='Mac'?'[ -n "$QP_APP_BUNDLE" ] && /usr/bin/open -a "$QP_APP_BUNDLE"':'[ -n "$QP_APP_EXEC" ] && nohup "$QP_APP_EXEC" >/dev/null 2>&1 &';
    fs.writeFileSync(script,[
     '#!/bin/sh',
     'while kill -0 "$QP_PID" 2>/dev/null; do sleep 0.5; done',
     'i=0; while '+busy+' && [ $i -lt 360 ]; do sleep 0.5; i=$((i+1)); done',
     '/bin/sh "$QP_LAUNCHER" > "$QP_LOG" 2>&1',
     'code=$?',
     'echo "exit=$code" >> "$QP_LOG"',
     '# On failure start TETR.IO again so CONFIG > PATCH UPDATE can show why.',
     'if [ "$code" -ne 0 ]; then '+relaunch+'; fi'
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
