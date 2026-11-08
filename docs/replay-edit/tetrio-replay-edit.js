// TETR.IO リプレイ盤面修正
// リプレイを一時停止すると、その場面の盤面・操作中のミノ・HOLD・NEXT のまま自分で操作できる。
// 再生ボタンを押す(またはシークする)と、止めたときの状態に戻してからリプレイが続く。
// ・使えるのはリプレイの中だけ。対戦中やルームの盤面には何もしない
// ・操作中の火力は表示するが、相手の盤面には送らない(相手のゲームは止まったまま進めない)
// ・操作中は、キー設定で使っているキーを TETR.IO のリプレイ操作(左右キーでのシークなど)に渡さない
(() => {
  const W = window;
  const SRC = 'https://kei1215.github.io/tetrio-hub/replay-edit/tetrio-replay-edit.js';
  const ME = document.currentScript && document.currentScript.src;
  const TAG = '[replay-edit]';

  const updated = !!W.__rpeUpdating;
  W.__rpeUpdating = false;
  const keep = (W.__rpeTeardown && W.__rpeTeardown(updated)) || {};

  // ---- ゲームをつかまえる ----
  // TETR.IO はリプレイを開くたびに、ゲームごとの内部オブジェクトを作り、そこへ .gsm(盤面などの状態)を入れる。
  // Object.prototype に gsm の受け口を置いておくと、そのときに内部オブジェクトを受け取れる。
  // 受け取ったら、そのオブジェクト自身に普通のプロパティとして入れ直す(ゲームの動きは変わらない)
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

  // ---- キー設定(TETR.IO と同じ表) ----
  const PRESET = {
    guideline: { moveLeft: ['ARROWLEFT', 'LEFT', 'NUMPAD4'], moveRight: ['ARROWRIGHT', 'RIGHT', 'NUMPAD6'], softDrop: ['ARROWDOWN', 'DOWN', 'NUMPAD2'], hardDrop: ['SPACE', 'NUMPAD8'], rotateCCW: ['CONTROL', 'CONTROLLEFT', 'Z', 'KEYZ', 'NUMPAD3', 'NUMPAD7'], rotateCW: ['ARROWUP', 'UP', 'X', 'KEYX', 'NUMPAD1', 'NUMPAD5', 'NUMPAD9'], rotate180: ['A', 'KEYA'], hold: ['SHIFT', 'SHIFTLEFT', 'C', 'KEYC', 'NUMPAD0'], retry: ['R', 'KEYR'] },
    wasd: { moveLeft: ['A', 'KEYA', 'NUMPAD4'], moveRight: ['D', 'KEYD', 'NUMPAD6'], softDrop: ['W', 'KEYW', 'NUMPAD8'], hardDrop: ['S', 'KEYS', 'NUMPAD5'], rotateCCW: ['ARROWLEFT', 'LEFT', 'NUMPAD7'], rotateCW: ['ARROWRIGHT', 'RIGHT', 'NUMPAD9'], rotate180: ['ARROWUP', 'UP', 'NUMPAD2'], hold: ['SHIFT', 'SHIFTLEFT', 'NUMPADENTER'], retry: ['R', 'KEYR'] }
  };
  const ACTIONS = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotateCCW', 'rotateCW', 'rotate180', 'hold', 'retry'];
  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const config = () => { try { return JSON.parse(localStorage.getItem('userConfig') || '{}'); } catch (e) { return {}; } };
  let binds = null, bindsAt = 0;
  const getBinds = () => {
    if (binds && performance.now() - bindsAt < 3000) return binds;
    const c = config().controls || {};
    let b = PRESET.guideline;
    if (c.style === 'wasd') b = PRESET.wasd;
    else if (c.style === 'custom' && c.custom) { b = {}; for (const a of ACTIONS) b[a] = (c.custom[a] || []).map(String); }
    binds = new Map();
    for (const a of ACTIONS) for (const k of b[a] || []) binds.set(String(k).toUpperCase(), a);
    bindsAt = performance.now();
    return binds;
  };
  // TETR.IO と同じキー名の作り方(e.code を大文字に)
  const keyName = e => e.code ? e.code.toUpperCase() : e.key ? (e.key === ' ' ? 'SPACE' : e.location === 3 ? 'NUMPAD' + e.key.toUpperCase() : e.key.toUpperCase()) : '';
  const actionOf = e => { const b = getBinds(); return b.get(keyName(e)) || b.get(String(e.key || '').toUpperCase()) || null; };

  // ---- 状態 ----
  const S = W.__rpe = {
    auto: keep.auto ?? true,     // 一時停止したら自動で操作できるようにする
    noGravity: keep.noGravity ?? false,
    swap: keep.swap ?? false,
    counter: keep.counter ?? true,   // スピンカウンター(SPIN・T-SPIN・QUAD)も出す    // 2人のリプレイで、左右のプレイヤーの位置を入れ替える(見た目だけ)   // 操作中の重力をなくす(ハードドロップ・ソフトドロップでだけ落ちる)
    side: keep.side ?? 0,        // 操作する盤面(左から何番目か)
    panelClosed: updated ? !!keep.panelClosed : false,
    active: null,                // 操作中のゲーム
    msg: '',
    attack: 0, lines: 0, pieces: 0
  };
  let snap = null;               // 止めたときの状態(TETR.IO の EjectState)
  let snapFrame = 0, base = null;
  let queue = [];                // ゲームに入れるキー操作
  const held = new Set();
  const patches = [];            // 元に戻す処理
  let acc = 0, last = 0;
  // 1手戻す(Ctrl+Z)用: ミノを置くたびに、次のミノが出た時点の状態を積む。undo[0] は止めた場面
  let undo = [], redo = [], placed = 0;
  let deadAt = 0;                // 自滅した時刻(0 = していない)
  let stepping = false;          // このスクリプトがゲームを1フレーム進めている最中か
  let preClear = null;           // ライン消去の直前の盤面(置いたミノとそろったラインが見える)

  const alive = n => { try { const h = n.hm.H.holder; return h && !h._destroyed && h.parent; } catch (e) { return false; } };
  const shown = () => {
    for (let i = games.length - 1; i >= 0; i--) if (!alive(games[i])) games.splice(i, 1);
    return games.filter(n => { try { return n.esm.IsReplay() && n.hm.H.holder.worldVisible; } catch (e) { return false; } })
      .sort((a, b) => a.hm.H.holder.worldTransform.tx - b.hm.H.holder.worldTransform.tx);
  };
  const paused = n => n.lm.H.playbackSpeed === 0;
  const name = n => String(n.gsm.setoptions.username || '?').toUpperCase();
  const clone = o => structuredClone(o);

  const unfocus = () => {
    const a = document.activeElement;
    if (a && a !== document.body && !typing(a) && a.blur) a.blur();
  };

  // ---- 操作モード ----
  const enter = n => {
    if (S.active) return;
    try {
      snap = n.siom.EjectState();
    } catch (e) { S.msg = '状態を保存できませんでした'; return; }
    snapFrame = n.esm.frame;
    const st = n.gsm.stats;
    base = { attack: st.garbage.attack || 0, lines: st.lines || 0, pieces: st.piecesplaced || 0 };
    S.active = n;
    queue = []; held.clear(); acc = 0; last = performance.now(); deadAt = 0;
    undo = [{ state: snap, frame: snapFrame }]; redo = []; placed = st.piecesplaced || 0;
    const esm = n.esm, elm = n.elm, H = n.lm.H, siom = n.siom;
    // 1) ゲームへの入力: リプレイの記録の代わりに、自分のキー操作を流す
    esm.Pull = function () {
      const f = this._frame, now = queue.filter(e => e.frame <= f);
      queue = queue.filter(e => e.frame > f);
      for (const e of now) this.Emit({ ...e, frame: f });
    };
    esm.IsFinished = () => false;
    patches.push(() => { delete esm.Pull; delete esm.IsFinished; });
    // 2) リプレイ画面への通知(シークバーの位置・終了)を止める。操作中にシークバーは動かない
    const emit0 = elm.emit;
    // (止めるのは、このスクリプトがゲームを進めている最中だけ。リプレイを閉じるときの通知は通す)
    elm.emit = function (type, ...a) { if (stepping && (type === 'frame' || type === 'end' || type === 'start')) return undefined; return emit0.call(this, type, ...a); };
    patches.push(() => { elm.emit = emit0; });
    // 3) 再生・シークを見張る: 押されたら、ゲームが動き出す前に止めたときの状態へ戻す
    let spd = H.playbackSpeed;
    Object.defineProperty(H, 'playbackSpeed', {
      configurable: true, enumerable: true, get() { return spd; },
      set(v) { if (v > 0 && S.active === n) { leave(true); H.playbackSpeed = v; return; } spd = v; }
    });
    patches.push(() => { delete H.playbackSpeed; H.playbackSpeed = spd; });
    const inject0 = siom.InjectState;
    siom.InjectState = function (...a) { if (S.active === n) leave(false); return inject0.apply(this, a); };
    patches.push(() => { siom.InjectState = inject0; });
    // 4') 自分の操作で自滅したとき(ゲームを進めている最中)だけ、ゲームオーバーの処理を走らせない。
    //     走ると、リプレイ画面がもう片方の盤面を消すなどしてしまう。代わりに盤面をその場で止め、
    //     少ししてから自滅したミノを置く前に戻す。
    //     それ以外(操作中のままリプレイを閉じたときの終了処理など)は、止めた場面に戻してから
    //     そのまま TETR.IO の処理を走らせる。止めると盤面の描画が残ってしまう
    const gom = n.gom, over0 = gom.GameOver;
    gom.GameOver = function (...a) {
      if (S.active === n && stepping) { if (!deadAt) deadAt = performance.now(); return; }
      if (S.active === n) leave(true);
      return over0.apply(this, a);
    };
    patches.push(() => { gom.GameOver = over0; });
    // 4'') ライン消去の直前の盤面を写しておく(fumen で「置いた所 → 消えた後」の順にページを出すため)
    const bm = n.bm, full0 = bm.GetFullLines;
    bm.GetFullLines = function (...a) {
      const r = full0.apply(this, a);
      if (stepping && r && r.length) preClear = n.gsm.board.map(row => row.slice());
      return r;
    };
    patches.push(() => { bm.GetFullLines = full0; });
    // 5) 重力なし: 落下の計算に使う重力を 0 にする(ソフトドロップ・ハードドロップは効く)
    const fm = n.fm;
    fm.GetEffectiveGravity = function (...a) { return S.noGravity ? 0 : Object.getPrototypeOf(this).GetEffectiveGravity.apply(this, a); };
    patches.push(() => { delete fm.GetEffectiveGravity; });
    // 4) 記録しない・自分のハンドリング(DAS/ARR/SDF)で動かす。どちらも戻すときに元へ戻る
    n.gsm.setoptions.noreplay = true;
    const hd = config().handling;
    if (hd && typeof hd === 'object') Object.assign(n.gsm.handling, hd);
    syncKeys(n);
    // 再生ボタンなどにフォーカスが残っていると、スペース(ハードドロップ)でそのボタンが押されてしまうので外す
    unfocus();
    S.msg = '';
    console.log(TAG, 'play', name(n), 'frame', snapFrame);
  };

  const leave = restore => {
    const n = S.active;
    if (!n) return;
    S.active = null;
    while (patches.length) { try { patches.pop()(); } catch (e) { console.warn(TAG, e); } }
    if (restore && snap) {
      try { n.siom.InjectState(clone(snap)); n.esm.Seek(snapFrame); } catch (e) { console.warn(TAG, 'restore failed', e); }
    }
    queue = []; held.clear();
    console.log(TAG, restore ? 'restored' : 'left (seek)');
  };

  // 左右・ソフトドロップの「押しっぱなし」を、いま実際に押しているキーに合わせる。
  // TETR.IO の状態の復元は押しっぱなしの情報(lShift / rShift / inputSoftdrop)まで戻すので、
  // 戻した先(またはリプレイの元のプレイヤー)が押していたキーが、離していても長押し扱いで残ってしまう。
  // 押していないキーは「離した」、押しているキーは「押した」を入れ直す(押していれば DAS がそのまま続く)。
  // 回転などは押し直さない(Ctrl+Z の Ctrl が左回転のキーでも、戻した後に回らない)
  const syncKeys = n => {
    const b = getBinds();
    for (const a of ['moveLeft', 'moveRight', 'softDrop']) {
      const down = [...held].some(k => b.get(k) === a);
      queue.push({ frame: n.esm.frame, type: down ? 'keydown' : 'keyup', data: { key: a, subframe: 0 } });
    }
  };

  // 保存した状態へ移る(操作モードのまま)
  const jump = u => {
    const n = S.active;
    if (!n || !u) return;
    S.active = null;   // InjectState の見張りに「シークした」と思わせない
    try { n.siom.InjectState.call(n.siom, clone(u.state)); n.esm.Seek(u.frame); } catch (e) { console.warn(TAG, 'jump failed', e); }
    S.active = n;
    n.gsm.setoptions.noreplay = true;
    const hd = config().handling;
    if (hd && typeof hd === 'object') Object.assign(n.gsm.handling, hd);
    placed = n.gsm.stats.piecesplaced || 0;
    deadAt = 0; acc = 0; queue = [];
    syncKeys(n);
  };
  // R(リトライのキー): 止めた場面からやり直す
  const retry = () => {
    if (!S.active) return;
    jump(undo[0]); undo = undo.slice(0, 1); redo = [];
    S.msg = '止めた場面に戻しました';
  };
  // Ctrl+Z: 最後に置いたミノを取り消す / Ctrl+Y: 取り消したミノを置き直す
  const undoOne = () => {
    if (!S.active) return;
    if (undo.length > 1) redo.push(undo.pop());
    jump(undo[undo.length - 1]);
    S.msg = undo.length > 1 ? `1手戻しました(あと${undo.length - 1}手戻せます)` : '止めた場面です';
  };
  const redoOne = () => {
    if (!S.active || !redo.length) return;
    const u = redo.pop();
    undo.push(u); jump(u);
    S.msg = '1手進めました';
  };

  // ---- キー入力 ----
  const onKey = e => {
    const n = S.active;
    if (!n || typing(e.target)) return;
    // Ctrl+Z / Ctrl+Y(Mac は ⌘ でも)
    if ((e.ctrlKey || e.metaKey) && /^(KEYZ|KEYY)$/.test(keyName(e))) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown' && !e.repeat) (keyName(e) === 'KEYZ' && !e.shiftKey ? undoOne : redoOne)();
      return;
    }
    const a = actionOf(e);
    if (!a) return;
    // TETR.IO のリプレイ操作(左右キーのシークなど)へ渡さない
    e.preventDefault();
    e.stopImmediatePropagation();
    unfocus();
    const k = keyName(e);
    if (e.type === 'keypress') return;
    if (e.type === 'keydown') {
      if (held.has(k)) return;
      held.add(k);
      if (a === 'retry') return retry();
      queue.push({ frame: n.esm.frame, type: 'keydown', data: { key: a, subframe: 0 } });
    } else {
      if (!held.delete(k)) return;
      if (a === 'retry') return;
      queue.push({ frame: n.esm.frame, type: 'keyup', data: { key: a, subframe: 0 } });
    }
  };
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKey, true);
  addEventListener('keypress', onKey, true);
  const onBlur = () => {
    const n = S.active;
    if (!n) return held.clear();
    for (const k of held) { const a = getBinds().get(k); if (a && a !== 'retry') queue.push({ frame: n.esm.frame, type: 'keyup', data: { key: a, subframe: 0 } }); }
    held.clear();
  };
  addEventListener('blur', onBlur);

  // ---- fumen(https://fumen.zui.jp/)に書き出す ----
  // 操作中: 1ページ目 = 止めた場面、2ページ目から = ミノを1つ置くごとの地形(1ミノ1ページ)。
  //         Ctrl+Z で取り消したミノは入らない(今の流れだけ)
  // 操作していないとき: 今の盤面を1ページで
  const FUMEN_PIECE = { i: 1, l: 2, o: 3, z: 4, t: 5, j: 6, s: 7, gb: 8, gbd: 8 };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // TETR.IO の盤面(上から40行)→ fumen のマス(上から23行 + せり上がり用の空の1行 = 240マス)
  const cellsOf = rows => {
    const cells = [];
    for (let y = 22; y >= 0; y--) {
      const row = rows[rows.length - 1 - y] || [];
      for (let x = 0; x < 10; x++) cells.push(FUMEN_PIECE[row[x]] || 0);
    }
    for (let x = 0; x < 10; x++) cells.push(0);
    return cells;
  };
  // boards: 盤面の配列({ board } でも可)。
  // fumen は次のページへ進むとき、そろったラインを必ず消す。なので「消える前」のページの次は、
  // fumen が消した後の地形からの差を書く(消えた後の地形がそのまま出る)
  // fumen がページを進めるときと同じく、そろった行(上23行のうち)を消して上を詰める
  const clearFull = cells => {
    const rows = [];
    for (let r = 0; r < 23; r++) rows.push(cells.slice(r * 10, r * 10 + 10));
    const kept = rows.filter(row => !row.every(c => c !== 0));
    while (kept.length < 23) kept.unshift(new Array(10).fill(0));
    return [].concat(...kept, cells.slice(230));
  };
  const fumenOfBoards = boards => {
    const out = [];
    const put = (v, len) => { for (let i = 0; i < len; i++) { out.push(B64[v % 64]); v = Math.floor(v / 64); } };
    const list = boards.map(b => Array.isArray(b) ? { board: b } : b);
    const pages = list.map(b => cellsOf(b.board));
    let prev = new Array(240).fill(0), skip = 0;
    const same = (a, b) => a.every((c, i) => c === b[i]);
    pages.forEach((cells, p) => {
      if (skip > 0) skip--;
      else {
        // 前のページとの差を、同じ値の続きでまとめて書く
        let d0 = cells[0] - prev[0] + 8, count = 1;
        for (let i = 1; i <= 240; i++) {
          const d = i < 240 ? cells[i] - prev[i] + 8 : -1;
          if (d === d0) { count++; continue; }
          put(d0 * 240 + (count - 1), 2);
          d0 = d; count = 1;
        }
        // 前のページと同じ地形なら、続けて同じ地形のページ数を書き、そのページの地形は省く
        if (same(cells, prev)) {
          let k = 0;
          while (p + 1 + k < pages.length && k < 63 && same(pages[p + 1 + k], cells)) k++;
          put(k, 1); skip = k;
        }
      }
      // ミノなしのページ(色付きは1ページ目だけ・コメントなし)
      let v = 0;
      v = v * 2 + 0;               // せり上がりなし
      v = v * 2 + 0;               // 反転なし
      v = v * 2 + (p === 0 ? 1 : 0); // 色付き
      v = v * 2 + 0;               // コメントなし
      v = v * 2 + 0;               // ロック
      v = v * 240; v = v * 4; v = v * 8;
      put(v, 3);
      prev = clearFull(cells);
    });
    const str = out.join('');
    let r = str.slice(0, 42);
    for (let i = 42; i < str.length; i += 47) r += '?' + str.slice(i, i + 47);
    return 'v115@' + r;
  };
  const fumenOf = n => fumenOfBoards([n.gsm.board]);
  // 操作中の流れ(止めた場面 + 置いたミノごと)
  // ラインを消したミノは「置いた所(消える前)」→「消えた後」の2ページ
  const fumenOfEdit = () => {
    const pages = [];
    undo.forEach((u, i) => {
      if (i > 0 && u.pre) pages.push({ board: u.pre, keep: true });
      pages.push({ board: u.state.game.board });
    });
    return fumenOfBoards(pages);
  };
  S.fumen = n => S.active && !n ? fumenOfEdit() : fumenOf(n || shown()[0]);
  S.fumenBoards = fumenOfBoards;

  // ---- パネル ----
  const css = 'position:fixed;z-index:2147483646;font:12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.82);border:1px solid #0085a1;border-radius:6px;';
  const panel = document.createElement('div');
  panel.id = '__rpepanel';
  panel.style.cssText = css + 'left:10px;top:60px;padding:8px;display:grid;gap:5px;width:220px';
  const status = document.createElement('div');
  status.style.whiteSpace = 'pre-line';
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:inherit;color:#fff;background:#0085a1;border:0;border-radius:4px;padding:4px 6px;cursor:pointer;text-align:left'; b.onclick = e => { e.stopPropagation(); fn(b); b.blur(); }; return b; };
  const bAuto = btn('', () => { S.auto = !S.auto; if (!S.auto) leave(true); draw(); });
  const bSide = btn('', () => { S.side++; if (S.active) leave(true); draw(); });
  const bSwap = btn('', () => { S.swap = !S.swap; draw(); });
  const bCounter = btn('', () => { S.counter = !S.counter; S.counter ? startCounter() : stopCounter(); draw(); });
  const bGrav = btn('', () => { S.noGravity = !S.noGravity; draw(); });
  const bReset = btn('止めた場面からやり直す(R)', () => retry());
  const bFumen = btn('', () => {
    let code;
    if (S.active) code = fumenOfEdit();
    else {
      const list = shown();
      const n = list[S.side % Math.max(1, list.length)];
      if (!n) { S.msg = 'リプレイの盤面がありません'; return; }
      code = fumenOf(n);
    }
    window.open('https://fumen.zui.jp/?' + code, '_blank', 'noopener');
  });
  const bClose = btn('パネルを閉じる', () => setClosed(true));
  panel.append(status, bAuto, bSide, bSwap, bGrav, bReset, bFumen, bCounter, bClose);
  const mini = document.createElement('div');
  mini.id = '__rpemini';
  mini.textContent = '盤面修正';
  mini.style.cssText = css + 'left:10px;top:60px;padding:4px 8px;cursor:pointer;display:none';
  mini.onclick = () => setClosed(false);
  document.body.append(panel, mini);
  const setClosed = c => { S.panelClosed = c; panel.style.display = c ? 'none' : 'grid'; mini.style.display = c ? 'block' : 'none'; };
  setClosed(S.panelClosed);
  if (updated) S.msg = '最新版に更新しました';

  const draw = () => {
    const list = shown();
    bAuto.textContent = '止めたら操作: ' + (S.auto ? 'ON' : 'OFF');
    bGrav.textContent = '重力: ' + (S.noGravity ? 'なし' : 'あり');
    bSwap.textContent = '2人の左右を入れ替え: ' + (S.swap ? 'ON' : 'OFF');
    bCounter.textContent = 'スピンカウンター: ' + (S.counter ? 'ON' : 'OFF');
    bFumen.textContent = S.active ? `fumen に書き出す(止めた場面 + ${undo.length - 1}ミノ)` : 'fumen で今の盤面を開く';
    const tgt = list.length ? list[S.side % list.length] : null;
    bSide.textContent = '操作する盤面: ' + (tgt ? name(tgt) : '-') + (list.length > 1 ? '(押すと切り替え)' : '');
    let t;
    if (S.active) {
      const st = S.active.gsm.stats;
      S.attack = (st.garbage.attack || 0) - base.attack;
      S.lines = (st.lines || 0) - base.lines;
      S.pieces = (st.piecesplaced || 0) - base.pieces;
      t = `操作中: ${name(S.active)}\n火力 ${S.attack}(相手には送りません)\nライン ${S.lines} / ミノ ${S.pieces}\nCtrl+Z 1手戻す / Ctrl+Y 進める / R 最初から\n再生ボタンで元の場面に戻ります`;
    } else if (!list.length) {
      t = games.length ? 'リプレイを開くと使えます' : 'リプレイを開くと使えます\n(このブックマークを押したあとに開いたリプレイが対象。開いていたら開き直してください)';
    } else t = `リプレイ: ${list.length}人\n一時停止すると操作できます`;
    status.textContent = 'リプレイ盤面修正\n' + t + (S.msg ? '\n' + S.msg : '');
  };

  // ---- 2人の左右の入れ替え(見た目だけ) ----
  // TETR.IO は2人のリプレイで、盤面の位置を holderstate の ox / oy / os(左 -0.35・右 0.45 など)で決め、
  // 表示の位置(cox など)がそこへなめらかに寄っていく。入れ替えるときは2人の ox / oy / os を交換する。
  // TETR.IO が位置を置き直したとき(ラウンドが変わったときなど)は、それを新しい元の位置として入れ替え直す
  const POS = ['ox', 'oy', 'os'];
  const applySwap = list => {
    const pair = games.filter(g => list.includes(g));   // 作られた順(左の人が先)
    if (pair.length !== 2) return;
    for (const g of pair) {
      const hs = g.hm.H.holderstate;
      if (!g.__rpeSet || POS.some(k => hs[k] !== g.__rpeSet[k])) g.__rpeOrig = { ox: hs.ox, oy: hs.oy, os: hs.os };
    }
    pair.forEach((g, i) => {
      const want = S.swap ? pair[1 - i].__rpeOrig : g.__rpeOrig;
      const hs = g.hm.H.holderstate;
      if (POS.some(k => hs[k] !== want[k])) { for (const k of POS) hs[k] = want[k]; }
      g.__rpeSet = { ox: hs.ox, oy: hs.oy, os: hs.os };
    });
  };
  const unswapAll = () => {
    for (const g of games) {
      if (!g.__rpeOrig) continue;
      try { const hs = g.hm.H.holderstate; for (const k of POS) hs[k] = g.__rpeOrig[k]; } catch (e) {}
      delete g.__rpeOrig; delete g.__rpeSet;
    }
  };

  // ---- スピンカウンター ----
  // 同じブックマークで、スピンカウンター(counter/tetrio-spin-counter.js)も起動する。
  // ゲームのつかまえ方(gsm の受け口・W.__rpeGames)は共通。止めても数えた回数は残る
  const COUNTER = SRC.replace('replay-edit/tetrio-replay-edit.js', 'counter/tetrio-spin-counter.js');
  const startCounter = () => {
    if (W.__scTeardown || W.__scLoading) return;
    W.__scLoading = true;
    const s = document.createElement('script');
    s.src = COUNTER + '?v=' + Date.now();
    s.onload = s.onerror = () => { W.__scLoading = false; };
    document.head.appendChild(s);
  };
  const stopCounter = () => { if (W.__scTeardown) W.__scTeardown(false); };
  if (S.counter) startCounter();

  // ---- 毎フレーム ----
  let raf = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    try {
      const list = shown();
      applySwap(list);
      if (S.active && (!alive(S.active) || !list.includes(S.active))) leave(false);
      if (!S.active && S.auto && list.length) {
        const n = list[S.side % list.length];
        if (paused(n) && n.gsm.started && n.gsm.playing) enter(n);
      }
      const n = S.active;
      if (n) {
        // 60 フレーム/秒でゲームを進める(一時停止中なので TETR.IO 自身は進めない)
        acc += Math.min(100, now - last) / 1000;
        let steps = 0;
        while (!deadAt && acc >= 1 / 60 && steps < 6) {
          acc -= 1 / 60; steps++;
          stepping = true; preClear = null;
          try { n.lm.Update(); } finally { stepping = false; }
          const p = n.gsm.stats.piecesplaced || 0;
          if (p !== placed && !deadAt) {
            // ミノを置いた: 次のミノが出たこの時点を、1手戻す先として積む
            placed = p;
            try { undo.push({ state: n.siom.EjectState(), frame: n.esm.frame, pre: preClear }); } catch (e) {}
            if (undo.length > 300) undo.splice(1, 1);
            redo = [];
          }
        }
        if (deadAt) {
          acc = 0;
          S.msg = '自滅しました。置く前に戻します';
          // 少し見せてから、自滅したミノを置く前へ戻す
          if (now - deadAt > 900) {
            const top = undo[undo.length - 1];
            if (undo.length > 1 && n.esm.frame - top.frame <= 2) undo.pop();   // 置いた直後に自滅したら、その置いた後の状態は使わない
            jump(undo[undo.length - 1]);
            S.msg = '自滅したので、置く前に戻しました';
          }
        }
      }
      last = now;
      draw();
    } catch (e) { console.warn(TAG, e); last = now; }
  };
  raf = requestAnimationFrame(loop);

  // ---- 片付け(押し直し・自動更新のとき) ----
  W.__rpeTeardown = upd => {
    leave(true);
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    removeEventListener('keypress', onKey, true);
    removeEventListener('blur', onBlur);
    clearInterval(W.__rpeUpd);
    panel.remove(); mini.remove();
    W.__rpeTeardown = null;
    unswapAll();
    return { auto: S.auto, side: S.side, noGravity: S.noGravity, swap: S.swap, counter: S.counter, panelClosed: upd ? S.panelClosed : false };
  };

  // ---- 自動更新(操作中は待つ) ----
  const hash = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
  const fetchText = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.text(); };
  let baseHash = null;
  const checkUpdate = async () => {
    try {
      if (baseHash == null) { baseHash = hash(await fetchText(ME || SRC + '?v=' + Date.now())); return; }
      if (S.active) return;
      const h = hash(await fetchText(SRC + '?v=' + Date.now()));
      if (h === baseHash) return;
      clearInterval(W.__rpeUpd);
      const s = document.createElement('script');
      s.src = SRC + '?v=' + Date.now();
      W.__rpeUpdating = true;
      s.onerror = () => { W.__rpeUpdating = false; };
      document.head.appendChild(s);
    } catch (e) {}
  };
  clearInterval(W.__rpeUpd);
  checkUpdate();
  W.__rpeUpd = setInterval(checkUpdate, 30000);
  console.log(TAG, 'started');
})();
