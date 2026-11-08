// ==UserScript==
// @name         TETR.IO board spin panel
// @match        https://tetr.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  const W = window;
  const K = '_lastObjectRendered';

  const startUI = () => {
    if (W.__spinUI) return;
    W.__spinUI = true;
    const S = W.__spin = W.__spin || {
      on: true, sec: 60, dir: 1, auto: true, ox: 0, oy: 0, cx: 0, cy: 0,
      angle: null, marker: true, rot: 0, ready: false, base: null, cur: null, screen: null,
      path: [3, 2]
    };
    const g = p => p.reduce((o, i) => o.children[i], W.__stage);
    // ゲーム内の座標(renderer.screen 単位)と、ページ上の座標(CSS px)の変換
    const view = () => W.__renderer && W.__renderer.view;
    const toClient = p => {
      const v = view();
      if (!v || !v.getBoundingClientRect) return p;
      const r = v.getBoundingClientRect(), s = W.__renderer.screen;
      return { x: r.left + p.x * r.width / s.width, y: r.top + p.y * r.height / s.height };
    };
    const fromClient = (x, y) => {
      const v = view();
      if (!v || !v.getBoundingClientRect) return { x, y };
      const r = v.getBoundingClientRect(), s = W.__renderer.screen;
      return { x: (x - r.left) * s.width / r.width, y: (y - r.top) * s.height / r.height };
    };
    const attach = c => {
      if (c.__w) return;
      c.__w = 1;
      const o = c.updateTransform;
      c.updateTransform = function () {
        if (!S.on || !S.ready || !S.cur || S.measuring) return o.call(this);
        const cx = S.cur.cx, cy = S.cur.cy;
        const px = this.pivot.x, py = this.pivot.y;
        const x = this.position.x, y = this.position.y, r = this.rotation;
        this.pivot.set(cx, cy);
        this.position.set(x + (cx - px) * this.scale.x, y + (cy - py) * this.scale.y);
        this.rotation = S.angle != null ? S.angle * Math.PI / 180 : S.rot;
        o.call(this);
        S.screen = this.worldTransform.apply({ x: cx, y: cy });
        this.pivot.set(px, py);
        this.position.set(x, y);
        this.rotation = r;
      };
    };

    const old = document.getElementById('__spinpanel');
    if (old) old.remove();
    const oldMk = document.getElementById('__spinmk');
    if (oldMk) oldMk.remove();

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
    range('秒/周', 'sec', 2, 120, 1);
    const sx = range('X補正', 'ox', -400, 400, 1);
    const sy = range('Y補正', 'oy', -400, 400, 1);
    range('固定角度', 'angle', 0, 360, 1);
    btn('回転 ON/OFF', () => { S.on = !S.on; });
    btn('逆回転', () => { S.dir *= -1; });
    btn('固定角度を解除', () => { S.angle = null; });
    btn('中心をクリックで指定', () => {
      if (document.getElementById('__spinpick')) return;
      const ov = document.createElement('div');
      ov.id = '__spinpick';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:#0003;color:#fff;font:bold 18px sans-serif;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;text-shadow:0 0 4px #000';
      ov.textContent = '回転の中心にしたい場所をクリック(Esc で中止)';
      const done = () => { ov.remove(); document.removeEventListener('keydown', esc, true); };
      const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } };
      ov.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        try {
          // 表示中(回転込み)の変換の逆変換で、クリック位置を盤面側の座標に直す
          const p = g(S.path).worldTransform.applyInverse(fromClient(e.clientX, e.clientY));
          S.cx = p.x; S.cy = p.y; S.auto = false;
          S.ox = S.oy = 0; sx.value = sy.value = 0;
          S.base = { cx: p.x, cy: p.y };
        } catch (err) { console.warn('[spin] center pick failed', err); }
        done();
      });
      document.addEventListener('keydown', esc, true);
      document.body.append(ov);
    });
    btn('中心を自動に戻す', () => { S.auto = true; S.base = null; });
    btn('中心の目印 ON/OFF', () => { S.marker = !S.marker; });
    btn('パネルを閉じる', () => panel.remove());
    document.body.append(panel);

    const mk = document.createElement('div');
    mk.id = '__spinmk';
    mk.style.cssText = 'position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:7px;background:red;z-index:2147483646;pointer-events:none';
    document.body.append(mk);

    let last = performance.now();
    let n = 0;
    cancelAnimationFrame(S.id);
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (S.on) S.rot += S.dir * dt * 2 * Math.PI / S.sec;
      try {
        attach(g(S.path));
        if (!S.base || Math.floor(n / 10) * 10 === n) {
          if (S.auto) {
            // 部品ごとの中心の平均ではなく、全体を囲む枠の中心を使う
            // (HOLD と NEXT が左右にあるので、盤面の中心に近くなる)
            S.measuring = true;
            let l;
            try { l = g(S.path).getLocalBounds(); } finally { S.measuring = false; }
            if (!(l.width > 0 && l.height > 0)) throw new Error('no board');
            S.base = { cx: l.x + l.width / 2, cy: l.y + l.height / 2 };
          } else {
            S.base = { cx: S.cx, cy: S.cy };
          }
        }
        S.cur = { cx: S.base.cx + S.ox, cy: S.base.cy + S.oy };
        S.ready = true;
      } catch (e) {
        S.ready = false;
      }
      n++;
      mk.style.display = S.marker && S.screen ? 'block' : 'none';
      if (S.screen) {
        const p = toClient(S.screen);
        mk.style.left = p.x + 'px';
        mk.style.top = p.y + 'px';
      }
      S.id = requestAnimationFrame(loop);
    };
    loop();
    console.log('[spin] panel started');
  };

  if (W.__hooked) return;
  W.__hooked = true;
  W.__stage = null;

  Object.defineProperty(Object.prototype, K, {
    configurable: true,
    get() { return undefined; },
    set(init) {
      let c = init;
      Object.defineProperty(this, K, {
        configurable: true,
        enumerable: true,
        get() { return c; },
        set: v => {
          c = v;
          if (v && v.children && typeof this.render === 'function' && !W.__stage) {
            W.__renderer = this;
            W.__stage = v;
            console.log('[grab] captured');
          }
        }
      });
    }
  });

  W.__spinTimer = setInterval(() => {
    if (W.__stage && document.body && document.readyState !== 'loading') {
      clearInterval(W.__spinTimer);
      startUI();
    }
  }, 300);
})();
