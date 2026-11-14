(function(root){
 function inspect(data){
  if(!data||typeof data!=='object')throw Error('TTRの内容が不正です');
  if(data.replay?.rounds)throw Error('この学習は単独プレイヤーのTTR専用です。TTRMはまだ学習できません');
  if(data.version!==undefined&&data.version!==1)throw Error('現在のTTR形式（version 1）のみ対応しています');
  const replay=data.replay||data,options=replay.options;
  if(!options||options.version!==19)throw Error('vAIは現ゲーム処理 version 19 のTTR専用です');
  if(!Number.isSafeInteger(replay.frames)||replay.frames<1||replay.frames>216000)throw Error('TTRは1フレーム〜1時間までです');
  if(!Array.isArray(replay.events)||replay.events.length>500000)throw Error('TTRのイベント数が不正です');
  let previous=-1,end=false;const types=new Set(['start','full','keydown','keyup','ige','end']);
  for(const event of replay.events){if(!event||!types.has(event.type)||!Number.isSafeInteger(event.frame)||event.frame<0||event.frame<previous||event.frame>replay.frames+1)throw Error('TTRのイベント形式・順序が不正です');previous=event.frame;if(event.type==='end')end=true}
  if(!end)throw Error('最後まで記録されたTTRを選んでください（終了イベントがありません）');
  if((options.boardwidth??10)!==10||![14,20].includes(options.boardheight??20)||(options.boardbuffer??20)!==20)throw Error('このTTRの盤面サイズは学習対象外です');
  let mode;
  if(options.zenlevels||data.gamemode==='zen')throw Error('ZENはTTR学習の対象外です');
  if(options.zenith||['zenith','zenithex'].includes(data.gamemode))mode=(options.zenith_mods?.length||['expert','duo','nohold','messy','gravity','volatile','doublehole','invisible','allspin'].some(mod=>options['zenith_'+mod]))?'qp-mod':'qp';
  else if(data.gamemode==='40l'||options.objective_type==='lines'&&options.objective_count===40)mode='40l';
  else if(data.gamemode==='blitz'||options.levels&&options.objective_type==='timed')mode='blitz';
  else if(data.gamemode==='league'||options.mission==='LOCAL TETRA LEAGUE')mode='qp';
  else throw Error('QP・40 LINES・BLITZ・TLの単独TTRを選んでください');
  return {mode,frames:replay.frames,events:replay.events.length,replay};
 }
 if(typeof module!=='undefined')module.exports={inspect};else root.LocalTTRFormat={inspect};
})(typeof window==='undefined'?globalThis:window);
