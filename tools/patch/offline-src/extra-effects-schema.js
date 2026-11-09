// QP revive-mission extra effects (v4.8238): JSON normalizer.
// The same text is inlined into custom-missions.js and mission-editor.html by
// tools/patch/build_release.py (marker: QP_EXTRA_SCHEMA). Edit only this file.
const QP_EXTRA_SCHEMA=(()=>{
 const SPIN_RULES=['none','T-spins','T-spins+','all','all+','all-mini','all-mini+','mini-only','handheld','stupid'];
 const RESTORE=['mission','revive','run'];
 const PATTERNS=['native','random','fixed','alternate','twoHoles','checker','shape','template'];
 const SHAPES=['tsd','tst','well4','stairs','zigzag'];
 const METHODS=['rise','terrain','holes','queue'];
 const PIECES=['I','O','T','S','Z','J','L'];
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 const int=(value,min,max,label)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error(label+'が不正です（'+min+'～'+max+'）');return n};
 const pick=(value,list,fallback)=>list.includes(value)?value:fallback;
 const repeat=r=>{r=obj(r);return {seconds:int(r.seconds??0,0,600,'繰り返し秒数'),pieces:int(r.pieces??0,0,100,'繰り返しミノ数')}};
 // Template rows: '#'/'x'/'X' = block, '.'/'_'/' '/'o' = hole. Top row first.
 const templateRows=text=>{
  const rows=String(text??'').replace(/\r/g,'').split('\n').map(s=>s.replace(/\s+$/,'')).filter(s=>s.length);
  if(rows.length>40)throw Error('テンプレートは40段までです');
  for(const row of rows){
   if(row.length>10||/[^#xX._o ]/.test(row))throw Error('テンプレートの行は # と . の10文字以内です');
   const cells=row.padEnd(10,'#').split('');
   if(!cells.some(c=>/[._o ]/.test(c))||!cells.some(c=>/[#xX]/.test(c)))throw Error('テンプレートの各行には穴とブロックを1つ以上入れてください');
  }
  return rows.join('\n');
 };
 const garbageEntry=(g,i)=>{
  g=obj(g);const p=obj(g.pattern);const label='強制ゴミ'+(i+1)+'の';
  const methods=[...new Set((Array.isArray(g.methods)?g.methods:['queue']).map(String))].filter(m=>METHODS.includes(m));
  const type=pick(p.type,PATTERNS,'native');
  const columns=[...new Set((Array.isArray(p.columns)?p.columns:[]).map(Number))];
  if(columns.some(c=>!Number.isInteger(c)||c<1||c>10)||columns.length>9)throw Error(label+'穴の列は1～10（9個まで）です');
  if(type==='fixed'&&!columns.length)throw Error(label+'固定の穴の列を1つ以上選んでください');
  const template=type==='template'?templateRows(p.template):String(p.template??'').slice(0,440);
  if(type==='template'&&!template)throw Error(label+'テンプレートが空です');
  return {enabled:g.enabled!==false,rows:int(g.rows??1,1,20,label+'段数'),methods:methods.length?methods:['queue'],
   pattern:{type,columns:columns.sort((a,b)=>a-b),seedSource:p.seedSource==='fixed'?'fixed':'game',seed:int(p.seed??0,0,2147483647,label+'シード'),
    shape:pick(p.shape,SHAPES,'tsd'),template,mirror:pick(p.mirror,['none','random','always'],'none')},
   bombs:g.bombs===true,repeat:repeat(g.repeat)};
 };
 function normalize(effects){
  const e=obj(effects);
  const u=obj(e.unclearable),b=obj(e.board),m=obj(e.messiness),s=obj(e.spin),p=obj(e.pieces),d=obj(p.delta);
  const garbage=Array.isArray(e.garbage)?e.garbage:[];
  if(garbage.length>6)throw Error('強制ゴミは6件までです');
  return {
   unclearable:{enabled:u.enabled===true,add:int(u.add??0,0,20,'消せない段の追加数'),remove:int(u.remove??0,0,20,'消せない段の削除数'),repeat:repeat(u.repeat)},
   garbage:garbage.map(garbageEntry),
   board:{enabled:b.enabled===true,height:int(b.height??20,4,40,'盤面の高さ'),restoreAt:pick(b.restoreAt,RESTORE,'mission')},
   messiness:{enabled:m.enabled===true,straight:int(m.straight??0,0,100,'直列率'),innerStraight:int(m.innerStraight??100,0,100,'ゴミごとの直列率'),restoreAt:pick(m.restoreAt,RESTORE,'mission')},
   spin:{enabled:s.enabled===true,rule:pick(s.rule,SPIN_RULES,'T-spins'),restoreAt:pick(s.restoreAt,RESTORE,'mission')},
   pieces:{enabled:p.enabled===true,delta:Object.fromEntries(PIECES.map(k=>[k,int(d[k]??0,-1,4,k+'ミノの増減')])),i5:int(p.i5??0,0,4,'I5ミノの数'),restoreAt:pick(p.restoreAt,RESTORE,'mission')}
  };
 }
 const defaults=()=>normalize({});
 const newGarbage=()=>garbageEntry({},0);
 return {normalize,defaults,newGarbage,SPIN_RULES,RESTORE,PATTERNS,SHAPES,METHODS,PIECES};
})();
