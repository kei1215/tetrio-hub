// CC 盤面修正: a .ttr / .ttrm in, one player's board replayed by an outside AI (Cold Clear) out.
// For every piece of that player, the AI is asked where to put it in the scene of the CC line
// (board, current, HOLD, NEXT, combo, B2B, incoming garbage); its keys replace the player's keys.
// The opponent's record and the player's incoming garbage (ige events) stay as they were.
// Output = the replay edit embed (docs/replay-edit, results.qp_replay_edit) with
//   frame 0, state null, keep true: the replay plays its own non-key events and these keys.
// The engine is the MP4 tool's (teto port, matches real TETR.IO replays). Each piece's hard drop
// is timed to the frame the player locked the same piece number (same pace as the original).
import { parseReplayFile, PlayerSim } from "../../../tetrio-replay-video/src/replay.js";
import { tetrominoes } from "../../../tetrio-replay-video/vendor/triangle/engine/utils/tetromino/data.ts";
import { kicks as KD } from "../../../tetrio-replay-video/vendor/triangle/engine/utils/kicks/data.ts";

export const EMB = "qp_replay_edit";
const W = 10;
const KEY = new Set(["keydown", "keyup"]);
const low = (t) => String(t || "").toLowerCase();

/** Players of a replay file: [{username, rounds: [round index, ...]}] */
export function playersOf(json) {
  const p = parseReplayFile(structuredClone(typeof json === "string" ? JSON.parse(json) : json));
  const map = new Map();
  p.rounds.forEach((round, ri) => round.forEach((pl) => {
    const k = low(pl.username);
    if (!map.has(k)) map.set(k, { username: pl.username, rounds: [] });
    map.get(k).rounds.push(ri);
  }));
  return [...map.values()];
}

// The player's original replay object inside the file (embeds go here).
function replayRef(j, ri, username) {
  const r = j.replay || {};
  if (Array.isArray(r.rounds)) { const pl = r.rounds[ri].find((x) => low(x.username) === low(username)); return pl ? pl.replay : null; }
  return ri === 0 ? r : null;
}

function tables(kickset) {
  const shapes = {};
  for (const t of ["t", "s", "z", "l", "j", "i", "o"]) shapes[t] = tetrominoes[t].matrix.data.map((r) => r.map(([x, y]) => [x, y]));
  const ks = KD[kickset || "SRS+"] || KD["SRS+"];
  return { shapes, ks };
}

