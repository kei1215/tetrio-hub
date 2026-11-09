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
