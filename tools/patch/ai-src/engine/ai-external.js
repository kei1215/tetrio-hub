/* vA: outside AI engines and the "外部AI対戦" entrance.
   The patch carries NO outside AI. The player loads one from files on their own
   computer (a package: one .js that registers the engine, plus its data files such
   as .wasm). Packages are kept in IndexedDB and loaded again on the next start.

   Package contract (the .js runs as a page script):
     LocalExternalAI.register({
       id: 'cc2', label: 'Cold Clear 2 S2',
       async create(files, {strength}) -> bot   // files: {name: ArrayBuffer}
     });
     bot.begin(input) -> job                      // one search; a new begin drops the old one
       input: {board: 40 rows (row 0 = bottom, cell null | 'G'), current, hold, queue (≤13),
               b2b, combo, incoming: [rows...]}   // pieces lower case
     job.step(ms) -> done (search about ms), job.stop() (finish now), job.result() ->
       {piece, usedHold, cells: [[x, y], ...] (y = 0 bottom)} | null
   bot-ai.js asks LocalExternalAI.planner() for the placement of a game whose _aiEngine
   names a loaded engine; the native sandbox still checks it and plays its exact keys.
   v4.8276 (user: heavy lag, CC2 weak against a player): the package runs in its own Web
   Worker (the app CSP allows blob: workers since v4.8267) and searches there without
   blocking the game; the BOT takes the best move found so far at the PPS clock. A package
   that can not run in a worker falls back to main-thread slices. */
