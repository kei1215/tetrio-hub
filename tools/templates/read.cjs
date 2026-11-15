// shiwehi の盤面画像を読んで盤面(10 列、上から)の文字にする。
// node read.cjs FILE... → JSON [{file, boards:[{x,y,p,frames:[[行...]]}]}]
//  GIF(手順のアニメ)= 画像全体が 1 盤面。コマごとに読む(同じ盤面が続くコマはまとめる)。
//  PNG(組み方一覧など)= 1 枚に盤面が何枚も並ぶ。黒い空きマスを探し、同じ格子に乗るものをまとめて盤面にする。
// 色: 黒=空き(.)、灰=下地(#)、色付き=ミノ(色相で I O T S Z J L。薄い色=次のミノも同じ文字)、背景=盤の外
const fs = require('fs');
const { GifReader } = require('omggif');

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx, d };
}
function classify(r, g, b) {
  const { h, v, d } = hsv(r, g, b);
  if (v < 55) return '.';
  if (d < 35) return v > 215 ? ' ' : '#';            // 白っぽい = 背景、灰 = 下地
  if (v > 225 && d < 45) return ' ';                  // 淡い背景色
  if (h < 18 || h >= 335) return 'Z';
  if (h < 45) return 'L';
  if (h < 75) return 'O';
  if (h < 160) return 'S';
  if (h < 205) return 'I';
  if (h < 255) return 'J';
  return 'T';
}

function img(file) {
  const buf = fs.readFileSync(file);
  if (/\.png$/i.test(file)) {
    const { PNG } = require('pngjs'), im = PNG.sync.read(buf);
    return { W: im.width, H: im.height, frames: [im.data] };
  }
  const gr = new GifReader(buf), W = gr.width, H = gr.height, px = new Uint8ClampedArray(W * H * 4), frames = [];
  for (let f = 0; f < gr.numFrames(); f++) {
    gr.decodeAndBlitFrameRGBA(f, px);                 // 差分コマは前のコマに重ねる
    frames.push(px.slice());
    if (gr.frameInfo(f).disposal === 2) px.fill(0);
  }
  return { W, H, frames };
}

// 盤のマス (cx, cy) = 中心ピクセル。中心付近の平均色で判定
function cellAt(px, W, H, x, y, p) {
  const k = Math.max(1, Math.floor(p / 6));
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    const X = Math.round(x + dx), Y = Math.round(y + dy);
    if (X < 0 || Y < 0 || X >= W || Y >= H) return ' ';
    const i = (Y * W + X) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
  }
  return classify(r / n, g / n, b / n);
}

// PNG: 黒マス(ほぼ正方形の暗い塊)を探す
function blackCells(px, W, H) {
  const seen = new Uint8Array(W * H), out = [];
  const dark = i => px[i * 4] < 45 && px[i * 4 + 1] < 45 && px[i * 4 + 2] < 45;
  const st = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !dark(s)) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    st.push(s); seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W, y = (i / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= W * H || seen[j] || Math.abs((j % W) - x) > 1) continue;
        if (dark(j)) { seen[j] = 1; st.push(j); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w >= 8 && h >= 8 && w <= 90 && h <= 90 && Math.abs(w - h) <= Math.max(2, w * 0.15) && n >= w * h * 0.8)
      out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: (w + h) / 2 });
  }
  return out;
}

