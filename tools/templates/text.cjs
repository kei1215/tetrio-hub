// shiwehi のページに文字で書かれた盤面(<div class="ttt"> など)を読む。node text.cjs DL_DIR > shiwehi-text.json
// 文字(サイトの描画スクリプト column-exp.js の色表より): b - B = 空き、c C = 灰、i o j l s z t(大文字も)= ミノ、
// 斜線つき h n k m r y u / 丸つき H N K M R Y U = 置く予定のミノ(I O J L S Z T の順)、p = 印(空き扱い)
const fs = require('fs'), path = require('path');
const DL = process.argv[2];
const MAP = { i: 'I', o: 'O', j: 'J', l: 'L', s: 'S', z: 'Z', t: 'T', h: 'I', n: 'O', k: 'J', m: 'L', r: 'S', y: 'Z', u: 'T', c: '#', C: '#' };
const conv = ch => MAP[ch] || MAP[ch.toLowerCase()] && /[IOJLSZT]/.test(ch) && MAP[ch.toLowerCase()] || (/[HNKMRYU]/.test(ch) ? MAP[ch.toLowerCase()] : '.');
const idx = fs.readFileSync(path.join(DL, 'tindex.html'), 'utf8'), cat = {};
let sec = '';
for (const m of idx.matchAll(/<h[234][^>]*>([\s\S]*?)<\/h[234]>|href="(?:\.\/|\/tetris\/template\/)([a-z0-9]+)\.php"/g)) {
  if (m[1]) { sec = m[1].replace(/<[^>]+>/g, '').trim(); continue; }
  if (/アルファベット|日本語|その他知識/.test(sec) || cat[m[2]]) continue;
  cat[m[2]] = /中盤/.test(sec) ? 'mid' : 'open';
}
const out = [];
for (const f of fs.readdirSync(path.join(DL, 'pages')).sort()) {
  const page = f.replace('.html', ''), h = fs.readFileSync(path.join(DL, 'pages', f), 'utf8');
  const title = ((h.match(/<title>([^<]+)/) || [])[1] || page).split('(')[0].trim();
  let head = '', k = 0;
  for (const m of h.matchAll(/<h([234])[^>]*>([\s\S]*?)<\/h\1>|<div class="?(?:ttt|tetTableText)\b[^>]*>([\s\S]*?)<\/div>/g)) {
    if (m[2] !== undefined) { head = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); continue; }
    const lines = m[3].trim().split(/\s+/).filter(Boolean);
    if (!lines.length || lines.some(l => l.length !== 10)) continue;   // 10 列の盤だけ
    const rows = lines.map(l => [...l].map(conv).join(''));
    while (rows.length && /^\.+$/.test(rows[0])) rows.shift();
    if (rows.length < 2) continue;
    out.push({ page, title, head, cat: cat[page] || '?', n: ++k, rows });
  }
}
process.stdout.write(JSON.stringify(out, null, 1));
