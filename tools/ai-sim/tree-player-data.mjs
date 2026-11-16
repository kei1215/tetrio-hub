// vA Tree player data (user: 新しいAIのデータは複数インストールできて、選んだプレーヤーのデータを参考に動かして).
// Replays the player's rounds with the MP4 tool's engine. For each placed piece, every placement of
// that piece on the board just before the lock gets the tree planner's counts (moveFeatures).
// A softmax ranking fit then moves the weights from the CC1 defaults toward the player's choices.
// It is a pull toward the player, not a copy: an L2 prior keeps each weight near its default.
// Misdrops (user: 置きミス再現はそもそも置きミスかを予測): a piece the fitted model finds very unlikely
// while the same piece one column / one rotation away is much better counts as a misdrop. It is left
// out of the fit (not learned as good terrain) and its rate / kind is kept for reproduction.
// Build: node ~/Downloads/all-tetrio-patch/private-ai/vA-cc2/build-vs.mjs <this> <out.mjs>
// Run:   node <out.mjs> <out.json> <player name> <replay files...>
import fs from "node:fs";
import { parseReplayFile, PlayerSim } from "/Users/kei/Downloads/tetrio-replay-video/src/replay.js";
import { tetrominoes } from "/Users/kei/Downloads/tetrio-replay-video/vendor/triangle/engine/utils/tetromino/data.ts";
import { kicks as KD } from "/Users/kei/Downloads/tetrio-replay-video/vendor/triangle/engine/utils/kicks/data.ts";
import SP from "../patch/ai-src/engine/ai-spin-planner.js";
import TP from "../patch/ai-src/engine/ai-tree-planner.js";

const [outPath, playerArg, ...files] = process.argv.slice(2);
if (!outPath || !playerArg || !files.length) { console.error("使い方: node tree-player-data.mjs <出力.json> <プレーヤー名> <リプレイ...>"); process.exit(1); }
const player = playerArg.toLowerCase();
const shapes = {}; for (const t of ["t", "s", "z", "l", "j", "i", "o"]) shapes[t] = tetrominoes[t].matrix.data.map((r) => r.map(([x, y]) => [x, y]));
const c4 = [[0, 0, 0, 3], [2, 0, 0, 1], [2, 2, 1, 2], [0, 2, 2, 3]];
const key = (cells) => cells.map(([x, y]) => x + "," + y).sort().join(";");
const rowsOf = (st) => { const h = st.length, rows = []; for (let y = 0; y < h; y++) { let m = 0; const row = st[h - 1 - y]; for (let x = 0; x < 10; x++) if (row[x]) m |= 1 << x; rows.push(m); } return rows; };
const K = TP.FIT_KEYS, NK = K.length, idx = Object.fromEntries(K.map((k, i) => [k, i]));