(() => {
 'use strict';
 const DB = 'qp-external-ai', STORE = 'packages';
 const defs = {}, bots = {}, errors = {};
 const strengthKey = id => 'qp-local-ai-ext-strength-' + id;
 const strength = id => { const v = Number(localStorage.getItem(strengthKey(id))); return Number.isFinite(v) && v > 0 ? v : null; };
 const lower = t => String(t || '').toLowerCase();

 // ---- package store (IndexedDB) ----
 const db = () => new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
 async function tx(mode, fn) { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s); t.oncomplete = () => resolve(out?.result ?? out); t.onerror = () => reject(t.error); }); }
 const allPackages = () => tx('readonly', s => s.getAll());
 const savePackage = pkg => tx('readwrite', s => s.put(pkg));
 const deletePackage = name => tx('readwrite', s => s.delete(name));

 // Run a package script; register() inside it records the definition.
 let pendingFiles = null, pendingScript = null;
 async function runPackage(pkg) {
  pendingFiles = pkg.files; pendingScript = pkg.script;
  const url = URL.createObjectURL(new Blob([pkg.script], { type: 'text/javascript' }));
  try {
   await new Promise((resolve, reject) => { const tag = document.createElement('script'); tag.src = url; tag.onload = resolve; tag.onerror = () => reject(Error('外部AIのスクリプトを実行できません: ' + pkg.name)); document.head.appendChild(tag); });
  } finally { URL.revokeObjectURL(url); pendingFiles = null; pendingScript = null; }
 }
 function register(def) {
  if (!def || !/^[a-z0-9_-]{1,32}$/.test(String(def.id || '')) || typeof def.create !== 'function') throw Error('外部AIの登録が不正です(id と create が必要)');
  // A def that brings its own files / script (the built-in CC2) keeps them, even when it
  // registers while a stored package is being loaded (pendingFiles belongs to that package).
  defs[def.id] = { ...def, files: def.files || pendingFiles || {}, script: def.script || pendingScript || null };
  delete bots[def.id]; delete errors[def.id];
 }
 // ---- worker host: the package script + files run in a Worker; results come back per slice ----
 const WORKER_SRC = `'use strict';
let defs = {}, bot = null, job = null, cur = 0, stopAt = 0;
// The next slice is queued with a MessageChannel, not setTimeout: worker timers can be
// throttled (seen: 60 ms of search in 400 ms), a channel message is not.
const tick = new MessageChannel(); let next = null; tick.port1.onmessage = () => { const f = next; next = null; f && f(); };
const later = (f) => { next = f; tick.port2.postMessage(0); };
self.LocalExternalAI = { register(d) { defs[d.id] = d; } };
const post = (n, final) => { let r = null; try { r = job.result(); } catch {} postMessage({ t: 'res', n, r, done: !!(final || job.done), spent: job.spent || 0 }); };
// After stop(): keep searching until there is a move (Cold Clear 2 returns none before its
// search ends), at most 250 ms more, then finish with what there is.
const run = (n) => { if (!job || cur !== n) return; let d = false; try { d = job.step(stopAt ? 10 : 25); } catch { d = true; }
 // (the move is read before job.stop(): Cold Clear 2's stop() can drop a finished move)
 if (!d && stopAt) { let r = null; try { r = job.result(); } catch {}
  if (r) { postMessage({ t: 'res', n, r, done: true, spent: job.spent || 0 }); job = null; return; }
  if (performance.now() - stopAt > 250) { try { job.stop(); } catch {} d = true; } }
 post(n, d); if (d) { job = null; return; } later(() => run(n)); };
onmessage = async (e) => { const m = e.data;
 if (m.t === 'load') { try { const u = URL.createObjectURL(new Blob([m.script], { type: 'text/javascript' })); importScripts(u); URL.revokeObjectURL(u);
   const d = defs[m.id]; if (!d) throw Error('register がありません'); bot = await d.create(m.files, { strength: m.strength });
   // Warm-up search (the first searches of a fresh wasm are several times slower), max 2 s.
   try { const e0 = Array.from({ length: 40 }, () => Array(10).fill(null)), w = bot.begin({ board: e0, current: 't', hold: null, queue: ['i', 'o', 's', 'z', 'l', 'j'], b2b: 0, combo: 0, incoming: [] }), t0 = performance.now();
    for (let k = 0; k < 2 && performance.now() - t0 < 2000; k++) { let j = k ? bot.begin({ board: e0, current: 'i', hold: null, queue: ['t', 'o', 's', 'z', 'l', 'j'], b2b: 0, combo: 0, incoming: [] }) : w; while (!j.step(50) && performance.now() - t0 < 2000); } } catch {}
   postMessage({ t: 'ready' }); }
  catch (err) { postMessage({ t: 'error', msg: String(err && err.message || err) }); } }
 else if (m.t === 'begin') { try { job = bot.begin(m.input); cur = m.n; stopAt = 0; run(m.n); } catch (err) { postMessage({ t: 'res', n: m.n, r: null, done: true, spent: 0 }); } }
 else if (m.t === 'stop') { if (job && cur === m.n && !stopAt) stopAt = performance.now(); }
};`;
 async function workerBot(def) {
  if (!def.script || typeof Worker !== 'function') return null;
  let w;
  try {
   w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
   await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error('外部AIのワーカーが応答しません')), 15000);
    w.onmessage = (e) => { if (e.data.t === 'ready') { clearTimeout(t); resolve(); } else if (e.data.t === 'error') { clearTimeout(t); reject(Error(e.data.msg)); } };
    w.onerror = (ev) => { clearTimeout(t); reject(Error(ev.message || 'worker')); };
    w.postMessage({ t: 'load', id: def.id, script: def.script, files: def.files, strength: strength(def.id) });
   });
  } catch (error) { console.warn('外部AIをワーカーで動かせません(画面のスレッドで動かします): ' + error.message); try { w?.terminate(); } catch {} return null; }
  let n = 0, last = {};
  w.onmessage = (e) => { const m = e.data; if (m.t === 'res' && m.n === n) last = m; };
  return {
   worker: true,
   begin(input) {
    const my = ++n; last = {}; w.postMessage({ t: 'begin', n: my, input });
    const live = () => my === n;
    // A worker that does not answer within 1.5 s of stop() counts as finished (no move).
    let stoppedAt = 0; const late = () => stoppedAt && performance.now() - stoppedAt > 1500;
    return { get done() { return live() && (!!last.done || late()); }, get spent() { return last.spent || 0; },
     step() { return this.done; }, stop() { if (live() && !last.done && !stoppedAt) { stoppedAt = performance.now(); w.postMessage({ t: 'stop', n: my }); } },
     result() { return live() ? last.r || null : null; } };
   },
   terminate() { try { w.terminate(); } catch {} },
  };
 }
 async function load(id) {
  if (bots[id]) return bots[id];
  const def = defs[id]; if (!def) throw Error('外部AI「' + id + '」が読み込まれていません');
  try { bots[id] = (await workerBot(def)) || await def.create(def.files, { strength: strength(id) }); return bots[id]; }
  catch (error) { errors[id] = error; throw error; }
 }
 // Files chosen by the player: one .js (the package) + its data files.
 async function addFiles(fileList) {
  const list = [...fileList], js = list.filter(f => /\.m?js$/i.test(f.name));
  if (js.length !== 1) throw Error('外部AIの .js ファイルを1つ選んでください(データファイルも一緒に)');
  const files = {};
  for (const f of list) if (f !== js[0]) files[f.name] = await f.arrayBuffer();
  const pkg = { name: js[0].name, script: await js[0].text(), files, added: Date.now() };
  const before = new Set(Object.keys(defs));
  await runPackage(pkg);
  const added = Object.keys(defs).filter(id => !before.has(id) || defs[id].files === files);
  if (!added.length) throw Error('このスクリプトは外部AIを登録しませんでした');
  pkg.ids = added; await savePackage(pkg);
  return added;
 }
 async function restore() {
  try { for (const pkg of await allPackages()) { try { await runPackage(pkg); } catch (error) { console.warn(error); } } } catch (error) { console.warn('外部AIの復元: ' + error.message); }
 }

 // ---- BOT hook ----
 // Native board: rows top-first. Engines: 40 rows, row 0 = bottom.
 function inputOf(base) {
  const g = base.game, H = g.board.length, board = [];
  for (let k = 0; k < 40; k++) { const y = H - 1 - k; board.push(Array.from({ length: 10 }, (_, x) => (y >= 0 && g.board[y][x] !== null && g.board[y][x] !== undefined) ? 'G' : null)); }
  const info = window.LocalAIInformation;
  const incoming = (g.impendingdamage || []).filter(d => d && d.active !== false && d.amt > 0).map(d => Math.round(d.amt));
  return { board, current: lower(g.falling?.type), hold: info?.holdPiece?.(g.hold) || null, queue: (info?.known?.(base) || []).map(lower).slice(0, 13),
   b2b: Math.max(0, Number(g.stats?.btb) || 0), combo: Math.max(0, Number(g.stats?.combo) || 0), incoming };
 }
 function planner(game, base, opts) {
  const bot = bots[game?._aiEngine];
  if (!bot) return null;
  const stats = game._aiExternalStats || (game._aiExternalStats = { asked: 0, placed: 0, unmatched: 0, early: 0, ms: 0 });
  stats.asked++;
  const job = bot.begin(inputOf(base));
  let out, early = false;
  const convert = () => {
   if (out !== undefined) return out;
   const p = job.result();
   // A worker search still finishing after stop() has no move yet: do not keep that null.
   if (!p) { if (job.done || !bot.worker) out = null; return null; }
   out = null;
   const H = base.game.board.length, type = lower(p.piece);
   const m = window.LocalSpinPlanner?.matchCells?.(opts.engine, { board: base.game.board }, type, p.cells.map(([x, yb]) => [x, H - 1 - yb]), opts);
   if (!m) { stats.unmatched++; return out; }
   stats.placed++; stats.ms += job.spent || 0;
   out = { ...m, hold: !!p.usedHold };
   game._localExternalPlan = { engine: game._aiEngine, ...out };
   return out;
  };
  return {
   // external: bot-ai lets it think until the PPS clock (no in-thread slice cap)
   external: true,
   get done() { return job.done; }, get spent() { return job.spent || 0; },
   // A non-realtime caller (step(1e9) in one synchronous loop) gets the full search.
   step(ms = 4) { return job.step(ms >= 1e6 ? 1e6 : Math.max(ms, 6)); },
   // An early finish with too little search returns no move (Cold Clear 2 needs
   // ~60 ms in Node, more in the browser). Top it up first: at most 120 ms here,
   // up to 250 ms of search in all, then finish early.
   stop() {
    // A worker search can not be waited for here (its messages arrive between frames):
    // take the best move it has sent so far.
    // bot-ai keeps waiting (frame by frame, nothing blocks) until done turns true.
    if (bot.worker) { if (!job.done && !early) { early = true; stats.early++; } job.stop(); return job.done ? convert() : null; }
    if (!job.done) {
     stats.early++;
     const t0 = performance.now();
     while (!job.done && (job.spent || 0) < 250 && performance.now() - t0 < 120) job.step(8);
     if (!job.done) job.stop();
    }
    return convert();
   },
   result() { return convert(); },
  };
 }
 const active = game => !!game?._aiEngine && !!bots[game._aiEngine];

 // ---- Entrance: 外部AI対戦 (TL / CUSTOM room: player / vA AI / loaded outside AI) ----
 const css = `#qp-ext-ai{position:fixed;left:12px;bottom:72px;z-index:2147483647;font:12px/1.4 sans-serif;color:#e8e8f0}
#qp-ext-ai>button{display:none;background:#3b2a6b;color:#fff;border:1px solid #8c7bd8;border-radius:6px;padding:6px 10px;cursor:pointer}
#qp-ext-ai .p{display:none;margin-top:6px;background:#1b1830ee;border:1px solid #6d5fb5;border-radius:8px;padding:10px;width:300px}
#qp-ext-ai.open .p{display:block}#qp-ext-ai.float>button{display:inline-block}#qp-ext-ai label{display:block;margin:4px 0}#qp-ext-ai select,#qp-ext-ai input[type=number]{width:100%;background:#0f0d1c;color:#fff;border:1px solid #555;border-radius:4px;padding:3px}
#qp-ext-ai .row{display:flex;gap:6px;margin-top:8px}#qp-ext-ai .row button{flex:1;padding:5px;border-radius:4px;border:1px solid #777;background:#2a2547;color:#fff;cursor:pointer}
#qp-ext-ai .s{margin-top:6px;opacity:.85;white-space:pre-wrap}#qp-ext-ai .n{opacity:.7;margin-top:4px}
#qp-ext-ai.intab{position:static;z-index:auto}#qp-ext-ai.intab>button{display:none!important}#qp-ext-ai.intab .p{display:block;width:auto;margin-top:4px}`;
 function sideOptions() {
  const out = [['player', 'プレイヤー(キーボード)']];
  for (const p of window.LocalBotLearning?.profiles?.() || []) out.push(['ai:' + p.id, 'vA AI: ' + p.name]);
  for (const [id, d] of Object.entries(defs)) out.push(['ext:' + id, '外部AI: ' + (d.label || id)]);
  return out;
 }
 function panel() {
  if (document.getElementById('qp-ext-ai')) return;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'qp-ext-ai';
  root.innerHTML = `<button type="button">外部AI対戦</button><div class="p">
<label>左 <select data-k="left"></select></label><label>右 <select data-k="right"></select></label>
<label>ルール <select data-k="mode"><option value="league">TL</option><option value="custom">CUSTOM</option></select></label>
<label>FT(先に何本取ったら勝ちか) <input data-k="ft" type="number" min="1" max="99" step="1" value="7"></label>
<label>外部AIの強さ(エンジンごとの探索量。空欄で既定) <input data-k="str" type="number" min="1" step="1"></label>
<div class="row"><button data-a="start" type="button">開始</button><button data-a="stop" type="button">終了</button></div>
<div class="row"><button data-a="add" type="button">外部AIを読み込む</button><button data-a="del" type="button">外部AIを外す</button></div>
<input data-k="files" type="file" multiple accept=".js,.mjs,.wasm,.json,.bin" style="display:none">
<div class="n">外部AIはパッチに入っていません。自分のパソコンにある外部AIのファイル(.js と、必要なら .wasm など)を選んで読み込みます。</div><div class="s"></div></div>`;
  document.body.appendChild(root);
  const $ = q => root.querySelector(q), status = t => { $('.s').textContent = t; };
  // The entrance sits next to "AI管理を開く" in the offline panel (TETR.IO's footer
  // covers the bottom-left corner); without that panel a floating button is used.
  const util = document.getElementById('local-utility-actions');
  if (util && !document.getElementById('local-ext-ai-open')) { const b = document.createElement('button'); b.id = 'local-ext-ai-open'; b.type = 'button'; b.textContent = '外部AI対戦'; b.onclick = () => $('button').onclick(); util.appendChild(b); }
  else root.classList.add('float');
  const extOf = v => (String(v).startsWith('ext:') ? String(v).slice(4) : null);
  const fill = () => {
   for (const k of ['left', 'right']) { const sel = $(`select[data-k="${k}"]`), keep = sel.value; sel.innerHTML = ''; for (const [v, t] of sideOptions()) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = keep; if (!sel.value) sel.selectedIndex = k === 'left' ? 0 : sel.options.length - 1; }
   try { const f = localStorage.getItem('qp-local-ai-ext-ft'); if (f) $('input[data-k="ft"]').value = f; } catch {}
   const id = extOf($('select[data-k="right"]').value) || extOf($('select[data-k="left"]').value); $('input[data-k="str"]').value = id ? (strength(id) ?? '') : '';
  };
  // In the Tab panel (2026-11-13): the same controls as a section under the vAI
  // test settings; the floating panel stays only where there is no Tab panel.
  let docked = null;
  const dock = () => {
   const tab = document.getElementById('local-panel'); if (!tab || docked) return !!docked;
   docked = document.createElement('details'); docked.id = 'qp-ext-ai-tab';
   const sum = document.createElement('summary'); sum.textContent = '外部AI対戦'; docked.appendChild(sum);
   root.classList.add('intab'); root.classList.remove('float'); docked.appendChild(root);
   const after = document.getElementById('qp-ai-test-settings') || document.getElementById('local-ai-quick');
   if (after && after.parentNode === tab) after.after(docked); else tab.appendChild(docked);
   docked.addEventListener('toggle', async () => { if (!docked.open) return; fill(); try { await window.LocalAI?.load?.(); fill(); } catch {} });
   return true;
  };
  if (!dock()) { const mo = new MutationObserver(() => { if (dock()) mo.disconnect(); }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
  $('button').onclick = async () => { if (docked) { docked.open = true; docked.scrollIntoView?.({ block: 'nearest' }); return; } root.classList.toggle('open'); if (root.classList.contains('open')) { fill(); try { await window.LocalAI?.load?.(); fill(); } catch {} } };
  $('[data-a="stop"]').onclick = () => { try { window.LocalAIRoom?.stop?.(); try { window.LocalNative?.resetResults?.(); window.LocalNative?.view?.('play1p'); } catch {} status('終了しました'); } catch (e) { status(e.message); } };
  $('[data-a="add"]').onclick = () => $('input[data-k="files"]').click();
  $('input[data-k="files"]').onchange = async ev => { try { const ids = await addFiles(ev.target.files); fill(); status('読み込みました: ' + ids.map(id => defs[id].label || id).join(', ')); } catch (e) { status('読み込めません: ' + e.message); } ev.target.value = ''; };
  $('[data-a="del"]').onclick = async () => {
   const id = extOf($('select[data-k="right"]').value) || extOf($('select[data-k="left"]').value);
   if (!id) { status('外す外部AIを左右どちらかで選んでください'); return; }
   try { for (const pkg of await allPackages()) if ((pkg.ids || []).includes(id)) await deletePackage(pkg.name); delete defs[id]; delete bots[id]; fill(); status('外しました(次の起動からは読み込みません)'); } catch (e) { status(e.message); }
  };
  $('[data-a="start"]').onclick = async () => {
   try {
    const L = $('select[data-k="left"]').value, R = $('select[data-k="right"]').value;
    if (L === 'player' && R === 'player') throw Error('片側は AI にしてください');
    await window.LocalAI?.load?.();
    const engines = [extOf(L), extOf(R)];
    const str = Number($('input[data-k="str"]').value);
    for (const id of new Set(engines.filter(Boolean))) {
     if (Number.isFinite(str) && str > 0 && str !== strength(id)) { localStorage.setItem(strengthKey(id), String(str)); delete bots[id]; }
     status((defs[id]?.label || id) + ' を準備中…'); await load(id);
    }
    const profiles = window.LocalBotLearning?.profiles?.() || [];
    if (engines.some(Boolean) && !profiles.length) throw Error('vA の AI プロファイルが1つもありません(外部AIのキー操作役に使います)');
    // An outside AI side borrows a vA profile only for the key driver; the outside AI decides every placement.
    // Same PPS: an outside AI borrows the other side's vA profile (its key driver and pace) when there is one.
    const other = i => [L, R][1 - i], drv = i => (String(other(i)).startsWith('ai:') ? other(i) : 'ai:' + profiles[0].id);
    const side = (v, e, i) => (e ? drv(i) : v);
    const labels = engines.map(e => (e ? defs[e].label || e : null));
    try { localStorage.setItem('qp-local-ai-ext-ft', String($('input[data-k="ft"]').value)); } catch {}
    const ft = Number($('input[data-k="ft"]').value); if (Number.isInteger(ft) && ft >= 1 && ft <= 99) window.LocalAIRoom.ft?.(ft);
    window.LocalAIRoom.start({ left: side(L, engines[0], 0), right: side(R, engines[1], 1), mode: $('select[data-k="mode"]').value, labels, engines });
    status('開始: ' + [L, R].map(v => sideOptions().find(o => o[0] === v)?.[1] || v).join(' vs '));
   } catch (e) { status('開始できません: ' + e.message); }
  };
 }
 // Every round (also auto-advanced ones) re-applies the chosen engines to the new games.
 window.addEventListener('local-ai-match-start', ev => {
  const { games, config } = ev.detail || {};
  (games || []).forEach((g, i) => { g._aiEngine = config?.engines?.[i] || null; g._aiExternalStats = null; });
 });
 window.LocalExternalAI = { register, load, planner, active, inputOf, addFiles, restore, engines: () => Object.keys(defs) };
 const mount = () => { if (document.body) panel(); else setTimeout(mount, 200); };
 if (typeof document !== 'undefined') { mount(); restore(); }
})();
