# v4.8241 feature baseline (browser bookmarklet and desktop patch)

## Browser bookmarklet (QP OFFLINE v4.8239)
- Offline bookmarklet loader: v4.8239 with the 30-day cache (core cache name `tetrio-patch-offline-v4.8239-core6`, page cache `tetrio-patch-offline-v4.8239-hold1`).
- Loader fix: the launcher stored its code and its "saved at" record under the same cache key, because Cache Storage ignores the `#...` part of a URL. From the second launch it ran the JSON record and failed with `Unexpected token ':'`. The record now uses `?launcher-meta`. The v4.8235 bookmarklet has this bug; register the new code again (fixed since v4.8238).
- Core client: `offline-v4.8239/client.patch.*` (the vO 4.8239 offline client with the HYPERSPEED fixes below, byte-patched against the official `tetrio.js` of the TETR.IO client of 2026-11-09; a different `tetrio.js` is refused by length and SHA-256). `build_browser_offline.py` keeps the previous core folder when the client is unchanged.
- Modules: the vO 4.8239 `O/offline` files, including `revive-extra-effects.js`.
- Mission editor: QP-Mission-Editor v6.5 (keeps the v5.3 settings, adds the 追加効果 tab).
- Reverse HYPERSPEED track: Kugelhagel OVERDRIVE, looped at 188.499583 seconds (3:08.499583).
- Browser fallback music asset: https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3.
- Render-test buttons are not exposed in the bookmarklet shell.
- Replay board edit and board rotation bookmarklets are separate tools and are not part of QP OFFLINE.

## Patch update and new mission effects (v4.8241)
- CONFIG > QP PATCH TOOLS > PATCH UPDATE (online client, from `tools/patch/app-src/update-config.js` added to the `O/transform.js` tail) and パッチを更新 in the offline Tab panel.
  - The main process (`tools/patch/app-src/patch-updater.js`, appended to `O/music-main.js` in every kind) reads the installed record (`qp-replay-patch-install.json`: kind A/R/O and update number) and the published `patch/latest.json` (version, download base, SHA-256 of every launcher).
  - When newer: on the player's click (and a confirm), it downloads the launcher for this OS and the same kind (A stays A), checks its SHA-256, saves it next to TETRIO-Resources-1.0.zip (Downloads or Downloads/all-tetrio-patch; R: Downloads), quits TETR.IO, waits until the app has exited and runs the launcher, which installs and relaunches TETR.IO. macOS / Linux use a small sh waiter, Windows a PowerShell waiter; the waiter is a file so the installer's "is TETR.IO running" check never matches it.
  - When already latest: it only shows 「最新です」 and a click does nothing. A failed update is shown on the next check with the last lines of its log.
  - `build_release.py --manifest docs/patch/latest.json` writes the manifest; publish the release before pushing the site.
- Revive mission extra effects: board width (4-20 columns, with the height; patterns, templates and stamps follow the width) and handling (DAS 1-20, ARR 0-5, SDF 5-41, DCD 0-20; only the ones switched on change), each with a restore timing.

## Mission editor window on the desktop (v4.8240)
- The TETR.IO app hands a same-origin `window.open()` to the operating system, which cannot open `tetrio-local://` addresses (the 「詳細エディタを開く」 button failed on macOS, and would on Windows/Linux). The offline page now asks the patch's main process (`qp-open-mission-editor`, appended to `O/local-main.js` from `tools/patch/app-src/editor-window.js`) for an app window. Only `tetrio-local://app/mission-editor.html` is accepted, from a top-level offline page; the window shares the game's session/storage, has no Node access (context isolation, sandbox), denies new windows and navigation away, and asks before closing with unsaved changes.
- In that window the editor shows 「ゲームに保存」: it writes through the game's own library code (`/custom-missions.js`, same validation) and the game reloads its missions from the storage event. The browser build still opens the editor in a new tab.
- Built incrementally from v4.8239 (`build_release.py --incremental`): only `O/local-main.js` and the changed `O/offline` files differ.
- Browser loader v4.8240 keeps the v4.8239 core (`offline-v4.8239/client.patch.*`).

