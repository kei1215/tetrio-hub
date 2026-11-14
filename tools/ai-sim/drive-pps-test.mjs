// Node test (v4.8283): the live BOT controller (ai-quick-planner.js drive) keeps a constant
// PPS — also while it clears every piece (REN) with garbage incoming, and on floor routes
// (soft drop / spin) whose lock delay could place the piece early.
// Run: node tools/ai-sim/drive-pps-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../patch/ai-src/engine/ai-quick-planner.js'), 'utf8');

function run({ pps, pieces, route, incoming, sync }) {
  const ctx = { LocalTestQP: {}, performance, console,
    localStorage: { getItem: k => (sync && k === 'qp-ai-sync-player' ? 'true' : null) } };
  ctx.window = ctx; const window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  let frame = 0, groundedAt = -1;
  const placed = [];
  const spawn = () => ({ type: 't', x: 4, y: 0, r: 0, flags: 0, locking: 0 });
  const lockPiece = () => { placed.push(frame); game.state.stats.piecesplaced++; game.state.falling = spawn(); groundedAt = -1; };
  const peer = sync ? { state: { stats: { piecesplaced: 0 } }, isPlaying: () => true, getFrame: () => frame } : null;
  const game = {
    options: { locktime: 30, handling: { arr: 0 } },
    state: { board: Array.from({ length: 40 }, () => Array(10).fill(null)), falling: spawn(), stats: { piecesplaced: 0, combo: 5 },
      impendingdamage: incoming ? [{ amt: 4, active: true }] : [], garbageareentries: [] },
    isPlaying: () => true, getFrame: () => frame, ejectState: () => ({}),
    _useLocalBotLearning: true, _localTLMatch: true, _localTLPeer: peer,
    source: {
      self: { fm: { GetEffectiveGravity: () => 0.02, GetPieceDefinition: () => ({ data: [[0, 0]], dx: 0, dy: 0 }) } },
      Push(type, { key }) {
        if (type !== 'keydown') return;
        const f = game.state.falling;
        if (key === 'hardDrop') lockPiece();
        else if (key === 'softDrop') { f.y = 20; groundedAt = frame; }
      },
    },
    on() {}, remove() {},
  };
  window.LocalAIMoveGen = { compile: () => (route === 'floor' ? [{ kind: 'drop', to: { x: 4, r: 0, y: 20 } }] : []) };
  // every placement clears lines and sends attack (a REN), so the old code took it as urgent
  const best = () => ({ type: 't', path: route === 'floor' ? ['softDrop'] : [], trace: route === 'floor' ? [{}] : [],
    final: { x: 4, rotation: 0, y: route === 'floor' ? 20 : 0 }, features: [1, 0, 0, 0, 0, 2, 1] });
  window.LocalCombatAI = { createSearch: () => ({ step: () => ({ done: true, best: best() }), dispose() {} }) };
  const tick = window.LocalTestQP.drive(game, () => pps);
  const want = sync ? pieces : pieces + 1;
  for (frame = 0; frame < 60 * 120 && placed.length < want; frame++) {
    if (sync && frame % Math.round(60 / sync) === 0) peer.state.stats.piecesplaced++;
    tick();
    // native lock delay: a grounded piece locks by itself after locktime frames
    if (groundedAt >= 0 && frame - groundedAt >= 30) lockPiece();
  }
  const gaps = placed.slice(1).map((v, i) => v - placed[i]);
  return { placed, gaps };
}

let fail = 0;
const check = (name, ok, info) => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fail++; };
for (const pps of [1, 2, 3]) {
  const iv = 60 / pps;
  for (const route of ['hard', 'floor']) {
    const { gaps } = run({ pps, pieces: 20, route, incoming: true });
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length, min = Math.min(...gaps), max = Math.max(...gaps);
    check(`PPS ${pps} ${route} route, REN + incoming: constant pace`, Math.abs(avg - iv) <= 1 && min >= iv - 2 && max <= iv + 2,
      `interval ${iv.toFixed(1)} avg ${avg.toFixed(1)} min ${min} max ${max}`);
  }
}
// Lockstep with the player: never more pieces than the player (ratio 1:1)
{
  const { placed } = run({ pps: 2, pieces: 15, route: 'hard', incoming: true, sync: 2 });
  const ok = placed.every((f, i) => Math.floor(f / 30) + 1 >= i + 1);
  check('lockstep: BOT never ahead of the player during REN', ok, `placed ${placed.slice(0, 6).join(',')}...`);
}
// A held DAS key whose piece is blocked short of the planned column is let go within a few
// frames (was: held up to 90 frames / until the lock deadline — the piece slid, the BOT froze).
{
  const ctx = { LocalTestQP: {}, performance, console, localStorage: { getItem: () => null } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  let frame = 0; const log = [];
  const game = { options: { locktime: 30, handling: { arr: 0, das: 6 } },
    state: { board: Array.from({ length: 40 }, () => Array(10).fill(null)), falling: { type: 't', x: 4, y: 0, r: 0, flags: 0, locking: 0 }, stats: { piecesplaced: 0 }, impendingdamage: [], garbageareentries: [] },
    isPlaying: () => true, getFrame: () => frame, ejectState: () => ({}), _useLocalBotLearning: true,
    source: { self: { fm: { GetEffectiveGravity: () => 0.02, GetPieceDefinition: () => ({ data: [[0, 0]], dx: 0, dy: 0 }) } }, Push(type, { key }) { log.push([frame, type, key]); } },
    on() {}, remove() {} };
  ctx.LocalAIMoveGen = { compile: () => [{ kind: 'hold', key: 'moveLeft', to: { x: 0, r: 0 }, wall: true }] };
  ctx.LocalCombatAI = { createSearch: () => ({ step: () => ({ done: true, best: { type: 't', path: ['moveLeft', 'moveLeft'], trace: [{}, {}], final: { x: 0, rotation: 0, y: 0 }, features: [0] } }), dispose() {} }) };
  const tick = ctx.LocalTestQP.drive(game, () => 1);
  for (frame = 0; frame < 200; frame++) tick();
  const down = log.find(e => e[1] === 'keydown' && e[2] === 'moveLeft'), up = log.find(e => e[1] === 'keyup' && e[2] === 'moveLeft');
  check('blocked DAS hold released quickly', down && up && up[0] - down[0] <= 14, down && up ? `held ${up[0] - down[0]} frames` : 'no release');
}
process.exit(fail ? 1 : 0);
