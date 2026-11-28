# v4.8238 feature baseline (browser bookmarklet and desktop patch)

## Browser bookmarklet (QP OFFLINE v4.8238)
- Offline bookmarklet loader: v4.8238 with the 30-day cache (core cache name `tetrio-patch-offline-v4.8238-core6`, page cache `tetrio-patch-offline-v4.8238-hold1`).
- Loader fix: the launcher stored its code and its "saved at" record under the same cache key, because Cache Storage ignores the `#...` part of a URL. From the second launch it ran the JSON record and failed with `Unexpected token ':'`. The record now uses `?launcher-meta`. The v4.8235 bookmarklet has this bug; register the v4.8238 code again.
- Core client: unchanged since v4.8235. The loader still reads `offline-v4.8235/client.patch.*` (the vO offline client, byte-patched against the official `tetrio.js` of the TETR.IO client of 2026-11-09; a different `tetrio.js` is refused by length and SHA-256).
- Modules: the vO 4.8238 `O/offline` files, including the new `revive-extra-effects.js`.
- Mission editor: QP-Mission-Editor v6.5 (keeps the v5.3 settings, adds the 追加効果 tab).
- Reverse HYPERSPEED track: Kugelhagel OVERDRIVE, looped at 188.499583 seconds (3:08.499583).
- Browser fallback music asset: https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3.
- Render-test buttons are not exposed in the bookmarklet shell.
- Replay board edit and board rotation bookmarklets are separate tools and are not part of QP OFFLINE.

## Revive mission extra effects (QP OFFLINE, desktop vO / vA and browser)
Set in the mission editor tab 追加効果 (JSON: `effects.extra`). Several effects can run at the same time. They start when the mission prompt is shown.
- Unclearable rows: add and/or remove N rows (removal takes the bottom unclearable rows first). Optional repeat every N seconds and/or every N placed pieces while the mission is active.
- Forced garbage (up to 6 entries per mission), each with:
  - Rows: 1-20.
  - Methods (several allowed): rise now; terrain rewrite of the bottom N rows above the unclearable rows (no rise); move only the holes of the garbage rows already on the board; add to the garbage bar (enters like normal incoming garbage).
  - Pattern: no terrain (the game's own random holes), or seed-derived: one random hole, two random holes, two columns alternating, checkerboard, fixed columns, a shape (T-slot TSD, TST, 4-row well, stairs, zigzag), or a rising template (`#` block / `.` hole, top row first, optional mirror).
  - Seed: from the game seed, or a fixed number. The same seed gives the same rows.
  - Bombs: bomb cells instead of holes (native bombs-style garbage: a mino placed on a bomb clears that row). While bomb cells remain, other garbage keeps normal holes, and the bottom unclearable rows are protected. The bombs use the native `_bomb` skin. The unclearable rows keep the normal skin. The desktop offline build has no `_bomb.png` in TETRIO-Resources-1.0, so bombs show as plain colored cells there.
  - Optional repeat every N seconds and/or every N pieces.
- Board height (4-40 visible rows). HOLD and NEXT are rebuilt with the board.
- Straightness: between attacks (`messiness_change` = 1 - value) and within one attack (`messiness_inner` = 1 - value). QP recalculates messiness every frame, so the mission value is put back right after that; the value restored afterwards is QP's latest value.
- Spin rule: T-spins, T-spins+, all-mini+ (QP default), all-mini, all, all+, mini-only, T/S/Z/L/J only (handheld), stupid, none. Overrides a MOD's spin rule.
- Pieces: -1..+4 of each of I/O/T/S/Z/J/L per bag, and 0-4 I5 pieces per bag. This starts with the next bag; the shown NEXT pieces do not change.
- Restore timing for board height, straightness, spin rule and pieces: when the mission ends, when the revive finishes, or at the end of the run. MOD changes are never kept: they are always restored when the mission ends.
- Replays: board-changing effects (garbage, unclearable rows, height) are not applied while a replay plays.

## Mission editor
- v6.5: 追加効果 tab (all of the above), with an inline check of the values.
- The in-game button 詳細エディタを開く passes the current mission library to the editor in the URL fragment (it is not sent to a server). The editor shows those missions and offers to go back to an unsaved draft.

## Desktop patch (A / R / O v4.8238)
- Built with `tools/patch/build_release.py ... --old 8233 --new 8238 --port-2026-11-09 --offline-src tools/patch/offline-src`. The changed `O/offline/*` files (vO and vA) come from `tools/patch/offline-src`; `extra-effects-schema.js` is inlined into `custom-missions.js` and `mission-editor.html`; `O/offline/index.html` loads `revive-extra-effects.js` before `revive-missions.js`.
- Anchors follow the TETR.IO client of 2026-11-09 (renamed minified identifiers; the Zenith base class is read from the client).
- CONFIG > QP PATCH TOOLS > REPLAY BOARD EDIT (ON/OFF, default OFF), unchanged from v4.8237.
- A (AI) downloads require Discord login with the server role.
- Safe check: `--dry-run --app /Applications/TETR.IO.app` passes for O, A and R.

## Change log
- v4.8233: quad screen mode, input inversion, reverse HYPERSPEED track, mission editor v6.3.
- v4.8234: REPLAY BOARD EDIT added to the desktop patch.
- v4.8235: desktop and browser builds follow the TETR.IO client of 2026-11-09.
- v4.8236: REPLAY BOARD EDIT runs while QP TOOLS are paused; it starts on TETRA CHANNEL or replay load.
- v4.8237: REPLAY BOARD EDIT stops outside TETRA CHANNEL / replay and on HOME.
- v4.8238: revive mission extra effects, mission editor v6.5, editor opens with the game's missions, bookmarklet cache fix.
