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
    const center = b => {
      const l = b.getLocalBounds();
      return {
        x: b.x + (l.x + l.width / 2 - b.pivot.x) * b.scale.x,
        y: b.y + (l.y + l.height / 2 - b.pivot.y) * b.scale.y
      };
    };
    const attach = c => {
      if (c.__w) return;
      c.__w = 1;
      const o = c.updateTransform;
      c.updateTransform = function () {
        if (!S.on || !S.ready || !S.cur) return o.call(this);
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
    range('X補正', 'ox', -400, 400, 1);
    range('Y補正', 'oy', -400, 400, 1);
    range('固定角度', 'angle', 0, 360, 1);
    btn('回転 ON/OFF', () => { S.on = !S.on; });
    btn('逆回転', () => { S.dir *= -1; });
    btn('固定角度を解除', () => { S.angle = null; });
    btn('中心: 自動/手動', () => {
      if (S.auto && S.base) { S.cx = S.base.cx; S.cy = S.base.cy; }
      S.auto = !S.auto;
    });
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
            const pts = g(S.path).children.filter(c => c.width > 0).map(center);
          if (!pts.length) throw new Error('no board');
            S.base = {
              cx: pts.reduce((a, p) => a + p.x, 0) / pts.length,
              cy: pts.reduce((a, p) => a + p.y, 0) / pts.length
            };
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
        mk.style.left = S.screen.x + 'px';
        mk.style.top = S.screen.y + 'px';
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
