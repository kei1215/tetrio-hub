# ai-src (vA only)

Files here replace / add `A/offline/<same path>` in the vA zip
(`build_release.py --ai-src tools/patch/ai-src`). vR / vO are not touched.

v4.8244 AI changes:
- `engine/ai-movegen.js` (new): native move generator. Every placement the real
  engine can reach (moves, native kicks, non-locking drop, then up to 3 more keys
  for tucks / spins), with the key path and the native spin flag.
- `engine/bot-ai.js`: candidates come from the move generator, are pre-ranked on
  the board (T-slot readiness, extra deep wells) and each one is checked once in
  the native sandbox. T-slot roofs built while a T is coming are a setup, not a hole.
- `engine/ai-quick-planner.js`: the live BOT replays the exact path; a run of
  equal horizontal moves is one held key (native DAS/ARR) when it ends at a wall or
  the ARR is 1 frame or slower; drops are a held soft drop released on the floor.
- `ai-loader.js`: loads `ai-movegen.js`.

v4.8246 Spin B2B mode (vA option "BOT: Spin B2B モード", localStorage
`qp-local-ai-tspin-b2b`, for solo / no-attack rooms):
- `engine/ai-spin-planner.js` (new): bitboard look-ahead over CURRENT / HOLD /
  NEXT (beam 24, depth 6). Piece shapes, SRS+ kicks and the T corner table are
  read from the running engine; spins follow the client's all-mini+ rule. It
  matched `LocalAIMoveGen` on every placement and spin flag tested. Runs in
  time slices inside the search, never one long frame.
- `engine/bot-ai.js`: with `game._aiTSpinB2B` and nothing incoming, the plan's
  first placement is checked once in the native sandbox and played. Non-spin
  clears are avoided (Quad / any clear only near top-out). Zero-line spins are
  penalised in every mode except All-Spin / Warlock mods and revive missions.
  With the option OFF the evaluation is the v4.8245 one.
- `engine/qp-ai-options.js`: I5 / extra O in the QP settings; the vAI test settings (BOT mode, PPS, preview, TTR import) in the Tab panel. `engine/live-bot-controller.js`:
  reads it every piece into `game._aiTSpinB2B`.
- `ai-loader.js`: loads `ai-spin-planner.js`.

2026-11-13 外部AI対戦(engine/ai-external.js):
- 画面左下の「外部AI対戦」から、TL / CUSTOM の左右に プレイヤー / vA AI / 読み込んだ外部AI を選んで対戦する。
- パッチには外部AIを入れない。ユーザーが自分のファイル(.js 1つ + .wasm などのデータ)を選んで読み込み、IndexedDB に残す。
  パッケージの約束はファイル先頭のコメント。bot-ai.js は game._aiEngine の外部AIに配置を聞き、ネイティブのサンドボックスで確かめて同じキーで置く。
- ai-spin-planner.js matchCells:外部AIのマス目から、到達できる配置(planner 座標)を探す。
- local-ai-room.js:config.labels で対戦の表示名(TTRM の名前)を上書きできる。

## Butter(バター)= vA Tree(2026-11-16)
- v5.08 から vA に最初から入る(`engine/butter-preinstalled.js`)。外部AIの中で Butter だけ、アプリ内で学習できる(外部AI対戦の「Butter に学習させる」→「Butter <名前>」が増える)。学ぶのは人のプレイだけ(選んだリプレイと、BOT・外部AIでないオフライン記録)。他の外部AIは学習しない。
- 作り直し: `tools/butter/build.sh`(外部AIパッケージ docs/ext-ai/vA-external-ai-tree.js・butter-preinstalled.js・butter-learn.js をまとめて作る)。学習の中身は `tools/butter/learn-core.mjs`(Node の tree-player-data.mjs と同じ)。
- 名前の由来:「vATree」と打ったら自動変換で「butter」になったので、ユーザーが AI の名前を Butter(バター)にした。
- 中身: `engine/ai-tree-planner.js`(CC1 型の木探索 + CC1 の盤面評価 + B2B・掘り・TSM・相殺の調整)。外部AIのパッケージとして配る(`docs/ext-ai/vA-external-ai-tree.js`、パッケージ id は `va-tree` のまま)。
- プレーヤーのデータ入り: `tools/ai-sim/tree-player-data.mjs` でリプレイから重みを合わせ、「Butter <プレーヤー名>」(例: Butter Y_Kei1215、id `va-tree-<名前>`)として何人ぶんでも入れられる。
- CC 盤面修正では、接地後 2 キーまでの置き方だけで一番よい手を選び、置きミスの所を「火力になる / 地形がきれいになる」置き方で見せる。
