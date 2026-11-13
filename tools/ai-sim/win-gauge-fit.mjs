// Fit the vA win gauge (ai-src/engine/win-gauge.js) from versus snapshots.
// Input: JSON lines {win: 1|0 (left side won), end, snaps: [[featuresLeft, featuresRight, frame], ...]}
// (written by a Node versus harness with SNAP=<file>). Logistic regression on feature
// differences, both orientations (symmetric model, no bias). Prints weights and accuracy.
// Run: node win-gauge-fit.mjs <snap.jsonl>
import fs from "node:fs";
import { createRequire } from "node:module";
const WG = createRequire(import.meta.url)("../patch/ai-src/engine/win-gauge.js");
const games = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse);
const n = WG.NAMES.length;
// hold out every 5th game
const rows = (set) => set.flatMap((g) => g.snaps.map(([a, b]) => ({ d: a.map((v, i) => v - b[i]), y: g.win })));
const train = rows(games.filter((_, i) => i % 5)), test = rows(games.filter((_, i) => !(i % 5)));
const sd = new Array(n).fill(0); for (const r of train) for (let i = 0; i < n; i++) sd[i] += r.d[i] ** 2; for (let i = 0; i < n; i++) sd[i] = Math.sqrt(sd[i] / train.length) || 1;
const u = new Array(n).fill(0), m = new Array(n).fill(0), v = new Array(n).fill(0);
for (let it = 1; it <= 600; it++) {
  const g = new Array(n).fill(0);
  for (const r of train) for (const sgn of [1, -1]) { let z = 0; for (let i = 0; i < n; i++) z += sgn * r.d[i] / sd[i] * u[i]; const y = sgn > 0 ? r.y : 1 - r.y, p = 1 / (1 + Math.exp(-z)); for (let i = 0; i < n; i++) g[i] += (y - p) * sgn * r.d[i] / sd[i]; }
  for (let i = 0; i < n; i++) { const gi = g[i] / (2 * train.length) - 1e-3 * u[i]; m[i] = 0.9 * m[i] + 0.1 * gi; v[i] = 0.999 * v[i] + 0.001 * gi * gi; u[i] += 0.05 * (m[i] / (1 - 0.9 ** it)) / (Math.sqrt(v[i] / (1 - 0.999 ** it)) + 1e-8); }
}
const w = u.map((x, i) => +(x / sd[i]).toFixed(4));
const acc = (set, W) => { let ok = 0, ll = 0; for (const r of set) { const z = r.d.reduce((a, x, i) => a + x * W[i], 0), p = 1 / (1 + Math.exp(-z)); ok += (p > 0.5) === (r.y === 1) ? 1 : 0; ll += Math.log(r.y ? p : 1 - p); } return { acc: +(ok / set.length).toFixed(3), ll: +(ll / set.length).toFixed(3) }; };
console.log(JSON.stringify({ games: games.length, train: train.length, test: test.length, before: acc(test, WG.weights), after: acc(test, w) }));
console.log(JSON.stringify(Object.fromEntries(WG.NAMES.map((k, i) => [k, w[i]]))));
console.log("W=" + JSON.stringify(w));
