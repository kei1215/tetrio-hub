// shiwehi のページ → 画像 → 盤面 をまとめ、開幕/中盤に分ける。node sum.cjs DL_DIR > shiwehi.json
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const DL = process.argv[2];
const idx = fs.readFileSync(path.join(DL, 'tindex.html'), 'utf8');
// 索引の見出し → 区分(開幕 / 中盤)。「その他知識」「アルファベット」「日本語」は区分に使わない
const cat = {};
let sec = '';
for (const m of idx.matchAll(/<h[234][^>]*>([\s\S]*?)<\/h[234]>|href="(?:\.\/|\/tetris\/template\/)([a-z0-9]+)\.php"/g)) {
  if (m[1]) { sec = m[1].replace(/<[^>]+>/g, '').trim(); continue; }
  if (/アルファベット|日本語|その他知識/.test(sec) || cat[m[2]]) continue;
  cat[m[2]] = /中盤/.test(sec) ? 'mid' : 'open';
}
const items = [];
for (const f of fs.readdirSync(path.join(DL, 'pages')).sort()) {
  const page = f.replace('.html', ''), h = fs.readFileSync(path.join(DL, 'pages', f), 'utf8');
  const title = ((h.match(/<title>([^<]+)/) || [])[1] || page).split('(')[0].trim();
  // このページの盤面画像: 手順 GIF と、ほかのページの題名画像ではない PNG
  const imgs = [...new Set([...h.matchAll(/src="?\.\/img\/((?:diagram\/)?[^"\s>/]+\.(?:gif|png))/g)].map(m => m[1]))]
    .filter(i => i.startsWith('diagram/') || !fs.existsSync(path.join(DL, 'pages', i.replace(/\.png$/, '.html'))))
    .filter(i => fs.existsSync(path.join(DL, 'img', i)) && !/^(?:[ijlostz]|gmresult|pcemblem)\.png$/.test(i));
  if (!imgs.length) continue;
  const res = JSON.parse(execFileSync('node', [path.join(__dirname, 'read.cjs'), ...imgs.map(i => path.join(DL, 'img', i))], { maxBuffer: 1 << 28 }));
  let k = 0;
  for (const r of res) for (const b of r.boards || []) {
    if (!b.frames) continue;
    let fr = b.frames;
    // GIF: 最初に段が消える直前のコマ(組み終わり)。消えなければ最後のコマ
    const cnt = rows => rows.join('').replace(/[. ]/g, '').length;
    let pick = fr[fr.length - 1];
    for (let i = 1; i < fr.length; i++) if (cnt(fr[i]) < cnt(fr[i - 1]) - 1) { pick = fr[i - 1]; break; }
    const rows = pick.map(l => l.replace(/ /g, '.'));
    while (rows.length && /^\.+$/.test(rows[0])) rows.shift();
    if (rows.length < 2) continue;
    items.push({ page, title, cat: cat[page] || '?', img: path.basename(r.file), n: ++k, rows });
  }
}
process.stdout.write(JSON.stringify(items, null, 1));