function boardsOfPng(px, W, H) {
  const cs = blackCells(px, W, H), par = cs.map((_, i) => i);
  const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
  // 同じ盤 = 大きさが同じで、格子(間隔 ≒ マス+線)に乗り、近い
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (Math.abs(a.s - b.s) > 2) continue;
    const p = a.s + 2, dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx > 1.6 * p || dy > 1.6 * p) continue;       // 隣のマスだけつなぐ(盤どうしをつながない)
    const ox = Math.abs(dx - Math.round(dx / p) * p), oy = Math.abs(dy - Math.round(dy / p) * p);
    if (ox < 0.25 * p && oy < 0.25 * p) par[find(i)] = find(j);
  }
  const groups = new Map();
  cs.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  const boards = [];
  for (const g of groups.values()) {
    if (g.length < 6) continue;
    // 間隔 = 隣どうしの距離の中央値
    const ds = [];
    for (const a of g) for (const b of g) { const d = b.x - a.x; if (d > a.s * 0.6 && d < a.s * 1.6 && Math.abs(b.y - a.y) < a.s * 0.3) ds.push(d); }
    for (const a of g) for (const b of g) { const d = b.y - a.y; if (d > a.s * 0.6 && d < a.s * 1.6 && Math.abs(b.x - a.x) < a.s * 0.3) ds.push(d); }
    if (!ds.length) continue;
    ds.sort((x, y) => x - y);
    const p = ds[ds.length >> 1], x0 = Math.min(...g.map(c => c.x)), y0 = Math.min(...g.map(c => c.y));
    const cols = g.map(c => Math.round((c.x - x0) / p)), rows = g.map(c => Math.round((c.y - y0) / p));
    let c0 = 0, c1 = Math.max(...cols), r0 = 0, r1 = Math.max(...rows);
    const inside = (c, r) => cellAt(px, W, H, x0 + c * p, y0 + r * p, p) !== ' ';
    const colIn = c => { for (let r = r0; r <= r1; r++) if (!inside(c, r)) return false; return true; };
    const rowIn = r => {
      let l = '';
      for (let c = c0; c <= c1; c++) { if (!inside(c, r)) return false; l += cellAt(px, W, H, x0 + c * p, y0 + r * p, p); }
      return !/^([IOTSZJL])\1+$/.test(l) || l.length < 6;   // 1 色だけの段 = パネルの色枠(盤ではない)
    };
    for (let it = 0; it < 40; it++) {                // 背景に当たるまで外へ広げる(横は 10 列まで)
      let grew = false;
      if (c1 - c0 < 9 && colIn(c0 - 1)) { c0--; grew = true; }
      if (c1 - c0 < 9 && colIn(c1 + 1)) { c1++; grew = true; }
      if (rowIn(r0 - 1)) { r0--; grew = true; }
      if (rowIn(r1 + 1)) { r1++; grew = true; }
      if (!grew) break;
    }
    if (c1 - c0 !== 9) { boards.push({ x: Math.round(x0 + c0 * p), y: Math.round(y0 + r0 * p), p: +p.toFixed(1), bad: `幅 ${c1 - c0 + 1} 列` }); continue; }
    const out = [];
    for (let r = r0; r <= r1; r++) { let l = ''; for (let c = c0; c <= c1; c++) l += cellAt(px, W, H, x0 + c * p, y0 + r * p, p); out.push(l); }
    boards.push({ x: Math.round(x0 + c0 * p), y: Math.round(y0 + r0 * p), p: +p.toFixed(1), frames: [out] });
  }
  // 読む順 = 上の段から、左から
  boards.sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x));
  return boards;
}

function boardOfGif(im) {
  const { W, H } = im, p = W / 10, rows = Math.round(H / p), q = H / rows, frames = [];
  for (const px of im.frames) {
    const out = [];
    for (let r = 0; r < rows; r++) { let l = ''; for (let c = 0; c < 10; c++) l += cellAt(px, W, H, (c + 0.5) * p, (r + 0.5) * q, p); out.push(l); }
    if (!frames.length || frames[frames.length - 1].join('/') !== out.join('/')) frames.push(out);
  }
  return [{ x: 0, y: 0, p: +p.toFixed(1), frames }];
}

const res = process.argv.slice(2).map(file => {
  try { const im = img(file); return { file, boards: /\.png$/i.test(file) ? boardsOfPng(im.frames[0], im.W, im.H) : boardOfGif(im) }; }
  catch (e) { return { file, error: String(e) }; }
});
process.stdout.write(JSON.stringify(res));