// ---- positions ----
const data = []; let games = 0, skipped = 0, realName = null;
for (const file of files) {
  let rep; try { rep = parseReplayFile(fs.readFileSync(file, "utf8"), file); } catch (e) { console.error("読めません: " + file); continue; }
  rep.rounds.forEach((round) => {
    for (const p of round) {
      if (String(p.username).toLowerCase() !== player || !p.replay?.events) continue;
      const opt = p.replay.options || {}, ks = KD[opt.kickset || "SRS+"] || KD["SRS+"];
      SP.setTables({ shapes, kicks: ks.kicks, ikicks: ks.i_kicks || ks.kicks, corner: [c4, c4, c4, c4] });
      SP.useRules({ allow180: opt.allow180 !== false });
      const sim = new PlayerSim(p.replay, { ts: p.ts }); games++; realName ??= p.username;
      for (let guard = 0; guard < 300000 && !sim.finished; guard++) {
        const e = sim.engine, pre = rowsOf(e.board.state), b2b = Math.max(0, e.stats?.b2b ?? 0), combo = Math.max(0, e.stats?.combo ?? 0);
        const hold = e.held ? String(e.held).toLowerCase() : null, queue = (e.queue || []).slice(0, 5).map((q) => String(q).toLowerCase());
        const g = e.board.state.filter((row) => row.some((c) => c && c.mino === "gb")).length;
        if (sim.step() === null) break;
        for (const lk of sim.frameLocks) {
          const type = String(lk.res.mino).toLowerCase(), h = pre.length;
          const want = key((lk.cells || []).map(([x, y]) => [x, h - 1 - y]));
          const cands = SP.placements(pre, type, 4, 19, 3);
          const ci = cands.findIndex((q) => key(shapes[type][q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === want);
          if (ci < 0 || cands.length < 2) { skipped++; continue; }
          const sp = lk.res.spin === "normal" ? 2 : lk.res.spin === "mini" ? 1 : 0; cands[ci] = { ...cands[ci], spin: sp };
          const ctx = { b2b, combo, g, hold, tAhead: queue.includes("t") };
          const feats = cands.map((q) => { const f = TP.moveFeatures(pre, type, q, ctx).F, v = new Float64Array(NK); for (const k in f) if (k in idx) v[idx[k]] = f[k]; return v; });
          data.push({ type, cands: cands.map((q) => ({ x: q.x, r: q.r })), feats, ci });
        }
        if (sim.frame > sim.endFrame + 5) break;
      }
    }
  });
}
if (data.length < 50) { console.error(`「${playerArg}」の手が少なすぎます (${data.length} 手)。名前とリプレイを確かめてください。`); process.exit(1); }

// ---- fit ----
const w0 = TP.weightsOf(), base = Float64Array.from(K.map((k) => w0[k]));
const sd = new Float64Array(NK); { let n = 0; for (const d of data) for (const f of d.feats) { n++; for (let i = 0; i < NK; i++) sd[i] += f[i] * f[i]; } for (let i = 0; i < NK; i++) sd[i] = Math.sqrt(sd[i] / n) || 1; }
const scoreOf = (w, f) => { let s = 0; for (let i = 0; i < NK; i++) s += w[i] * f[i]; return s; };
function stats(w, beta, use) { let ll = 0, top = 0, n = 0; for (const d of data) { if (use && !use(d)) continue; const s = d.feats.map((f) => beta * scoreOf(w, f)), m = Math.max(...s); let z = 0; for (const v of s) z += Math.exp(v - m); ll += s[d.ci] - m - Math.log(z); if (s[d.ci] === m) top++; n++; } return { ll: ll / n, top: top / n }; }
// temperature for the default weights
let beta = 0.01; { let best = -Infinity; for (const b of [0.001, 0.002, 0.004, 0.007, 0.01, 0.015, 0.02, 0.03, 0.05]) { const r = stats(base, b).ll; if (r > best) { best = r; beta = b; } } }
const before = stats(base, beta);
function fit(use, lambda = 2, epochs = 120) {
  // w = base + delta / sd (delta in scaled units), Adam on mean log-likelihood - lambda/N * |delta|^2
  const delta = new Float64Array(NK), m = new Float64Array(NK), v = new Float64Array(NK), set = data.filter(use), N = set.length;
  const w = Float64Array.from(base);
  for (let ep = 1; ep <= epochs; ep++) {
    const grad = new Float64Array(NK);
    for (const d of set) { const s = d.feats.map((f) => beta * scoreOf(w, f)), mx = Math.max(...s); let z = 0; const e = s.map((x) => { const t = Math.exp(x - mx); z += t; return t; });
      for (let j = 0; j < d.feats.length; j++) { const pj = e[j] / z, f = d.feats[j], c = (j === d.ci ? 1 : 0) - pj; if (!c) continue; for (let i = 0; i < NK; i++) if (f[i]) grad[i] += c * beta * f[i] / sd[i]; } }
    for (let i = 0; i < NK; i++) { const gi = grad[i] / N - (2 * lambda / N) * delta[i] / 100; m[i] = 0.9 * m[i] + 0.1 * gi; v[i] = 0.999 * v[i] + 0.001 * gi * gi;
      delta[i] += 20 * (m[i] / (1 - 0.9 ** ep)) / (Math.sqrt(v[i] / (1 - 0.999 ** ep)) + 1e-8); w[i] = base[i] + delta[i] / sd[i]; }
  }
  return w;
}
let w = fit(() => true);
// misdrops: very unlikely, and the same piece one column (same rotation) or one rotation (same column) away is much better
const mis = new Set(), byPiece = {}, dir = { left: 0, right: 0, rot: 0 };
for (const d of data) {
  const s = d.feats.map((f) => scoreOf(w, f)), mx = Math.max(...s); let z = 0; for (const x of s) z += Math.exp(beta * (x - mx));
  const pc = Math.exp(beta * (s[d.ci] - mx)) / z; if (pc > 0.02) continue;
  const me = d.cands[d.ci];
  for (let j = 0; j < d.cands.length; j++) { const q = d.cands[j];
    const near = (q.r === me.r && Math.abs(q.x - me.x) === 1) || (q.x === me.x && q.r !== me.r);
    if (near && s[j] - s[d.ci] > 3 / beta) { mis.add(d); byPiece[d.type] = (byPiece[d.type] || 0) + 1; if (q.r !== me.r) dir.rot++; else if (me.x < q.x) dir.left++; else dir.right++; break; } }
}
w = fit((d) => !mis.has(d));
const after = stats(w, beta, (d) => !mis.has(d)), beforeClean = stats(base, beta, (d) => !mis.has(d));
// "参考に": the AI uses the halfway point between the defaults and the player's fit (MIX, 0.5),
// because a one-move fit overstates rewards that the tree search already reads ahead.
// User rule kept whatever the player does: no T-Spin Mini outside a REN for B2B (tMiniSolo stays negative).
const MIX = Number(process.env.MIX || 0.5), fitted = {}, raw = {};
K.forEach((k, i) => { raw[k] = Math.round(w[i] * 10) / 10; fitted[k] = Math.round((base[i] + MIX * (w[i] - base[i])) * 10) / 10; });
fitted.tMiniSolo = Math.min(fitted.tMiniSolo, -60);
const out = {
  kind: "va-tree-player", v: 1, player: realName || playerArg, made: new Date().toISOString(), games, pieces: data.length, skipped,
  agree: { default: +beforeClean.top.toFixed(3), fitted: +after.top.toFixed(3) },
  misdrop: { rate: +(mis.size / data.length).toFixed(4), count: mis.size, byPiece, dir },
  mix: MIX, options: TP.optionsOf(fitted), raw,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
if (process.env.FITDBG) { console.error("ll", before.ll.toFixed(4), "->", after.ll.toFixed(4), "beta", beta); K.forEach((k, i) => Math.abs(w[i] - base[i]) > 1 && console.error(k, base[i], "->", fitted[k])); }
console.log(JSON.stringify({ player: playerArg, games, pieces: data.length, skipped, agreeDefault: out.agree.default, agreeFitted: out.agree.fitted, misdropRate: out.misdrop.rate }));
