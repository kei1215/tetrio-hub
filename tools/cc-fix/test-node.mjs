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
// replay check: what the replay edit plays (keep = original non-key events + embedded keys)
const p = parseReplayFile(structuredClone(json));
p.rounds.forEach((round, ri) => {
  const pl = round.find((x) => x.username.toLowerCase() === user.toLowerCase());
  const em = pl && pl.replay.results && pl.replay.results[EMB];
  if (!em) return;
  const rep = structuredClone(pl.replay);
  rep.events = rep.events.filter((e) => e.type !== "keydown" && e.type !== "keyup")
    .concat(em.events.map((x) => ({ frame: x.f, type: x.t === "d" ? "keydown" : "keyup", data: { key: x.k, subframe: x.s || 0 } })))
    .sort((a, b) => a.frame - b.frame);
  const s = new PlayerSim(rep, pl);
  while (!s.finished && !(s.engine.toppedOut)) s.step();
  const rr = report.find((x) => x.round === ri);
  console.log("round", ri, "replayed pieces", s.engine.stats.pieces, "attack", s.locks.reduce((a, l) => a + (l.res.rawGarbage || []).reduce((x, y) => x + y, 0), 0), "fix said attack", rr.attack);
});
