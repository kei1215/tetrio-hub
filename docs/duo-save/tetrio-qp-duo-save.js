/* QP DUO リプレイ保存 (tetrio-hub) v2
 * 今の段階: QP の DUO が終わったら、「自分」のリプレイ(.ttr)を保存する。相方の分は後で対応。
 * - 「↓ TTR」で普通のダウンロード(保存先は自分で選ぶ)。この端末の中(IndexedDB)にも控えを残す。外部には送らない。
 * - 診断ログ: 保存処理が見た情報(ゲームの種類・DUO 設定・相方とのつながり・フレーム数・終わり・保存の結果)を
 *   時刻つきで記録し、「診断ログ ↓」で JSON に出力する。自動では送らない。
 * - 同じプレイは1回だけ保存する(シード + 自分の名前で判定)。
 */
(() => {
  'use strict';
  const W = window, D = document, TAG = '[qp-duo-save]', VER = 3;
  if (W.__qpDuoSave) { W.__qpDuoSave.open(); return; }

  // ---- 診断ログ(メモリに最大 3000 件。終わるたびに端末内へも残す) ----
  const T0 = Date.now(), LOG = [];
  const log = (k, d = {}) => { LOG.push({ t: Date.now() - T0, k, ...d }); if (LOG.length > 3000) LOG.splice(0, LOG.length - 3000); };
  log('start', { ver: VER, embedded: !!W.__qpDuoSaveEmbedded, ua: navigator.userAgent, url: location.origin + location.pathname });
  W.addEventListener('error', e => log('error', { msg: String(e.message || '').slice(0, 300), src: String(e.filename || '').slice(-80), line: e.lineno }));

  // ---- ゲームをつかまえる(リプレイ盤面修正・カウンターと同じ受け口を共有する) ----
  const games = W.__rpeGames || (W.__rpeGames = []);
  const trap = Object.getOwnPropertyDescriptor(Object.prototype, 'gsm');
  log('trap', { existing: !!(trap && trap.set && trap.set.__rpe) });
  if (!trap || !trap.set || !trap.set.__rpe) {
    const set = function (v) {
      Object.defineProperty(this, 'gsm', { value: v, writable: true, configurable: true, enumerable: true });
      try { if (this && this.W && this.T && 'Wh' in this) W.__rpeGames.push(this); } catch (e) {}
    };
    set.__rpe = true;
    Object.defineProperty(Object.prototype, 'gsm', { configurable: true, enumerable: false, get() { return undefined; }, set });
  }

  // ---- 端末内の保存(IndexedDB): replays = 保存したリプレイ、logs = 終わったときの診断ログ ----
  const DB = 'qp-duo-save', KEEP = 50, KEEP_LOGS = 5;
  const db = () => new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { for (const s of ['replays', 'logs']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'key' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
  const req = r => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
  const tx = async (store, mode, fn) => {
    const d = await db();
    return new Promise((ok, ng) => {
      const t = d.transaction(store, mode); let out;
      Promise.resolve(fn(t.objectStore(store))).then(v => { out = v; });
      t.oncomplete = () => { d.close(); ok(out); }; t.onerror = () => { d.close(); ng(t.error); };
    });
  };
  const all = store => tx(store, 'readonly', s => req(s.getAll())).then(a => (a || []).sort((x, y) => y.ts - x.ts));
  const list = () => all('replays');
  const get = key => tx('replays', 'readonly', s => req(s.get(key)));
  const del = (key, store = 'replays') => tx(store, 'readwrite', s => req(s.delete(key)));
  const put = (rec, store = 'replays') => tx(store, 'readwrite', s => req(s.put(rec)));
  const prune = async (store, keep) => { const a = await all(store); for (const r of a.slice(keep)) await del(r.key, store); };

  // ---- ファイル ----
  const download = (text, name) => {
    const a = D.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  const safe = s => String(s || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 20) || 'player';
  const stamp = () => new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const nameOf = data => {
    if (typeof W.__qpReplayDownloadName === 'function') { try { const n = W.__qpReplayDownloadName(data, 'ttr'); if (n) return n; } catch (e) {} }
    return `qp-duo-${stamp()}-${safe(data.users[0].username)}.ttr`;
  };

  // ---- ゲームの様子 ----
  const seen = new WeakSet(), last = new WeakMap();
  const typeOf = n => { try { return n.esm?.IsKeyboard?.() ? 'keyboard' : n.esm?.IsSocket?.() ? 'socket' : n.esm?.IsReplay?.() ? 'replay' : n.esm?.IsPipe?.() ? 'pipe' : '?'; } catch (e) { return 'err'; } };
  const frames = r => { try { return { f: r?.frame ?? r?.frames ?? null, e: r?.events?.length ?? null }; } catch (e) { return {}; } };
  const info = n => {
    const so = n.gsm?.setoptions || {}, ally = n.zthm?.duoOtherSideGame;
    return { id: so.gameid ?? null, type: typeOf(n), user: so.username, zenith: !!so.zenith, duo: !!so.zenith_duo, ally: so.zenith_ally?.[1] ?? null,
      noreplay: !!so.noreplay, playing: !!n.gsm?.playing, reason: n.gsm?.gameoverreason ?? null, ...frames(n.iom?.replay),
      allyRef: !!ally, allyUser: ally?.options?.username ?? null, allyFrames: ally ? frames(ally.replay).f : null };
  };

  // ---- 保存(自分の分だけ。1回のプレイにつき1件) ----
  const saveSelf = async n => {
    const play = JSON.parse(JSON.stringify(n.iom.replay.Export()));
    const so = play.options || n.gsm.setoptions || {};
    const key = [so.seed, so.username].join('|');
    if (!(play.frames > 0)) { log('save-skip', { why: 'no frames', key }); return null; }
    if (await get(key)) { log('save-skip', { why: 'duplicate', key }); return null; }
    const data = { id: null, version: 1, gamemode: 'zenith', ts: new Date().toISOString(),
      users: [{ id: String(n.zthm?.duoOtherSideGame?.options?.zenith_ally?.[0] || '0'.repeat(24)), username: String(so.username || 'PLAYER'), avatar_revision: 0, banner_revision: 0, flags: 0, country: null }],
      replay: play };
    const st = n.gsm.stats || {};
    const rec = { key, ts: Date.now(), name: nameOf(data), self: data.users[0].username, ally: so.zenith_ally?.[1] || '', altitude: Math.round(st.zenith?.altitude || 0), frames: play.frames, data: JSON.stringify(data) };
    await put(rec); await prune('replays', KEEP);
    log('saved', { key, frames: play.frames, events: play.events?.length, bytes: rec.data.length });
    return rec;
  };
  const keepLog = async why => {
    try { await put({ key: 'log-' + Date.now(), ts: Date.now(), why, data: JSON.stringify(exportLog(false)) }, 'logs'); await prune('logs', KEEP_LOGS); }
    catch (e) { log('log-store-error', { msg: String(e.message || e) }); }
  };

  // ---- 見張り(1秒ごと) ----
  // QP では塔のほかのプレイヤーのゲームも大量につかまる(数百)。自分のゲーム(keyboard の QP)は mine に入れて
  // 絶対に手放さない。ほかの人のゲームはログに件数だけ残し、終わったものから受け口の一覧を軽くする。
  const mine = new Set();
  let others = 0, othersLogged = 0;
  const tick = async () => {
    for (const n of games) {
      if (!n || !n.gsm || seen.has(n)) continue;
      seen.add(n);
      const so = n.gsm.setoptions || {};
      if (so.zenith && typeOf(n) === 'keyboard') { mine.add(n); log('game', info(n)); } else others++;
    }
    if (others !== othersLogged && Date.now() - (tick.lastOthers || 0) > 30000) { tick.lastOthers = Date.now(); othersLogged = others; log('others', { count: others, list: games.length }); }
    for (const n of mine) {
      try {
        const so = n.gsm.setoptions;
        const now = info(n), before = last.get(n);
        if (!before || before.playing !== now.playing || before.allyRef !== now.allyRef || before.reason !== now.reason || Date.now() - before._t > 5000) {
          last.set(n, { ...now, _t: Date.now() });
          log('state', now);
        }
        if (now.playing) continue;
        mine.delete(n);
        log('end', now);
        if (!so.zenith_duo) continue;          // DUO のときだけ保存する(ソロは公式の保存がある)
        const rec = await saveSelf(n);
        if (rec) toast(rec);
        await keepLog('end');
      } catch (e) { log('tick-error', { msg: String(e && e.stack || e).slice(0, 400) }); }
    }
    // 受け口の一覧が増えすぎないように、終わったほかの人のゲームだけを外す(自分・プレイ中のものは残す)
    if (games.length > 300) {
      for (let i = games.length - 1; i >= 0; i--) { const n = games[i]; if (!mine.has(n) && !n?.gsm?.playing) games.splice(i, 1); }
    }
  };
  setInterval(() => { tick(); }, 1000);

  const exportLog = (withStored = true) => ({ kind: 'qp-duo-save-log', ver: VER, at: new Date().toISOString(), log: LOG.slice() });
  const downloadLog = async () => {
    const out = exportLog();
    try { out.stored = (await all('logs')).map(r => ({ ts: r.ts, why: r.why, ...JSON.parse(r.data) })); } catch (e) { out.storedError = String(e.message || e); }
    try { out.saved = (await list()).map(r => ({ ts: r.ts, name: r.name, frames: r.frames, bytes: r.data.length })); } catch (e) {}
    download(JSON.stringify(out, null, 1), `qp-duo-log-${stamp()}.json`);
  };

  // ---- 画面(保存の知らせ・一覧・CONFIG の入口) ----
  const css = D.createElement('style');
  css.textContent = `#qp-duo-save{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:350px;max-height:60vh;overflow:auto;background:rgba(16,18,28,.95);color:#eee;font:13px/1.45 system-ui,sans-serif;border:1px solid #556;border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
#qp-duo-save h3{margin:0 0 6px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
#qp-duo-save button{background:#2d3a5a;color:#fff;border:1px solid #556;border-radius:5px;padding:3px 9px;cursor:pointer;font:inherit}
#qp-duo-save button:hover{background:#3d4d75}#qp-duo-save .row{display:flex;gap:6px;align-items:center;margin:5px 0}#qp-duo-save .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#qp-duo-save .muted{color:#9aa}`;
  (D.head || D.documentElement).appendChild(css);
  let box = null;
  const el = (tag, attrs = {}, ...kids) => { const e = D.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
  const close = () => { box?.remove(); box = null; };
  const shell = title => { close(); box = el('div', { id: 'qp-duo-save' }); box.append(el('h3', {}, title, el('button', { textContent: '×', title: '閉じる', onclick: close }))); D.body.appendChild(box); return box; };
  const when = t => new Date(t).toLocaleString();
  const dl = rec => download(rec.data, rec.name);
  function toast(rec) {
    const b = shell('QP DUO: 自分のリプレイを保存しました');
    b.append(el('div', { className: 'muted', textContent: `${rec.self}${rec.ally ? ' (相方 ' + rec.ally + ')' : ''} · ${rec.altitude}m · ${when(rec.ts)}` }),
      el('div', { className: 'row' }, el('button', { textContent: '↓ TTR', onclick: () => dl(rec) }), el('button', { textContent: '一覧', onclick: open }), el('button', { textContent: '診断ログ ↓', onclick: downloadLog })));
  }
  async function open() {
    const b = shell('QP DUO リプレイ(この端末だけに保存)');
    b.append(el('div', { className: 'row' }, el('button', { textContent: '診断ログ ↓', title: 'うまく保存できないときに出力してください', onclick: downloadLog })));
    let a = [];
    try { a = await list(); } catch (e) { b.append(el('div', { textContent: '読み込めません: ' + e.message })); return; }
    if (!a.length) b.append(el('div', { className: 'muted', textContent: 'まだありません。DUO が終わると、自分のリプレイが自動で保存されます。' }));
    for (const rec of a) {
      b.append(el('div', { className: 'row' },
        el('span', { className: 'grow', title: rec.name, textContent: `${when(rec.ts)} ${rec.self}${rec.ally ? ' & ' + rec.ally : ''} ${rec.altitude}m` }),
        el('button', { textContent: '↓', title: 'ダウンロード', onclick: () => dl(rec) }),
        el('button', { textContent: '🗑', title: '削除', onclick: async () => { if (confirm('この DUO リプレイを削除しますか?')) { await del(rec.key); open(); } } })));
    }
  }
  // CONFIG > QP PATCH TOOLS に「QP DUO REPLAYS」を置く(CONFIG の画面ができるまで待つ)
  const installConfig = () => {
    if (D.getElementById('qp-duo-save-entry')) return true;
    const account = D.getElementById('config_account');
    const config = account?.closest?.('[data-menuview="config"]') || D.querySelector('[data-menuview="config"]');
    if (!config) return false;
    const template = D.getElementById('config_export') || account;
    const node = el('div', { id: 'qp-duo-save-entry', className: template?.className || 'scroller_item scroller_item_config has_description ns rg_target_pri', tabIndex: 0 },
      el('h1', { textContent: 'QP DUO REPLAYS' }), el('p', { textContent: 'DUO で保存した自分のリプレイの一覧と、診断ログの出力' }));
    node.setAttribute('role', 'button');
    const run = e => { e.preventDefault(); e.stopImmediatePropagation(); open(); };
    node.addEventListener('click', run, true);
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') run(e); }, true);
    let footer = D.getElementById('qp-patch-tools-footer');
    if (!footer) { footer = el('div', { id: 'qp-patch-tools-footer', className: 'scroller_block zero' }, el('h2', { className: 'ns', textContent: 'QP PATCH TOOLS' })); footer.firstChild.style.cssText = 'margin:.8em 0 .25em;color:#ff9866'; config.append(footer); }
    footer.after(node);
    log('config-entry');
    return true;
  };
  let tries = 0; const iv = setInterval(() => { try { if (installConfig() || ++tries > 120) clearInterval(iv); } catch (e) { clearInterval(iv); } }, 1000);

  W.__qpDuoSave = { open, list, tick, downloadLog, log: LOG };
  if (!W.__qpDuoSaveEmbedded) open();
  console.log(TAG, 'ready v' + VER);
})();
