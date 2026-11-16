// Butter (= vA Tree) player data, Node CLI. The learner is tools/butter/learn-core.mjs (the app uses the same one).
// Build: node ~/Downloads/all-tetrio-patch/private-ai/vA-cc2/build-vs.mjs <this> <out.mjs>
// Run:   node <out.mjs> <out.json> <player name> <replay files...>   [PKG=<Butter package .js> also writes Butter-<name>.js next to out.json]
import fs from "node:fs";
import path from "node:path";
import { learn, playerPackage } from "../butter/learn-core.mjs";
const [outPath, player, ...files] = process.argv.slice(2);
if (!outPath || !player || !files.length) { console.error("使い方: node tree-player-data.mjs <出力.json> <プレーヤー名> <リプレイ...>"); process.exit(1); }
const texts = []; for (const f of files) { try { texts.push(fs.readFileSync(f, "utf8")); } catch { console.error("読めません: " + f); } }
let data;
try { data = await learn(texts, player, { mix: process.env.MIX ? Number(process.env.MIX) : 0.5 }); } catch (e) { console.error(e.message); process.exit(1); }
fs.writeFileSync(outPath, JSON.stringify(data, null, 1));
if (process.env.PKG) { const p = playerPackage(data, fs.readFileSync(process.env.PKG, "utf8")); fs.writeFileSync(path.join(path.dirname(outPath), p.name), p.script); console.log("package " + p.name + " (" + p.label + ")"); }
console.log(JSON.stringify({ player: data.player, games: data.games, pieces: data.pieces, skipped: data.skipped, agreeDefault: data.agree.default, agreeFitted: data.agree.fitted, misdropRate: data.misdrop.rate }));
