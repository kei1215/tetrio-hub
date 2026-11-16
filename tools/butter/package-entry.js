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
  async create(files) {
    // no level (user: butterにレベル設定はなくしてほしい)
    const iters = 200;
    const data = dataOf(files), opts = data ? data.options : {};
    // the player's own Butter plays like the player (user: 開幕テンプレが全く違う・動きが効率的すぎる): their opening
    // shapes and their spread of choices (not in CC 盤面修正, which wants the best plausible move).
    // Misdrops are not copied (user: ミスに関してはオフ状態だからいい).
    const like = data ? { openers: data.openers || null, pickBeta: data.beta || 0, misdrop: 0 } : {};
    // opener only from an empty board until the first line clear or garbage (cells drop, or jump by more than a piece);
    // the 9-cell rows of a DT cannon must not be taken for garbage here
    let live = false, lastCells = -1, ready = null, follow = null;
    return {
      begin(input) {
        SP.setTables(TABLES);
        const H = Math.max(40, (input.board || []).length);
        const board = []; for (let y = 0; y < H; y++) { const row = input.board[H - 1 - y] || []; board.push(Array.from({ length: W }, (_, x) => (row[x] ? "x" : null))); }
        // ゴミ行の目安: 下から続く「1マスだけ空き」の行
        let g = 0; for (let y = H - 1; y >= 0; y--) { const n = board[y].filter(Boolean).length; if (n === W - 1) g++; else break; }
        const inc = (input.incoming || []).reduce((a, n) => a + (Number(n) || 0), 0);
        // after a setup (user: 2回以上組んでる場合はどういう打ちをするか理解して塞いでいいとこを考えて): when the board
        // has one of the player's setups complete and the first clear comes, Butter goes on the way the player did
        // (opener.then, e.g. TSD then TST) and does not cover the setup's slots until those clears are done.
        { const cells = board.reduce((a, r) => a + r.filter(Boolean).length, 0), rowsB = board.map((r) => r.reduce((m, c, x) => (c ? m | 1 << x : m), 0)).reverse();
          if (!cells) { live = true; follow = null; ready = null; }
          else if (lastCells < 0 || cells - lastCells > 4) { live = false; follow = null; }
          else if (cells < lastCells) { const lines = Math.max(1, Math.round((lastCells + 4 - cells) / 10));
            if (live && ready && ready.then && ready.then.length) follow = { then: ready.then.slice(1), protect: (ready.empty || []).slice(lines) };
            else if (follow) { follow.then = follow.then.slice(1); follow.protect = follow.protect.slice(lines); if (!follow.then.length) follow = null; }
            live = false; }
          if (live && like.openers) ready = like.openers.find((o) => o.rows.every((m, k) => (m & ~(rowsB[k] || 0)) === 0) && (o.empty || []).every((m, k) => (m & (rowsB[k] || 0)) === 0)) || ready;
          lastCells = cells; }
        const fol = follow && follow.then.length ? { followKind: follow.then[0], protect: follow.protect } : {};
        // the T-spins of a setup like a DT cannon need several turns after the drop (maxTail 5 while they are due)
        const fol0 = live && ready && ready.then && ready.then.length ? { followKind: ready.then[0] } : {};
        const job = TP.create(null, { board, falling: input.current, hold: input.hold || null, queue: (input.queue || []).slice(0, 5), holdAllowed: true, b2b: Math.max(0, input.b2b | 0), combo: Math.max(0, input.combo | 0) },
          { ...opts, ...like, ...fol0, ...fol, ...(fol0.followKind || fol.followKind ? { maxTail: 5 } : {}), openLive: live && !!like.openers, ...(input.human ? { maxTail: 2, pickBeta: 0 } : {}), ms: 1e9, maxIters: iters, incoming: inc, gRows: g, seed: (Date.now() & 0xffff) + 1 });
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
