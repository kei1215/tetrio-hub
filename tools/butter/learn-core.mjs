// Butter (= vA Tree) player data: learn(replays, player) -> data for "Butter <player>".
// Shared by the Node tool (tools/ai-sim/tree-player-data.mjs) and the app (butter-learn.js, in a Worker).
// Replays the player's rounds with the MP4 tool's engine. For each placed piece, every placement of
// that piece on the board just before the lock gets the tree planner's counts (moveFeatures).
// A softmax ranking fit then moves the weights from the defaults toward the player's choices.
// It is a pull toward the player, not a copy: an L2 prior keeps each weight near its default, and the AI
// uses the fitted weights fully (MIX 1, 2026-11-16: 本人版は真似をする; Butter without data does not imitate).
// Misdrops (user: 置きミス再現はそもそも置きミスかを予測): a piece the fitted model finds very unlikely
// while the same piece one column / one rotation away is much better counts as a misdrop. It is left
// out of the fit (not learned as good terrain) and its rate / kind is kept.
// Only the player's own rounds are used (user: AI のプレイからは学習しない): rounds of BOT / outside AI
// players never match a human player's name, and records flagged bot / engine are skipped by the caller.
import { parseReplayFile, PlayerSim } from "../../../tetrio-replay-video/src/replay.js";
import { tetrominoes } from "../../../tetrio-replay-video/vendor/triangle/engine/utils/tetromino/data.ts";
import { kicks as KD } from "../../../tetrio-replay-video/vendor/triangle/engine/utils/kicks/data.ts";
import SP from "../patch/ai-src/engine/ai-spin-planner.js";
import TP from "../patch/ai-src/engine/ai-tree-planner.js";

const shapes = {}; for (const t of ["t", "s", "z", "l", "j", "i", "o"]) shapes[t] = tetrominoes[t].matrix.data.map((r) => r.map(([x, y]) => [x, y]));
const c4 = [[0, 0, 0, 3], [2, 0, 0, 1], [2, 2, 1, 2], [0, 2, 2, 3]];
const key = (cells) => cells.map(([x, y]) => x + "," + y).sort().join(";");
const rowsOf = (st) => { const h = st.length, rows = []; for (let y = 0; y < h; y++) { let m = 0; const row = st[h - 1 - y]; for (let x = 0; x < 10; x++) if (row[x]) m |= 1 << x; rows.push(m); } return rows; };
// a setup (user: DT砲は2巡目は左以外テンプレじゃない、右側は自由積み、Tは持ち越し): from the board before the first
// clear (rows top first) and which piece filled each cell: the first bag's pieces, and later pieces that touch a
// T-spin slot (an empty cell under a filled one), are the setup ("must"); the slots stay empty; the rest is free.
// Key: "must rows|empty rows", bottom first.
function setupOf(board, idx) {
  const H = board.length, at = (k, x) => k >= 0 && k < H && x >= 0 && x < 10 && (board[H - 1 - k] >> x & 1) === 1;
  let top = 0; for (let k = 0; k < H; k++) if (board[H - 1 - k]) top = k + 1;
  const slot = new Set(); for (let x = 0; x < 10; x++) { let roof = false; for (let k = top - 1; k >= 0; k--) { if (at(k, x)) roof = true; else if (roof) slot.add(k + "," + x); } }
  const byPiece = new Map(); for (const [c, p] of idx) { const [k, x] = c.split(",").map(Number); if (!at(k, x)) continue; if (!byPiece.has(p)) byPiece.set(p, []); byPiece.get(p).push([k, x]); }
  const must = Array(top).fill(0), empty = Array(top).fill(0);
  for (const [p, cs] of byPiece) { const keep = p <= 7 || cs.some(([k, x]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dk, dx]) => slot.has((k + dk) + "," + (x + dx)))); if (keep) for (const [k, x] of cs) must[k] |= 1 << x; }
  for (const c of slot) { const [k, x] = c.split(",").map(Number); empty[k] |= 1 << x; }
  while (must.length && !must[must.length - 1]) { must.pop(); empty.pop(); }
  if (!must.length) return null;
  empty.length = must.length;
  return must.join(",") + "|" + empty.join(",");
}
const K = TP.FIT_KEYS, NK = K.length, idx = Object.fromEntries(K.map((k, i) => [k, i]));
// sparse feature vector: {i: Uint8Array, v: Float32Array}
const sparse = (f) => { const ks = Object.keys(f).filter((k) => k in idx && f[k]); return { i: Uint8Array.from(ks.map((k) => idx[k])), v: Float32Array.from(ks.map((k) => f[k])) }; };
const popc = (n) => { let c = 0; while (n) { n &= n - 1; c++; } return c; };
const dot = (w, f) => { let s = 0; for (let j = 0; j < f.i.length; j++) s += w[f.i[j]] * f.v[j]; return s; };

