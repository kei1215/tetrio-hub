// vA player templates from real replays, in Node (same learner as the live BOT: ai-templates.js).
// Input: tspin-terrain-data.mjs output (one line per lock, with pre / cells).
// Output: JSON {list, statsBy} that can be loaded as the qp-ai-templates-v1 store.
// Run: node templates-from-replays.mjs <locks.jsonl> <out.json> [ctx=normal]
import fs from "node:fs";
import { createRequire } from "node:module";
const [inPath, outPath, ctx = "normal"] = process.argv.slice(2);
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const T = createRequire(import.meta.url)("../patch/ai-src/engine/ai-templates.js");
const L = fs.readFileSync(inPath, "utf8").trim().split("\n").map(JSON.parse).filter((l) => l.cells?.length === 4 && l.lines <= 4);
const games = new Map();
for (const l of L) { const k = `${l.file}|${l.round}|${l.who}`; if (!games.has(k)) games.set(k, []); games.get(k).push(l); }
let added = 0;
for (const locks of games.values()) {
  locks.sort((a, b) => a.frame - b.frame);
  added += T.learn(locks.map((l) => ({ type: l.mino, cells: l.cells, pre: l.pre, spin: l.spin === "normal" ? 2 : l.spin === "mini" ? 1 : 0, lines: l.lines })), ctx);
}
const store = JSON.parse(mem["qp-ai-templates-v1"]);
const kinds = {}; for (const t of store.list) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
fs.writeFileSync(outPath, JSON.stringify(store));
console.log(JSON.stringify({ games: games.size, locks: L.length, templates: store.list.length, added, kinds }));
