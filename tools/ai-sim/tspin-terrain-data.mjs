// T-Spin terrain data from real replays (vA AI): replays each round of the given players with the
// MP4 tool's engine and writes one JSON line per locked piece:
//   {rows: 40 row masks (y = 0 top), mino, spin, lines, file, round}
// A learner (tspin-terrain-fit.mjs) labels a board by what the player fired in the next pieces.
// Build: cd ~/Downloads/tetrio-replay-video && npx --prefix tools esbuild <this> --bundle
//   --platform=node --format=esm --alias:chalk=./vendor/triangle/chalk-stub.js --outfile=<out.mjs>
// Run:   node <out.mjs> <out.jsonl> <player names comma-separated> <replay files...>
import fs from "node:fs";
import { parseReplayFile, PlayerSim } from "/Users/kurashinakei/Downloads/tetrio-replay-video/src/replay.js";

const [outPath, namesArg, ...files] = process.argv.slice(2);
const names = new Set(namesArg.toLowerCase().split(","));
fs.writeFileSync(outPath, "");
let n = 0;
for (const file of files) {
  let rep; try { rep = parseReplayFile(fs.readFileSync(file, "utf8"), file); } catch { continue; }
  rep.rounds.forEach((round, ri) => {
    for (const p of round) {
      if (!names.has(String(p.username).toLowerCase()) || !p.replay?.events) continue;
      const sim = new PlayerSim(p.replay, { ts: p.ts });
      const lines = [];
      for (let guard = 0; guard < 200000 && !sim.finished; guard++) {
        if (sim.step() === null) break;
        for (const lk of sim.frameLocks) {
          const st = sim.engine.board.state, h = st.length, rows = [];
          for (let y = 0; y < h; y++) { let m = 0; const row = st[h - 1 - y]; for (let x = 0; x < 10; x++) if (row[x]) m |= 1 << x; rows.push(m); }
          lines.push(JSON.stringify({ rows, mino: String(lk.res.mino).toLowerCase(), spin: lk.res.spin || "none", lines: lk.res.lines || 0, file: file.split("/").pop(), round: ri, who: p.username }));
        }
        if (sim.frame > sim.endFrame + 5) break;
      }
      fs.appendFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""));
      n += lines.length;
    }
  });
}
console.log(JSON.stringify({ pieces: n }));