## HYPERSPEED in offline QP (v4.8239)
- Reverse HYPERSPEED music (Kugelhagel OVERDRIVE): the track is started once. Before, the client asked to start it every frame until the mp3 was decoded, and every request decoded the mp3 again: unplayable lag.
- If the game ends before the track has started, the track is stopped as soon as it starts.
- The local QP sync and the HYPER presentation both report the HYPER state every frame. A stop while the game is still playing must last 0.3 s, so the music never flips between the reverse track and the zenith score (each flip reloaded the music: lag).
- Browser build: `reverse-hyper-browser.js` answers the client's request for `/res/bgm/qp-kugelhagel-overdrive.mp3` with the published copy, so the game's own music engine plays the track (game volume, loop at 3:08.499583). It also registers QP games in `__qpGameRegistry`; the `<audio>` fallback plays only if that download fails. Before v4.8239 the browser build never played the track.
- Checked in Chrome (local copy of the browser build, forced HYPERSPEED with the reversed Volatile MOD): the track was downloaded once, 3 music requests in 12 s, 52 fps; after a game over in HYPERSPEED, no HYPER overlay and no music requests on the result screen.
- Result screen: a finished game is not in HYPERSPEED, so the HYPER overlay, its beat sounds and the HYPER music (normal and reverse) stop. The HYPERSPEED end cue is not played when the game is over.
- Applied by `build_release.py` (`OFFLINE_CLIENT_FIXES`) to `O/offline/client.js`; the client code is not stored in this repo.
- The online-client patch `O/transform.js` (R, O and A) has the same reverse HYPERSPEED music code and speedrun view state for the replay / spectator presentation; the same fixes are applied there (`fix_transform_hyper`). The native HYPERSPEED end cue is left as it is online.
- Checked against v4.8237: every changed line keeps its original settings (only extended), and the existing editor / mission settings and the embedded replay edit + spin counter are all still present.

## Revive mission failure, rank and rewards (v4.8239)
- Failure => instant death (per mission, default off): `rules.dieOnTimeout` (time limit runs out) and `rules.dieOnReset` (a reset key is pressed, or progress returns to 0 on a mismatch). The death runs on the next frame through the native `IncapacitateSelf` (the partner is already down, so the run ends). Checked in Chrome: a 4 s mission ended the run 4 s after the prompt appeared.
- Rank: a fixed rank is never changed. Only an automatic rank becomes A when the mission has MODs (runtime deck and editor list).
- Clear rewards (default 0 = none): `rewardAltitude` 0-1000 m is added to the altitude (the floor follows; `setZenithAltitude` ignores writes while synced, so the stat is changed directly). `rewardAttack` 0-1000 is sent on the next frame through the native `atm.FightLines`, like a real attack (offsets garbage, counts as attack, climbs, counts for attack prompts).

## Templates, stamps and the washing machine (v4.8239)
- Template garbage: drawn on a grid the size of the board (10 wide; the mission's board height or 20) in the editor; press and drag paints or erases (the first cell decides). Rows without blocks at the top and bottom are trimmed, empty rows in the middle stay. In game the template is used whole and fitted to the current visible height (bottom rows kept); terrain rewrites stay inside the visible board. Presets: TSD, TST (DT cannon / STSD are drawn by hand).
- Choosing a shape or template switches the method from the default garbage bar to rise.
- Forced garbage trigger `when`: at mission start (with repeats) or each time garbage (an attack) is received (`stats.garbage.received` grows).
- Stamp (`effects.extra.stamp`): single blocks placed on empty cells at mission start (column 1-10, row from the bottom), no rise.
- Rotate missions can count only some pieces (`rules.pieces`, e.g. J/L).
- Washing machine (`rules.washer`, rotate missions): four rotations in the same direction that return the piece to the same position and facing count as one loop, only with a block inside the piece's box; a new piece, a direction change or a 180 starts again. Editor button 洗濯機ミッションを追加: rotate J/L, 5 loops, one block at column 5 row 2, J/L +2 per bag.

## Native progress forwarding (v4.8239)
- B2B missions: the native engine raises B2B progress with `BumpPrompt` ("Reach B2B xN"), which custom missions did not receive, so B2B missions never advanced. `BumpPrompt` is now forwarded to the matching custom mission.
- When B2B breaks, the native `NixPrompt` returns the progress to 0; with `rules.dieOnReset` that reset is an instant death instead.
- Washing machine button default: 1 loop.

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

## Desktop patch (A / R / O v4.8239)
- Built with `tools/patch/build_release.py ... --old 8233 --new 8239 --port-2026-11-09 --offline-src tools/patch/offline-src`. The changed `O/offline/*` files (vO and vA) come from `tools/patch/offline-src`; `extra-effects-schema.js` is inlined into `custom-missions.js` and `mission-editor.html`; `O/offline/index.html` loads `revive-extra-effects.js` before `revive-missions.js`.
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
- v4.8239: offline QP reverse HYPERSPEED music lag fixed; no HYPER on the result screen.
- v4.8240: desktop mission editor opens in an app window (every OS); 「ゲームに保存」.
- v4.8241: PATCH UPDATE (in-app update from the web, every OS, same kind); board width and handling mission effects.
- v4.8242 (desktop only; the browser build stays v4.8241): PATCH UPDATE uses Node's https in the main process instead of Electron net.fetch (net::ERR_UNEXPECTED inside the TETR.IO app), falls back to the GitHub API asset download when the direct release download fails (GitHub answered 504 there), keeps launchers in Downloads/all-tetrio-patch and deletes only the launcher it downloaded the previous time. v4.8241 cannot update itself in-app; install v4.8242 once by hand.
- v4.8243 (desktop): the embedded replay edit gets the fumen options (pages per piece / per 7 pieces; gray except the current bag cycle counted from the game start, or except the last piece; pieces placed during playback are logged so a cycle that began before the stop is shown from its start). Incremental builds now refresh the embedded replay edit and spin counter.
