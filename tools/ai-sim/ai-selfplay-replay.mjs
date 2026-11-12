// vA AI self-play in Node (no browser): the vA spin planner (ai-src/engine/ai-spin-planner.js)
// drives the MP4 tool's engine (teto port, matches real TETR.IO replays) with real key events,
// and the events are written out as a .ttr (QP solo, no incoming garbage). The live BOT's
// learned templates are not used here. Paths are this Mac's checkouts.
// Build: cd ~/Downloads/tetrio-replay-video && npx --prefix tools esbuild <this> --bundle
//   --platform=node --format=esm --alias:chalk=./vendor/triangle/chalk-stub.js --outfile=/tmp/x.mjs
// Run:   PARAMS='{"zeroSpin":-20}' node /tmp/x.mjs <template QP solo .ttr> <out.ttr> [pieces] [seed]
// GARB=amt,period adds seeded incoming garbage (TL-like); the .ttr keeps it as ige events.
// Check: test/verify-stats.mjs <out.ttr> (bundled the same way) must print ALL OK.
import fs from "node:fs";
import { parseReplayFile, resolveOptions, createEngine } from "/Users/kurashinakei/Downloads/tetrio-replay-video/src/replay.js";
import { tetrominoes } from "/Users/kurashinakei/Downloads/tetrio-replay-video/vendor/triangle/engine/utils/tetromino/data.ts";
import { kicks as KD } from "/Users/kurashinakei/Downloads/tetrio-replay-video/vendor/triangle/engine/utils/kicks/data.ts";
import SP from "/Users/kurashinakei/Downloads/tetrio-hub/tools/patch/ai-src/engine/ai-spin-planner.js";

const [tplPath, outPath, maxPieces = "300", seedArg] = process.argv.slice(2);
const tplFile = JSON.parse(fs.readFileSync(tplPath, "utf8"));
const rep0 = tplFile.replay;
const options = { ...rep0.options };
if (seedArg) options.seed = Number(seedArg);
const rep = { options, events: [{ frame: 0, type: "start", data: {} }], frames: 1 };
const o = resolveOptions({ ...rep, events: rep0.events.filter((e) => e.type === "end") });
o.seed = options.seed;
const date = new Date(tplFile.ts);
const e = createEngine(o, date);

// Planner tables in matrix coords (y down), TETR.IO kick data (y down).
const shapes = {};
for (const t of ["t", "s", "z", "l", "j", "i", "o"]) shapes[t] = tetrominoes[t].matrix.data.map((r) => r.map(([x, y]) => [x, y]));
const ks = KD[o.kickset || "SRS+"] || KD["SRS+"];
const corner = [[[0, 0, 0, 3], [2, 0, 0, 1], [2, 2, 1, 2], [0, 2, 2, 3]]];
SP.setTables({ shapes, kicks: ks.kicks, ikicks: ks.i_kicks || ks.kicks, corner: [0, 1, 2, 3].map(() => corner[0]) });

const W = 10;
const H = () => e.board.state.length;
function rowsOf() { const h = H(), rows = new Array(h); for (let y = 0; y < h; y++) { let m = 0; const row = e.board.state[h - 1 - y]; for (let x = 0; x < W; x++) if (row[x]) m |= 1 << x; rows[y] = m; } return rows; }
function boardOf() { const h = H(), b = []; for (let y = 0; y < h; y++) b.push(e.board.state[h - 1 - y].map((c) => (c ? "x" : null))); return b; }
const cellsAt = (t, x, y, r) => shapes[t][r].map(([cx, cy]) => [x + cx, y + cy]);
const key = (c) => c.map(([x, y]) => x + "," + y).sort().join(";");

