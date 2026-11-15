// 文字の盤面 + 画像の盤面 → カウンター用の開幕(OPENERS_S)と途中(MIDS_S)。node curate.cjs > shiwehi-tpl.json
const fs = require('fs');
const T = require('./shiwehi-text.json').map(i => ({ ...i, src: 'text' }));
const G = require('./shiwehi.json').map(i => ({ ...i, head: '', src: 'img:' + i.img }));
const OPEN_X = new Set(['1stpc', 'pcsetups', 'sakanatailpc', 'derivedtcannonop', 'aftertsdop6lpc']);
const MID_X = new Set(['applieddonating', 'basicdonating', 'fillrectangle', 'fintcannon', 'haimentspin', 'hiradumi', 'stickspin']);
const kind = i => (OPEN_X.has(i.page) ? 'open' : MID_X.has(i.page) ? 'mid' : i.cat);
const mirrorRows = rows => rows.map(r => [...r].reverse().map(c => ({ J: 'L', L: 'J', S: 'Z', Z: 'S' }[c] || c)).join(''));
const cells = rows => { const s = new Set(); rows.forEach((r, y) => { for (let x = 0; x < 10; x++) if (r[x] !== '.') s.add((rows.length - 1 - y) * 10 + x); }); return s; };
const sub = (a, b) => a.size < b.size && [...a].every(c => b.has(c));
const nm = i => (i.title + (i.head && i.head !== i.title ? ' ' + i.head.replace(/^.*?「|」.*$/g, '') : '')).slice(0, 40);

function pick(list) {   // ページごとに作りかけ(後の図に含まれる図)を外し、同じ形(反転含む)を 1 つに
  const keep = [], seen = new Set();
  const byPage = {};
  for (const i of list) (byPage[i.page] ||= []).push(i);
  for (const arr of Object.values(byPage)) {
    const cs = arr.map(i => cells(i.rows));
    arr.forEach((i, k) => {
      if (cs.some((c, j) => j !== k && sub(cs[k], c))) return;
      const key = i.rows.join('/'), mk = mirrorRows(i.rows).join('/');
      if (seen.has(key) || seen.has(mk)) return;
      seen.add(key); keep.push(i);
    });
  }
  return keep;
}
// 開幕: 灰なし・ミノ 4〜16 個。形は # と . (T は置く前の形に合わせて空き)
const open = pick([...T, ...G].filter(i => kind(i) === 'open')
  .filter(i => { const n = i.rows.join('').replace(/\./g, '').length; return n >= 16 && n <= 64 && n % 4 === 0; })   // 灰 = 前に置いたミノ(1 巡目を灰で描く図)
  .map(i => { const r = i.rows.map(x => x.replace(/T/g, '.').replace(/[IOSZJL#]/g, '#')); while (r.length && /^\.+$/.test(r[0])) r.shift(); return { ...i, rows: r }; }));
// 途中: 色のミノが少ない図(灰で描いた図)は、表面から 3 段の灰を X(必ず埋まっているマス)にする
const mid = pick([...T, ...G].filter(i => kind(i) === 'mid').map(i => {
  const colored = i.rows.join('').replace(/[.#T]/g, '').length;
  if (colored >= 8) return i;
  const rows = i.rows.map(r => [...r]);
  for (let x = 0; x < 10; x++) { let y = 0; while (y < rows.length && rows[y][x] === '.') y++; for (let d = 0; d < 3 && y + d < rows.length; d++) if (rows[y + d][x] === '#') rows[y + d][x] = 'X'; }
  return { ...i, rows: rows.map(r => r.join('')) };
}));
const nameUniq = arr => { const c = {}; return arr.map(i => { const n = nm(i); c[n] = (c[n] || 0) + 1; return [c[n] > 1 ? n + ' ' + c[n] : n, i.rows.join('/'), i.src, i.page]; }); };
const o = { open: nameUniq(open), mid: nameUniq(mid) };
process.stdout.write(JSON.stringify(o));
console.error('open', o.open.length, 'mid', o.mid.length);