// One player, one round.
async function fixOne(info, rep, bot, opt, T) {
  const { shapes, ks } = T;
  // pass 1: the original line, only for its lock frames (pace) and first input frame
  const s0 = new PlayerSim(structuredClone(rep), info);
  const lockFrames = [];
  s0.onLock = (_r, f) => lockFrames.push(f);
  while (!s0.finished) s0.step();
  const firstKey = (rep.events.find((e) => e.type === "keydown") || { frame: 0 }).frame;
  // the player's own timing: the first key pressed for each piece (after the previous lock)
  const downs = rep.events.filter((e) => e.type === "keydown").map((e) => e.frame).sort((a, b) => a - b);
  const firstDownAfter = (f) => { for (const d of downs) if (d > f) return d; return null; };
  const endFrame = s0.endFrame;
  const gaps = lockFrames.slice(1).map((f, i) => f - lockFrames[i]);
  const avgGap = gaps.length ? Math.max(4, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 20;
  // pass 2: same replay without its keys; ours go in frame by frame.
  // range {F, K} (weak spot): the original runs up to frame F, then K pieces are the AI's and nothing
  // else of the original is played (the replay edit plays such a segment without the original's events).
  const range = opt.range || null;
  const r2 = structuredClone(rep);
  if (!range) r2.events = r2.events.filter((e) => !KEY.has(e.type));
  const sim = new PlayerSim(r2, info), e = sim.engine;
  let pieceStart = 0;
  if (range) {
    while (sim.frame < range.F && !sim.finished) sim.step();
    // from F the player's keys are gone; incoming garbage (ige) still arrives as in the original
    for (const [f, list] of [...sim.byFrame]) if (f >= range.F) { const rest = list.filter((x) => !KEY.has(x.type)); if (rest.length) sim.byFrame.set(f, rest); else sim.byFrame.delete(f); }
    pieceStart = e.stats.pieces;
  }
  // rescue: survive past the frame the player died (a little more, so garbage already on its way lands too)
  if (range && range.rescue) sim.endFrame = endFrame + (range.margin ?? 90);
  const out = [], stat = { pieces: 0, planned: 0, matched: 0, miss: 0, noplan: 0, attack: 0, topout: false, locks: [] };
  let lockRes = null;
  // CC's sent garbage (after cancelling), for the opponent's board in the replay edit:
  // [frame, amount, ackiid]. ackiid = the last attack id of the opponent this player had received then.
  const sends = [], recv = rep.events.filter((x) => x.type === "ige" && x.data?.type === "interaction" && x.data.data?.type === "garbage").map((x) => [x.frame, x.data.data.iid || 0]);
  const ackAt = (f) => { let a = 0; for (const [rf, iid] of recv) if (rf <= f && iid > a) a = iid; return a; };
  sim.onLock = (r) => { lockRes = r; const s = (r.garbage || []).reduce((a, b) => a + b, 0); if (s > 0) sends.push([sim.frame, s, ackAt(sim.frame)]); };
  const push = (type, key, s = 0) => {
    const ev = { frame: sim.frame, type, data: { key, subframe: s } };
    let list = sim.byFrame.get(sim.frame); if (!list) sim.byFrame.set(sim.frame, (list = []));
    list.push(ev); out.push({ f: sim.frame, t: type === "keydown" ? "d" : "u", k: key, ...(s ? { s } : {}) });
  };
  const H = () => e.board.state.length;
  const rowsOf = () => { const h = H(), rows = new Array(h); for (let y = 0; y < h; y++) { let m = 0; const row = e.board.state[h - 1 - y]; for (let x = 0; x < W; x++) if (row[x]) m |= 1 << x; rows[y] = m; } return rows; };
  const cellsAt = (t, x, y, r) => shapes[t][r].map(([cx, cy]) => [x + cx, y + cy]);
  const ckey = (c) => c.map(([x, y]) => x + "," + y).sort().join(";");
  const legal = (rows, t, x, y, r) => { for (const [cx, cy] of cellsAt(t, x, y, r)) { if (cx < 0 || cx >= W || cy >= rows.length) return false; if (cy >= 0 && (rows[cy] >> cx) & 1) return false; } return true; };
  const rot = (rows, t, x, y, r, d) => {
    if (t === "o") return null; const nr = (r + d + 4) & 3;
    if (legal(rows, t, x, y, nr)) return [x, y, nr];
    const list = (t === "i" ? ks.i_kicks || ks.kicks : ks.kicks)[String(r) + String(nr)] || [];
    for (const [kx, ky] of list) if (legal(rows, t, x + kx, y + ky, nr)) return [x + kx, y + ky, nr];
    return null;
  };
  const allow180 = sim.options.allow180 !== false;
  // BFS over single taps (and "soft drop to the floor") to the target cells. A path that ends in a
  // rotation is kept for spins: the goal test is done on the resting position after each action.
  const path = (rows, t, sx, sy, sr, target) => {
    const want = ckey(target), start = [sx, sy, sr], seen = new Map([[start.join(), null]]), q = [start];
    const acts = ["moveLeft", "moveRight", "rotateCW", "rotateCCW", "rotate180", "softDrop"];
    for (let i = 0; i < q.length && i < 30000; i++) {
      const [x, y, r] = q[i];
      let gy = y; while (legal(rows, t, x, gy + 1, r)) gy++;
      if (ckey(cellsAt(t, x, gy, r)) === want) { const keys = []; let k = q[i].join(); while (seen.get(k)) { const [p, a] = seen.get(k); keys.unshift(a); k = p; } return keys; }
      for (const a of acts) {
        let n = null;
        if (a === "moveLeft") n = legal(rows, t, x - 1, y, r) ? [x - 1, y, r] : null;
        else if (a === "moveRight") n = legal(rows, t, x + 1, y, r) ? [x + 1, y, r] : null;
        else if (a === "softDrop") n = gy !== y ? [x, gy, r] : null;
        else if (a === "rotate180" && !allow180) n = null;
        else n = rot(rows, t, x, y, r, a === "rotateCW" ? 1 : a === "rotateCCW" ? -1 : 2);
        if (!n) continue; const k = n.join(); if (seen.has(k)) continue; seen.set(k, [q[i].join(), a]); q.push(n);
      }
    }
    return null;
  };
  const grounded = () => { const f = e.falling, t = low(f.symbol), rows = rowsOf(), h = rows.length; return !legal(rows, t, f.location[0], h - 1 - Math.floor(f.location[1]) + 1, f.rotation); };
  const input = () => {
    const h = H(), board = [];
    for (let k = 0; k < 40; k++) board.push(Array.from({ length: W }, (_, x) => (k < h && e.board.state[k][x] ? "G" : null)));
    const incoming = (e.zenith?.impendingdamage || e.garbageQueue?.queue || []).filter((d) => d && d.active !== false && (d.amt || d.amount) > 0).map((d) => Math.round(d.amt || d.amount));
    return { board, current: low(e.falling.symbol), hold: e.held ? low(e.held) : null, queue: e.queue.slice(0, 13).map(low), b2b: Math.max(0, e.stats.b2b || 0), combo: Math.max(0, e.stats.combo || 0), incoming };
  };
  const ask = async () => {
    const job = bot.begin(input()), t0 = Date.now();
    while (!job.step(opt.sliceMs) && Date.now() - t0 < opt.thinkMs) await opt.idle();
    if (!job.done) job.stop?.();
    // a Worker host (vA LocalExternalAI.load) answers stop() asynchronously
    for (const t1 = Date.now(); !job.done && Date.now() - t1 < 2000;) await opt.idle();
    return job.result();
  };

  let plan = null, keys = null, target = null, want = null, sd = false, pieceAt = -1, sched = null, doneN = 0, gSince = -1;
  const lockT = Number(sim.options.locktime) || 30;
  const idleTo = (f) => { while (sim.frame < f && !sim.finished) sim.step(); };
  if (!range) idleTo(firstKey);
  while (!sim.finished) {
    if (lockRes) {
      if (want && sim.lastLock && ckey(sim.lastLock.cells || []) === ckey(want)) stat.matched++;
      want = null;
      stat.attack += (lockRes.rawGarbage || []).reduce((a, b) => a + b, 0);
      stat.locks.push({ f: sim.frame, lines: lockRes.lines || 0, spin: lockRes.spin || "none", mino: low(lockRes.mino), combo: lockRes.stats?.combo ?? 0, atk: (lockRes.rawGarbage || []).reduce((a, b) => a + b, 0) });
      if (lockRes.topout) { stat.topout = true; }
      lockRes = null;
    }
    if (stat.topout) break;
    if (range && e.stats.pieces - pieceStart >= range.K) break;
    const n = e.stats.pieces;
    if (n !== pieceAt) {
      // a new piece: ask the AI (the board does not change until this piece locks)
      pieceAt = n; keys = null; target = null; sd = false;
      plan = await ask(); stat.pieces++;
      if (plan && plan.cells) {
        stat.planned++;
        if (plan.usedHold) { push("keydown", "hold"); push("keyup", "hold", 0.5); sim.step(); }
      } else { stat.noplan++; plan = null; }
      if (opt.onProgress) opt.onProgress({ frame: sim.frame, end: endFrame, pieces: stat.pieces });
      continue;
    }
    if (!keys) {
      // pace: the hard drop lands on the frame the player locked this piece number
      const due = n < lockFrames.length ? lockFrames[n] : (lockFrames.at(-1) ?? firstKey) + avgGap * (n - lockFrames.length + 1);
      const f = e.falling, t = low(f.symbol), rows = rowsOf(), h = rows.length;
      if (plan) {
        const pt = low(plan.piece || t);
        target = plan.cells.map(([x, yb]) => [x, h - 1 - yb]);
        keys = pt === t ? path(rows, t, f.location[0], h - 1 - Math.floor(f.location[1]), f.rotation, target) : null;
        if (!keys) { stat.miss++; keys = []; target = null; } else want = plan.cells;
      } else keys = [];
      keys = keys.concat(["hardDrop"]);
      // spread the keys like the player: from the frame the player first pressed a key for this
      // piece to the frame the player locked it (hard drop there)
      const need = keys.length + keys.filter((k) => k === "softDrop").length * 2;
      const prevL = n > 0 && n - 1 < lockFrames.length ? lockFrames[n - 1] : firstKey - 1;
      let st = firstDownAfter(prevL);
      if (st == null || st > due - need) st = due - need;
      sched = { st, due, total: keys.length }; doneN = 0; gSince = -1;
    }
    if (!sd) {
      const at = keys[0] === "hardDrop" ? sched.due : Math.min(sched.due, Math.round(sched.st + doneN * (sched.due - sched.st) / Math.max(1, sched.total - 1)));
      // on the floor the lock delay runs: wait only while it surely can not lock (a few frames spare)
      const gr = grounded();
      if (!gr) gSince = -1; else if (gSince < 0) gSince = sim.frame;
      if (sim.frame < at && (!gr || sim.frame - gSince < lockT - 4)) { sim.step(); continue; }
      // the piece may have fallen while waiting: find the way again from where it is now
      if (doneN > 0 && want && keys[0] !== "hardDrop") {
        const f = e.falling, t = low(f.symbol), rows = rowsOf(), h = rows.length;
        const np = path(rows, t, f.location[0], h - 1 - Math.floor(f.location[1]), f.rotation, target);
        if (np) keys = np.concat(["hardDrop"]);
      }
    }
    const k = keys[0];
    if (k === "softDrop") {
      if (!sd) { push("keydown", "softDrop"); sd = true; sim.step(); continue; }
      if (!grounded() && sd < 120) { sd++; sim.step(); continue; }
      push("keyup", "softDrop"); sd = false; keys.shift(); doneN++; sim.step(); continue;
    }
    push("keydown", k); push("keyup", k, 0.5); keys.shift(); doneN++;
    sim.step();
  }
  if (range && range.rescue) { const end = Math.min(sim.frame, endFrame); return { seg: { v: 1, frame: range.F, end, state: null, lazy: true, ige: true, by: opt.engineId || "cc", events: out.filter((x) => x.f <= end) }, stat }; }
  if (range) return { seg: { v: 1, frame: range.F, end: sim.frame, state: null, lazy: true, ige: true, by: opt.engineId || "cc", events: out }, stat };
  const end = stat.topout ? sim.frame : endFrame;
  return { embed: { v: 1, frame: 0, end, state: null, keep: true, by: opt.engineId || "cc", events: out, sends }, stat };
}

// The original line piece by piece: lock frame, attack, clear, and the first frame after each lock
// with no key held (a fix starts there, so nothing held carries into it).
function analyze(info, rep) {
  const s = new PlayerSim(structuredClone(rep), info), locks = [];
  s.onLock = (r, f) => locks.push({ f, atk: (r.rawGarbage || []).reduce((a, b) => a + b, 0), lines: r.lines || 0, spin: r.spin || "none", combo: r.stats?.combo || 0 });
  while (!s.finished) s.step();
  const keys = rep.events.filter((x) => KEY.has(x.type)).sort((a, b) => a.frame - b.frame || (a.data?.subframe || 0) - (b.data?.subframe || 0));
  const held = new Set(); let k = 0;
  const freeAfter = locks.map(() => null);
  for (let i = 0; i < locks.length; i++) {
    const lim = i + 1 < locks.length ? locks[i + 1].f : s.endFrame;
    for (let f = locks[i].f + 1; f < lim; f++) {
      while (k < keys.length && keys[k].frame < f) { const x = keys[k++]; if (x.type === "keydown") held.add(x.data.key); else held.delete(x.data.key); }
      if (!held.size) { freeAfter[i] = f; break; }
    }
  }
  return { locks, freeAfter, endFrame: s.endFrame, topout: s.isTopout() };
}

// Candidate spots: the game cut into stretches of W pieces. A stretch is tried when its attack per
// piece is under 80% of the player's average (it pulls the average APM down) or it has a REN (combo 2+)
// or a QUAD (those get a second look). The caller keeps a stretch only when the AI does clearly better.
function weakSpots(an, W, max) {
  const a = an.locks.map((l) => l.atk), n = a.length;
  if (n < W + 2) return [];
  const avg = a.reduce((x, y) => x + y, 0) / n, out = [];
  for (let i = 1; i + 3 <= n && out.length < max; i += W) {
    let s = i; while (s < i + W && an.freeAfter[s - 1] == null) s++;
    const K = Math.min(W, n - s); if (K < 3 || an.freeAfter[s - 1] == null) continue;
    const L = an.locks.slice(s, s + K), sum = L.reduce((x, l) => x + l.atk, 0);
    const ren = L.some((l) => l.combo >= 2), quad = L.some((l) => l.lines >= 4);
    if (sum / K < avg * 0.8 || ren || quad) out.push({ i: s, sum, avg, F: an.freeAfter[s - 1], K, ren, quad });
  }
  return out;
}

// A REN (combo 2+, 3 clears in a row or more) whose last clear is a QUAD or a T-Spin.
// Returns the index in locks of that last clear, or -1.
export function renFinish(locks) {
  let run = 0;
  for (let i = 0; i < locks.length; i++) {
    const l = locks[i];
    if (l.lines > 0) run++; else { run = 0; continue; }
    const next = locks[i + 1];
    const last = !next || next.lines === 0;
    const strong = l.lines >= 4 || (l.mino === "t" && l.spin && l.spin !== "none");
    if (last && run >= 3 && strong) return i;
  }
  return -1;
}

// Topout rescue: from 1, 2, 3 ... pieces before the death, the AI plays on (same pieces, same incoming
// garbage at the same frames) until past the frame the player died. The fewest pieces back that
// survives is "how far back". From there a few more starts are tried for a line whose REN ends with a
// QUAD or a T-Spin (the user's wish); that line is used when found, otherwise the first survival.
async function rescueOne(pl, bot, o, T, an, prog) {
  const N = an.locks.length, maxBack = Math.min(o.maxBack ?? 30, N - 1), extra = o.renTries ?? 12;
  let first = null, best = null;
  for (let k = 1; k <= maxBack; k++) {
    const i = N - k;                       // the AI places pieces i, i+1, ... (0-based)
    const F = i > 0 ? an.freeAfter[i - 1] : null;
    if (F == null) continue;
    const { seg, stat } = await fixOne(pl, pl.replay, bot, { ...o, range: { F, K: Infinity, rescue: true }, onProgress: prog && ((x) => prog({ ...x, back: k })) }, T);
    if (stat.topout) continue;
    const ri = renFinish(stat.locks);
    const cand = { seg, stat, k, i, F, ren: ri >= 0 ? stat.locks[ri] : null };
    if (!first) first = cand;
    if (cand.ren) { best = cand; break; }
    if (k >= first.k + extra) break;
  }
  const r = best || first;
  return r && { ...r, minBack: first.k };
}

/**
 * ccFix(json, username, bot, opt) -> {json (new file object), report}
 * bot: an outside AI package bot (begin(input) -> job.step(ms) / stop() / result()).
 * opt: {thinkMs = 150, sliceMs = 20, idle = async () => {}, onProgress, engineId}
 */
export async function ccFix(json, username, bot, opt = {}) {
  const j = structuredClone(typeof json === "string" ? JSON.parse(json) : json);
  const o = { thinkMs: 150, sliceMs: 20, idle: async () => {}, mode: "weak", ...opt };
  const p = parseReplayFile(structuredClone(j));
  const report = [];
  let found = 0;
  for (let ri = 0; ri < p.rounds.length; ri++) {
    const pl = p.rounds[ri].find((x) => low(x.username) === low(username));
    if (!pl) continue;
    found++;
    const ref = replayRef(j, ri, username);
    if (!ref || !Array.isArray(pl.replay.events)) continue;
    const T = tables(pl.replay.options?.kickset);
    const prog = o.onProgress;
    if (!ref.results || typeof ref.results !== "object") ref.results = {};
    if (o.mode === "all") {
      const { embed, stat } = await fixOne(pl, pl.replay, bot, { ...o, onProgress: prog && ((x) => prog({ ...x, round: ri, rounds: p.rounds.length })) }, T);
      ref.results[EMB] = embed;
      report.push({ round: ri, ...stat, events: embed.events.length });
      continue;
    }
    if (o.mode === "rescue") {
      const an = analyze(pl, pl.replay);
      if (!an.topout) { delete ref.results[EMB]; report.push({ round: ri, rescue: null, died: false }); continue; }
      const r = await rescueOne(pl, bot, o, T, an, prog && ((x) => prog({ ...x, round: ri, rounds: p.rounds.length })));
      if (!r) { delete ref.results[EMB]; report.push({ round: ri, rescue: null, died: true, pieces: an.locks.length }); continue; }
      const info = { minBack: r.minBack, back: r.k, piece: r.i + 1, death: an.locks.length, deathFrame: an.endFrame, ren: r.ren ? (r.ren.lines >= 4 ? "quad" : "tspin") : null, renCombo: r.ren ? r.ren.combo : 0 };
      const seg = { ...r.seg, rescue: info, cc: r.stat.locks.filter((l) => l.f <= r.seg.end).reduce((a, l) => a + l.atk, 0) };
      ref.results[EMB] = { ...seg, segs: [seg] };
      report.push({ round: ri, died: true, rescue: info });
      continue;
    }
    // weak spots only: the player's own play stays; each spot is a fix the replay edit inserts there
    const an = analyze(pl, pl.replay), spots = weakSpots(an, o.window || 10, o.maxSpots || 30), segs = [], kept = [];
    for (let si = 0; si < spots.length; si++) {
      const sp = spots[si];
      const { seg, stat } = await fixOne(pl, pl.replay, bot, { ...o, range: sp, onProgress: prog && ((x) => prog({ ...x, round: ri, rounds: p.rounds.length, spot: si + 1, spots: spots.length })) }, T);
      // used only when the AI attacks more than the player did with the same pieces
      if (!stat.topout && stat.attack >= sp.sum + (o.minGain ?? 2)) { segs.push({ ...seg, orig: sp.sum, cc: stat.attack }); kept.push({ piece: sp.i + 1, frame: sp.F, orig: sp.sum, cc: stat.attack, ren: sp.ren, quad: sp.quad }); }
    }
    if (segs.length) ref.results[EMB] = { ...segs[0], segs };
    else delete ref.results[EMB];
    report.push({ round: ri, spots: spots.length, fixed: kept });
  }
  if (!found) throw new Error("このリプレイに「" + username + "」はいません");
  return { json: j, report };
}
