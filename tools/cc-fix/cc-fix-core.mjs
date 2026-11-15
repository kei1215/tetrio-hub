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
  const endFrame = s0.endFrame;
  const gaps = lockFrames.slice(1).map((f, i) => f - lockFrames[i]);
  const avgGap = gaps.length ? Math.max(4, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 20;
  // pass 2: same replay without its keys; ours go in frame by frame
  const r2 = structuredClone(rep);
  r2.events = r2.events.filter((e) => !KEY.has(e.type));
  const sim = new PlayerSim(r2, info), e = sim.engine;
  const out = [], stat = { pieces: 0, planned: 0, matched: 0, miss: 0, noplan: 0, attack: 0, topout: false };
  let lockRes = null;
  sim.onLock = (r) => { lockRes = r; };
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
    return job.result();
  };

  let plan = null, keys = null, target = null, want = null, sd = false, pieceAt = -1;
  const idleTo = (f) => { while (sim.frame < f && !sim.finished) sim.step(); };
  idleTo(firstKey);
  while (!sim.finished) {
    if (lockRes) {
      if (want && sim.lastLock && ckey(sim.lastLock.cells || []) === ckey(want)) stat.matched++;
      want = null;
      stat.attack += (lockRes.rawGarbage || []).reduce((a, b) => a + b, 0);
      if (lockRes.topout) { stat.topout = true; }
      lockRes = null;
    }
    if (stat.topout) break;
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
      const need = keys.length + keys.filter((k) => k === "softDrop").length * 2;
      if (sim.frame < due - need && !grounded()) { keys = null; sim.step(); continue; }
    }
    const k = keys[0];
    if (k === "softDrop") {
      if (!sd) { push("keydown", "softDrop"); sd = true; sim.step(); continue; }
      if (!grounded() && sd < 120) { sd++; sim.step(); continue; }
      push("keyup", "softDrop"); sd = false; keys.shift(); sim.step(); continue;
    }
    push("keydown", k); push("keyup", k, 0.5); keys.shift();
    sim.step();
  }
  const end = stat.topout ? sim.frame : endFrame;
  return { embed: { v: 1, frame: 0, end, state: null, keep: true, by: opt.engineId || "cc", events: out }, stat };
}

/**
 * ccFix(json, username, bot, opt) -> {json (new file object), report}
 * bot: an outside AI package bot (begin(input) -> job.step(ms) / stop() / result()).
 * opt: {thinkMs = 150, sliceMs = 20, idle = async () => {}, onProgress, engineId}
 */
export async function ccFix(json, username, bot, opt = {}) {
  const j = structuredClone(typeof json === "string" ? JSON.parse(json) : json);
  const o = { thinkMs: 150, sliceMs: 20, idle: async () => {}, ...opt };
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
    const { embed, stat } = await fixOne(pl, pl.replay, bot, { ...o, onProgress: prog && ((x) => prog({ ...x, round: ri, rounds: p.rounds.length })) }, T);
    if (!ref.results || typeof ref.results !== "object") ref.results = {};
    ref.results[EMB] = embed;
    report.push({ round: ri, ...stat, events: embed.events.length });
  }
  if (!found) throw new Error("このリプレイに「" + username + "」はいません");
  return { json: j, report };
}
