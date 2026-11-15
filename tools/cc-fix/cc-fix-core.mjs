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
  let pieceStart = 0; const out0 = [];
  if (range) {
    while (sim.frame < range.F && !sim.finished) sim.step();
    // from F the player's keys are gone; incoming garbage (ige) still arrives as in the original
    for (const [f, list] of [...sim.byFrame]) if (f >= range.F) { const rest = list.filter((x) => !KEY.has(x.type)); if (rest.length) sim.byFrame.set(f, rest); else sim.byFrame.delete(f); }
    pieceStart = e.stats.pieces;
    // keys the player still held at F are let go there (their keyups were after F and are dropped)
    if (range.release) {
      const held = new Set();
      for (const x of rep.events.filter((x) => KEY.has(x.type) && x.frame < range.F).sort((a, b) => a.frame - b.frame || (a.data?.subframe || 0) - (b.data?.subframe || 0))) { if (x.type === "keydown") held.add(x.data.key); else held.delete(x.data.key); }
      for (const k of held) { const ev = { frame: sim.frame, type: "keyup", data: { key: k, subframe: 0 } }; let l = sim.byFrame.get(sim.frame); if (!l) sim.byFrame.set(sim.frame, (l = [])); l.push(ev); out0.push({ f: sim.frame, t: "u", k }); }
    }
  }
  // rescue: survive past the frame the player died (a little more, so garbage already on its way lands too)
  // and then up to range.more pieces past the death (a REN that ends with a QUAD / T-Spin is shown to its end)
  if (range && range.rescue) sim.endFrame = endFrame + 60 * 20;
  const out = out0, stat = { pieces: 0, planned: 0, matched: 0, miss: 0, noplan: 0, attack: 0, topout: false, locks: [] };
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
  // range.order: the player's placed minos from the start; the AI must place that mino each time (same order)
  let wanted = null;
  const ask = async () => {
    const inp = input();
    if (wanted) { inp.current = wanted; inp.hold = wanted; }   // either choice gives the same mino; HOLD is decided by us
    const job = bot.begin(inp), t0 = Date.now();
    while (!job.step(opt.sliceMs) && Date.now() - t0 < opt.thinkMs) await opt.idle();
    if (!job.done) job.stop?.();
    // a Worker host (vA LocalExternalAI.load) answers stop() asynchronously
    for (const t1 = Date.now(); !job.done && Date.now() - t1 < 2000;) await opt.idle();
    return job.result();
  };

  let deathAt = -1, plan = null, keys = null, target = null, want = null, sd = false, pieceAt = -1, sched = null, doneN = 0, gSince = -1;
  const lockT = Number(sim.options.locktime) || 30;
  const idleTo = (f) => { while (sim.frame < f && !sim.finished) sim.step(); };
  if (!range) idleTo(firstKey);
  while (!sim.finished) {
    if (lockRes) {
      if (want && sim.lastLock && ckey(sim.lastLock.cells || []) === ckey(want)) stat.matched++;
      want = null;
      stat.attack += (lockRes.rawGarbage || []).reduce((a, b) => a + b, 0);
      stat.locks.push({ f: sim.frame, lines: lockRes.lines || 0, spin: lockRes.spin || "none", mino: low(lockRes.mino), combo: lockRes.stats?.combo ?? 0, dug: lockRes.garbageCleared || 0, atk: (lockRes.rawGarbage || []).reduce((a, b) => a + b, 0) });
      if (lockRes.topout) { stat.topout = true; }
      lockRes = null;
    }
    if (stat.topout) break;
    if (range && e.stats.pieces - pieceStart >= range.K) break;
    if (range && range.rescue && sim.frame > endFrame + (range.margin ?? 90) && (deathAt < 0 ? (deathAt = e.stats.pieces) : deathAt) >= 0 && e.stats.pieces - deathAt >= (range.more ?? 10) && !(stat.locks.at(-1)?.lines > 0)) break;
    const n = e.stats.pieces;
    if (n !== pieceAt) {
      // a new piece: ask the AI (the board does not change until this piece locks)
      pieceAt = n; keys = null; target = null; sd = false;
      wanted = range && range.order ? range.order[n - pieceStart] || null : null;
      const cur = low(e.falling.symbol);
      if (wanted && wanted !== cur && !(e.held && low(e.held) === wanted)) wanted = null;   // can not follow (keeps playing freely)
      plan = await ask(); stat.pieces++;
      if (plan && plan.cells) {
        stat.planned++;
        if (wanted ? wanted !== cur : plan.usedHold) { push("keydown", "hold"); push("keyup", "hold", 0.5); sim.step(); }
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
  if (range && range.rescue) return { seg: { v: 1, frame: range.F, end: sim.frame, state: null, lazy: true, ige: true, by: opt.engineId || "cc", events: out }, stat, endFrame };
  if (range) return { seg: { v: 1, frame: range.F, end: sim.frame, state: null, lazy: true, ige: true, by: opt.engineId || "cc", events: out }, stat };
  const end = stat.topout ? sim.frame : endFrame;
  return { embed: { v: 1, frame: 0, end, state: null, keep: true, by: opt.engineId || "cc", events: out, sends }, stat };
}

// The original line piece by piece: lock frame, attack, clear, and the first frame after each lock
// with no key held (a fix starts there, so nothing held carries into it).
function analyze(info, rep) {
  const s = new PlayerSim(structuredClone(rep), info), locks = [];
  s.onLock = (r, f) => locks.push({ f, atk: (r.rawGarbage || []).reduce((a, b) => a + b, 0), lines: r.lines || 0, spin: r.spin || "none", mino: low(r.mino), combo: r.stats?.combo || 0, dug: r.garbageCleared || 0 });
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
  // v5.01 (user: 地面についた状態で始めないで): a fix starts the frame the next piece appears (keys still
  // held are let go there), not the first frame with no key held (a held soft drop had landed it by then)
  const spawnAt = locks.map((l) => l.f + 1);
  return { locks, freeAfter, spawnAt, endFrame: s.endFrame, topout: s.isTopout() };
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
    if (sum / K < avg * 0.8 || ren || quad) out.push({ i: s, sum, avg, F: an.spawnAt[s - 1], K, ren, quad, release: true });
  }
  return out;
}

// A REN (combo 2+, 3 clears in a row or more) whose last clear is a QUAD or a T-Spin.
// Returns the index in locks of that last clear, or -1.
export function renFinish(locks, ok = () => true) {
  let run = 0, dug = 0;
  for (let i = 0; i < locks.length; i++) {
    const l = locks[i];
    if (l.lines > 0) { run++; dug += l.dug || 0; } else { run = 0; dug = 0; continue; }
    const next = locks[i + 1];
    const last = !next || next.lines === 0;
    const strong = l.lines >= 4 || (l.mino === "t" && l.spin && l.spin !== "none");
    if (last && run >= 3 && strong && ok(i, dug)) return i;
  }
  return -1;
}

// Runs of clears in a row (a REN when 3+): [{a, b (lock indexes), run, dug (garbage rows cleared), quad, tspin, last ('quad'|'tspin'|null)}]
export function chainsOf(locks) {
  const out = []; let c = null;
  locks.forEach((l, i) => {
    if (!l.lines) { c = null; return; }
    const q = l.lines >= 4, ts = l.mino === "t" && l.spin && l.spin !== "none";
    if (!c) out.push((c = { a: i, b: i, run: 0, dug: 0, quad: false, tspin: false, last: null }));
    c.b = i; c.run++; c.dug += l.dug || 0; c.quad ||= q; c.tspin ||= ts; c.last = q ? "quad" : ts ? "tspin" : null;
  });
  return out.filter((c) => c.run >= 3);
}
// The REN the user wants to see (first one): it ends with a QUAD / T-Spin within about 10 pieces or
// after digging deep (4+ garbage rows), or it digs deep with a QUAD somewhere in it.
function seenChain(locks, o) {
  const within = o.renWithin ?? 10, deep = o.renDig ?? 4;
  for (const c of chainsOf(locks)) {
    if (c.last && (c.b + 1 <= within || c.dug >= deep)) return { ...c, kind: c.last };
    if (c.quad && c.dug >= deep) return { ...c, kind: "dig-quad" };
  }
  return null;
}

// Topout rescue: from 1, 2, 3 ... pieces before the death, the AI plays on (same pieces, same incoming
// garbage at the same frames) until past the frame the player died. The fewest pieces back that
// survives is "how far back". From there a few more starts are tried for a line whose REN ends with a
// QUAD or a T-Spin (the user's wish); that line is used when found, otherwise the first survival.
async function rescueOne(pl, bot, o, T, an, prog) {
  const N = an.locks.length, maxBack = Math.min(o.maxBack ?? 30, N - 1), extra = o.renTries ?? 12;
  let first = null, best = null; const all = [];
  const tryFrom = async (k, i, F, order) => {
    const { seg, stat } = await fixOne(pl, pl.replay, bot, { ...o, range: { F, K: Infinity, rescue: true, order, release: true }, onProgress: prog && ((x) => prog({ ...x, back: k })) }, T);
    // survives = no topout until past the death frame (+90F); a topout later (in the extra pieces) only cuts the line
    const lim = an.endFrame + 90;
    if (stat.topout && (stat.locks.at(-1)?.f ?? 0) <= lim) return null;
    const safe = stat.topout ? stat.locks.slice(0, -1) : stat.locks;
    const ch = seenChain(safe, o);
    // shown to the end of the REN (a digging REN is never cut); with none, to the death frame (but a
    // digging REN going on there still runs to its end)
    let endF = an.endFrame;
    if (ch) {
      // a REN seen right after (within 2 pieces) is played on too (the user: Quad のあとにも REN が見えたら続けて)
      let b = ch.b;
      for (const c of chainsOf(safe)) if (c.a > b && c.a - b <= 3) b = c.b;
      endF = Math.max(endF, safe[b].f + 1);
    }
    else { const c = chainsOf(safe).find((c) => safe[c.a].f <= an.endFrame && safe[c.b].f > an.endFrame && c.dug > 0); if (c) endF = safe[c.b].f + 1; }
    seg.end = endF; seg.events = seg.events.filter((x) => x.f <= endF);
    const cand = { seg, stat, k, i, F, ren: ch ? { lines: ch.quad ? 4 : 0, combo: ch.run - 1, kind: ch.kind, dug: ch.dug } : null, renAt: ch ? ch.b : -1, renPast: !!ch && safe[ch.b].f > an.endFrame };
    cand.m = metrics(safe.filter((l) => l.f <= endF));
    // (1) same piece order as the player (the AI placed the same minos in the same order) / (2) a different order (HOLD)
    const mine = an.locks.slice(i).map((l) => l.mino), ai = safe.map((l) => l.mino), n = Math.min(mine.length, ai.length);
    cand.order = ai.slice(0, n).every((x, j) => x === mine[j]) ? "same" : "hold";
    return cand;
  };
  for (let k = 1; k <= maxBack; k++) {
    const i = N - k;                       // the AI places pieces i, i+1, ... (0-based)
    const F = i > 0 ? an.spawnAt[i - 1] : null;
    if (F == null) continue;
    const cand = await tryFrom(k, i, F, null);
    if (!cand) continue;
    all.push(cand);
    if (!first) first = cand;
    if (cand.ren && !best) best = cand;
    if (k >= first.k + extra) break;
  }
  const r = best || first;
  if (!r) return null;
  // (1) the same piece order as the player: the AI places the player's minos in the player's order
  const same = [];
  for (let k = first.k; k <= Math.min(maxBack, first.k + extra); k++) {
    const i = N - k, F = i > 0 ? an.spawnAt[i - 1] : null;
    if (F == null) continue;
    const c = await tryFrom(k, i, F, an.locks.slice(i).map((l) => l.mino));
    if (c && c.order === "same") same.push(c);
  }
  // "もうちょっと伸ばせた": another survival from about the same place with a clearly longer REN, deeper dig
  // or more attack (also shows when the player's piece order cut a REN short)
  // QUAD first (the user: REN の数より Quad で締めるのを優先), then REN, dig, attack
  const rank = (c) => (c.m.quad ? 1000 : 0) + c.m.score;
  const isBetter = (c) => c !== r && ((c.m.quad && !r.m.quad) || c.m.ren > r.m.ren || c.m.dug >= r.m.dug + 3 || c.m.atk >= r.m.atk + 4) && !(r.m.quad && !c.m.quad);
  const pickBest = (list) => list.filter(isBetter).sort((a, b) => rank(b) - rank(a))[0] || null;
  // both kinds are shown when found: (1) same order, (2) another order (HOLD)
  const betters = [pickBest(same), pickBest(all.filter((c) => c.order !== "same"))].filter(Boolean);
  return { ...r, minBack: first.k, betters };
}
// REN (longest run of clears in a row - 1), garbage rows dug, attack
function metrics(locks) {
  let run = 0, ren = 0, dug = 0, atk = 0, quad = 0;
  for (const l of locks) { if (l.lines > 0) { run++; ren = Math.max(ren, run - 1); } else run = 0; dug += l.dug || 0; atk += l.atk || 0; if (l.lines >= 4) quad++; }
  return { ren, dug, atk, quad, score: ren * 3 + dug + atk };
}

/**
 * ccImprove(rep, username, frame, bot, opt) -> {seg, cc, orig, piece} | null
 * 「ここから改善案」(replay edit, during playback): one player's replay object (TETR.IO's esm.replay) and a frame.
 * From the first frame at or after it with no key held (after a lock), the AI places opt.K (10) pieces with
 * the same pieces and incoming garbage; the result is a fix (lazy seg) the replay edit inserts there.
 */
export async function ccImprove(rep, username, frame, bot, opt = {}) {
  const o = { thinkMs: 150, sliceMs: 20, idle: async () => {}, ...opt };
  const p = parseReplayFile({ users: [{ username }], replay: structuredClone(rep) });
  const pl = p.rounds[0][0], T = tables(pl.replay.options?.kickset), an = analyze(pl, pl.replay);
  // from just after the next lock (keys still held there are let go)
  // (the replay is at that frame, so the fix starts at the next piece: just after the next lock)
  const i = an.locks.findIndex((l) => l.f >= frame);
  if (i < 0) return null;
  // the AI takes the piece in play now from the next frame (keys still held are let go; the path search
  // starts where the piece is). Only when HOLD was already used on it, it starts at the piece after.
  // v5.01 (user: 地面についた状態で始めないで): the piece in play may already be on the ground, so the AI
  // starts with the next piece, the frame it appears
  const s = i + 1, F = an.spawnAt[i];
  if (s >= an.locks.length) return null;
  const K = Math.min(o.K ?? 10, an.locks.length - s);
  const { seg, stat } = await fixOne(pl, pl.replay, bot, { ...o, range: { F, K, release: true } }, T);
  const orig = an.locks.slice(s, s + K).reduce((a, l) => a + l.atk, 0);
  return { seg: { ...seg, orig, cc: stat.attack, improve: true }, cc: stat.attack, orig, piece: s + 1, pieces: K, topout: stat.topout };
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
      const info = { renPieces: r.ren ? r.renAt + 1 : 0, renPast: !!r.renPast, minBack: r.minBack, back: r.k, piece: r.i + 1, death: an.locks.length, deathFrame: an.endFrame, ren: r.ren ? r.ren.kind : null, renCombo: r.ren ? r.ren.combo : 0, dug: r.ren ? r.ren.dug : 0 };
      // the player's own play over the same pieces (from the shown start to the death)
      info.mine = metrics(an.locks.slice(r.i)); info.m = r.m;
      const seg = { ...r.seg, rescue: info, cc: r.m.atk };
      const segs = [seg];
      for (const b of r.betters) {
        const binfo = { ...info, base: r.m, order: b.order, alt: true, back: b.k, piece: b.i + 1, m: b.m, mine: metrics(an.locks.slice(b.i)), ren: b.ren ? b.ren.kind : null, renCombo: b.ren ? b.ren.combo : 0, dug: b.ren ? b.ren.dug : 0, renPast: !!b.renPast };
        // played after the first one (the replay edit goes back to its start); not started by reaching its frame
        segs.push({ ...b.seg, alt: true, rescue: binfo, cc: b.m.atk });
        (info.betters || (info.betters = [])).push({ back: b.k, m: b.m, order: b.order });
        info.better = info.betters[0];
      }
      ref.results[EMB] = { ...seg, segs };
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