/** names of the players in a replay file (to pick from) */
export function playersIn(file) { try { const p = parseReplayFile(typeof file === "string" ? file : JSON.stringify(file)); const s = new Set(); p.rounds.forEach((r) => r.forEach((x) => s.add(x.username))); return [...s]; } catch { return []; } }

/**
 * learn(files, playerName, {mix = 0.5, maxPositions = 20000, onProgress, tick}) -> data
 * files: replay files (string or object, .ttr / .ttrm). Throws when too few of the player's pieces are found.
 */
export async function learn(files, playerArg, opt = {}) {
  const player = String(playerArg).toLowerCase(), MIX = opt.mix ?? 1, MAXP = opt.maxPositions ?? 20000; // MIX 1 (user: Butter 本体は真似しない、本人版は真似をする)
  const say = opt.onProgress || (() => {}), tick = opt.tick || (async () => {});
  const data = []; let games = 0, skipped = 0, realName = null;
  // opening shapes (user: 開幕テンプレが全く違う): the board before the player's first line clear (no garbage yet),
  // counted by shape; the most common ones become this player's openers (one-off shapes only if none repeat).
  const openings = new Map();
  // B2B charging (user: B2Bを火力を出る数ためたのが1回だけ): peaks of the player's B2B chains that reached 4+
  const peaks = []; let b2bPieces = 0;
  for (let fi = 0; fi < files.length && data.length < MAXP; fi++) {
    let rep; try { const f = files[fi]; rep = parseReplayFile(typeof f === "string" ? f : JSON.stringify(f)); } catch { continue; }
    for (const round of rep.rounds) for (const p of round) {
      if (String(p.username).toLowerCase() !== player || !p.replay?.events || data.length >= MAXP) continue;
      const o = p.replay.options || {}, ks = KD[o.kickset || "SRS+"] || KD["SRS+"];
      SP.setTables({ shapes, kicks: ks.kicks, ikicks: ks.i_kicks || ks.kicks, corner: [c4, c4, c4, c4] });
      SP.useRules({ allow180: o.allow180 !== false });
      let sim; try { sim = new PlayerSim(p.replay, { ts: p.ts }); } catch { continue; }
      games++; realName ??= p.username; let placed = 0, prevB = 0, openSt = 0, openPrev = null; const openIdx = new Map();
      for (let guard = 0; guard < 300000 && !sim.finished; guard++) {
        const e = sim.engine, pre = rowsOf(e.board.state), b2b = Math.max(0, e.stats?.b2b ?? 0), combo = Math.max(0, e.stats?.combo ?? 0);
        const hold = e.held ? String(e.held).toLowerCase() : null, queue = (e.queue || []).slice(0, 5).map((q) => String(q).toLowerCase());
        const g = e.board.state.filter((row) => row.some((c) => c && c.mino === "gb")).length;
        const preOwn = g ? rowsOf(e.board.state.filter((row) => !row.some((c) => c && c.mino === "gb"))) : pre;
        if (sim.step() === null) break;
        for (const lk of sim.frameLocks) {
          placed++; b2bPieces++;
          { const b = Math.max(0, lk.res.stats?.b2b ?? 0); if (prevB >= 4 && b < prevB) peaks.push(prevB); prevB = b; }
          // the opener = the board just before the first line clear, within the first 3 bags (user: DT砲などは2巡目まで
          //待ち、3巡目のTまで要る): so a DT cannon / PC setup is kept whole, and the planner fills it in piece order
          // garbage that came in meanwhile is taken off (the setup is what the player built on top of it)
          if (openSt === 0) { const own = preOwn, cells = own.reduce((a, m) => a + popc(m), 0);
            if (cells !== (placed - 1) * 4) { openSt = 1; if (openPrev && placed - 2 >= 4 && placed - 2 <= 22) { const sh = setupOf(openPrev, openIdx); if (sh) openings.set(sh, (openings.get(sh) || 0) + 1); } }
            else if (placed > 23) openSt = 1;
            else { // which piece (1, 2, ...) filled each cell: the new cells since the last lock (no clears yet)
              const H = own.length; for (let y = 0; y < H; y++) { const nw = own[y] & ~((openPrev && openPrev[y]) || 0); for (let x = 0; x < 10; x++) if (nw >> x & 1) openIdx.set((H - 1 - y) + "," + x, placed - 1); } }
            openPrev = own; }
          const type = String(lk.res.mino).toLowerCase(), h = pre.length;
          if (!shapes[type]) continue;
          const want = key((lk.cells || []).map(([x, y]) => [x, h - 1 - y]));
          const cands = SP.placements(pre, type, 4, 19, 3);
          const ci = cands.findIndex((q) => key(shapes[type][q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === want);
          if (ci < 0 || cands.length < 2) { skipped++; continue; }
          const sp = lk.res.spin === "normal" ? 2 : lk.res.spin === "mini" ? 1 : 0; cands[ci] = { ...cands[ci], spin: sp };
          const ctx = { b2b, combo, g, hold, tAhead: queue.includes("t") };
          const mf = cands.map((q, j) => TP.moveFeatures(pre, type, j === ci ? cands[ci] : q, ctx));
          const kinds = cands.map((q, j) => TP.kindOf(type, (j === ci ? cands[ci] : q).spin | 0, mf[j].lines, mf[j].F.digW | 0, combo + 1, g));
          data.push({ type, cands: cands.map((q) => ({ x: q.x, r: q.r })), feats: mf.map((m) => sparse(m.F)), kinds, ci });
        }
        if (sim.frame > sim.endFrame + 5) break;
      }
      if (prevB >= 4) peaks.push(prevB);
      say({ phase: "read", file: fi + 1, files: files.length, games, pieces: data.length }); await tick();
    }
  }
  if (data.length < 50) throw new Error(`「${playerArg}」の手が少なすぎます (${data.length} 手)。名前とリプレイを確かめてください。`);

  const w0 = TP.weightsOf(), base = Float64Array.from(K.map((k) => w0[k]));
  const sd = new Float64Array(NK); { let n = 0; for (const d of data) for (const f of d.feats) { n++; for (let j = 0; j < f.i.length; j++) sd[f.i[j]] += f.v[j] * f.v[j]; } for (let i = 0; i < NK; i++) sd[i] = Math.sqrt(sd[i] / n) || 1; }
  const stats = (w, beta, use) => { let ll = 0, top = 0, n = 0; for (const d of data) { if (use && !use(d)) continue; const s = d.feats.map((f) => beta * dot(w, f)), m = Math.max(...s); let z = 0; for (const v of s) z += Math.exp(v - m); ll += s[d.ci] - m - Math.log(z); if (s[d.ci] === m) top++; n++; } return { ll: ll / n, top: top / n }; };
  let beta = 0.01; { let best = -Infinity; for (const b of [0.001, 0.002, 0.004, 0.007, 0.01, 0.015, 0.02, 0.03, 0.05]) { const r = stats(base, b).ll; if (r > best) { best = r; beta = b; } } }
  async function fit(use, label, lambda = 2, epochs = 120) {
    const delta = new Float64Array(NK), m = new Float64Array(NK), v = new Float64Array(NK), set = data.filter(use), N = set.length, w = Float64Array.from(base);
    for (let ep = 1; ep <= epochs; ep++) {
      const grad = new Float64Array(NK);
      for (const d of set) { const s = d.feats.map((f) => beta * dot(w, f)), mx = Math.max(...s); let z = 0; const e = s.map((x) => { const t = Math.exp(x - mx); z += t; return t; });
        for (let j = 0; j < d.feats.length; j++) { const c = (j === d.ci ? 1 : 0) - e[j] / z; if (!c) continue; const f = d.feats[j]; for (let q = 0; q < f.i.length; q++) grad[f.i[q]] += c * beta * f.v[q] / sd[f.i[q]]; } }
      for (let i = 0; i < NK; i++) { const gi = grad[i] / N - (2 * lambda / N) * delta[i] / 100; m[i] = 0.9 * m[i] + 0.1 * gi; v[i] = 0.999 * v[i] + 0.001 * gi * gi;
        delta[i] += 20 * (m[i] / (1 - 0.9 ** ep)) / (Math.sqrt(v[i] / (1 - 0.999 ** ep)) + 1e-8); w[i] = base[i] + delta[i] / sd[i]; }
      if (ep % 10 === 0) { say({ phase: label, epoch: ep, epochs, pieces: data.length }); await tick(); }
    }
    return w;
  }
  let w = await fit(() => true, "fit1");
  const mis = new Set(), byPiece = {}, dir = { left: 0, right: 0, rot: 0 };
  for (const d of data) {
    const s = d.feats.map((f) => dot(w, f)), mx = Math.max(...s); let z = 0; for (const x of s) z += Math.exp(beta * (x - mx));
    if (Math.exp(beta * (s[d.ci] - mx)) / z > 0.02) continue;
    const me = d.cands[d.ci];
    for (let j = 0; j < d.cands.length; j++) { const q = d.cands[j];
      if (((q.r === me.r && Math.abs(q.x - me.x) === 1) || (q.x === me.x && q.r !== me.r)) && s[j] - s[d.ci] > 3 / beta) { mis.add(d); byPiece[d.type] = (byPiece[d.type] || 0) + 1; if (q.r !== me.r) dir.rot++; else if (me.x < q.x) dir.left++; else dir.right++; break; } }
  }
  w = await fit((d) => !mis.has(d), "fit2");
  const after = stats(w, beta, (d) => !mis.has(d)), beforeClean = stats(base, beta, (d) => !mis.has(d));
  // Moves the player does not make (user: プレーヤーがしない動きは取り入れない、掘りクアッドが見えてない等).
  // For each kind (T-spin, dig Quad ...): spots where it was possible, how often the default Butter's first
  // pick there is that kind, and how often the player made it. Player < 30% of the default's rate -> banned.
  const avail = {}, defK = {}, took = {};
  for (const d of data) { let bj = 0, bs = -Infinity; d.feats.forEach((f, j) => { const s = dot(base, f); if (s > bs) { bs = s; bj = j; } });
    for (const k of new Set(d.kinds.filter(Boolean))) { avail[k] = (avail[k] || 0) + 1; if (d.kinds[bj] === k) defK[k] = (defK[k] || 0) + 1; if (d.kinds[d.ci] === k) took[k] = (took[k] || 0) + 1; } }
  const never = {}, ban = [];
  for (const k of TP.KINDS) { const a = avail[k] || 0, df = defK[k] || 0, t = took[k] || 0; never[k] = { possible: a, butter: df, player: t };
    if (a >= 10 && df >= 5 && t < 0.3 * df) ban.push(k); }
  // mix of attacks (user: 攻撃の種類の割合(TSD/TST/クアッド)も合わせる、試合で同じ状態になる必要はない): the player's
  // share of each kind against Butter's own share (measured from a Butter y_kei1215 match: TSD-heavy) -> a soft bias
  const BUTTER_SHARE = { tspin1: 0.09, tspin2: 0.44, tspin3: 0, tmini: 0.05, allSpin: 0.19, quad: 0.01, digQuad: 0.19, renQuad: 0.04 };
  const tookN = TP.KINDS.reduce((a, k) => a + (took[k] || 0), 0), kindBias = {};
  if (tookN >= 20) for (const k of TP.KINDS) { if (ban.includes(k)) continue; const v = Math.round(Math.max(-120, Math.min(120, 50 * Math.log(((took[k] || 0) / tookN + 0.03) / (BUTTER_SHARE[k] + 0.03))))); if (Math.abs(v) >= 5) kindBias[k] = v; }
  const fitted = {}, raw = {};
  K.forEach((k, i) => { raw[k] = Math.round(w[i] * 10) / 10; fitted[k] = Math.round((base[i] + MIX * (w[i] - base[i])) * 10) / 10; });
  fitted.tMiniSolo = Math.min(fitted.tMiniSolo, -60);
  // charge like the player: the chain value runs up to the player's usual peak, and a player who charges
  // often (1+ chain of 5+ per 300 pieces) gets a steeper chain value
  const sp = peaks.slice().sort((a, b) => a - b), med = sp.length ? sp[Math.floor(sp.length * 0.75)] : 0, per300 = peaks.filter((x) => x >= 5).length * 300 / Math.max(1, b2bPieces);
  const b2bStyle = { chains: peaks.length, peaks: sp, per300: +per300.toFixed(2) };
  const b2bOpt = med >= 5 ? { b2bCap: Math.min(16, med), b2bStep: Math.max(fitted.b2bStep, per300 >= 1 ? 30 : 20) } : {}; // user rule: no T-Spin Mini outside a REN for B2B
  return {
    kind: "va-tree-player", v: 1, player: String(playerArg).trim() || realName, made: new Date().toISOString(), games, pieces: data.length, skipped, // player as typed (Butter Y_Kei1215); replays keep names lowercase
    agree: { default: +beforeClean.top.toFixed(3), fitted: +after.top.toFixed(3) },
    misdrop: { rate: +(mis.size / data.length).toFixed(4), count: mis.size, byPiece, dir },
    beta, openers: (() => {
      // setups built the same way at least twice (setupOf above); a smaller one inside a bigger one is the same setup
      // cut short and counts for it; up to 4, not one inside an already kept one
      const all = [...openings.entries()].map(([k, n]) => { const [m, e] = k.split("|"); return { rows: m.split(",").map(Number), empty: e.split(",").map(Number), n }; });
      const inside = (a, b) => a.rows.length <= b.rows.length && a.rows.every((m, i) => (m & ~b.rows[i]) === 0);
      for (const a of all) a.sup = all.reduce((t, b) => t + (inside(b, a) ? b.n : 0), 0);
      all.sort((a, b) => b.sup - a.sup || b.rows.length - a.rows.length);
      const keep = []; for (const a of all) { if (a.n < 2 || keep.some((k) => inside(a, k))) continue; keep.push(a); if (keep.length >= 4) break; }
      return keep.map((a) => ({ rows: a.rows, empty: a.empty, n: a.sup }));
    })(),
    b2b: b2bStyle, mix: MIX, options: { ...TP.optionsOf(fitted), ...b2bOpt, ban, kindBias, tank: false }, raw, kinds: never, // own version plays like the player (no tank)
  };
}

/** the id / label / package script of a per-player Butter (base = the Butter package script) */
export function slugOf(name) { let s = String(name || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 22); if (!s) { let h = 2166136261; for (const c of String(name)) h = Math.imul(h ^ c.codePointAt(0), 16777619); s = (h >>> 0).toString(16); } return s; }
export function playerPackage(data, base) {
  const slug = slugOf(data.player), id = ("va-tree-" + slug).slice(0, 32), label = "Butter " + data.player;
  return { id, label, name: "Butter-" + slug + ".js", script: "var __VA_TREE_EMBED__=" + JSON.stringify({ id, label, data }) + ";\n" + base };
}
