// vA 外部AI: Butter (= vA Tree, 新しい探索, 2026-11-16)。名前は「vATree」が自動変換で「butter」になったことから。 CC1 型の木探索 + CC1 の盤面評価 + B2B・掘り・TSM の調整。
// 自前のコードだけ (外部AIのコードは入っていない)。SRS+ の形・キックは同梱。
import SP from "../patch/ai-src/engine/ai-spin-planner.js";
import TP from "../patch/ai-src/engine/ai-tree-planner.js";
import SH from "./shapes.json";
import KS from "./kicks-srsplus.json";
const shapes = {}; for (const t of Object.keys(SH)) shapes[t] = SH[t].map((r) => r.map(([x, y]) => [x, y]));
const c = [[0, 0, 0, 3], [2, 0, 0, 1], [2, 2, 1, 2], [0, 2, 2, 3]];
const TABLES = { shapes, kicks: KS.kicks, ikicks: KS.i_kicks || KS.kicks, corner: [c, c, c, c] };
const W = 10;
// Player data (user: 複数インストールできて、選んだプレーヤーのデータを参考に動かして):
//  - a per-player package (made by vA-tree-player) carries its data in __VA_TREE_EMBED__ and
//    registers under its own id, so several players can be installed side by side;
//  - or player data .json files installed with this .js: the first one is used.
// input.human (CC 盤面修正, user: プレーヤーがしそうな手で一番いいもの・無理のない最適解): at most two
// keys after the piece lands (no long tuck / spin chains), so every fix is a move a player makes.
// The package never learns during play (user: 他の外部AIは学習しないように).
const EMBED = typeof __VA_TREE_EMBED__ !== "undefined" ? __VA_TREE_EMBED__ : null;
const dataOf = (files) => {
  if (EMBED && EMBED.data) return EMBED.data;
  for (const name of Object.keys(files || {})) if (/\.json$/i.test(name)) {
    try { const d = JSON.parse(new TextDecoder().decode(files[name])); if (d && d.kind === "va-tree-player" && d.options) return d; } catch {}
  }
  return null;
};
LocalExternalAI.register({
  id: EMBED ? EMBED.id : "va-tree", label: EMBED ? EMBED.label : "Butter",
  async create(files, { strength } = {}) {
    const iters = Math.max(20, Math.min(2000, Number(strength) || 200));
    const data = dataOf(files), opts = data ? data.options : {};
    return {
      begin(input) {
        SP.setTables(TABLES);
        const H = Math.max(40, (input.board || []).length);
        const board = []; for (let y = 0; y < H; y++) { const row = input.board[H - 1 - y] || []; board.push(Array.from({ length: W }, (_, x) => (row[x] ? "x" : null))); }
        // ゴミ行の目安: 下から続く「1マスだけ空き」の行
        let g = 0; for (let y = H - 1; y >= 0; y--) { const n = board[y].filter(Boolean).length; if (n === W - 1) g++; else break; }
        const inc = (input.incoming || []).reduce((a, n) => a + (Number(n) || 0), 0);
        const job = TP.create(null, { board, falling: input.current, hold: input.hold || null, queue: (input.queue || []).slice(0, 5), holdAllowed: true, b2b: Math.max(0, input.b2b | 0), combo: Math.max(0, input.combo | 0) },
          { ...opts, ...(input.human ? { maxTail: 2 } : {}), ms: 1e9, maxIters: iters, incoming: inc, gRows: g, seed: (Date.now() & 0xffff) + 1 });
        const conv = (p) => {
          if (!p) return null;
          const cells = TABLES.shapes[p.type][p.r].map(([cx, cy]) => [p.x + cx, H - 1 - (p.y + cy)]);
          return { piece: p.type, usedHold: !!p.hold, cells };
        };
        let spent = 0;
        return {
          get done() { return !job || job.done; }, get spent() { return spent; },
          step(ms = 4) { if (!job) return true; const t0 = performance.now(); const d = job.step(ms); spent += performance.now() - t0; return d; },
          stop() { if (job) job.stop(); },
          result() { return job ? conv(job.result()) : null; },
        };
      },
    };
  },
});
