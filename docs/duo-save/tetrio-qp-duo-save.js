/* QP DUO リプレイ保存 (tetrio-hub)
 * QP の DUO が終わったら、自分と相方のリプレイを1つの .ttrm にまとめる。
 * - 「↓ TTRM」で普通のダウンロード(保存先は自分で選ぶ)。
 * - 押し忘れに備えて、この端末の中(tetr.io の IndexedDB)にも控えを残す。外部には送らない。
 * - 同じプレイは1回だけ保存する(シード + 2人の名前で判定)。
 * 2人だけの部屋では、TETR.IO は相方のゲームも端末内で記録している(noreplay = 人数 > 2)。それを使う。
 */
(() => {
  'use strict';
  const W = window, D = document, TAG = '[qp-duo-save]';
  if (W.__qpDuoSave) { W.__qpDuoSave.open(); return; }

  // ---- ゲームをつかまえる(リプレイ盤面修正と同じ受け口。同じものを共有する) ----
  const games = W.__rpeGames || (W.__rpeGames = []);
  const trap = Object.getOwnPropertyDescriptor(Object.prototype, 'gsm');
  if (!trap || !trap.set || !trap.set.__rpe) {
    const set = function (v) {
      Object.defineProperty(this, 'gsm', { value: v, writable: true, configurable: true, enumerable: true });
      try { if (this && this.W && this.T && 'Wh' in this) W.__rpeGames.push(this); } catch (e) {}
    };
    set.__rpe = true;
    Object.defineProperty(Object.prototype, 'gsm', { configurable: true, enumerable: false, get() { return undefined; }, set });
  }

  // ---- 端末内の控え(IndexedDB) ----
  const DB = 'qp-duo-save', STORE = 'replays', KEEP = 50;
  const db = () => new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((ok, ng) => {
      const t = d.transaction(STORE, mode), s = t.objectStore(STORE); let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => { d.close(); ok(out); }; t.onerror = () => { d.close(); ng(t.error); };
    });
  };
  const req = r => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
  const list = () => tx('readonly', s => req(s.getAll())).then(a => (a || []).sort((x, y) => y.ts - x.ts));
  const get = key => tx('readonly', s => req(s.get(key)));
  const del = key => tx('readwrite', s => req(s.delete(key)));
  const put = rec => tx('readwrite', s => req(s.put(rec)));
  const prune = async () => { const a = await list(); for (const r of a.slice(KEEP)) await del(r.key); };

  // ---- .ttrm を作る(公式の対戦リプレイと同じ形: leaderboard + rounds) ----
  const clone = o => JSON.parse(JSON.stringify(o));
  const statsOf = (play, gsm) => {
    const agg = play.results?.aggregatestats || {}, st = play.results?.stats || gsm?.stats || {};
    return { apm: agg.apm || 0, pps: agg.pps || 0, vsscore: agg.vsscore || 0, garbagesent: st.garbage?.sent || 0, garbagereceived: st.garbage?.received || 0,
      kills: st.kills || 0, altitude: st.zenith?.altitude || 0, rank: st.zenith?.rank || 1, targetingfactor: st.zenith?.targetingfactor || 3,
      targetinggrace: st.zenith?.targetinggrace || 0, btb: st.btb || 0, revives: st.zenith?.revives || 0 };
  };
  const build = (selfPlay, selfGsm, allyPlay, allyGsm) => {
    const so = selfPlay.options || {}, ao = allyPlay.options || {};
    const users = [
      { id: String(ao.zenith_ally?.[0] || '0'.repeat(24)), username: String(so.username || 'PLAYER 1') },
      { id: String(so.zenith_ally?.[0] || '0'.repeat(23) + '1'), username: String(ao.username || so.zenith_ally?.[1] || 'PLAYER 2') },
    ].map(u => ({ ...u, avatar_revision: 0, banner_revision: 0, flags: 0, country: null }));
    const plays = [clone(selfPlay), clone(allyPlay)], gsms = [selfGsm, allyGsm];
    const base = (u, i) => ({ id: u.id, username: u.username, active: true, naturalorder: i, shadows: [], shadowedBy: [null, null] });
    return {
      id: null, version: 1, gamemode: 'zenith', ts: new Date().toISOString(), users,
      replay: {
        leaderboard: users.map((u, i) => ({ ...base(u, i), wins: 0, stats: statsOf(plays[i], gsms[i]) })),
        rounds: [users.map((u, i) => ({ ...base(u, i), alive: false, lifetime: Math.round((plays[i].frames || 0) / 60 * 1000), stats: statsOf(plays[i], gsms[i]), replay: plays[i] }))],
      },
    };
  };
  const nameOf = data => {
    if (typeof W.__qpReplayDownloadName === 'function') { try { const n = W.__qpReplayDownloadName(data, 'ttrm'); if (n) return n; } catch (e) {} }
    const safe = s => String(s || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 20) || 'player';
    return `qp-duo-${data.ts.replace(/[^0-9]/g, '').slice(0, 14)}-${safe(data.users[0].username)}-${safe(data.users[1].username)}.ttrm`;
  };
  const download = rec => {
    const a = D.createElement('a');
    a.href = URL.createObjectURL(new Blob([rec.data], { type: 'application/json' }));
    a.download = rec.name; D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  // ---- 保存(1回のプレイにつき1件) ----
  const keyOf = (so, ao) => [so.seed, so.username, ao.username || so.zenith_ally?.[1]].join('|');
  const save = async (selfPlay, selfGsm, allyPlay, allyGsm) => {
    const key = keyOf(selfPlay.options || {}, allyPlay.options || {});
    if (await get(key)) return null;
    const data = build(selfPlay, selfGsm, allyPlay, allyGsm);
    const rec = { key, ts: Date.now(), name: nameOf(data), self: data.users[0].username, ally: data.users[1].username,
      altitude: Math.round(Math.max(data.replay.leaderboard[0].stats.altitude, data.replay.leaderboard[1].stats.altitude)), data: JSON.stringify(data) };
    await put(rec); await prune();
    return rec;
  };

  // ---- DUO の終わりを見張る ----
  const WAIT_ALLY = 120000; // 自分が先に倒れたら、相方が終わるまで最大 2 分待つ
  const tick = async () => {
    for (let i = games.length - 1; i >= 0; i--) {
      const n = games[i];
      try {
        const so = n.gsm?.setoptions;
        if (!so || !so.zenith_duo || n.__duoSaved) continue;
        if (!n.esm?.IsKeyboard?.()) continue;          // 自分の盤面だけを起点にする
        const ally = n.zthm?.duoOtherSideGame;
        if (ally) n.__duoAlly = ally;                  // 終わると外されるので、遊んでいる間に覚えておく
        if (n.gsm.playing) continue;
        const a = n.__duoAlly;
        if (!a) continue;
        n.__duoEndAt ||= Date.now();
        if (a.state?.playing && Date.now() - n.__duoEndAt < WAIT_ALLY) continue;
        n.__duoSaved = true;
        const selfPlay = n.iom.replay.Export(), allyPlay = a.replay?.Export?.();
        if (!(selfPlay?.frames > 0) || !(allyPlay?.frames > 0)) { console.warn(TAG, 'replay missing', !!allyPlay); continue; }
        const rec = await save(selfPlay, n.gsm, allyPlay, a.state);
        if (rec) toast(rec);
      } catch (e) { console.warn(TAG, e); }
    }
    if (games.length > 200) games.splice(0, games.length - 200);
  };
  setInterval(() => { tick(); }, 1000);

  // ---- 画面(保存の知らせと一覧) ----
  const css = D.createElement('style');
  css.textContent = `#qp-duo-save{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;max-height:60vh;overflow:auto;background:rgba(16,18,28,.95);color:#eee;font:13px/1.45 system-ui,sans-serif;border:1px solid #556;border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
#qp-duo-save h3{margin:0 0 6px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
#qp-duo-save button{background:#2d3a5a;color:#fff;border:1px solid #556;border-radius:5px;padding:3px 9px;cursor:pointer;font:inherit}
#qp-duo-save button:hover{background:#3d4d75}#qp-duo-save .row{display:flex;gap:6px;align-items:center;margin:5px 0}#qp-duo-save .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#qp-duo-save .muted{color:#9aa}`;
  D.head.appendChild(css);
  let box = null;
  const el = (tag, attrs = {}, ...kids) => { const e = D.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
  const close = () => { box?.remove(); box = null; };
  const shell = title => { close(); box = el('div', { id: 'qp-duo-save' }); box.append(el('h3', {}, title, el('button', { textContent: '×', title: '閉じる', onclick: close }))); D.body.appendChild(box); return box; };
  const when = t => new Date(t).toLocaleString();
  function toast(rec) {
    const b = shell('QP DUO のリプレイを保存しました');
    b.append(el('div', { className: 'muted', textContent: `${rec.self} & ${rec.ally} · ${rec.altitude}m · ${when(rec.ts)}` }),
      el('div', { className: 'row' }, el('button', { textContent: '↓ TTRM', onclick: () => download(rec) }), el('button', { textContent: '一覧', onclick: open })));
  }
  async function open() {
    const b = shell('QP DUO リプレイ(この端末だけに保存)');
    let a = [];
    try { a = await list(); } catch (e) { b.append(el('div', { textContent: '読み込めません: ' + e.message })); return; }
    if (!a.length) b.append(el('div', { className: 'muted', textContent: 'まだありません。DUO が終わると自動で保存されます。' }));
    for (const rec of a) {
      b.append(el('div', { className: 'row' },
        el('span', { className: 'grow', title: rec.name, textContent: `${when(rec.ts)} ${rec.self} & ${rec.ally} ${rec.altitude}m` }),
        el('button', { textContent: '↓', title: 'ダウンロード', onclick: () => download(rec) }),
        el('button', { textContent: '🗑', title: '削除', onclick: async () => { if (confirm('この DUO リプレイを削除しますか?')) { await del(rec.key); open(); } } })));
    }
  }

  W.__qpDuoSave = { open, list, save, build, download, tick };
  if (!W.__qpDuoSaveEmbedded) open();
  console.log(TAG, 'ready');
})();