// BFS over taps from the current piece position (planner coords) to the target cells.
function legal(rows, t, x, y, r) { for (const [cx, cy] of cellsAt(t, x, y, r)) { if (cx < 0 || cx >= W || cy >= rows.length) return false; if (cy >= 0 && (rows[cy] >> cx) & 1) return false; } return true; }
function rot(rows, t, x, y, r, d) {
  if (t === "o") return null; const nr = (r + d + 4) & 3;
  if (legal(rows, t, x, y, nr)) return [x, y, nr];
  const list = (t === "i" ? ks.i_kicks || ks.kicks : ks.kicks)[String(r) + String(nr)] || [];
  for (const [kx, ky] of list) if (legal(rows, t, x + kx, y + ky, nr)) return [x + kx, y + ky, nr];
  return null;
}
function path(rows, t, sx, sy, sr, target, allow180) {
  const want = key(target), start = [sx, sy, sr], seen = new Map([[start.join(), null]]), q = [start];
  const acts = ["moveLeft", "moveRight", "rotateCW", "rotateCCW", "rotate180", "softDrop"];
  for (let i = 0; i < q.length && i < 20000; i++) {
    const [x, y, r] = q[i];
    let gy = y; while (legal(rows, t, x, gy + 1, r)) gy++;
    if (key(cellsAt(t, x, gy, r)) === want) { const keys = []; let k = q[i].join(); while (seen.get(k)) { const [p, a] = seen.get(k); keys.unshift(a); k = p; } return { keys, needDrop: gy !== y }; }
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
}

let frame = 1;
const events = rep.events;
function tick(evs) { evs = [...garbageTick(), ...evs]; e.tick(evs.map((x) => ({ ...x, frame }))); for (const x of evs) events.push({ frame, ...x }); frame++; }
// GARB="amt,period": an opponent sends 1..2*amt-1 lines every ~period frames (seeded),
// like a TL / QP match, so the planner's cancel / take logic is exercised.
const [gAmt, gPer] = (process.env.GARB || "").split(",").map(Number);
let gSeed = (Number(seedArg) || 1) * 7919 + 13, gNext = gPer || Infinity, gIid = 0;
const gRnd = () => ((gSeed = (Math.imul(gSeed, 1103515245) + 12345) >>> 0) / 4294967296);
function garbageTick() {
  if (frame < gNext) return [];
  gNext = frame + Math.round(gPer * (0.5 + gRnd()));
  gIid++;
  return [{ type: "ige", data: { id: "sim-" + gIid, type: "interaction", data: { type: "garbage", gameid: 9999, username: "SIM", iid: gIid, ackiid: gIid, amt: 1 + Math.floor(gRnd() * (2 * gAmt - 1)), zthalt: e.stats.zenith?.altitude ?? 0, x: 4.5, y: 30 } } }];
}
const incoming = () => (e.zenith?.impendingdamage || []).reduce((n, d) => n + (d.active === false ? 0 : d.amt || 0), 0);
// Same rule as bot-ai.js playerPlanOptions (no series estimate here).
function cancelOf() {
  const inc = incoming(), b = boardOf(); stats.maxInc = Math.max(stats.maxInc || 0, inc); let peak = 0; for (let y = 0; y < b.length; y++) if (b[y].some(Boolean)) { peak = b.length - y; break; }
  const margin = 20 - (peak + inc);
  return { incoming: inc, cancelW: !inc ? 0 : margin < 4 ? 4 + 0.5 * peak : margin < 8 ? 1.5 : 0 };
}
function tap(k) { tick([{ type: "keydown", data: { key: k, subframe: 0 } }, { type: "keyup", data: { key: k, subframe: 0.5 } }]); }
const stats = { recv: 0, pieces: 0, miss: 0, noplan: 0, spins: {}, zeroSpin: 0, attack: 0 };
const allow180 = o.allow180 !== false;
const P = { ...JSON.parse(process.env.PARAMS || "{}"), charging: true, chargeAt: o.b2bcharge_at ?? 4, chargeBase: o.b2bcharge_base ?? 3, combo: true };
for (let i = 0; i < 60; i++) tick([]); // countdown-free start: let the first piece spawn
let lastLines = 0, topped = false;
while (stats.pieces < Number(maxPieces)) {
  if (topped) break;
  const f = e.falling, t = String(f.symbol).toLowerCase();
  const plan = SP.plan(null, { board: boardOf(), falling: t, hold: e.held ? String(e.held).toLowerCase() : null, queue: e.queue.slice(0, 5).map((q) => String(q).toLowerCase()), holdAllowed: true, b2b: Math.max(0, e.stats.b2b || 0), combo: Math.max(0, e.stats.combo || 0) }, { ...P, ...cancelOf(), allow180 });
  if (!plan) { stats.noplan++; tap("hardDrop"); stats.pieces++; continue; }
  if (plan.hold) tap("hold");
  const g = e.falling, gt = String(g.symbol).toLowerCase();
  const rows = rowsOf(), h = rows.length;
  const sx = g.location[0], sy = h - 1 - Math.floor(g.location[1]), sr = g.rotation;
  const target = cellsAt(gt, plan.x, plan.y, plan.r);
  const p = path(rows, gt, sx, sy, sr, target, allow180);
  if (!p) stats.miss++;
  else for (const k of p.keys) { if (k === "softDrop") { tick([{ type: "keydown", data: { key: k, subframe: 0 } }]); tick([{ type: "keyup", data: { key: k, subframe: 0 } }]); } else tap(k); }
  const before = key(e.falling.absoluteBlocks.map(([x, y]) => [x, h - 1 - y]));
  let gy = 0; // where the engine would land the piece now
  const landed = key(target);
  if (p && before !== landed) { /* piece above target; hard drop lands it */ }
  const pre = { lines: e.stats.lines, spin: null };
  let lock = null; const on = (r) => { lock = r; }; e.events.on("falling.lock", on);
  tap("hardDrop"); e.events.off?.("falling.lock", on);
  stats.pieces++;
  if (lock) {
    const sp = lock.spin || "none"; const lines = e.stats.lines - pre.lines;
    if (sp !== "none") { const k = lock.mino + ":" + sp + ":" + lines; stats.spins[k] = (stats.spins[k] || 0) + 1; if (!lines) stats.zeroSpin++; }
    if (lock.topout) topped = true;
    const a = (lock.rawGarbage || []).reduce((a, b) => a + b, 0); stats.attack += a;
    const cat = lines === 0 ? null : sp !== "none" ? (String(lock.mino).toLowerCase() === "t" ? (sp === "mini" ? "tmini" : "tfull") : "other") : lines === 4 ? "quad" : "plain";
    if (cat) { stats.cat ??= {}; stats.cat[cat] = (stats.cat[cat] || 0) + a; }
    if (String(lock.mino).toLowerCase() === "t") { stats.tPieces = (stats.tPieces || 0) + 1; if (sp === "normal" && lines >= 2) stats.tGood = (stats.tGood || 0) + 1; }
  }
  for (let i = 0; i < Number(process.env.PACE || 2); i++) tick([]); // idle frames between pieces (PACE)
}
const frames = frame;
events.push({ frame: frames, type: "end", data: { reason: topped ? "topout" : "clear" } });
const secs = frames / 60;
const results = { aggregatestats: { apm: +(stats.attack / secs * 60).toFixed(2), pps: +(e.stats.pieces / secs).toFixed(2), vsscore: 0 }, stats: { piecesplaced: e.stats.pieces, lines: e.stats.lines, btb: e.stats.b2b, topbtb: e.stats.topB2B ?? 0 }, gameoverreason: topped ? "topout" : "clear" };
const out = { id: null, gamemode: tplFile.gamemode, ts: tplFile.ts, users: [{ ...tplFile.users[0], username: "VA-AI" }], replay: { frames, events, options, results }, version: tplFile.version };
fs.writeFileSync(outPath, JSON.stringify(out));
const tf = ((stats.cat?.tfull || 0) / Math.max(1, stats.attack) * 100).toFixed(0);
console.log(JSON.stringify({ app: (stats.attack / Math.max(1, stats.pieces)).toFixed(2), tShare: tf + "%", tGood: (stats.tGood || 0) + "/" + (stats.tPieces || 0), cat: stats.cat, zeroSpin: stats.zeroSpin, recv: e.stats.garbage?.receive ?? 0, maxInc: stats.maxInc, miss: stats.miss, topped, lines: e.stats.lines, b2b: e.stats.b2b }));
if (0) console.log(JSON.stringify({ ...stats, lines: e.stats.lines, frames, topped, b2b: e.stats.b2b }));
