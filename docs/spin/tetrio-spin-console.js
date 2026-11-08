(() => {
  const W = window;

  const startUI = () => {
    if (W.__spinUI) return;
    W.__spinUI = true;
    const S = W.__spin = {
      on: true, sec: 60, dir: 1, angle: null, marker: true, rot: 0,
      group: 'each',      // 'each' = 盤面ごとに自分の中心で回す / 'together' = 全員の中心でまとめて回す
      center: null,       // まとめて回すときの中心(画面座標)
      holders: [],
      v: 1,               // 実際の回転の向き(-1〜1)。dir に向かってなめらかに変わる
      follow: false,      // true = 回転入力の多い方向に回す
      hist: []            // 直近の「実際に回った」回転(-1 = 左回転, 1 = 右回転)
    };
    const HIST = 20;

    // ---- 回転の検出(読むだけ。キー入力・音・ゲームの動きは一切変えない) ----
    // TETR.IO では、回転が成功したとき(壁やブロックに当たって回れなかったときは除く)だけ
    // 効果音 "rotate" が鳴る(ホールド中の先行回転 IRS は "irs")。
    // そこで「回転音が鳴った瞬間」を数え、その直前に押された回転キーの向き(左/右)を割り当てる。
    // ・効果音は1つの音声ファイルにまとまっていて、/sfx/tetrio.*.rsd に音ごとの開始位置が書いてある
    // ・AudioBufferSourceNode.start(時刻, 開始位置, 長さ) の開始位置で、どの音かがわかる
    // ・キー設定は localStorage の userConfig.controls(guideline / wasd / custom + ゲームパッド)
    const PRESET = {
      guideline: {
        ccw: ['CONTROL', 'CONTROLLEFT', 'Z', 'KEYZ', 'NUMPAD3', 'NUMPAD7', 'BUTTON_0'],
        cw: ['ARROWUP', 'UP', 'X', 'KEYX', 'NUMPAD1', 'NUMPAD5', 'NUMPAD9', 'BUTTON_1'],
        r180: ['A', 'KEYA', 'BUTTON_3']
      },
      wasd: {
        ccw: ['ARROWLEFT', 'LEFT', 'NUMPAD7', 'BUTTON_0'],
        cw: ['ARROWRIGHT', 'RIGHT', 'NUMPAD9', 'BUTTON_1'],
        r180: ['ARROWUP', 'UP', 'NUMPAD2', 'BUTTON_3']
      }
    };
    let binds = null, bindsAt = 0;
    const getBinds = () => {
      if (binds && performance.now() - bindsAt < 3000) return binds;
      let b = PRESET.guideline;
      try {
        const c = JSON.parse(localStorage.getItem('userConfig') || '{}').controls || {};
        if (c.style === 'wasd') b = PRESET.wasd;
        else if (c.style === 'custom' && c.custom) {
          const k = n => (c.custom[n] || []).map(String);
          b = { ccw: k('rotateCCW'), cw: k('rotateCW'), r180: k('rotate180') };
        }
      } catch (e) {}
      const set = a => new Set(a.map(k => k.toUpperCase()));
      binds = { ccw: set(b.ccw), cw: set(b.cw), r180: set(b.r180) };
      bindsAt = performance.now();
      return binds;
    };
    const decide = () => {
      if (!S.follow) return;
      let sum = 0;
      for (const x of S.hist) sum += x;
      if (sum !== 0) S.dir = sum > 0 ? 1 : -1;   // 同数なら今の向きのまま
    };
    const record = d => {
      S.hist.push(d);
      if (S.hist.length > HIST) S.hist.shift();
      decide();
    };

    // 押された回転キー(-1 = 左, 1 = 右, 0 = 180°)。音と組み合わせるまで少しの間だけ覚えておく
    const pending = [];
    const press = d => {
      pending.push({ d, t: performance.now() });
      if (pending.length > 8) pending.shift();
    };
    // 回転音が鳴ったら、直前(rotate は 250ms 以内、IRS は 1.5秒以内)の一番新しい回転キーと組み合わせる
    const onSound = name => {
      const now = performance.now(), win = name === 'irs' ? 1500 : 250;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (now - pending[i].t > win) break;
        const { d } = pending.splice(i, 1)[0];
        if (d !== 0) record(d);
        return;
      }
    };

    const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (W.__spinKey) removeEventListener('keydown', W.__spinKey, true);
    W.__spinKey = e => {
      if (e.repeat || typing(e.target)) return;
      const b = getBinds();
      const ks = [String(e.code || '').toUpperCase(), String(e.key || '').toUpperCase()];
      if (ks.some(k => b.ccw.has(k))) press(-1);
      else if (ks.some(k => b.cw.has(k))) press(1);
      else if (ks.some(k => b.r180.has(k))) press(0);
    };
    addEventListener('keydown', W.__spinKey, true);
    const padPrev = new Map();
    const pollPads = () => {
      if (!navigator.getGamepads) return;
      const b = getBinds();
      for (const p of navigator.getGamepads()) {
        if (!p) continue;
        p.buttons.forEach((btn, i) => {
          const k = p.index + ':' + i, down = btn.pressed, was = padPrev.get(k);
          padPrev.set(k, down);
          if (!down || was) return;
          const name = 'BUTTON_' + i;
          if (b.ccw.has(name)) press(-1);
          else if (b.cw.has(name)) press(1);
          else if (b.r180.has(name)) press(0);
        });
      }
    };

    // 効果音の目録(.rsd)を読む。形式: "tRSD", uint32 版, uint32 版, 以降 [float32 開始位置, uint32 名前の長さ, 名前] の繰り返し
    S.sfx = null;          // { rotate: 開始位置, irs: 開始位置 }
    S.sfxError = '';
    const parseRsd = buf => {
      const v = new DataView(buf);
      let o = 0;
      const u8 = () => v.getUint8(o++);
      const u32 = () => { const x = v.getUint32(o, true); o += 4; return x; };
      const f32 = () => { const x = v.getFloat32(o, true); o += 4; return x; };
      if (String.fromCharCode(u8(), u8(), u8(), u8()) !== 'tRSD') throw new Error('rsd header');
      u32(); u32();
      const out = {};
      for (;;) {
        const off = f32(), len = u32();
        let name = '';
        for (let i = 0; i < len; i++) name += String.fromCharCode(u8());
        if (len === 0) break;
        out[name] = off;
      }
      return out;
    };
    const loadSfx = async () => {
      try {
        const url = performance.getEntriesByType('resource').map(e => e.name)
          .find(u => /\/sfx\/tetrio\.[^/?]*\.rsd/.test(u));
        if (!url) throw new Error('効果音の情報が見つかりません');
        const map = parseRsd(await (await fetch(url)).arrayBuffer());
        if (map.rotate == null) throw new Error('回転音が見つかりません');
        S.sfx = { rotate: map.rotate, irs: map.irs };
        S.sfxError = '';
      } catch (e) {
        S.sfxError = String(e.message || e);
        setTimeout(loadSfx, 5000);
      }
    };
    loadSfx();
    // 音が鳴る瞬間を見る(元の start をそのまま呼び、引数も戻り値も変えない)
    if (W.AudioBufferSourceNode && !W.__spinAudio) {
      const proto = AudioBufferSourceNode.prototype, orig = proto.start;
      W.__spinAudio = { orig, listener: null };
      proto.start = function (when, offset) {
        const r = orig.apply(this, arguments);
        try { if (W.__spinAudio.listener) W.__spinAudio.listener(offset); } catch (e) {}
        return r;
      };
    }
    if (W.__spinAudio) {
      const near = (a, b) => typeof a === 'number' && b != null && Math.abs(a - b) < 1e-3;
      W.__spinAudio.listener = offset => {
        if (!S.sfx) return;
        if (near(offset, S.sfx.rotate)) onSound('rotate');
        else if (near(offset, S.sfx.irs)) onSound('irs');
      };
    }

    // 盤面の holder を探す(ソロ・リプレイ・ルームのどれでも、盤面ごとに1つある)。
    // TETR.IO は holder を gSceneBG / gSceneFG に入れ、pivot を
    // (マス幅×横/2, マス幅×縦/2) = 横10×縦20 のプレイ範囲の中心に設定している。
    const findHolders = () => {
      const out = [];
      const walk = (o, depth) => {
        if (!o || !o.children || depth > 6) return;
        if (o.name === 'gSceneBG' || o.name === 'gSceneFG') {
          for (const h of o.children) {
            if (h && !h._destroyed && h.sortableChildren && h.pivot && h.pivot.x > 0 && h.pivot.y > 0) out.push(h);
          }
          return;
        }
        for (const c of o.children) walk(c, depth + 1);
      };
      walk(W.__stage, 0);
      return out;
    };
    const visible = h => !h._destroyed && h.parent && h.worldVisible;
    const angleNow = () => (S.angle != null ? S.angle * Math.PI / 180 : S.rot);
    const active = () => S.on || S.angle != null;

    const attach = h => {
      if (h.__spin) return;
      h.__spin = 1;
      const o = h.updateTransform;
      h.updateTransform = function () {
        if (!active() || !this.parent) return o.call(this);
        const th = angleNow();
        const r = this.rotation, x = this.position.x, y = this.position.y;
        // 盤面の中心(pivot)はゲームの設定のまま。回転だけ足す
        this.rotation = r + th;
        const G = S.group === 'together' ? S.center : null;
        if (G) {
          // まとめて回す: 盤面の中心そのものも、全員の中心 G のまわりで同じ角度だけ回す
          const pw = this.parent.worldTransform;
          const C = pw.apply(this.position);
          const dx = C.x - G.x, dy = C.y - G.y, c = Math.cos(th), s = Math.sin(th);
          const P = pw.applyInverse({ x: G.x + dx * c - dy * s, y: G.y + dx * s + dy * c });
          this.position.set(P.x, P.y);
        }
        o.call(this);
        this.position.set(x, y);
        this.rotation = r;
        this.__spinCenter = this.worldTransform.apply(this.pivot);
      };
    };

    // ゲーム内の座標(renderer.screen 単位)を、ページ上の座標(CSS px)に直す
    const toClient = p => {
      const v = W.__renderer && W.__renderer.view;
      if (!v || !v.getBoundingClientRect) return p;
      const r = v.getBoundingClientRect(), s = W.__renderer.screen;
      return { x: r.left + p.x * r.width / s.width, y: r.top + p.y * r.height / s.height };
    };

    for (const id of ['__spinpanel']) { const e = document.getElementById(id); if (e) e.remove(); }
    document.querySelectorAll('.__spinmk').forEach(e => e.remove());

    const panel = document.createElement('div');
    panel.id = '__spinpanel';
    panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#000c;color:#fff;font:12px sans-serif;padding:8px;border-radius:6px;display:grid;gap:4px;width:220px';
    ['keydown', 'keyup', 'keypress'].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));
    const row = (t, el) => {
      const d = document.createElement('label');
      d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px';
      d.append(t, el);
      panel.append(d);
      return el;
    };
    const range = (t, key, min, max, step) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = min; i.max = max; i.step = step;
      i.value = S[key] == null ? 0 : S[key];
      i.style.width = '110px';
      i.oninput = () => { S[key] = +i.value; };
      return row(t, i);
    };
    const btn = (t, fn) => {
      const b = document.createElement('button');
      b.textContent = t;
      b.onclick = () => fn(b);
      b.style.cssText = 'padding:3px';
      panel.append(b);
      return b;
    };
    const status = document.createElement('div');
    status.style.cssText = 'opacity:.8;white-space:pre-line';
    panel.append(status);
    range('秒/周', 'sec', 2, 120, 1);
    const sa = range('固定角度', 'angle', 0, 360, 1);
    btn('回転 ON/OFF', () => { S.on = !S.on; });
    const followLabel = () => '向き: ' + (S.follow ? '回転入力に合わせる' : '固定(逆回転ボタン)');
    const followBtn = btn(followLabel(), b => {
      S.follow = !S.follow;
      decide(); // 今までの入力から向きを決め直す
      b.textContent = followLabel();
    });
    btn('逆回転', () => { S.follow = false; S.dir *= -1; followBtn.textContent = followLabel(); });
    btn('固定角度を解除', () => { S.angle = null; sa.value = 0; });
    btn('角度を0に戻す', () => { S.rot = 0; S.angle = null; sa.value = 0; });
    const groupLabel = () => '2人以上: ' + (S.group === 'together' ? 'まとめて回す' : 'それぞれ回す');
    btn(groupLabel(), b => { S.group = S.group === 'together' ? 'each' : 'together'; S.center = null; b.textContent = groupLabel(); });
    btn('中心の目印 ON/OFF', () => { S.marker = !S.marker; });
    btn('パネルを閉じる', () => panel.remove());
    document.body.append(panel);

    const marks = [];
    const mark = i => {
      if (!marks[i]) {
        const m = document.createElement('div');
        m.className = '__spinmk';
        m.style.cssText = 'position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:7px;background:red;z-index:2147483646;pointer-events:none;display:none';
        document.body.append(m);
        marks[i] = m;
      }
      return marks[i];
    };
    const place = (i, p) => {
      const m = mark(i);
      if (!p) { m.style.display = 'none'; return; }
      const c = toClient(p);
      m.style.display = 'block';
      m.style.left = c.x + 'px';
      m.style.top = c.y + 'px';
    };

    let last = performance.now();
    let n = 0;
    cancelAnimationFrame(W.__spinRaf);
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      pollPads();
      // 向きが変わったら、約0.5秒かけてなめらかに逆向きへ
      S.v += (S.dir - S.v) * Math.min(1, dt * 4);
      if (S.on) S.rot = (S.rot + S.v * dt * 2 * Math.PI / S.sec) % (2 * Math.PI);
      // holder はゲーム開始・リトライ・ルームの入れ替わりで作り直されるので、ときどき探し直す
      if (n % 30 === 0 || S.holders.some(h => h._destroyed || !h.parent)) {
        let found = [];
        try { found = findHolders(); } catch (e) {}
        if (found.length !== S.holders.length || found.some((h, i) => h !== S.holders[i])) S.center = null;
        S.holders = found;
        S.holders.forEach(attach);
      }
      n++;
      const shown = S.holders.filter(visible);

      // まとめて回すときの中心 = 表示中の盤面の中心(回転前)の平均。
      // 被弾時の揺れで中心が揺れないよう、ゆっくり追いかける
      if (S.group === 'together' && shown.length >= 2) {
        let x = 0, y = 0;
        for (const h of shown) { const c = h.parent.worldTransform.apply(h.position); x += c.x; y += c.y; }
        const t = { x: x / shown.length, y: y / shown.length };
        if (!S.center) S.center = t;
        else { S.center.x += (t.x - S.center.x) * 0.08; S.center.y += (t.y - S.center.y) * 0.08; }
      } else {
        S.center = null;
      }

      const left = S.hist.filter(x => x < 0).length, right = S.hist.length - left;
      status.textContent = (shown.length ? `盤面: ${shown.length}` : '盤面: なし(ゲーム開始を待っています)') +
        (S.follow ? (S.sfx ? `\n直近${HIST}回 左${left}/右${right} → ${S.dir < 0 ? '左' : '右'}回転`
                           : `\n回転音の準備中…${S.sfxError ? '(' + S.sfxError + ')' : ''}`) : '');
      let k = 0;
      if (S.marker) {
        if (S.center) place(k++, S.center);
        else for (const h of shown) if (h.__spinCenter) place(k++, h.__spinCenter);
      }
      for (; k < marks.length; k++) place(k, null);
      W.__spinRaf = requestAnimationFrame(loop);
    };
    loop();
    console.log('[spin] panel started');
  };

  if (W.__stage) {
    startUI();
    return;
  }
  if (W.__spinHooking) {
    console.log('[spin] already waiting for the game to render');
    return;
  }
  W.__spinHooking = true;

  const origCall = Function.prototype.call;
  const origApply = Function.prototype.apply;
  const restore = () => {
    Function.prototype.call = origCall;
    Function.prototype.apply = origApply;
    W.__spinHooking = false;
  };
  const check = t => {
    if (W.__stage) return;
    try {
      if (t && typeof t === 'object' && t.stage && t.renderer &&
          typeof t.renderer.render === 'function' &&
          t.renderer.view && t.renderer.view.id === 'pixi') {
        W.__app = t;
        W.__renderer = t.renderer;
        W.__stage = t.stage;
        restore();
        console.log('[grab] captured app');
        setTimeout(startUI, 0);
      }
    } catch (e) {}
  };
  Function.prototype.call = function (t) {
    check(t);
    return Reflect.apply(origCall, this, arguments);
  };
  Function.prototype.apply = function (t) {
    check(t);
    return Reflect.apply(origApply, this, arguments);
  };
  setTimeout(() => {
    if (!W.__stage) {
      restore();
      console.warn('[spin] could not capture the app within 15s');
    }
  }, 15000);
  console.log('[spin] waiting for the next frame...');
})();
