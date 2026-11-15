// four.lol の page-data から、見出しごとの最初の fumen を取り出して md にする
const { decoder } = require('tetris-fumen');
const { execFileSync } = require('child_process');
const fs = require('fs');
const PAGES = process.argv.slice(3);
const out = [];
for (const p of PAGES) {
  const f = `pd/${p.replace(/\//g, '_')}.json`;
  if (!fs.existsSync(f)) { fs.mkdirSync('pd', { recursive: true }); execFileSync('curl', ['-sL', '-A', 'Mozilla/5.0', `https://four.lol/page-data/${p}/page-data.json`, '-o', f]); }
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { console.error('skip', p); continue; }
  const s = JSON.stringify(j);
  const tt = s.match(/"title":"([^"]+)"/g) || [], title = tt[1] ? tt[1].slice(9, -1) : p;
  // 見出しと Fumen を出てくる順に
  const re = /mdx\(\\"h([23])\\", \{\\n\s*\\"id\\": \\"([^\\]+)\\"\\n\s*\}, \\"((?:[^\\]|\\[^"])*)\\"|mdx\(Fumen, \{\\n\s*data: \\"([vmd]115@[A-Za-z0-9+/?]+)\\"/g;
  let m, sec = title, used = {};
  while ((m = re.exec(s))) {
    if (m[1]) { sec = m[3].replace(/\\"/g, '').replace(/mdx\([^,]*,[^,]*,\s*/g, '').trim() || m[2]; continue; }
    const ix = (used[sec] = (used[sec] || 0) + 1);
    let pg; try { pg = decoder.decode(m[4]); } catch { continue; }
    const fld = pg[0].field, rows = [];
    for (let y = 22; y >= 0; y--) { let r = ''; for (let x = 0; x < 10; x++) { const c = fld.at(x, y); r += c === '_' ? '.' : c === 'X' ? '#' : c; } rows.push(r); }
    while (rows.length && rows[0] === '..........') rows.shift();
    if (!rows.length) continue;
    out.push({ page: p, title, sec: ix > 1 ? sec + " " + ix : sec, code: m[4], rows, pages: pg.length });
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(out.length);
