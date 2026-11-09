// TETR.IO スピンカウンター(リプレイ盤面修正のブックマークから起動される。単体でも動く)
// 盤面ごとに、スピン・T-spin・QUAD の回数を数えて表示する(表示だけ。ゲームには何もしない)
// ・SPIN   : スピン(全ミノ・MINI 込み)の回数。「列ごと」ON で、消したライン数ごとの内訳も出す
// ・T-SPIN : T-spin(MINI 込み)の回数 / 置いた T ミノの数
// ・QUAD   : 4ライン消しの回数
// 数え方: ゲームが1フレーム進むたびに、TETR.IO 自身の集計(stats.tspins・stats.clears・置いたミノの数)の増え方を読む
(() => {
  const W = window;
  const SRC = 'https://kei1215.github.io/tetrio-hub/counter/tetrio-spin-counter.js';
  const ME = document.currentScript && document.currentScript.src;
  const TAG = '[spin-counter]';

  const updated = !!W.__scUpdating;
  W.__scUpdating = false;
  const keep = (W.__scTeardown && W.__scTeardown(updated)) || {};

  // ---- ゲームをつかまえる(リプレイ盤面修正と同じ受け口・同じ一覧を使う) ----
  // TETR.IO はゲームを作るたびに、内部オブジェクトへ .gsm(盤面や集計)を入れる。そのときに受け取る
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

  const S = W.__sc = {
    byLines: keep.byLines ?? true,   // スピンを消したライン数ごとにも出す
    byPiece: keep.byPiece ?? false,  // スピンをミノごとにも出す
    panelClosed: updated ? !!keep.panelClosed : false
  };

  // ---- 数える ----
  const LINES = {
    minitspins: 0, realtspins: 0,
    singles: 1, tspinsingles: 1, minitspinsingles: 1,
    doubles: 2, tspindoubles: 2, minitspindoubles: 2,
    triples: 3, tspintriples: 3, minitspintriples: 3,
    quads: 4, tspinquads: 4, minitspinquads: 4,
    pentas: 5, tspinpentas: 5
  };
  const MINI = new Set(['minitspins', 'minitspinsingles', 'minitspindoubles', 'minitspintriples', 'minitspinquads']);
  const read = st => ({ pieces: st.stats.piecesplaced || 0, spins: st.stats.tspins || 0, clears: { ...(st.stats.clears || {}) } });

  // 盤面ごとの記録: ミノを置いたできごとを、フレーム番号つきで残す(リプレイで戻ったら、その先の分を消す)
  const watch = n => {
    if (n.__sc && n.__sc.hooked) return n.__sc;
    const rec = n.__sc || (n.__sc = { events: [], last: null, type: null, frame: -1 });
    const esm = n.esm;
    const adv0 = esm.AdvanceFrame, own = Object.prototype.hasOwnProperty.call(esm, 'AdvanceFrame');
    rec.hooked = true;
    rec.restore = () => {
      if (esm.AdvanceFrame === hook) { if (own) esm.AdvanceFrame = adv0; else delete esm.AdvanceFrame; }
      rec.hooked = false;
    };
    const hook = function (...a) {
      try { observe(n, rec); } catch (e) {}
      return adv0.apply(this, a);
    };
    esm.AdvanceFrame = hook;
    return rec;
  };
  // 1フレームごと(ゲームがフレームを進める直前)に呼ばれる
  const observe = (n, rec) => {
    const st = n.gsm, f = n.esm.frame;
    if (!rec.tlChecked && st.started !== false) {
      rec.tlChecked = true;
      const rep = replayOf(n);
      if (rep && headless(n)) timelines.set(rep, rec);
    }
    const now = read(st);
    // 戻った(リプレイのシーク・盤面修正で元に戻した・新しいゲーム): その先の記録を消して、今を基準にする
    if (f < rec.frame || !rec.last || now.pieces < rec.last.pieces) {
      rec.events = rec.events.filter(e => e.frame <= f);
      rec.last = now; rec.frame = f; rec.type = st.falling && st.falling.type;
      return;
    }
    const dp = now.pieces - rec.last.pieces;
    if (dp === 1) {
      // ミノを置いた。置いたミノの種類は、前のフレームで操作していたミノ
      let lines = 0, mini = false;
      for (const k in LINES) {
        const d = (now.clears[k] || 0) - (rec.last.clears[k] || 0);
        if (d > 0) { lines = LINES[k]; if (MINI.has(k)) mini = true; }
      }
      const spin = now.spins > rec.last.spins;
      rec.events.push({ frame: f, type: rec.type, spin, mini, lines });
    } else if (dp > 1) {
      // 一度に何手も進んだ(リプレイで先へシークしたときなど): 回数だけまとめて足す(ミノの種類はわからない)
      const agg = { frame: f, agg: true, spins: Math.max(0, now.spins - rec.last.spins), mini: 0, quad: 0, byLines: [0, 0, 0, 0, 0] };
      for (const k in LINES) {
        const d = Math.max(0, (now.clears[k] || 0) - (rec.last.clears[k] || 0));
        if (!d) continue;
        if (LINES[k] >= 4) agg.quad += d;
        if (MINI.has(k)) agg.mini += d;
        if (k.includes('tspin')) agg.byLines[Math.min(4, LINES[k])] += d;
      }
      rec.events.push(agg);
    }
    rec.last = now; rec.frame = f;
    rec.type = st.falling && st.falling.type;
  };
  // ---- リプレイ全体の一覧 ----
  // TETR.IO はリプレイを開くと、シーク用の保存を作るために、裏の(画面に出ない)ゲームでリプレイを最初から最後まで計算する。
  // その裏のゲームも同じように見て、「何フレーム目に何を置いたか」の一覧を作っておく(リプレイのデータごと)。
  // 画面のリプレイは、この一覧のうち今のフレームまでの分を数える。どこへ飛ばしても正しい数になる
  const timelines = W.__scTimelines || (W.__scTimelines = new WeakMap());
  // 内部オブジェクトに .esm(フレームを進める係)が入った瞬間にフックを付ける(裏のゲームは作られてすぐ計算が始まるため)
  const esmTrap = Object.getOwnPropertyDescriptor(Object.prototype, 'esm');
  if (esmTrap && esmTrap.set && esmTrap.set.__sc) delete Object.prototype.esm;   // 前の版の受け口は外す
  const esmSet = function (v) {
    Object.defineProperty(this, 'esm', { value: v, writable: true, configurable: true, enumerable: true });
    try { if (this && this.W && this.T && 'Wh' in this && this.gsm) watch(this); } catch (e) {}
  };
  esmSet.__sc = true;
  Object.defineProperty(Object.prototype, 'esm', { configurable: true, enumerable: false, get() { return undefined; }, set: esmSet });
  const headless = n => { try { return !!(n.iom && n.iom.IsHeadless && n.iom.IsHeadless()); } catch (e) { return false; } };
  const replayOf = n => { try { return n.esm && n.esm.replay; } catch (e) { return null; } };
  // 画面の盤面について、数える対象のできごと
  const eventsFor = n => {
    const own = watch(n);
    const rep = replayOf(n);
    const tl = rep && !headless(n) && timelines.get(rep);
    if (!tl || tl === own) return own.events;
    // リプレイ盤面修正で操作中: 止めたフレームまではリプレイの一覧、その先は自分で置いた分
    const rpe = W.__rpe, practice = rpe && rpe.active === n;
    const limit = practice ? rpe.snapFrame : n.esm.frame;
    const list = tl.events.filter(e => e.frame <= limit);
    return practice ? list.concat(own.events.filter(e => e.frame > limit)) : list;
  };

  const tally = events => {
    const c = { spin: 0, spinMini: 0, byLines: [0, 0, 0, 0, 0], byPiece: {}, t: 0, tspin: 0, tmini: 0, quad: 0 };
    for (const e of events) {
      if (e.agg) {
        c.spin += e.spins; c.spinMini += e.mini; c.quad += e.quad;
        e.byLines.forEach((v, i) => { c.byLines[i] += v; });
        continue;
      }
      if (e.type === 't') c.t++;
      if (e.lines >= 4) c.quad++;
      if (!e.spin) continue;
      c.spin++;
      if (e.mini) c.spinMini++;
      c.byLines[Math.min(4, e.lines)]++;
      const p = String(e.type || '?').toUpperCase();
      c.byPiece[p] = (c.byPiece[p] || 0) + 1;
      if (e.type === 't') { c.tspin++; if (e.mini) c.tmini++; }
    }
    return c;
  };

  // ---- 表示する盤面 ----
  const alive = n => { try { const h = n.hm.H.holder; return h && !h._destroyed && h.parent; } catch (e) { return false; } };
  const shown = () => {
    for (let i = games.length - 1; i >= 0; i--) if (!alive(games[i])) { try { games[i].__sc && games[i].__sc.restore(); } catch (e) {} games.splice(i, 1); }
    return games.filter(n => { try { const h = n.hm.H.holder; return h.worldVisible && Math.abs(h.scale ? h.scale.x : 1) > 0.01; } catch (e) { return false; } })
      .sort((a, b) => a.hm.H.holder.worldTransform.tx - b.hm.H.holder.worldTransform.tx);
  };
  const name = n => String((n.gsm.setoptions && n.gsm.setoptions.username) || '?').toUpperCase();

  // ---- パネル ----
  const css = 'position:fixed;z-index:2147483645;font:12px/1.45 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.82);border:1px solid #0085a1;border-radius:6px;';
  const panel = document.createElement('div');
  panel.id = '__scpanel';
  panel.style.cssText = css + 'right:10px;top:60px;padding:8px;display:grid;gap:6px;min-width:190px;max-width:46vw';
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap';
  const btn = (fn) => { const b = document.createElement('button'); b.style.cssText = 'font:inherit;color:#fff;background:#0085a1;border:0;border-radius:4px;padding:3px 6px;cursor:pointer;text-align:left'; b.onclick = e => { e.stopPropagation(); fn(); b.blur(); draw(true); }; return b; };
  const bLines = btn(() => { S.byLines = !S.byLines; });
  const bPiece = btn(() => { S.byPiece = !S.byPiece; });
  const bClose = btn(() => setClosed(true));
  bClose.textContent = 'パネルを閉じる';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  bar.append(bLines, bPiece, bClose);
  const title = document.createElement('div');
  title.textContent = 'スピンカウンター';
  title.style.cssText = 'font-weight:700;color:#7fdcf0';
  panel.append(title, body, bar);
  const mini = document.createElement('div');
  mini.id = '__scmini';
  mini.textContent = 'カウンター';
  mini.style.cssText = css + 'right:10px;top:60px;padding:4px 8px;cursor:pointer;display:none';
  mini.onclick = () => setClosed(false);
  document.body.append(panel, mini);
  const setClosed = c => { S.panelClosed = c; panel.style.display = c ? 'none' : 'grid'; mini.style.display = c ? 'block' : 'none'; };
  // パッチ版: 盤面修正と同じく、TETRA CHANNEL かリプレイで動き始めるまでは表示しない(数えるのは起動時から)
  const shownYet = () => !W.__qpEmbedded || !!W.__qpEditStarted;
  let visible = shownYet();
  if (visible) setClosed(S.panelClosed); else { panel.style.display = 'none'; mini.style.display = 'none'; }

  let lastHtml = '';
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const draw = force => {
    if (!visible) {
      if (!shownYet()) return;
      visible = true; setClosed(S.panelClosed);
    }
    bLines.textContent = 'SPIN の列ごと: ' + (S.byLines ? 'ON' : 'OFF');
    bPiece.textContent = 'ミノごと: ' + (S.byPiece ? 'ON' : 'OFF');
    const list = shown();
    let html;
    if (!list.length) {
      html = '<div style="opacity:.8">ゲームが始まると数えます<br>(このブックマークを押したあとに始まったゲーム・開いたリプレイが対象)</div>';
    } else {
      html = list.map(n => {
        const c = tally(eventsFor(n));
        const rows = [];
        rows.push(`<div style="font-weight:700">${esc(name(n))}</div>`);
        rows.push(`<div>SPIN <b style="font-size:15px">${c.spin}</b>${c.spinMini ? ` <span style="opacity:.75">(MINI ${c.spinMini})</span>` : ''}</div>`);
        if (S.byLines) {
          const L = ['0列', '1列', '2列', '3列', '4列'];
          rows.push(`<div style="opacity:.9;padding-left:8px">${c.byLines.map((v, i) => (i < 4 || v) ? `${L[i]} ${v}` : '').filter(Boolean).join(' / ')}</div>`);
        }
        if (S.byPiece) {
          rows.push(`<div style="opacity:.9;padding-left:8px">${['T', 'S', 'Z', 'L', 'J', 'I', 'O'].map(p => `${p} ${c.byPiece[p] || 0}`).join(' ')}</div>`);
        }
        rows.push(`<div>T-SPIN <b style="font-size:15px">${c.tspin}</b> / ${c.t}${c.t ? ` <span style="opacity:.75">(${Math.round(c.tspin / c.t * 100)}%)</span>` : ''}${c.tmini ? ` <span style="opacity:.75">MINI ${c.tmini}</span>` : ''}</div>`);
        rows.push(`<div>QUAD <b style="font-size:15px">${c.quad}</b></div>`);
        return `<div>${rows.join('')}</div>`;
      }).join('');
    }
    if (force || html !== lastHtml) { body.innerHTML = html; lastHtml = html; }
  };

  // 盤面が出ていない間も、つかまえたゲームは数え続ける(フックはフレームごとに呼ばれる)
  let raf = 0, tick = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    try {
      for (const n of games) if (alive(n)) watch(n);
      if (++tick % 6 === 0) draw(false);   // 表示の更新は 10 回/秒
    } catch (e) { console.warn(TAG, e); }
  };
  raf = requestAnimationFrame(loop);

  W.__scTeardown = upd => {
    cancelAnimationFrame(raf);
    clearInterval(W.__scUpd);
    panel.remove(); mini.remove();
    // フックは外す。記録(n.__sc.events)は残すので、押し直しても数え直さない
    for (const n of games) { try { n.__sc && n.__sc.restore(); } catch (e) {} }
    if (Object.getOwnPropertyDescriptor(Object.prototype, 'esm')?.set === esmSet) delete Object.prototype.esm;
    W.__scTeardown = null;
    return { byLines: S.byLines, byPiece: S.byPiece, panelClosed: upd ? S.panelClosed : false };
  };

  // ---- 自動更新 ----
  const hash = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
  const fetchText = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.text(); };
  let baseHash = null;
  const checkUpdate = async () => {
    try {
      if (baseHash == null) { baseHash = hash(await fetchText(ME || SRC + '?v=' + Date.now())); return; }
      const h = hash(await fetchText(SRC + '?v=' + Date.now()));
      if (h === baseHash) return;
      clearInterval(W.__scUpd);
      const s = document.createElement('script');
      s.src = SRC + '?v=' + Date.now();
      W.__scUpdating = true;
      s.onerror = () => { W.__scUpdating = false; };
      document.head.appendChild(s);
    } catch (e) {}
  };
  clearInterval(W.__scUpd);
  if (!W.__qpEmbedded) {   // パッチ版はパッチと一緒に更新する
    checkUpdate();
    W.__scUpd = setInterval(checkUpdate, 30000);
  }
  console.log(TAG, 'started');
})();
