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
      hist: []            // 直近の回転入力(-1 = 左回転, 1 = 右回転)
    };
    const HIST = 20;

    // ---- 回転入力の読み取り(読むだけ。キーを止めたり書き換えたりはしない) ----
    // TETR.IO のキー設定は localStorage の userConfig.controls にある。
    // style が guideline / wasd のときは既定の割り当て(+ゲームパッド)、custom のときは custom の割り当て。
    const PRESET = {
      guideline: {
        ccw: ['CONTROL', 'CONTROLLEFT', 'Z', 'KEYZ', 'NUMPAD3', 'NUMPAD7', 'BUTTON_0'],
        cw: ['ARROWUP', 'UP', 'X', 'KEYX', 'NUMPAD1', 'NUMPAD5', 'NUMPAD9', 'BUTTON_1']
      },
      wasd: {
        ccw: ['ARROWLEFT', 'LEFT', 'NUMPAD7', 'BUTTON_0'],
        cw: ['ARROWRIGHT', 'RIGHT', 'NUMPAD9', 'BUTTON_1']
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
          b = { ccw: (c.custom.rotateCCW || []).map(String), cw: (c.custom.rotateCW || []).map(String) };
        }
      } catch (e) {}
      binds = { ccw: new Set(b.ccw.map(k => k.toUpperCase())), cw: new Set(b.cw.map(k => k.toUpperCase())) };
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
    const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (W.__spinKey) removeEventListener('keydown', W.__spinKey, true);
    W.__spinKey = e => {
      if (e.repeat || typing(e.target)) return;
      const b = getBinds();
      const ks = [String(e.code || '').toUpperCase(), String(e.key || '').toUpperCase()];
      if (ks.some(k => b.ccw.has(k))) record(-1);
      else if (ks.some(k => b.cw.has(k))) record(1);
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
          if (b.ccw.has(name)) record(-1);
          else if (b.cw.has(name)) record(1);
        });
      }
    };

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
        (S.follow ? `\n直近${HIST}回 左${left}/右${right} → ${S.dir < 0 ? '左' : '右'}回転` : '');
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
