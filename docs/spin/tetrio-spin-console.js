(() => {
  const W = window;

  const startUI = () => {
    if (W.__spinUI) return;
    W.__spinUI = true;
    const S = W.__spin = {
      on: true, sec: 60, dir: 1, angle: null, marker: true, rot: 0, screen: null, holders: []
    };

    // 盤面の holder を探す。
    // TETR.IO は盤面ごとに holder(Container)を作り、gSceneBG / gSceneFG に入れる。
    // holder の pivot は (マス幅×横/2, マス幅×縦/2) = 横10×縦20 のプレイ範囲の中心に
    // ゲーム側で設定されているので、pivot はそのまま使い、回転だけ足す。
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

    const attach = h => {
      if (h.__spin) return;
      h.__spin = 1;
      const o = h.updateTransform;
      h.updateTransform = function () {
        if (!S.on && S.angle == null) return o.call(this);
        const r = this.rotation;
        // ゲーム本来の回転(通常 0)に、こちらの回転を足すだけ。pivot と位置は触らない
        this.rotation = r + (S.angle != null ? S.angle * Math.PI / 180 : S.rot);
        o.call(this);
        this.rotation = r;
        if (this === S.holders[0]) S.screen = this.worldTransform.apply(this.pivot);
      };
    };

    // ゲーム内の座標(renderer.screen 単位)を、ページ上の座標(CSS px)に直す
    const toClient = p => {
      const v = W.__renderer && W.__renderer.view;
      if (!v || !v.getBoundingClientRect) return p;
      const r = v.getBoundingClientRect(), s = W.__renderer.screen;
      return { x: r.left + p.x * r.width / s.width, y: r.top + p.y * r.height / s.height };
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
    const status = document.createElement('div');
    status.style.cssText = 'opacity:.8';
    panel.append(status);
    range('秒/周', 'sec', 2, 120, 1);
    const sa = range('固定角度', 'angle', 0, 360, 1);
    btn('回転 ON/OFF', () => { S.on = !S.on; });
    btn('逆回転', () => { S.dir *= -1; });
    btn('固定角度を解除', () => { S.angle = null; sa.value = 0; });
    btn('角度を0に戻す', () => { S.rot = 0; S.angle = null; sa.value = 0; });
    btn('中心の目印 ON/OFF', () => { S.marker = !S.marker; });
    btn('パネルを閉じる', () => panel.remove());
    document.body.append(panel);

    const mk = document.createElement('div');
    mk.id = '__spinmk';
    mk.style.cssText = 'position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:7px;background:red;z-index:2147483646;pointer-events:none';
    document.body.append(mk);

    let last = performance.now();
    let n = 0;
    cancelAnimationFrame(W.__spinRaf);
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (S.on) S.rot = (S.rot + S.dir * dt * 2 * Math.PI / S.sec) % (2 * Math.PI);
      // holder はゲーム開始・リトライのたびに作り直されるので、ときどき探し直す
      if (n % 30 === 0 || S.holders.some(h => h._destroyed || !h.parent)) {
        try { S.holders = findHolders(); } catch (e) { S.holders = []; }
        S.holders.forEach(attach);
        if (!S.holders.length) S.screen = null;
      }
      n++;
      status.textContent = S.holders.length ? `盤面: ${S.holders.length}` : '盤面: なし(ゲーム開始を待っています)';
      mk.style.display = S.marker && S.screen ? 'block' : 'none';
      if (S.screen) {
        const p = toClient(S.screen);
        mk.style.left = p.x + 'px';
        mk.style.top = p.y + 'px';
      }
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
