// Node test of the CC 盤面修正 core with Cold Clear 1 (the user's test standard).
// Build: cd ~/Downloads/tetrio-replay-video && npx --prefix tools esbuild ../tetrio-hub/tools/cc-fix/test-node.mjs
//   --bundle --platform=node --format=esm --alias:chalk=./vendor/triangle/chalk-stub.js --outfile=/tmp/ccfix-test.mjs
// Run:   node /tmp/ccfix-test.mjs <in.ttrm> <username> <out.ttrm> [thinkMs]
// Then it replays the output (original non-key events + the embedded keys) with the engine
// and checks each round ends with the same piece count the fix reported.
import fs from "node:fs";
import vm from "node:vm";
import { ccFix, playersOf, EMB } from "./cc-fix-core.mjs";
import { parseReplayFile, PlayerSim } from "../../../tetrio-replay-video/src/replay.js";

const CC1 = process.env.CC1_DIR || process.env.HOME + "/Downloads/tetrio-hub/docs/ext-ai/";
const [inPath, user, outPath, think = "60"] = process.argv.slice(2);
let def;
const ctx = { LocalExternalAI: { register: (d) => (def = d) }, WebAssembly, performance, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(CC1 + "vA-external-ai-cc1.js", "utf8"), ctx);
const bot = await def.create({ "cold_clear_1.wasm": fs.readFileSync(CC1 + "cold_clear_1.wasm") }, { strength: null });
const src = fs.readFileSync(inPath, "utf8");
console.log("players", playersOf(src).map((p) => p.username + ":" + p.rounds.length).join(" "));
const t0 = Date.now();
const { json, report } = await ccFix(src, user, bot, { thinkMs: Number(think), engineId: "cc1" });
console.log("time", ((Date.now() - t0) / 1000).toFixed(1) + "s");
for (const r of report) console.log(JSON.stringify(r));
fs.writeFileSync(outPath, JSON.stringify(json));
// replay check: each fix = the original up to its frame, then only the embedded keys
const p = parseReplayFile(structuredClone(json));
p.rounds.forEach((round, ri) => {
  const pl = round.find((x) => x.username.toLowerCase() === user.toLowerCase());
  const em = pl && pl.replay.results && pl.replay.results[EMB];
  if (!em) return;
  for (const sg of em.segs || [em]) {
    const rep = structuredClone(pl.replay);
    if (sg.keep) rep.events = rep.events.filter((e) => e.type !== "keydown" && e.type !== "keyup");
    const s = new PlayerSim(rep, pl);
    while (s.frame < sg.frame) s.step();
    if (!sg.keep) for (const [f, l] of [...s.byFrame]) if (f >= sg.frame) { const r = sg.ige ? l.filter((x) => x.type !== "keydown" && x.type !== "keyup") : []; if (r.length) s.byFrame.set(f, r); else s.byFrame.delete(f); }
    for (const x of sg.events) { let l = s.byFrame.get(x.f); if (!l) s.byFrame.set(x.f, (l = [])); l.push({ frame: x.f, type: x.t === "d" ? "keydown" : "keyup", data: { key: x.k, subframe: x.s || 0 } }); }
    let atk = 0; const lf = []; s.onLock = (r, f) => { atk += (r.rawGarbage || []).reduce((a, b) => a + b, 0); lf.push(f); };
    const p0 = s.engine.stats.pieces, rc0 = s.engine.stats.garbage?.receive ?? 0;
    while (!s.finished && s.frame <= sg.end) s.step();
    // the player's lock frames for the same piece numbers
    const o = new PlayerSim(structuredClone(pl.replay), pl), of = []; o.onLock = (_r, f) => of.push(f); while (!o.finished) o.step();
    const shift = lf.map((f, i) => f - (of[p0 + i] ?? f)); if (process.env.SHIFTS) console.log(shift.join(" ")); const maxShift = Math.max(0, ...shift.map(Math.abs));
    console.log("round", ri, "fix @", sg.frame, "-", sg.end, "attack", atk, "(fix said", sg.cc ?? "-", "player", sg.orig ?? "-", ") garbage in", (s.engine.stats.garbage?.receive ?? 0) - rc0, "lock shift max", maxShift, "frames");
  }
});
