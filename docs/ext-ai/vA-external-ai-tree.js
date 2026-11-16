(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../tetrio-hub/tools/patch/ai-src/engine/ai-spin-planner.js
  var require_ai_spin_planner = __commonJS({
    "../tetrio-hub/tools/patch/ai-src/engine/ai-spin-planner.js"(exports, module) {
      (function spinPlannerFactory(root) {
        "use strict";
        const W2 = 10, FULL = (1 << W2) - 1;
        let tables = null, rawTables = null;
        const tablesBy = {}, rawBy = {};
        let mode = { allow180: true, slam: false };
        function load(engine, kick = "SRS+") {
          if (tablesBy[kick]) {
            tables = tablesBy[kick];
            return tables;
          }
          if (!engine) return tables;
          const c2 = engine.cm?.constants, ks = c2?.kicksets?.[kick] || c2?.kicksets?.["SRS+"];
          if (!ks || !engine.fm?.GetPieceDefinition) return null;
          const shapes2 = {};
          for (const t of ["t", "s", "z", "l", "j", "i", "o"]) {
            shapes2[t] = [];
            for (let r = 0; r < 4; r++) {
              const d = engine.fm.GetPieceDefinition(t, r);
              shapes2[t].push(d.data.map(([x, y]) => [x - d.dx, y - d.dy]));
            }
          }
          rawBy[kick] = { shapes: shapes2, kicks: ks.kicks, ikicks: ks.i_kicks || ks.kicks, corner: c2.cornerTable?.t || null };
          tables = tablesBy[kick] = withBits({ ...rawBy[kick] });
          return tables;
        }
        function bitsOf(cells) {
          let minx = 9, maxx = -9;
          const byRow = /* @__PURE__ */ new Map();
          for (const [cx, cy] of cells) {
            minx = Math.min(minx, cx);
            maxx = Math.max(maxx, cx);
            byRow.set(cy, (byRow.get(cy) || 0) | 1 << cx + 3);
          }
          const dy = [...byRow.keys()].sort((a, b) => b - a);
          return { minx, maxx, n: dy.length, dy: Int8Array.from(dy), m: Int32Array.from(dy.map((k) => byRow.get(k))) };
        }
        function withBits(t) {
          t.bits = {};
          for (const k of Object.keys(t.shapes)) t.bits[k] = t.shapes[k].map(bitsOf);
          return t;
        }
        function legal(rows, b, x, y) {
          if (x + b.minx < 0 || x + b.maxx >= W2) return false;
          const sh = x - 3, H = rows.length;
          for (let k = 0; k < b.n; k++) {
            const py = y + b.dy[k];
            if (py >= H) return false;
            if (py < 0) continue;
            if (rows[py] & (sh >= 0 ? b.m[k] << sh : b.m[k] >> -sh)) return false;
          }
          return true;
        }
        function occupied(rows, x, y) {
          return x < 0 || x >= W2 || y >= rows.length || y >= 0 && (rows[y] >> x & 1) === 1;
        }
        function spinKind(rows, type, x, y, r, kick) {
          const cells = tables.bits[type][r];
          if (legal(rows, cells, x, y + 1)) return 0;
          const immobile = !legal(rows, cells, x - 1, y) && !legal(rows, cells, x + 1, y) && !legal(rows, cells, x, y - 1);
          if (type === "t" && tables.corner) {
            const tab = tables.corner[r];
            let n = 0, front = 0;
            for (const o of tab) if (occupied(rows, x + o[0], y + o[1])) {
              n++;
              if (r === o[2] || r === o[3]) front++;
            }
            if (n >= 3) return front === 2 || kick === 3 ? 2 : 1;
          }
          return immobile ? 1 : 0;
        }
        const XO = 3, YO = 4, NX = 16, NY = 48, stamp = new Uint32Array(4 * NY * NX * 3 * 2);
        let gen = 1;
        const sid = (x, y, r, spin, layer) => (((layer * 3 + spin) * 4 + r) * NY + (y + YO)) * NX + (x + XO);
        const qx = new Int8Array(8192), qy = new Int8Array(8192), qr = new Int8Array(8192), qt = new Int8Array(8192);
        function placements(rows, type, spawnX = 4, spawnY = 19, maxTail = 3) {
          const T = tables, shapes2 = T.bits[type], out = /* @__PURE__ */ new Map();
          if (++gen >= 4294967280) {
            stamp.fill(0);
            gen = 1;
          }
          const table = type === "i" ? T.ikicks : T.kicks;
          let rx = 0, ry = 0, rr = 0, rk = -1;
          const rotate = (x, y, r, dir) => {
            if (type === "o") return false;
            const nr = r + dir + 4 & 3, cells = shapes2[nr];
            if (legal(rows, cells, x, y)) {
              rx = x;
              ry = y;
              rr = nr;
              rk = -1;
              return true;
            }
            const list = table[String(r) + String(nr)] || [];
            for (let k = 0; k < list.length; k++) {
              const nx = x + list[k][0], ny = y + list[k][1];
              if (legal(rows, cells, nx, ny)) {
                rx = nx;
                ry = ny;
                rr = nr;
                rk = k;
                return true;
              }
            }
            return false;
          };
          const record = (x, y, r, spin) => {
            const id = (r * NY + y + YO) * NX + x + XO;
            const old = out.get(id);
            if (!old) {
              out.set(id, { x, y, r, spin, plain: !spin });
              return;
            }
            if (!spin) old.plain = true;
            else if (spin > old.spin) old.spin = spin;
          };
          if (!legal(rows, shapes2[0], spawnX, spawnY)) return [];
          let head = 0, tail = 0;
          if (mode.slam) while (legal(rows, shapes2[0], spawnX, spawnY + 1)) spawnY++;
          qx[tail] = spawnX;
          qy[tail] = spawnY;
          qr[tail] = 0;
          tail++;
          stamp[sid(spawnX, spawnY, 0, 0, 0)] = gen;
          const ground = [];
          while (head < tail) {
            const x = qx[head], y = qy[head], r = qr[head];
            head++;
            for (let a = 0; a < 5; a++) {
              let nx, ny, nr;
              if (a === 4 && !mode.allow180) continue;
              if (a < 2) {
                nx = x + (a ? -1 : 1);
                ny = y;
                nr = r;
                if (!legal(rows, shapes2[r], nx, ny)) continue;
                if (mode.slam) while (legal(rows, shapes2[r], nx, ny + 1)) ny++;
              } else {
                if (mode.slam && legal(rows, shapes2[r], x, y + 1)) continue;
                if (!rotate(x, y, r, a === 2 ? 1 : a === 3 ? -1 : 2)) continue;
                nx = rx;
                ny = ry;
                nr = rr;
              }
              if (ny < -YO || ny >= NY - YO || nx < -XO || nx >= NX - XO) continue;
              const id = sid(nx, ny, nr, 0, 0);
              if (stamp[id] === gen) continue;
              stamp[id] = gen;
              qx[tail] = nx;
              qy[tail] = ny;
              qr[tail] = nr;
              tail++;
              if (tail >= 8e3) break;
            }
          }
          let gh = 0, gt = 0;
          const gx = [], gy = [], gr = [], gtail = [];
          for (let i = 0; i < tail; i++) {
            const x = qx[i], r = qr[i], cells = shapes2[r];
            let y = qy[i];
            while (legal(rows, cells, x, y + 1)) y++;
            record(x, y, r, 0);
            const id = sid(x, y, r, 0, 1);
            if (stamp[id] === gen) continue;
            stamp[id] = gen;
            gx.push(x);
            gy.push(y);
            gr.push(r);
            gtail.push(0);
          }
          for (let i = 0; i < gx.length && i < 900; i++) {
            const x = gx[i], y = gy[i], r = gr[i], t = gtail[i];
            if (t >= maxTail) continue;
            for (let a = 0; a < 6; a++) {
              let nx, ny, nr, spin = 0;
              if (a === 4 && !mode.allow180) continue;
              if (a === 5) {
                if (!legal(rows, shapes2[r], x, y + 1)) continue;
                nx = x;
                nr = r;
                ny = y;
                while (legal(rows, shapes2[r], nx, ny + 1)) ny++;
              } else if (a < 2) {
                nx = x + (a ? -1 : 1);
                ny = y;
                nr = r;
                if (!legal(rows, shapes2[r], nx, ny)) continue;
                if (mode.slam) while (legal(rows, shapes2[r], nx, ny + 1)) ny++;
              } else {
                if (mode.slam && legal(rows, shapes2[r], x, y + 1)) continue;
                if (!rotate(x, y, r, a === 2 ? 1 : a === 3 ? -1 : 2)) continue;
                nx = rx;
                ny = ry;
                nr = rr;
                if (!legal(rows, shapes2[nr], nx, ny + 1)) spin = spinKind(rows, type, nx, ny, nr, rk);
              }
              if (ny < -YO || ny >= NY - YO || nx < -XO || nx >= NX - XO) continue;
              const g = !legal(rows, shapes2[nr], nx, ny + 1);
              if (g) record(nx, ny, nr, spin);
              const id = sid(nx, ny, nr, spin, 1);
              if (stamp[id] === gen) continue;
              stamp[id] = gen;
              gx.push(nx);
              gy.push(ny);
              gr.push(nr);
              gtail.push(t + 1);
            }
          }
          return [...out.values()];
        }
        function place(rows, type, p) {
          const next = rows.slice();
          for (const [cx, cy] of tables.shapes[type][p.r]) {
            const y = p.y + cy;
            if (y >= 0) next[y] |= 1 << p.x + cx;
          }
          let lines = 0;
          const kept = [];
          for (let y = 0; y < next.length; y++) {
            if (next[y] === FULL) lines++;
            else kept.push(next[y]);
          }
          while (kept.length < next.length) kept.unshift(0);
          return { rows: kept, lines };
        }
        const EDGE = 771;
        function sealedCount(rows) {
          let reach = 0, above = 0, n = 0;
          for (let y = 0; y < rows.length; y++) {
            const empty = ~rows[y] & FULL;
            let r = y === 0 ? empty : reach & empty;
            for (let k = 0; k < W2; k++) {
              const m = r | (r << 1 | r >> 1) & empty;
              if (m === r) break;
              r = m;
            }
            reach = r;
            for (let b = empty & above & ~r; b; b &= b - 1) n++;
            above |= rows[y];
          }
          return n;
        }
        function boardValue(rows, P) {
          const H = rows.length, heights = new Array(W2).fill(0);
          let reach = 0, above = 0, sealed = 0, tuck = 0, tuckReady = 0, trap = 0, edgeCave = 0, tuckSparse = 0;
          for (let y = 0; y < H; y++) {
            const row = rows[y], empty = ~row & FULL;
            let r = y === 0 ? empty : reach & empty;
            for (let k = 0; k < W2; k++) {
              const n = r | (r << 1 | r >> 1) & empty;
              if (n === r) break;
              r = n;
            }
            reach = r;
            const covered = empty & above;
            if (covered) {
              let fill = 0;
              for (let b = row; b; b &= b - 1) fill++;
              for (let b = covered; b; b &= b - 1) {
                const bit = b & -b;
                if (r & bit) {
                  tuck++;
                  if (fill >= 8) tuckReady++;
                  if (bit & EDGE) edgeCave++;
                  if (fill < 7) tuckSparse++;
                } else {
                  sealed++;
                  if (fill >= 7) trap++;
                }
              }
            }
            for (let x = 0; x < W2; x++) if (!heights[x] && row >> x & 1) heights[x] = H - y;
            above |= row;
          }
          let peak = 0, bump = 0, dead = 0, sum = 0;
          for (let x = 0; x < W2; x++) {
            peak = Math.max(peak, heights[x]);
            sum += heights[x];
            if (x) bump += Math.abs(heights[x] - heights[x - 1]);
            const l = x ? heights[x - 1] : 99, rr = x < W2 - 1 ? heights[x + 1] : 99, d = Math.min(l, rr) - heights[x];
            if (d >= 3) dead += d - 2;
          }
          let well = 0;
          if (P.well) {
            for (const x of [0, W2 - 1]) {
              const bit = 1 << x;
              let n = 0;
              for (let y = H - heights[x] - 1; y >= 0 && n < 4; y--) {
                if ((rows[y] | bit) === FULL && !(rows[y] & bit)) n++;
                else break;
              }
              well = Math.max(well, n);
            }
          }
          let bumpSq = 0;
          for (let x = 1; x < W2; x++) {
            const d = heights[x] - heights[x - 1];
            bumpSq += d * d;
          }
          let ren = 0;
          if (P.ren) {
            let reach2 = 0;
            for (let y = 0; y < H; y++) {
              const empty = ~rows[y] & FULL;
              let r = y === 0 ? empty : reach2 & empty;
              for (let k = 0; k < W2; k++) {
                const m = r | (r << 1 | r >> 1) & empty;
                if (m === r) break;
                r = m;
              }
              reach2 = r;
              let f = 0;
              for (let b = rows[y]; b; b &= b - 1) f++;
              if (f >= 8 && f < W2 && (empty & ~r) === 0) ren++;
            }
            ren = Math.min(6, ren);
          }
          let ownOver = 0;
          if (P.own) {
            let g = 0;
            for (let y = H - 1; y >= 0; y--) {
              let f = 0;
              for (let b = rows[y]; b; b &= b - 1) f++;
              if (f === W2 - 1) g++;
              else break;
            }
            ownOver = Math.max(0, sum / W2 - g - (P.ownCap || 4));
          }
          let dig = 0;
          if (P.dig) {
            for (let x = 0; x < W2; x++) {
              const bit = 1 << x;
              let n = 0;
              for (let y = H - heights[x] - 1; y >= 0 && n < 4; y--) {
                if ((rows[y] | bit) === FULL && !(rows[y] & bit)) n++;
                else break;
              }
              if (n > dig) dig = n;
            }
          }
          let gCover = 0;
          if (P.gHole && P.gRows > 0) {
            const seg = [];
            let y = H - 1;
            for (; y >= Math.max(0, H - P.gRows); y--) {
              const e = ~rows[y] & FULL;
              if (!rows[y] || e & e - 1) break;
              const c2 = 31 - Math.clz32(e);
              if (!seg.length || seg[seg.length - 1] !== c2) seg.push(c2);
            }
            if (seg.length) {
              const top = y, wk = [1, 0.6, 0.3];
              for (let k = 0; k < 3 && k < seg.length; k++) {
                const bit = 1 << seg[seg.length - 1 - k];
                let n = 0;
                for (let yy = top; yy >= 0; yy--) if (rows[yy] & bit) n++;
                gCover += wk[k] * Math.min(6, n);
              }
            }
          }
          let loose = 0;
          if (P.loose) {
            let run = 0, col = -1, acc = 0;
            for (let y = 0; y < H - (P.gRows || 0); y++) {
              const e = ~rows[y] & FULL;
              const one = rows[y] && e && !(e & e - 1);
              const x = one ? 31 - Math.clz32(e) : -1;
              if (one && H - heights[x] > y) {
                if (x === col) run++;
                else {
                  if (run && run < 4) acc += run;
                  run = 1;
                  col = x;
                }
              } else {
                if (run && run < 4) acc += run;
                run = 0;
                col = -1;
              }
            }
            if (run && run < 4) acc += run;
            loose = Math.min(6, acc);
          }
          const tShape = P.tShape ? P.tShape * tShapeValue(rows, P.tShapeTable || root.LocalTShapeTable) : 0;
          return -(P.loose || 0) * loose - (P.gHole || 0) * gCover + tShape - P.sealed * sealed - P.trap * trap - P.tuck * tuck + P.tuckReady * tuckReady - P.bump * bump - P.bumpSq * bumpSq - P.height * sum / W2 - P.peak * Math.max(0, peak - P.safePeak) - P.top * Math.max(0, peak - P.topPeak) - P.dead * dead + P.well * well - (P.edgeCave || 0) * edgeCave + (P.dig || 0) * dig + (P.ren || 0) * ren - (P.tuckSparse || 0) * tuckSparse - (P.own || 0) * ownOver * ownOver;
        }
        function tShapeKeys(rows) {
          const H = rows.length, top = new Array(W2).fill(H), keys = [];
          for (let x = 0; x < W2; x++) for (let y = 0; y < H; y++) if (rows[y] >> x & 1) {
            top[x] = y;
            break;
          }
          const occ = (x, y) => y >= H ? 1 : y < 0 ? 0 : rows[y] >> x & 1;
          for (let x = 0; x <= W2 - 3; x++) {
            let c2 = x;
            for (let d = 1; d < 3; d++) if (top[x + d] > top[c2]) c2 = x + d;
            const y0 = top[c2] - 1;
            let bits = 0, k = 0;
            for (let r = 1; r >= -2; r--) for (let dx = 0; dx < 3; dx++) {
              if (occ(x + dx, y0 + r)) bits |= 1 << k;
              k++;
            }
            let key = bits;
            for (const [i, yy] of [[0, y0], [1, y0 - 1]]) {
              let n = 0;
              if (yy >= 0 && yy < H) {
                const m = rows[yy] & ~(7 << x) & FULL;
                for (let b = m; b; b &= b - 1) n++;
              }
              key |= (n >= 7 ? 2 : n >= 5 ? 1 : 0) << 12 + 2 * i;
            }
            keys.push(key | (x === 0 || x === W2 - 3 ? 1 : 0) << 16);
          }
          return keys;
        }
        function tShapeValue(rows, table) {
          if (!table) return 0;
          let m = -Infinity;
          const ks = tShapeKeys(rows), v = new Array(ks.length);
          for (let i = 0; i < ks.length; i++) {
            v[i] = table[ks[i]] || 0;
            if (v[i] > m) m = v[i];
          }
          let z = 0;
          for (const a of v) z += Math.exp(a - m);
          return m + Math.log(z) - Math.log(ks.length);
        }
        function withGarbage(rows, n, cols, gi) {
          const b = rows[rows.length - 1], hole = b && (~b & FULL & (~b & FULL) - 1) === 0 && ~b & FULL ? ~b & FULL : 1;
          const out = rows.slice(n);
          for (let i = 0; i < n; i++) {
            const c2 = cols?.[gi + i];
            out.push(FULL & ~(c2 != null ? 1 << c2 : hole));
          }
          return out;
        }
        function predictHoles(s) {
          let seed = s.seed % 2147483647;
          if (seed <= 0) seed = seed + 2147483646 || 1;
          const rnd = () => (seed = 16807 * seed % 2147483647, (seed - 1) / 2147483646), width = s.width || W2;
          let last = s.lastColumn ?? null, changed = !!s.changed;
          const out = [];
          const reroll = () => {
            const cb = s.center ? Math.round(W2 / 5) : 0;
            let n;
            if (s.nosame && last !== null) {
              n = cb + Math.floor(rnd() * (width - 1 - 2 * cb));
              if (n >= last) n++;
            } else n = cb + Math.floor(rnd() * (width - 2 * cb));
            return last = n;
          };
          if (s.timeout && !changed) {
            reroll();
            changed = true;
          }
          for (const it of s.items || []) for (let a = it.amt; a > 0 && out.length < 40; a--) {
            let c2 = last;
            if (it.column != null) c2 = it.column;
            else if (last === null || rnd() < (s.inner || 0)) {
              if (!changed) {
                c2 = reroll();
                changed = true;
              }
            }
            out.push(c2 == null ? 0 : c2);
            changed = false;
            if (a === 1 && rnd() < (s.change || 0)) {
              reroll();
              changed = true;
            }
          }
          return out;
        }
        function tPotential(rows, P) {
          let best = 0;
          for (const p of placements(rows, "t", 4, 19, 2)) {
            if (!p.spin) continue;
            const r = place(rows, "t", p).lines;
            best = Math.max(best, p.spin === 2 ? r >= 3 ? P.tstReady : r >= 2 ? P.tsdReady : r ? P.tssReady : P.slotReady : P.miniReady * r);
          }
          return best;
        }
        function attackOf(type, spin, lines, b2bBefore, combo = 1) {
          if (!lines) return 0;
          let a;
          if (spin === 2 && type === "t") a = [0, 2, 4, 6][Math.min(3, lines)];
          else if (spin) a = [0, 0, 1, 2][Math.min(3, lines)];
          else a = [0, 0, 1, 2, 4][Math.min(4, lines)];
          if (b2bBefore > 0 && (spin || lines === 4)) a += 1;
          if (combo > 1) {
            a *= 1 + 0.25 * (combo - 1);
            if (combo > 2) a = Math.max(Math.log1p(1.25 * (combo - 1)), a);
          }
          return a;
        }
        const DEFAULTS = {
          width: 24,
          sealed: 9,
          tuck: 1.5,
          tuckReady: 1,
          bump: 0.8,
          bumpSq: 0.3,
          height: 2,
          peak: 4,
          safePeak: 8,
          top: 12,
          topPeak: 12,
          dead: 1.5,
          tsdReady: 16,
          tstReady: 30,
          tssReady: 3,
          slotReady: 1.5,
          miniReady: 1.2,
          tFull: [0, 16, 38, 52],
          tMini: [0, 1, 3, 4],
          mini: [0, 1, 8, 14],
          quad: 14,
          breakClear: -30,
          dangerPeak: 15,
          depthDecay: 0.97,
          zeroSpin: -1.5,
          wastedT: 7,
          tPotK: 3,
          perFirst: 3,
          breakPerB2B: 0,
          breakDangerPerB2B: 0,
          outlook: 5,
          outlookCap: 4,
          well: 2,
          tMiniWasted: true,
          comboCashAt: 3,
          comboCashMin: 8,
          comboScale: 0.25,
          cancelLoss: 1,
          atkOther: 1,
          combo: true,
          trap: 4,
          atk: 2,
          charging: false,
          chargeAt: 4,
          chargeBase: 3,
          cashout: Infinity,
          incoming: 0,
          cancelW: 0,
          tpl: 10,
          colWeight: [0.8, 0.86, 0.95, 1, 1, 1, 1, 0.95, 0.86, 0.8]
        };
        function* search(state, P, out = {}) {
          const H = state.board.length, rows = new Array(H);
          for (let y = 0; y < H; y++) {
            let m = 0;
            for (let x = 0; x < W2; x++) if (state.board[y][x] !== null) m |= 1 << x;
            rows[y] = m;
          }
          const queue = (state.queue || []).map((t) => String(t).toLowerCase()).filter((t) => tables.shapes[t]);
          const start = { combo: Math.max(0, Number(state.combo) || 0), incoming: Math.max(0, Number(P.incoming) || 0), rows, cur: String(state.falling).toLowerCase(), hold: state.hold ? String(state.hold).toLowerCase() : null, qi: 0, acc: 0, first: null, b2b: state.b2b || 0, spins: 0 };
          if (!tables.shapes[start.cur]) return null;
          let rootH = 0;
          for (let y = 0; y < H; y++) if (rows[y]) {
            rootH = H - y;
            break;
          }
          const bigWave = P.bigWave > 0 && start.incoming >= P.bigWave;
          const rootDanger = rootH + 0.5 * start.incoming + 0.5 * (P.threat || 0) >= P.dangerPeak;
          const tpl = /* @__PURE__ */ new Map();
          for (const t of P.templates || []) for (const st of t.steps) {
            const k = st.t + "|" + st.c.map((c2) => c2[0] + "," + c2[1]).sort().join(";");
            tpl.set(k, Math.max(tpl.get(k) || 0, P.tpl * (1 + Math.min(1, (t.score || 0) / 10))));
          }
          const colW = P.colWeight || null;
          let beam = [start], best = null, leaves = [];
          const depth = Math.min(P.maxDepth || 7, 1 + queue.length);
          for (let d = 0; d < depth; d++) {
            const children = [], seen = /* @__PURE__ */ new Set();
            for (const node of beam) {
              const options = [[node.cur, node.hold, node.qi, false]];
              if (state.holdAllowed !== false) {
                if (node.hold && node.hold !== node.cur) options.push([node.hold, node.cur, node.qi, true]);
                else if (!node.hold && node.qi < queue.length) options.push([queue[node.qi], node.cur, node.qi + 1, true]);
              }
              let heightBefore = 0;
              for (let y = 0; y < H; y++) if (node.rows[y]) {
                heightBefore = H - y;
                break;
              }
              const danger = heightBefore + 0.5 * (node.incoming || 0) + 0.5 * (P.threat || 0) >= P.dangerPeak && (rootDanger || (node.gi || 0) > 0);
              for (const [type, hold, qi, held] of options) {
                for (const p of placements(node.rows, type, 4, 19, heightBefore >= 14 ? 6 : 3)) {
                  const res = place(node.rows, type, p);
                  let gain = 0, b2b = node.b2b, tplOff = node.tplOff, inc = node.incoming || 0, gi = node.gi || 0, brk = node.brk || null, pendS = node.pendS || 0, pendR = node.pendR || 0;
                  if (tpl.size && !tplOff) {
                    const cells = tables.shapes[type][p.r];
                    const k2 = type + "|" + cells.map(([cx, cy]) => p.x + cx + "," + (p.y + cy)).sort().join(";");
                    const v = tpl.get(k2);
                    if (v) gain += v;
                  }
                  if (res.lines) {
                    const combo = (node.combo || 0) + 1;
                    if (pendS && combo >= P.comboCashAt) {
                      gain += pendS + pendR;
                      pendS = pendR = 0;
                    }
                    let atk = attackOf(type, p.spin, res.lines, node.b2b, P.combo ? combo : 1);
                    const breaking = !p.spin && res.lines < 4;
                    const surge = breaking && P.charging && node.b2b > P.chargeAt ? node.b2b - P.chargeAt + P.chargeBase : 0;
                    const cashOk = surge > 0 && (node.b2b >= P.cashout || danger || (node.incoming || 0) > 0 && P.cancelW >= 4);
                    if (cashOk) atk += surge;
                    gain += P.atk * atk * (type === "t" && p.spin === 2 ? 1 : P.atkOther);
                    if (inc > 0) {
                      const c2 = Math.min(inc, atk);
                      if (P.cancelW > 0) gain += P.cancelW * c2;
                      else if (bigWave) gain += P.bigCancel * c2;
                      else if (P.takeMax && heightBefore + inc + (P.threat || 0) > P.takeMax) gain += (P.cancelHi || 4) * c2;
                      else gain -= P.atk * P.cancelLoss * c2;
                      inc -= c2;
                      gi += c2;
                    }
                    if (p.spin) {
                      let g = (type === "t" ? p.spin === 2 ? P.tFull : P.tMini : P.mini)[Math.min(3, res.lines)];
                      if (colW && g > 0) {
                        const cells = tables.shapes[type][p.r];
                        const cx = Math.round(cells.reduce((a, [x]) => a + x, 0) / 4 + p.x);
                        g *= colW[Math.max(0, Math.min(W2 - 1, cx))];
                      }
                      if (P.comboScale && combo > 1 && g > 0) g *= 1 + P.comboScale * (combo - 1);
                      if (P.donateSeal && type === "t") {
                        const d2 = sealedCount(res.rows) - sealedCount(node.rows);
                        if (d2 > 0) g -= P.donateSeal * d2;
                      }
                      gain += g;
                      b2b++;
                    } else if (res.lines === 4) {
                      gain += (danger ? 6 : P.quad) * (P.comboScale && combo > 1 ? 1 + P.comboScale * (combo - 1) : 1);
                      b2b++;
                    } else {
                      const pen = danger || cashOk ? -2 : P.breakClear - P.breakPerB2B * Math.min(60, node.b2b);
                      gain += pen;
                      if (!danger && !cashOk && surge > 0 && node.b2b >= P.comboCashMin) {
                        pendS = P.atk * surge;
                        pendR = -pen;
                      }
                      if (P.digRebuild && pen < 0) brk = { at: node.attack || 0, r: -pen };
                      b2b = 0;
                    }
                    if (bigWave && (node.incoming || 0) > 0) gain += (P.bigCombo || 0) * Math.min(6, combo);
                    if (res.rows.every((v) => v === 0)) gain += 12;
                    tplOff = true;
                  } else {
                    pendS = pendR = 0;
                    if (p.spin && !p.plain) gain += P.zeroSpin;
                  }
                  if (P.surviveNoClear && (node.incoming || 0) > 0 && heightBefore + (node.incoming || 0) + (P.threat || 0) > (P.takeMax || 14)) {
                    if (res.lines) gain += (P.surviveCombo || 0) * Math.min(6, (node.combo || 0) + 1) * (p.spin || res.lines === 4 ? 1 : 0.5);
                    else gain -= P.surviveNoClear;
                  }
                  let rowsOut = res.rows;
                  if (!res.lines && inc > 0 && P.cancelW === 0) {
                    const k2 = Math.min(inc, H, P.garbageCap || inc);
                    rowsOut = withGarbage(res.rows, k2, P.garbageHoles, gi);
                    inc -= k2;
                    gi += k2;
                    let h = 0;
                    for (let y = 0; y < H; y++) if (rowsOut[y]) {
                      h = H - y;
                      break;
                    }
                    if (h >= (P.topOut || 20)) gain -= P.topOutPen ?? 1e3;
                  }
                  if (type === "t" && !(p.spin && res.lines && (p.spin === 2 || !P.tMiniWasted)) && !danger) gain -= P.wastedT;
                  const nextCur = qi < queue.length ? queue[qi] : null;
                  let hash = hold ? hold.charCodeAt(0) : 1;
                  for (let y = 0; y < H; y++) hash = Math.imul(hash, 31) + rowsOut[y] | 0;
                  const attackNow = (node.attack || 0) + (res.lines ? attackOf(type, p.spin, res.lines, node.b2b, P.combo ? (node.combo || 0) + 1 : 1) : 0);
                  if (brk && attackNow - brk.at >= P.digRebuild) {
                    gain += brk.r;
                    brk = null;
                  }
                  const acc = node.acc + gain * Math.pow(P.depthDecay, d), key = hash + ":" + (nextCur || "");
                  if (seen.has(key)) continue;
                  seen.add(key);
                  const child = { rows: rowsOut, cur: nextCur, hold, qi: qi + 1, acc, tplOff, incoming: inc, gi, pendS, pendR, combo: res.lines ? (node.combo || 0) + 1 : 0, attack: attackNow, brk, first: node.first || { x: p.x, y: p.y, r: p.r, hold: held, spin: p.spin, type }, b2b, spins: node.spins + (p.spin && res.lines ? 1 : 0) };
                  if (P.trace) child.seq = [...node.seq || [], attackNow - (node.attack || 0)];
                  child.value = acc + boardValue(rowsOut, P);
                  children.push(child);
                }
                yield;
              }
            }
            if (!children.length) break;
            children.sort((a, b) => b.value - a.value);
            const k = Math.min(children.length, Math.ceil(P.width * P.tPotK));
            for (let i = 0; i < k; i++) {
              const c2 = children[i];
              let m = 1;
              if (P.reserve && P.threat) {
                let h = 0;
                for (let y = 0; y < H; y++) if (c2.rows[y]) {
                  h = H - y;
                  break;
                }
                if (h + P.threat > (P.takeMax || 14)) m += P.reserve;
              }
              c2.value += m * tPotential(c2.rows, P);
              if (P.holdT && c2.hold === "t") {
                for (const p of placements(c2.rows, "t", 4, 19, 2)) if (p.spin === 2 && place(c2.rows, "t", p).lines) {
                  c2.value += P.holdT;
                  break;
                }
              } else if (P.holdI && c2.hold === "i") {
                for (const p of placements(c2.rows, "i", 4, 19, 2)) if (place(c2.rows, "i", p).lines === 4) {
                  c2.value += P.holdI;
                  break;
                }
              }
              if (i % 8 === 7) yield;
            }
            children.length = k;
            children.sort((a, b) => b.value - a.value);
            const next = [], firsts = /* @__PURE__ */ new Map();
            for (const c2 of children) {
              const f = c2.first, id = f.x + "," + f.y + "," + f.r + "," + f.hold;
              const n = firsts.get(id) || 0;
              if (n >= P.perFirst) continue;
              firsts.set(id, n + 1);
              next.push(c2);
              if (next.length >= P.width) break;
            }
            best = next[0] || best;
            leaves = next;
            if (best) out.best = { ...best.first, value: best.value, spins: best.spins, depth: d + 1 };
            beam = next.filter((c2) => c2.cur);
            if (!beam.length) break;
            yield;
          }
          if (P.outlook > 0 && leaves.length) {
            for (const c2 of leaves) {
              let n = 0;
              for (const t of ["s", "z", "l", "j", "i", "o"]) {
                for (const p of placements(c2.rows, t, 4, 19, 2)) {
                  if (p.spin && place(c2.rows, t, p).lines) {
                    n++;
                    break;
                  }
                }
              }
              c2.value += P.outlook * Math.min(P.outlookCap, n);
              yield;
            }
            leaves.sort((a, b) => b.value - a.value);
            best = leaves[0];
          }
          return best ? { ...best.first, value: best.value, spins: best.spins, seq: best.seq } : null;
        }
        function create(engine, state, options = {}) {
          const P = { ...DEFAULTS, ...root.__spinPlannerParams || {}, ...options };
          const kick = String(P.kickset || "SRS+"), rules = { allow180: P.allow180 !== false, slam: !!P.slam };
          if (!load(engine, kick)) return null;
          const myTables = tables;
          const use = () => {
            tables = myTables;
            mode = rules;
          };
          use();
          const out = {}, it = search(state, P, out);
          let done = false, result = null, spent = 0;
          return {
            step(ms = 4) {
              if (done) return true;
              use();
              const t0 = performance.now(), end = t0 + ms;
              try {
                while (performance.now() < end) {
                  const r = it.next();
                  if (r.done) {
                    done = true;
                    result = r.value;
                    break;
                  }
                }
              } catch (error) {
                done = true;
                result = null;
              }
              spent += performance.now() - t0;
              return done;
            },
            result: () => done ? result : out.best || null,
            get done() {
              return done;
            },
            get spent() {
              return spent;
            },
            stop() {
              if (!done) {
                done = true;
                result = out.best || null;
              }
              return result;
            }
          };
        }
        function plan(engine, state, options = {}) {
          const p = create(engine, state, options);
          if (!p) return null;
          while (!p.step(50)) ;
          return p.result();
        }
        function predictAttack(engine, state, options = {}, n = 3) {
          const r = plan(engine, state, { ...options, trace: true, width: options.predWidth || 6, maxDepth: options.predDepth || 4, incoming: 0, threat: 0, templates: [], outlook: 0 });
          if (!r || !r.seq) return null;
          let soon = 0;
          for (let i = 0; i < Math.min(n, r.seq.length); i++) soon += r.seq[i];
          const total = r.seq.reduce((a, b) => a + b, 0), eat = Math.max(0, Number(state.incoming) || 0);
          return { seq: r.seq, soon: Math.max(0, soon - eat), total: Math.max(0, total - eat) };
        }
        function setTables(t) {
          rawTables = { shapes: t.shapes, kicks: t.kicks, ikicks: t.ikicks, corner: t.corner };
          tables = withBits({ ...t });
        }
        function matchCells(engine, state, type, cells, options = {}) {
          if (!load(engine, String(options.kickset || "SRS+"))) return null;
          const prev = mode;
          mode = { allow180: options.allow180 !== false, slam: !!options.slam };
          try {
            const H = state.board.length, rows = new Array(H);
            for (let y = 0; y < H; y++) {
              let m = 0;
              for (let x = 0; x < W2; x++) if (state.board[y][x] !== null && state.board[y][x] !== void 0) m |= 1 << x;
              rows[y] = m;
            }
            const key = (c2) => c2.map(([x, y]) => x + "," + y).sort().join(";"), want = key(cells), sh = tables.shapes[type];
            for (const p of placements(rows, type)) if (key(sh[p.r].map(([cx, cy]) => [p.x + cx, p.y + cy])) === want) return { x: p.x, y: p.y, r: p.r, spin: p.spin, type };
            return null;
          } finally {
            mode = prev;
          }
        }
        let workers = null, workerBroken = false, fileBroken = false, jobSeq = 0;
        const jobs = /* @__PURE__ */ new Map();
        const WORKER_GLUE = "const SP=self.LocalSpinPlanner;const jobs=new Map();let running=false,kick=null;const ch=new MessageChannel();ch.port1.onmessage=run;const later=()=>ch.port2.postMessage(0);self.onmessage=e=>{const m=e.data;if(m.cancel){jobs.delete(m.cancel);return}if(m.kick!==kick){SP.setTables(m.tables);kick=m.kick}jobs.set(m.id,{id:m.id,p:SP.create(null,m.state,m.P),last:null});if(!running){running=true;later()}};function run(){const it=jobs.values().next();if(it.done){running=false;return}const j=it.value;jobs.delete(j.id);let fin=false;try{fin=j.p.step(8)}catch(err){fin=true}const b=j.p.result();if(fin){self.postMessage({id:j.id,done:true,result:b})}else{jobs.set(j.id,j);if(b&&b!==j.last){j.last=b;self.postMessage({id:j.id,best:b})}}later()}";
        root.__spinWorkerGlue = WORKER_GLUE;
        function getWorker() {
          if (workerBroken) return null;
          if (!workers) {
            if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
              workerBroken = true;
              return null;
            }
            const glue = ";(" + String(spinPlannerFactory) + ")(self);" + WORKER_GLUE;
            const fileUrl = !fileBroken && typeof document !== "undefined" && document.querySelector?.('script[src*="/engine/ai-spin-planner.js"]') ? "/engine/ai-plan-worker.js" : null;
            try {
              const url = fileUrl || URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
              const n = Math.max(1, Math.min(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency || 2) - 1));
              workers = [];
              for (let i = 0; i < n; i++) {
                const w = new Worker(url);
                w.load = 0;
                w.onmessage = (e) => {
                  const m = e.data, j = jobs.get(m.id);
                  if (!j) return;
                  if (m.done) {
                    jobs.delete(m.id);
                    w.load = Math.max(0, w.load - 1);
                    j.finish(m.result);
                  } else j.best = m.best;
                };
                w.onerror = () => {
                  if (fileUrl && !fileBroken) {
                    fileBroken = true;
                  } else workerBroken = true;
                  try {
                    for (const x of workers || []) x.terminate();
                  } catch {
                  }
                  workers = null;
                  for (const j of jobs.values()) j.fail();
                  jobs.clear();
                };
                workers.push(w);
              }
            } catch (error) {
              workers = null;
              if (fileUrl && !fileBroken) {
                fileBroken = true;
                return getWorker();
              }
              workerBroken = true;
              return null;
            }
          }
          return workers.reduce((a, b) => b.load < a.load ? b : a);
        }
        function createAsync(engine, state, options = {}) {
          const P = { ...DEFAULTS, ...root.__spinPlannerParams || {}, ...options };
          const kick = String(P.kickset || "SRS+");
          if (!load(engine, kick)) return null;
          const raw = rawBy[kick] || rawTables, w = raw && getWorker();
          const syncOpts = options.syncWidth ? { ...options, width: Math.min(options.width || 24, options.syncWidth) } : options;
          if (!w) return create(engine, state, syncOpts);
          const id = ++jobSeq, t0 = performance.now();
          let done = false, result = null, fallback = null, spent = 0, stoppedEarly = false;
          const job = { best: null, finish(r) {
            if (done) return;
            done = true;
            result = r;
            spent = performance.now() - t0;
          }, fail() {
            if (!done) fallback = create(engine, state, syncOpts);
          } };
          jobs.set(id, job);
          const send = {};
          for (const [k, v] of Object.entries(P)) if (typeof v !== "function") send[k] = v;
          if (send.tShape && !send.tShapeTable && root.LocalTShapeTable) send.tShapeTable = root.LocalTShapeTable;
          w.load++;
          try {
            w.postMessage({ id, kick: kick + (raw === rawTables ? ":set" : ""), tables: raw, state: { board: state.board, falling: state.falling, hold: state.hold, queue: state.queue, holdAllowed: state.holdAllowed, b2b: state.b2b, combo: state.combo }, P: send });
          } catch (error) {
            jobs.delete(id);
            w.load = Math.max(0, w.load - 1);
            return create(engine, state, syncOpts);
          }
          return {
            get async() {
              return !fallback;
            },
            step(ms = 4) {
              if (fallback) return fallback.step(ms);
              return done;
            },
            result: () => fallback ? fallback.result() : done ? result : job.best,
            get done() {
              return fallback ? fallback.done : done;
            },
            get spent() {
              return fallback ? fallback.spent : spent;
            },
            get stopped() {
              return stoppedEarly;
            },
            stop() {
              if (fallback) return fallback.stop();
              if (!done) {
                done = true;
                stoppedEarly = true;
                result = job.best;
                if (jobs.delete(id)) w.load = Math.max(0, w.load - 1);
                try {
                  w.postMessage({ cancel: id });
                } catch {
                }
              }
              return result;
            }
          };
        }
        const api = { attackOf, setTables, create, createAsync, plan, placements, place, boardValue, load, matchCells, tShapeKeys, tShapeValue, predictHoles, predictAttack, DEFAULTS, __shapes: () => tables.shapes, useRules: (r) => {
          mode = { allow180: r.allow180 !== false, slam: !!r.slam };
        } };
        if (typeof module !== "undefined") module.exports = api;
        else root.LocalSpinPlanner = api;
      })(typeof window === "undefined" ? globalThis : window);
    }
  });

  // ../tetrio-hub/tools/patch/ai-src/engine/ai-tree-planner.js
  var require_ai_tree_planner = __commonJS({
    "../tetrio-hub/tools/patch/ai-src/engine/ai-tree-planner.js"(exports, module) {
      (function treePlannerFactory(root) {
        "use strict";
        const SP2 = (typeof __require === "function" ? require_ai_spin_planner() : null) || root.LocalSpinPlanner;
        const COMBO_G = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
        const W2 = 10, FULL = (1 << W2) - 1, PIECES = ["t", "s", "z", "l", "j", "i", "o"];
        const DEFAULTS = {
          // CC1 Standard (default) board weights
          backToBack: 52,
          b2bStep: 14,
          b2bCap: 6,
          bump: -24,
          bumpSq: -7,
          rowTrans: -5,
          height: -39,
          topHalf: -150,
          topQuarter: -511,
          cavity: -173,
          cavitySq: -3,
          overhang: -34,
          overhangSq: -1,
          covered: -17,
          coveredSq: -1,
          tslot: [8, 148, 192, 407],
          wellDepth: 57,
          maxWell: 17,
          wellColumn: [20, 23, 20, 50, 59, 21, 59, 10, -10, 24],
          // rewards
          // rewards: CC1's clear values (style 'cc1') or attack x atkW (style 'atk'), plus the user's changes
          style: "cc1",
          clear: [0, -143, -100, -58, 390],
          tspin: [0, 121, 410, 602],
          b2bClear: 104,
          comboW: 150,
          allSpin: 60,
          atkW: 105,
          clear1: -90,
          clear2: -60,
          clear3: -30,
          wastedT: -152,
          tMiniSolo: -130,
          renQuad: 160,
          digW: 45,
          pcAttack: 5,
          pcB2B: 1,
          charging: true,
          chargeAt: 4,
          chargeBase: 3,
          simGarbage: true,
          garbageCap: 8,
          // take, then send (user: 火力があっても受けて死なないなら受けてからまとめ打ち): attack that would only cancel
          // garbage the board can take (stack + waiting garbage <= tankSafe rows) costs tankW per line, so the search
          // lets it in and sends the attack after (digging it with spins / REN pays digW).
          tank: true,
          tankW: 120,
          tankSafe: 14,
          // moves the player never makes (user: プレーヤーがしない動きは取り入れない、掘りクアッドが見えてない等): kinds from
          // kindOf() listed in ban are never chosen (player data sets it, see learn-core.mjs)
          ban: null,
          banW: 5e3,
          // a player's own Butter (user: 開幕テンプレが全く違う・動きが効率的すぎる、僕の動きに合ってない):
          //  openers: board shapes the player builds first (bottom row first). When the search starts from an opening
          //  (no garbage, no more cells than a shape), cells in the shape's rows but outside the best-fitting shape cost
          //  openW (no reward for matching: a reward that stops when the shape is done made the search avoid finishing).
          //  pickBeta: the move is drawn from the top lines with weight exp(pickBeta x (value - best)) like the
          //  player's own spread; misdrop: that share of moves lands one column off (the player's misdrop rate).
          openers: null,
          openW: 45,
          followKind: null,
          followW: 300,
          protect: null,
          protectW: 600,
          openBudget: 250,
          openDepth: 4,
          pickBeta: 0,
          misdrop: 0,
          // search
          ms: 45,
          maxNodes: 1e7,
          maxIters: 1e9,
          maxTail: 3,
          merge: true,
          speculate: true,
          seed: 1
        };
        function popc(n) {
          let c2 = 0;
          while (n) {
            n &= n - 1;
            c2++;
          }
          return c2;
        }
        function heightsOf(rows) {
          const H = rows.length, h = new Int8Array(W2);
          let seen = 0;
          for (let y = 0; y < H && seen !== FULL; y++) {
            let nb = rows[y] & ~seen;
            if (!nb) continue;
            seen |= nb;
            while (nb) {
              const b = nb & -nb;
              h[31 - Math.clz32(b)] = H - y;
              nb ^= b;
            }
          }
          return h;
        }
        function filled(rows, x, y) {
          return x < 0 || x >= W2 || y >= rows.length || y >= 0 && (rows[y] >> x & 1) === 1;
        }
        const TS = { S: [[0, 0], [-1, 0], [1, 0], [0, -1]], E: [[0, 0], [0, 1], [0, -1], [1, 0]], W: [[0, 0], [0, 1], [0, -1], [-1, 0]] };
        const SHAPES = [
          { n: 3, req: (o, x, h) => h[1] <= h[2] - 1, sy: (h) => h[2] + 1, ok: { dx: 1, y: (h) => h[2], rot: "S" }, rows: ["#??", "_??", "#??"] },
          { n: 3, req: (o, x, h) => h[1] <= h[0] - 1, sy: (h) => h[0] + 1, ok: { dx: 1, y: (h) => h[0], rot: "S" }, rows: ["??#", "??_", "??#"] }
        ];
        const TST = [
          { n: 3, req: (o, x, h) => h[0] <= h[1] && o(x - 1, h[1]) === o(x - 1, h[1] + 1), sy: (h) => h[1] + 1, ok: { dx: 2, y: (h) => h[1] - 2, rot: "W" }, rows: ["??#", "??_", "??_", "?__", "??_"] },
          { n: 3, req: (o, x, h) => h[2] <= h[1] && o(x + 3, h[1]) === o(x + 3, h[1] + 1), sy: (h) => h[1] + 1, ok: { dx: 0, y: (h) => h[1] - 2, rot: "E" }, rows: ["#??", "_??", "_??", "__?", "_??"] }
        ];
        const FIN = [
          { n: 4, req: (o, x, h) => h[0] <= h[1] + 1, sy: (h) => h[1] + 2, ok: { dx: 3, y: (h) => h[1] - 1, rot: "W" }, rows: ["??##?", "??__?", "??__#", "??__?", "??#_#"] },
          { n: 4, req: (o, x, h) => h[3] <= h[2] + 1 && o(x - 1, h[2]) && o(x - 1, h[2] - 2), sy: (h) => h[2] + 2, ok: { dx: 0, y: (h) => h[2] - 1, rot: "E" }, rows: ["##??", "__??", "__??", "__??", "_#??"] }
        ];
        function detect(o, h, shape) {
          for (let x = 0; x + shape.n <= W2; x++) {
            const hs = [];
            for (let i = 0; i < shape.n; i++) hs.push(h[x + i]);
            if (!shape.req(o, x, hs)) continue;
            let y = shape.sy(hs), ok = true;
            for (const row of shape.rows) {
              for (let i = 0; i < row.length && ok; i++) {
                const c2 = row[i];
                if (c2 === "#" && !o(x + i, y)) ok = false;
                else if (c2 === "_" && o(x + i, y)) ok = false;
              }
              if (!ok) break;
              y--;
            }
            if (ok) return { x: x + shape.ok.dx, y: shape.ok.y(hs), rot: shape.ok.rot };
          }
          return null;
        }
        const fits = (o, p) => TS[p.rot].every(([dx, dy]) => !o(p.x + dx, p.y + dy));
        function caveSlot(o, p) {
          p = { ...p };
          while (fits(o, { ...p, y: p.y - 1 })) p.y--;
          const x = p.x, y = p.y;
          if (p.rot === "E") {
            if (!o(x - 1, y) && o(x - 1, y - 1) && o(x + 1, y - 1) && o(x - 1, y + 1)) return { x, y, rot: "S" };
            if (!o(x + 1, y - 1) && !o(x + 2, y - 1) && !o(x + 1, y - 2) && o(x - 1, y) && o(x + 2, y) && o(x, y - 2) && o(x + 2, y - 2)) return { x: x + 1, y: y - 1, rot: "S" };
          } else if (p.rot === "W") {
            if (!o(x + 1, y) && o(x + 1, y + 1) && o(x + 1, y - 1) && o(x - 1, y - 1)) return { x, y, rot: "S" };
            if (!o(x - 1, y - 1) && !o(x - 2, y - 1) && !o(x - 1, y - 2) && o(x + 1, y) && o(x - 2, y) && o(x - 2, y - 2) && o(x, y - 2)) return { x: x - 1, y: y - 1, rot: "S" };
          }
          return null;
        }
        function findTslot(rows, h) {
          const H = rows.length, o = (x, yb) => x < 0 || x >= W2 || yb < 0 || yb < H && (rows[H - 1 - yb] >> x & 1) === 1;
          let p = detect(o, h, SHAPES[0]) || detect(o, h, SHAPES[1]);
          if (!p) {
            const t = detect(o, h, TST[0]) || detect(o, h, TST[1]);
            if (t) {
              p = caveSlot(o, t);
              if (!p) {
                const c2 = o(t.x - 1, t.y - 1) + o(t.x + 1, t.y - 1) + o(t.x - 1, t.y + 1) + o(t.x + 1, t.y + 1);
                if (c2 >= 3 && !fits(o, { ...t, y: t.y - 1 })) p = t;
              }
            }
          }
          if (!p) p = detect(o, h, FIN[0]) || detect(o, h, FIN[1]);
          if (!p || !fits(o, p)) return null;
          const n = rows.slice();
          for (const [dx, dy] of TS[p.rot]) {
            const yb = p.y + dy;
            if (yb >= 0 && yb < H) n[H - 1 - yb] |= 1 << p.x + dx;
          }
          const kept = n.filter((r) => r !== FULL), lines = H - kept.length;
          while (kept.length < H) kept.unshift(0);
          return { lines: Math.min(3, lines), rows: kept };
        }
        function boardValue(rows, node, P, F) {
          let v = 0;
          const H = rows.length;
          if (node.b2b > 0) {
            v += P.backToBack + P.b2bStep * Math.min(node.b2b, P.b2bCap);
            if (F) {
              F.backToBack = 1;
              F.b2bStep = Math.min(node.b2b, P.b2bCap);
            }
          }
          let h = heightsOf(rows);
          let hp = 0;
          for (let x = 0; x < W2; x++) if (h[x] > hp) hp = h[x];
          const eff = hp + (node.pend || 0);
          v += P.topQuarter * Math.max(0, eff - 15) + P.topHalf * Math.max(0, eff - 10);
          if (F) {
            F.topQuarter = Math.max(0, eff - 15);
            F.topHalf = Math.max(0, eff - 10);
          }
          let ts = (node.tAhead ? 1 : 0) + (node.hold === "t" ? 1 : 0);
          if (ts < 1) ts = 1;
          for (let i = 0; i < ts; i++) {
            const s = findTslot(rows, h);
            if (!s) break;
            v += P.tslot[s.lines];
            if (F) F["tslot" + s.lines] = (F["tslot" + s.lines] || 0) + 1;
            if (s.lines < 2) break;
            rows = s.rows;
            h = heightsOf(rows);
          }
          hp = 0;
          for (let x = 0; x < W2; x++) if (h[x] > hp) hp = h[x];
          v += P.height * hp;
          if (F) F.height = hp;
          let well = 0;
          for (let x = 1; x < W2; x++) if (h[x] <= h[well]) well = x;
          let depth = 0;
          for (let yb = h[well]; yb < 20; yb++) {
            const r = rows[H - 1 - yb];
            if ((r | 1 << well) !== FULL) break;
            depth++;
          }
          depth = Math.min(depth, P.maxWell);
          v += P.wellDepth * depth;
          if (depth) v += P.wellColumn[well];
          if (F) {
            F.wellDepth = depth;
            if (depth) F["wc" + well] = 1;
          }
          if (P.rowTrans) {
            let t = 0;
            for (let y = 0; y < H; y++) {
              const r = rows[y];
              if (!r) continue;
              const d = (r | 1 << W2) ^ (1 | r << 1);
              t += popc(d);
            }
            v += P.rowTrans * t;
            if (F) F.rowTrans = t;
          }
          {
            let b = -1, bs = -1, prev = well === 0 ? 1 : 0;
            for (let i = 1; i < W2; i++) {
              if (i === well) continue;
              const d = Math.abs(h[prev] - h[i]);
              b += d;
              bs += d * d;
              prev = i;
            }
            v += P.bump * Math.abs(b) + P.bumpSq * Math.abs(bs);
            if (F) {
              F.bump = Math.abs(b);
              F.bumpSq = Math.abs(bs);
            }
          }
          let cav = 0, ov = 0, cov = 0, covSq = 0;
          for (let yb = 0; yb < hp; yb++) {
            const r = rows[H - 1 - yb];
            for (let x = 0; x < W2; x++) {
              if (r >> x & 1 || yb >= h[x]) continue;
              if (x > 1 && h[x - 1] <= yb - 1 && h[x - 2] <= yb) {
                ov++;
                continue;
              }
              if (x < 8 && h[x + 1] <= yb - 1 && h[x + 2] <= yb) {
                ov++;
                continue;
              }
              cav++;
            }
          }
          for (let x = 0; x < W2; x++) for (let yb = h[x] - 3; yb >= 0; yb--) {
            if (!(rows[H - 1 - yb] >> x & 1)) {
              const c2 = Math.min(6, h[x] - yb - 1);
              cov += c2;
              covSq += c2 * c2;
            }
          }
          v += P.cavity * cav + P.cavitySq * cav * cav + P.overhang * ov + P.overhangSq * ov * ov + P.covered * cov + P.coveredSq * covSq;
          if (F) Object.assign(F, { cavity: cav, cavitySq: cav * cav, overhang: ov, overhangSq: ov * ov, covered: cov, coveredSq: covSq });
          return v;
        }
        function moveFeatures(rows, type, p, ctx, P0) {
          const P = { ...DEFAULTS, ...P0 || {} }, g = ctx.g | 0, r = lock(rows, type, p, g), F = {};
          const b2bBefore = Math.max(0, ctx.b2b | 0);
          let b2b = b2bBefore, combo = Math.max(0, ctx.combo | 0);
          if (r.lines) {
            combo++;
            const special = p.spin || r.lines === 4, fullT = type === "t" && p.spin === 2;
            if (fullT) F["tspin" + Math.min(3, r.lines)] = 1;
            else if (type === "t" && p.spin === 1) {
              if (combo < 2) F.tMiniSolo = 1;
            } else {
              F["clear" + Math.min(4, r.lines)] = 1;
              if (p.spin) F.allSpin = 1;
            }
            if (special && b2bBefore > 0) F.b2bClear = 1;
            F.comboW = COMBO_G[Math.min(11, combo - 1)];
            if (!special && b2b > 0) b2b = 0;
            if (special) b2b++;
            if (r.lines === 4 && combo >= 2 && g > 0) F.renQuad = 1;
            if (r.dug) F.digW = r.dug;
          } else combo = 0;
          if (type === "t" && !(type === "t" && p.spin === 2 && r.lines) && !(r.lines && combo >= 2)) F.wastedT = 1;
          boardValue(r.rows, { b2b, hold: ctx.hold || null, tAhead: !!ctx.tAhead, pend: 0 }, P, F);
          return { F, lines: r.lines, rows: r.rows };
        }
        function kindOf(type, spin, lines, dug, combo, g) {
          if (!lines) return null;
          if (type === "t" && spin === 2) return "tspin" + Math.min(3, lines);
          if (type === "t" && spin === 1) return "tmini";
          if (spin) return "allSpin";
          if (lines === 4) return dug > 0 ? combo >= 2 && g > 0 ? "renQuad" : "digQuad" : "quad";
          return null;
        }
        const KINDS = ["tspin1", "tspin2", "tspin3", "tmini", "allSpin", "quad", "digQuad", "renQuad"];
        const FIT_KEYS = [
          "backToBack",
          "b2bStep",
          "bump",
          "bumpSq",
          "rowTrans",
          "height",
          "topHalf",
          "topQuarter",
          "cavity",
          "cavitySq",
          "overhang",
          "overhangSq",
          "covered",
          "coveredSq",
          "tslot0",
          "tslot1",
          "tslot2",
          "tslot3",
          "wellDepth",
          "wc0",
          "wc1",
          "wc2",
          "wc3",
          "wc4",
          "wc5",
          "wc6",
          "wc7",
          "wc8",
          "wc9",
          "clear1",
          "clear2",
          "clear3",
          "clear4",
          "tspin1",
          "tspin2",
          "tspin3",
          "b2bClear",
          "comboW",
          "allSpin",
          "wastedT",
          "tMiniSolo",
          "renQuad",
          "digW"
        ];
        function weightsOf(P0) {
          const P = { ...DEFAULTS, ...P0 || {} }, w = {};
          for (const k of FIT_KEYS) {
            let m;
            if (m = /^tslot(\d)$/.exec(k)) w[k] = P.tslot[+m[1]];
            else if (m = /^wc(\d)$/.exec(k)) w[k] = P.wellColumn[+m[1]];
            else if (m = /^clear(\d)$/.exec(k)) w[k] = P.clear[+m[1]];
            else if (m = /^tspin(\d)$/.exec(k)) w[k] = P.tspin[+m[1]];
            else w[k] = P[k];
          }
          return w;
        }
        function optionsOf(w) {
          const o = { tslot: [], wellColumn: [], clear: [0], tspin: [0] };
          for (const k of FIT_KEYS) {
            let m;
            const v = w[k];
            if (m = /^tslot(\d)$/.exec(k)) o.tslot[+m[1]] = v;
            else if (m = /^wc(\d)$/.exec(k)) o.wellColumn[+m[1]] = v;
            else if (m = /^clear(\d)$/.exec(k)) o.clear[+m[1]] = v;
            else if (m = /^tspin(\d)$/.exec(k)) o.tspin[+m[1]] = v;
            else o[k] = v;
          }
          return o;
        }
        function popc(n) {
          n = n - (n >> 1 & 1431655765);
          n = (n & 858993459) + (n >> 2 & 858993459);
          return (n + (n >> 4) & 252645135) * 16843009 >> 24;
        }
        function lock(rows, type, p, g) {
          const n = rows.slice(), H = n.length;
          for (const [cx, cy] of SP2.__shapes()[type][p.r]) {
            const y = p.y + cy;
            if (y >= 0) n[y] |= 1 << p.x + cx;
          }
          let lines = 0, dug = 0;
          const kept = [];
          for (let y = 0; y < H; y++) {
            if (n[y] === FULL) {
              lines++;
              if (y >= H - g) dug++;
            } else kept.push(n[y]);
          }
          while (kept.length < H) kept.unshift(0);
          return { rows: kept, lines, dug };
        }
        function addGarbage(rows, n, hole) {
          const out = rows.slice(n);
          const r = FULL & ~(1 << hole);
          for (let i = 0; i < n; i++) out.push(r);
          return out;
        }
        function nextPossible(seq) {
          const can = /* @__PURE__ */ new Set();
          for (let off = 0; off < 7; off++) {
            let ok = true;
            for (let s2 = -off; s2 < seq.length && ok; s2 += 7) {
              const seen = /* @__PURE__ */ new Set();
              for (let i = Math.max(0, s2); i < Math.min(seq.length, s2 + 7); i++) {
                if (seen.has(seq[i])) ok = false;
                seen.add(seq[i]);
              }
            }
            if (!ok) continue;
            const s = seq.length - (seq.length + off) % 7;
            const used = new Set(seq.slice(Math.max(0, s)));
            for (const t of PIECES) if (!used.has(t)) can.add(t);
          }
          return can.size ? [...can] : PIECES.slice();
        }
        function rng(seed) {
          let s = seed >>> 0 || 1;
          return () => {
            s ^= s << 13;
            s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5;
            s >>>= 0;
            return s / 4294967296;
          };
        }
        let ORI = null;
        function oris() {
          if (ORI) return ORI;
          ORI = [];
          const S = SP2.__shapes(), seen = /* @__PURE__ */ new Set();
          for (const type of PIECES) for (const cells of S[type]) {
            const c2 = cells.map(([cx, cy]) => [cx, -cy]).sort((a, b) => a[1] - b[1] || a[0] - b[0]), o = c2.map(([x, k]) => [x - c2[0][0], k - c2[0][1]]), key = type + o.join(";");
            if (!seen.has(key)) {
              seen.add(key);
              ORI.push({ type, c: o });
            }
          }
          return ORI;
        }
        function tilings(rem, free, avail, cap, budget) {
          const n = rem.reduce((a, m) => a + popc(m), 0);
          if (!n) return 1;
          const O = oris(), cnt = {}, stack = [], L = rem.length;
          let found = 0, left = budget;
          const order = () => {
            const n2 = stack.length, after = stack.map(() => []);
            for (let a = 0; a < n2; a++) for (let b = 0; b < n2; b++) if (a !== b && stack[a].some(([x, k]) => stack[b].some(([X, K]) => X === x && K > k))) after[a].push(b);
            const st = new Int8Array(n2);
            const loop = (v) => {
              st[v] = 1;
              for (const w of after[v]) {
                if (st[w] === 1 || st[w] === 0 && loop(w)) return true;
              }
              st[v] = 2;
              return false;
            };
            for (let v = 0; v < n2; v++) if (!st[v] && loop(v)) return false;
            return true;
          };
          const rec = () => {
            if (found >= cap || left-- <= 0) return;
            let k = 0;
            while (k < L && !rem[k]) k++;
            if (k >= L) {
              if (order()) found++;
              return;
            }
            const x = 31 - Math.clz32(rem[k] & -rem[k]);
            for (const o of O) {
              if ((cnt[o.type] | 0) >= (avail[o.type] | 0)) continue;
              for (const [ax, ak] of o.c) {
                const cs = o.c.map(([dx, dk]) => [x + dx - ax, k + dk - ak]);
                let ok = true;
                for (const [X, K] of cs) {
                  if (X < 0 || X >= W2 || K < 0 || K >= L || !((rem[K] | free[K]) >> X & 1) || (K < k || K === k && X < x) && rem[K] >> X & 1) {
                    ok = false;
                    break;
                  }
                }
                if (!ok) continue;
                const was = cs.map(([X, K]) => rem[K] >> X & 1);
                for (const [X, K] of cs) {
                  rem[K] &= ~(1 << X);
                  free[K] &= ~(1 << X);
                }
                cnt[o.type] = (cnt[o.type] | 0) + 1;
                stack.push(cs);
                rec();
                stack.pop();
                cnt[o.type]--;
                cs.forEach(([X, K], i) => {
                  if (was[i]) rem[K] |= 1 << X;
                  else free[K] |= 1 << X;
                });
                if (found >= cap) return;
              }
            }
          };
          rec();
          return found;
        }
        function create(engine, state, options = {}) {
          const P = { ...DEFAULTS, ...root.__treePlannerParams || {}, ...options };
          if (!SP2.load(engine, String(P.kickset || "SRS+"))) return null;
          if (SP2.useRules) SP2.useRules({ allow180: P.allow180 !== false, slam: !!P.slam });
          const H = state.board.length, rows0 = new Array(H);
          for (let y = 0; y < H; y++) {
            let m = 0;
            for (let x = 0; x < W2; x++) if (state.board[y][x] !== null) m |= 1 << x;
            rows0[y] = m;
          }
          const seq = [String(state.falling).toLowerCase(), ...(state.queue || []).map((t) => String(t).toLowerCase())].filter((t) => PIECES.includes(t));
          const holdOk = state.holdAllowed !== false, rand = rng(P.seed), holes = (P.garbageHoles || []).slice();
          const g0 = Math.max(0, Number(P.gRows) || 0);
          const rootNode = {
            rows: rows0,
            hold: state.hold ? String(state.hold).toLowerCase() : null,
            qi: 0,
            b2b: Math.max(0, state.b2b | 0),
            combo: Math.max(0, state.combo | 0),
            pend: Math.max(0, Number(P.incoming) || 0),
            g: g0,
            gi: 0,
            acc: 0,
            eval: 0,
            children: null,
            spec: null,
            depth: 0
          };
          let rootCells = 0;
          for (const m of rows0) if (m) rootCells += popc(m);
          const opens = (P.openers || []).map((o) => {
            const rows = o.rows || o;
            return { rows, empty: o.empty || rows.map(() => 0), book: o.book || null, n: o.n || 1 };
          }).filter(() => P.openLive !== void 0 ? !!P.openLive : !g0), openOn = opens.length > 0;
          const seen = /* @__PURE__ */ new Map();
          let nodes = 0, done = false, spent = 0, best = null, maxDepth = 0, iters = 0;
          const pieceAt = (i, extra) => i < seq.length ? seq[i] : extra;
          function expandWith(node, cur, next) {
            const out2 = [];
            const opts = [[cur, node.hold, 1, false]];
            if (holdOk) {
              if (node.hold && node.hold !== cur) opts.push([node.hold, cur, 1, true]);
              else if (!node.hold && next) opts.push([next, cur, 2, true]);
            }
            for (const [type, hold, adv, held] of opts) {
              for (const p of SP2.placements(node.rows, type, 4, 19, P.maxTail)) {
                const r = lock(node.rows, type, p, node.g);
                const c2 = child(node, type, p, r, hold, adv, held);
                nodes++;
                if (c2) out2.push(c2);
              }
            }
            return out2;
          }
          function child(node, type, p, r, hold, adv, held) {
            let rew = 0;
            if (P.protect && !r.lines) {
              const H2 = r.rows.length;
              for (let k = 0; k < P.protect.length; k++) if (r.rows[H2 - 1 - k] & P.protect[k]) {
                rew -= P.protectW;
                break;
              }
            }
            let b2b = node.b2b, combo = node.combo, pend = node.pend, g = node.g - r.dug, rows = r.rows, gi = node.gi;
            const fullT = type === "t" && p.spin === 2;
            if (r.lines) {
              combo++;
              const special = p.spin || r.lines === 4;
              let atk = SP2.attackOf(type, p.spin, r.lines, b2b, combo);
              if (!special && b2b > 0) {
                if (P.charging && b2b > P.chargeAt) atk += b2b - P.chargeAt + P.chargeBase;
                b2b = 0;
              }
              if (special) b2b++;
              let pc = true;
              for (let y = 0; y < rows.length; y++) if (rows[y]) {
                pc = false;
                break;
              }
              if (pc) {
                atk += P.pcAttack;
                b2b += P.pcB2B;
              }
              if (P.style === "cc1") {
                const b2bBefore = node.b2b;
                if (fullT) rew += P.tspin[Math.min(3, r.lines)];
                else if (type === "t" && p.spin === 1) {
                  if (combo < 2) rew += P.tMiniSolo;
                } else {
                  rew += P.clear[Math.min(4, r.lines)];
                  if (p.spin) rew += P.allSpin;
                }
                if (special && b2bBefore > 0) rew += P.b2bClear;
                rew += P.comboW * COMBO_G[Math.min(11, combo - 1)];
                if (pc) rew += P.atkW * P.pcAttack;
                if (!special && b2bBefore > P.chargeAt && P.charging) rew += P.atkW * (b2bBefore - P.chargeAt + P.chargeBase);
              } else {
                rew += P.atkW * atk;
                if (!p.spin && r.lines < 4 && combo < 2) rew += [0, P.clear1, P.clear2, P.clear3][r.lines];
                if (type === "t" && p.spin === 1 && combo < 2) rew += P.tMiniSolo;
              }
              if (r.lines === 4 && combo >= 2 && node.g > 0) rew += P.renQuad;
              rew += P.digW * r.dug;
              if (P.followKind && kindOf(type, p.spin, r.lines, r.dug, combo, node.g) === P.followKind) rew += P.followW;
              if (P.ban && P.ban.length || P.kindBias) {
                const k = kindOf(type, p.spin, r.lines, r.dug, combo, node.g);
                if (k) {
                  if (P.ban && P.ban.includes(k)) rew -= P.banW;
                  if (P.kindBias && P.kindBias[k]) rew += P.kindBias[k];
                }
              }
              if (P.tank && pend > 0 && atk > 0) {
                const h = heightsOf(rows);
                let top = 0;
                for (let x = 0; x < W2; x++) if (h[x] > top) top = h[x];
                if (top + pend <= P.tankSafe) rew -= P.tankW * Math.min(pend, atk);
              }
              pend = Math.max(0, pend - atk);
            } else {
              combo = 0;
              if (P.simGarbage && pend > 0) {
                const n2 = Math.min(pend, P.garbageCap) | 0;
                if (n2 > 0) {
                  const hc = holes[gi] ?? wellOf(rows);
                  gi++;
                  rows = addGarbage(rows, n2, hc);
                  pend -= n2;
                  g += n2;
                }
              }
            }
            if (type === "t" && !(fullT && r.lines) && !(r.lines && combo >= 2)) rew += P.wastedT;
            const qi = node.qi + adv;
            const n = {
              rows,
              hold,
              qi,
              b2b,
              combo,
              pend,
              g,
              gi,
              acc: node.acc + rew,
              eval: 0,
              children: null,
              spec: null,
              parent: node,
              depth: node.depth + 1,
              move: node.depth === 0 ? { x: p.x, y: p.y, r: p.r, type, hold: held, spin: p.spin } : node.move,
              dead: rows[0] !== 0 || rows[1] !== 0
            };
            if (P.merge) {
              let h1 = 2166136261, h2 = qi * 31 + b2b * 7 + combo * 3 + pend * 131 + (hold ? hold.charCodeAt(0) : 0);
              for (let y = 0; y < rows.length; y++) {
                const v = rows[y];
                if (!v) continue;
                h1 = Math.imul(h1 ^ v ^ y << 10, 16777619);
                h2 = h2 * 33 + v + y | 0;
              }
              const k = h1 + ":" + h2, prev = seen.get(k);
              if (prev !== void 0 && prev >= n.acc) return null;
              seen.set(k, n.acc);
            }
            n.tAhead = seq.indexOf("t", qi) >= 0;
            n.eval = n.dead ? -1e9 : n.acc + boardValue(rows, n, P) + (openOn && !g ? openBonus(rows) : 0);
            return n;
          }
          function openBonus(rows) {
            let best2 = Infinity;
            const H2 = rows.length;
            for (const o of opens) {
              const t = o.rows;
              let s = 0;
              for (let k = 0; k < t.length && k < H2; k++) s += popc(t[k] & ~rows[H2 - 1 - k]) + popc(o.empty[k] & rows[H2 - 1 - k]);
              if (s < best2) best2 = s;
            }
            return -P.openW * best2 / 4;
          }
          function wellOf(rows) {
            const h = heightsOf(rows);
            let w = 0;
            for (let x = 1; x < W2; x++) if (h[x] <= h[w]) w = x;
            return w;
          }
          function expand(node) {
            const cur = pieceAt(node.qi, null);
            if (cur) {
              node.children = expandWith(node, cur, pieceAt(node.qi + 1, null));
              node.children.sort((a, b) => b.eval - a.eval);
              return;
            }
            if (!P.speculate) {
              node.children = [];
              return;
            }
            const known = seq.slice(0, node.qi);
            node.spec = {};
            for (const t of nextPossible(known.length ? known : seq)) {
              const l = expandWith(node, t, null);
              l.sort((a, b) => b.eval - a.eval);
              node.spec[t] = l;
            }
            node.children = [];
          }
          function score(node) {
            if (node.spec) {
              const ks = Object.keys(node.spec);
              let s = 0, n = 0;
              for (const k of ks) {
                const l = node.spec[k];
                if (l.length) {
                  s += l[0].eval;
                  n++;
                }
              }
              return n ? s / n : -1e9;
            }
            if (node.children && node.children.length) return node.children[0].eval;
            return node.eval;
          }
          function pick(list) {
            let tot = 0;
            const k = Math.min(list.length, 8);
            for (let i = 0; i < k; i++) tot += 1 / ((i + 1) * (i + 1));
            let r = rand() * tot;
            for (let i = 0; i < k; i++) {
              r -= 1 / ((i + 1) * (i + 1));
              if (r <= 0) return list[i];
            }
            return list[0];
          }
          function iterate() {
            let node = rootNode;
            const path = [node];
            while (true) {
              if (node.spec) {
                const ks = Object.keys(node.spec).filter((k) => node.spec[k].length);
                if (!ks.length) break;
                node = pick(node.spec[ks[rand() * ks.length | 0]]);
              } else if (node.children && node.children.length) node = pick(node.children.filter((c2) => !c2.dead).length ? node.children : node.children);
              else if (node.children) break;
              else {
                expand(node);
                break;
              }
              path.push(node);
              if (node.dead) break;
            }
            iters++;
            if (node.depth > maxDepth) maxDepth = node.depth;
            for (let i = path.length - 1; i >= 0; i--) {
              const n = path[i];
              if (n.children && (n.children.length || n.spec)) {
                if (n.spec) for (const k in n.spec) n.spec[k].sort((a, b) => b.eval - a.eval);
                else n.children.sort((a, b) => b.eval - a.eval);
                n.eval = score(n);
              }
            }
            return path.length === 1 && rootNode.children && !rootNode.children.length;
          }
          function openPlan(list) {
            if (!openOn) return null;
            const H2 = rows0.length, D0 = rootCells / 4 + (rootNode.hold ? 1 : 0);
            const better = (a, b) => a.ok !== b.ok ? a.ok > b.ok : a.g !== b.g ? a.g > b.g : a.ways > b.ways;
            let best2 = null;
            for (const o of opens) {
              const t = o.rows, e = o.empty, L = t.length;
              const bad = (rows) => {
                for (let k = 0; k < e.length; k++) if (rows[H2 - 1 - k] & e[k]) return true;
                return false;
              };
              const need = (rows) => {
                let c2 = 0;
                for (let k = 0; k < L; k++) c2 += popc(t[k] & ~rows[H2 - 1 - k]);
                return c2;
              };
              if (bad(rows0) || !need(rows0)) continue;
              const blocked = (rows) => {
                const top = new Int8Array(W2).fill(-1);
                for (let x = 0; x < W2; x++) for (let k = H2 - 1; k >= 0; k--) if (rows[H2 - 1 - k] >> x & 1) {
                  top[x] = k;
                  break;
                }
                let c2 = 0;
                for (let k = 0; k < L; k++) {
                  const row = rows[H2 - 1 - k];
                  for (let x = 0; x < W2; x++) {
                    if (!(t[k] >> x & 1) || row >> x & 1 || top[x] < k) continue;
                    let ok = false;
                    for (const dir of [-1, 1]) for (let s = 1, X = x + dir; s <= 3 && X >= 0 && X < W2 && !(row >> X & 1); s++, X += dir) if (top[X] < k) {
                      ok = true;
                      break;
                    }
                    if (!ok) c2++;
                  }
                }
                return c2;
              };
              const memo = /* @__PURE__ */ new Map(), tmemo = /* @__PURE__ */ new Map();
              let budget = P.openBudget;
              const leaf = (rows, hold, qi) => {
                const left = seq.slice(qi), key = rows.join(",") + "|" + hold + "|" + left.join("");
                let w = tmemo.get(key);
                if (w === void 0) {
                  const rem = [], free = [];
                  for (let k = 0; k < L + 1; k++) {
                    const b = rows[H2 - 1 - k] || 0, tk = t[k] || 0;
                    rem.push(tk & ~b);
                    free.push(FULL & ~tk & ~(e[k] || 0) & ~b);
                  }
                  const n = Math.ceil(rem.reduce((a, m) => a + popc(m), 0) / 4) + 2, avail = {};
                  for (const x of left) avail[x] = (avail[x] || 0) + 1;
                  if (hold) avail[hold] = (avail[hold] || 0) + 1;
                  const gl = D0 + seq.length - 1, B = Math.floor(gl / 7), inB = /* @__PURE__ */ new Set();
                  for (let j = 0; j < seq.length; j++) if (Math.floor((D0 + j) / 7) === B) inB.add(seq[j]);
                  const restN = 6 - gl % 7;
                  if (restN > 0) {
                    for (const x of PIECES) if (!inB.has(x)) avail[x] = (avail[x] || 0) + 1;
                  }
                  const bags = Math.max(0, Math.ceil((n - left.length - (hold ? 1 : 0) - restN) / 7));
                  if (bags) for (const x of PIECES) avail[x] = (avail[x] || 0) + bags;
                  avail.t = 0;
                  w = tilings(rem, free, avail, 4, 400);
                  tmemo.set(key, w);
                }
                return { ok: w > 0 ? 1 : 0, g: 0, ways: w };
              };
              const tKeep = !(rootNode.hold === "t" && seq[0] === "t");
              const tall = (rows) => {
                for (let k = L + 1; k < H2; k++) if (rows[H2 - 1 - k]) return true;
                return false;
              };
              const okMove = (rows, type, p) => {
                const r = lock(rows, type, p, 0);
                if (r.lines || bad(r.rows) || tall(r.rows)) return null;
                if (type === "t" && tKeep) return null;
                if (blocked(r.rows) > blocked(rows)) return null;
                return r;
              };
              const dfs = (rows, hold, qi) => {
                const cur = qi < P.openDepth ? seq[qi] : null;
                if (!cur || budget-- <= 0) return leaf(rows, hold, qi);
                const key = rows.join(",") + "|" + hold + "|" + qi;
                if (memo.has(key)) return memo.get(key);
                let out2 = leaf(rows, hold, qi);
                const opts = [[cur, hold, qi + 1]];
                if (holdOk) {
                  if (hold && hold !== cur) opts.push([hold, cur, qi + 1]);
                  else if (!hold && seq[qi + 1]) opts.push([seq[qi + 1], cur, qi + 2]);
                }
                const n02 = need(rows);
                for (const [type, h2, q2] of opts) for (const p of SP2.placements(rows, type, 4, 19, P.maxTail)) {
                  const r = okMove(rows, type, p);
                  if (!r) continue;
                  const sub = dfs(r.rows, h2, q2), v = { ok: sub.ok, g: sub.g + n02 - need(r.rows), ways: sub.ways };
                  if (better(v, out2)) out2 = v;
                }
                memo.set(key, out2);
                return out2;
              };
              const n0 = need(rows0);
              for (const c2 of list) {
                if (c2.dead) continue;
                const m = c2.move;
                const r = okMove(rows0, m.type, m);
                if (!r) continue;
                const h2 = m.hold ? rootNode.hold ? seq[0] : seq[0] : rootNode.hold, q2 = m.hold && !rootNode.hold ? 2 : 1;
                const sub = dfs(r.rows, h2, q2), v = { ok: sub.ok, g: sub.g + n0 - need(r.rows), ways: sub.ways, c: c2 };
                if (v.ok && (!best2 || better(v, best2))) best2 = v;
              }
            }
            if (root.__openDbg) root.__openDbg(best2 && { g: best2.g, ways: best2.ways, type: best2.c.move.type }, rootCells);
            return best2 ? best2.c : null;
          }
          function bookPlan(list) {
            if (!openOn) return null;
            const H2 = rows0.length, S = SP2.__shapes();
            let doneAny = false;
            const picks = [];
            const sq = seq.slice();
            {
              const D0 = Math.round(rootCells / 4) + (rootNode.hold ? 1 : 0), at = (D0 + sq.length) % 7;
              if (at === 6) {
                const inB = new Set(sq.slice(sq.length - 6));
                const left = PIECES.filter((t) => !inB.has(t));
                if (left.length === 1) sq.push(left[0]);
              }
            }
            for (const o of opens) {
              const B = o.book;
              if (!B || !B.length) continue;
              const e = o.empty, L = o.rows.length;
              const rb = new Array(L + 6);
              for (let k = 0; k < L + 6; k++) rb[k] = rows0[H2 - 1 - k] || 0;
              let bad = false;
              for (let k = 0; k < e.length; k++) if (rb[k] & e[k]) {
                bad = true;
                break;
              }
              if (bad) continue;
              let done2 = 0;
              for (let i = 0; i < B.length && !bad; i++) {
                let f = 0;
                for (const [x, k] of B[i].c) if (rb[k] >> x & 1) f++;
                if (f === 4) done2 |= 1 << i;
                else if (f) bad = true;
              }
              if (bad) continue;
              if (done2 === (1 << B.length) - 1) {
                doneAny = true;
                continue;
              }
              const dep = B.map((q, i) => {
                let m = 0;
                B.forEach((r, j) => {
                  if (j !== i && q.c.some(([x, k]) => r.c.some(([X, K]) => X === x && K < k))) m |= 1 << j;
                });
                return m;
              });
              const rmemo = /* @__PURE__ */ new Map();
              const reach = (rows, i) => {
                const key = i + "|" + rows.join(",");
                let v = rmemo.get(key);
                if (v !== void 0) return v;
                const full = new Array(H2).fill(0);
                for (let k = 0; k < rows.length; k++) full[H2 - 1 - k] = rows[k];
                v = false;
                for (const q of SP2.placements(full, B[i].t, 4, 19, P.maxTail)) {
                  const cs = S[B[i].t][q.r];
                  if (B[i].c.every(([x, k]) => cs.some(([cx, cy]) => q.x + cx === x && H2 - 1 - (q.y + cy) === k))) {
                    v = true;
                    break;
                  }
                }
                rmemo.set(key, v);
                return v;
              };
              const fits2 = (rows, i) => {
                let sup = false, drop = true;
                for (const [x, k] of B[i].c) {
                  if (rows[k] >> x & 1) return 0;
                  if (k === 0 || rows[k - 1] >> x & 1) sup = true;
                  if (drop) {
                    for (let K = k + 1; K < rows.length; K++) if (rows[K] >> x & 1) {
                      drop = false;
                      break;
                    }
                  }
                }
                return !sup ? 0 : drop ? 2 : 1;
              };
              const can = (rows, dn, i) => {
                if (dn >> i & 1) return false;
                const f = fits2(rows, i);
                if (!f || f === 1 && !reach(rows, i)) return false;
                if ((dep[i] & ~dn) !== 0) {
                  const n = put(rows, i);
                  for (let j = 0; j < B.length; j++) if (dep[i] >> j & 1 && !(dn >> j & 1)) {
                    const g = fits2(n, j);
                    if (g === 1 && !reach(n, j)) return false;
                  }
                }
                return true;
              };
              const put = (rows, i) => {
                const n = rows.slice();
                for (const [x, k] of B[i].c) n[k] |= 1 << x;
                return n;
              };
              const memo = /* @__PURE__ */ new Map();
              const dfs = (rows, dn, hold, qi) => {
                const cur = sq[qi];
                if (!cur) return 0;
                const key = dn + "|" + hold + "|" + qi;
                if (memo.has(key)) return memo.get(key);
                let best3 = 0;
                const opts = [[cur, hold, qi + 1]];
                if (holdOk) {
                  if (hold && hold !== cur) opts.push([hold, cur, qi + 1]);
                  else if (!hold && sq[qi + 1]) opts.push([sq[qi + 1], cur, qi + 2]);
                }
                for (const [type, h2, q2] of opts) {
                  let placed = false;
                  for (let i = 0; i < B.length; i++) if (B[i].t === type && can(rows, dn, i)) {
                    placed = true;
                    const v = 1 + dfs(put(rows, i), dn | 1 << i, h2, q2);
                    if (v > best3) best3 = v;
                  }
                  if (!placed && (type !== "t" || h2 === "t")) {
                    const v = dfs(rows, dn, h2, q2) - 0.01;
                    if (v > best3) best3 = v;
                  }
                }
                memo.set(key, best3);
                return best3;
              };
              const rem = new Array(L + 6).fill(0);
              for (let i = 0; i < B.length; i++) if (!(done2 >> i & 1)) for (const [x, k] of B[i].c) rem[k] |= 1 << x;
              const tKeep = !(rootNode.hold === "t" && seq[0] === "t");
              let best2 = null;
              const DBG = root.__bookDbg ? { cover: 0, slot: 0, tall: 0, over: 0, tk: 0, dep: 0, lines: 0, free: 0 } : null;
              for (const c2 of list) {
                if (c2.dead) continue;
                const m = c2.move, cells = S[m.type][m.r].map(([cx, cy]) => [m.x + cx, H2 - 1 - (m.y + cy)]);
                if (cells.some(([x, k]) => k < 0 || k >= L + 6)) continue;
                const r = lock(rows0, m.type, m, 0);
                if (r.lines) continue;
                const h2 = m.hold ? seq[0] : rootNode.hold, q2 = m.hold && !rootNode.hold ? 2 : 1;
                let bi = -1;
                for (let i = 0; i < B.length; i++) if (!(done2 >> i & 1) && B[i].t === m.type && B[i].c.every(([x, k]) => cells.some(([X, K]) => X === x && K === k))) {
                  bi = i;
                  break;
                }
                let v;
                if (bi >= 0) {
                  if (!can(rb, done2, bi)) continue;
                  v = 1 + dfs(put(rb, bi), done2 | 1 << bi, h2, q2) + (m.type === "t" ? 5e-3 : 0) + (m.hold ? 0 : 1e-3);
                } else {
                  if (m.type === "t" && tKeep) {
                    if (DBG) DBG.tk++;
                    continue;
                  }
                  let ok = true;
                  for (const [x, k] of cells) {
                    if (rem[k] >> x & 1 || (e[k] || 0) >> x & 1 || k > L + 3) {
                      ok = false;
                      if (DBG) DBG[rem[k] >> x & 1 ? "cover" : (e[k] || 0) >> x & 1 ? "slot" : "tall"]++;
                      break;
                    }
                    for (let K = 0; K < k; K++) if (rem[K] >> x & 1) {
                      ok = false;
                      if (DBG) DBG.over++;
                      break;
                    }
                    if (!ok) break;
                  }
                  if (!ok) continue;
                  const n = rb.slice();
                  for (const [x, k] of cells) n[k] |= 1 << x;
                  v = dfs(n, done2, h2, q2) - 0.01;
                  if (DBG) {
                    DBG.free++;
                    DBG.fv = v;
                  }
                }
                if (!best2 || v > best2.v + 1e-9) best2 = { v, c: c2, book: bi >= 0 };
              }
              if (root.__bookDbg) root.__bookDbg({ done: done2.toString(2), best: best2 && { v: best2.v, book: best2.book, t: best2.c.move.type }, why: DBG, list: list.length, seq: seq.join(""), hold: rootNode.hold });
              if (best2 && best2.v > 0) picks.push({ ...best2, o });
            }
            if (!picks.length) return doneAny ? { done: true } : null;
            const top = Math.max(...picks.map((p) => p.v)), near = picks.filter((p) => p.v >= top - 0.5);
            let pick2 = near[0];
            if (near.length > 1) {
              let tot = near.reduce((a, p) => a + p.o.n, 0), r = Math.random() * tot;
              for (const p of near) {
                r -= p.o.n;
                if (r <= 0) {
                  pick2 = p;
                  break;
                }
              }
            }
            if (root.__openDbg) root.__openDbg({ book: pick2.book, v: pick2.v, type: pick2.c.move.type }, rootCells);
            return { c: pick2.c };
          }
          function result() {
            const list = rootNode.children || [];
            if (!list.length) return null;
            const bp = bookPlan(list);
            if (bp && bp.c) return out(bp.c);
            const op = bp && bp.done ? null : openPlan(list);
            if (op) return out(op);
            const inc = Math.max(0, Number(P.incoming) || 0);
            const pickList = [];
            for (const c3 of list) {
              if (c3.dead) continue;
              if (inc) {
                const h = heightsOf(c3.rows);
                if (!(h[3] + c3.pend <= 20 && h[4] + c3.pend <= 20 && h[5] + c3.pend <= 20)) continue;
              }
              pickList.push(c3);
            }
            if (!pickList.length) return out(list[0]);
            let c2 = pickList[0];
            if (P.pickBeta > 0) {
              const top = pickList.slice(0, 6), w = top.map((x) => Math.exp(P.pickBeta * (x.eval - c2.eval)));
              let s = w.reduce((a, b) => a + b, 0) * Math.random();
              for (let i = 0; i < top.length; i++) {
                s -= w[i];
                if (s <= 0) {
                  c2 = top[i];
                  break;
                }
              }
            }
            if (P.misdrop > 0 && Math.random() < P.misdrop) {
              const m = c2.move, near = list.filter((x) => !x.dead && x.move.type === m.type && x.move.hold === m.hold && x.move.r === m.r && Math.abs(x.move.x - m.x) === 1);
              if (near.length) c2 = near[Math.random() * near.length | 0];
            }
            return out(c2);
          }
          function dbg(c2) {
            if (!root.__treeDebug) return;
            const r = lock(rootNode.rows, c2.move.type, c2.move, rootNode.g);
            if (!r.lines || c2.move.spin || r.lines === 4) return;
            const show = (rows) => rows.slice(-12).map((m) => Array.from({ length: W2 }, (_, x) => m >> x & 1 ? "#" : ".").join("")).join("\n");
            console.error("PLAIN", r.lines, "b2b", rootNode.b2b, "combo", rootNode.combo, "pend", rootNode.pend, "seq", seq.join(""), "hold", rootNode.hold);
            console.error(show(rootNode.rows));
            for (const k of (rootNode.children || []).slice(0, 4)) {
              let n = k, line = [];
              while (n) {
                line.push(n.move && n === k ? k.move.type + k.move.x + "," + k.move.r + (k.move.hold ? "H" : "") : "");
                n = n.children && n.children[0];
              }
              console.error(" cand", k.move.type, k.move.x, k.move.r, "acc", k.acc | 0, "eval", k.eval | 0, "own", k.eval - k.acc | 0);
            }
          }
          const out = (c2) => (dbg(c2), { ...c2.move, value: c2.eval, nodes, iters, depth: maxDepth });
          return {
            step(ms = 4) {
              if (done) return true;
              const t0 = performance.now(), end = t0 + Math.min(ms, Math.max(1, P.ms - spent));
              try {
                if (!rootNode.children) expand(rootNode);
                while (performance.now() < end) {
                  if (iterate() || nodes >= P.maxNodes || iters >= P.maxIters) {
                    done = true;
                    break;
                  }
                }
                if (spent + performance.now() - t0 >= P.ms) done = true;
              } catch (e) {
                done = true;
                if (root.__treeDebug) console.error(e);
              }
              spent += performance.now() - t0;
              if (done) best = result();
              return done;
            },
            result: () => done ? best : result(),
            get done() {
              return done;
            },
            get spent() {
              return spent;
            },
            get nodes() {
              return nodes;
            },
            stop() {
              if (!done) {
                done = true;
                best = result();
              }
              return best;
            }
          };
        }
        function plan(engine, state, options = {}) {
          const p = create(engine, state, options);
          if (!p) return null;
          while (!p.step(50)) ;
          return p.result();
        }
        const api = { create, plan, boardValue, findTslot, nextPossible, moveFeatures, weightsOf, optionsOf, kindOf, KINDS, FIT_KEYS, DEFAULTS };
        if (typeof module !== "undefined") module.exports = api;
        else root.LocalTreePlanner = api;
      })(typeof window === "undefined" ? globalThis : window);
    }
  });

  // ../tetrio-hub/tools/butter/package-entry.js
  var import_ai_spin_planner = __toESM(require_ai_spin_planner());
  var import_ai_tree_planner = __toESM(require_ai_tree_planner());

  // ../tetrio-hub/tools/butter/shapes.json
  var shapes_default = { t: [[[1, 0, 241], [0, 1, 199], [1, 1, 164], [2, 1, 124]], [[2, 1, 124], [1, 0, 241], [1, 1, 41], [1, 2, 31]], [[1, 2, 31], [2, 1, 124], [1, 1, 74], [0, 1, 199]], [[0, 1, 199], [1, 2, 31], [1, 1, 146], [1, 0, 241]]], s: [[[1, 0, 201], [2, 0, 124], [0, 1, 199], [1, 1, 156]], [[2, 1, 114], [2, 2, 31], [1, 0, 241], [1, 1, 39]], [[1, 2, 156], [0, 2, 199], [2, 1, 124], [1, 1, 201]], [[0, 1, 39], [0, 0, 241], [1, 2, 31], [1, 1, 114]]], z: [[[0, 0, 199], [1, 0, 114], [1, 1, 39], [2, 1, 124]], [[2, 0, 241], [2, 1, 156], [1, 1, 201], [1, 2, 31]], [[2, 2, 124], [1, 2, 39], [1, 1, 114], [0, 1, 199]], [[0, 2, 31], [0, 1, 201], [1, 1, 156], [1, 0, 241]]], l: [[[2, 0, 241], [0, 1, 199], [1, 1, 68], [2, 1, 156]], [[2, 2, 124], [1, 0, 241], [1, 1, 17], [1, 2, 39]], [[0, 2, 31], [2, 1, 124], [1, 1, 68], [0, 1, 201]], [[0, 0, 199], [1, 2, 31], [1, 1, 17], [1, 0, 114]]], j: [[[0, 0, 241], [0, 1, 39], [1, 1, 68], [2, 1, 124]], [[2, 0, 124], [1, 0, 201], [1, 1, 17], [1, 2, 31]], [[2, 2, 31], [2, 1, 114], [1, 1, 68], [0, 1, 199]], [[0, 2, 199], [1, 2, 156], [1, 1, 17], [1, 0, 241]]], i: [[[0, 1, 199], [1, 1, 68], [2, 1, 68], [3, 1, 124]], [[2, 0, 241], [2, 1, 17], [2, 2, 17], [2, 3, 31]], [[3, 2, 124], [2, 2, 68], [1, 2, 68], [0, 2, 199]], [[1, 3, 31], [1, 2, 17], [1, 1, 17], [1, 0, 241]]], o: [[[0, 0, 193], [1, 0, 112], [0, 1, 7], [1, 1, 28]], [[1, 0, 112], [1, 1, 28], [0, 0, 193], [0, 1, 7]], [[1, 1, 28], [0, 1, 7], [1, 0, 112], [0, 0, 193]], [[0, 1, 7], [0, 0, 193], [1, 1, 28], [1, 0, 112]]] };

  // ../tetrio-hub/tools/butter/kicks-srsplus.json
  var kicks_srsplus_default = { kicks: { "10": [[1, 0], [1, 1], [0, -2], [1, -2]], "12": [[1, 0], [1, 1], [0, -2], [1, -2]], "13": [[1, 0], [1, -2], [1, -1], [0, -2], [0, -1]], "20": [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0]], "21": [[-1, 0], [-1, -1], [0, 2], [-1, 2]], "23": [[1, 0], [1, -1], [0, 2], [1, 2]], "30": [[-1, 0], [-1, 1], [0, -2], [-1, -2]], "31": [[-1, 0], [-1, -2], [-1, -1], [0, -2], [0, -1]], "32": [[-1, 0], [-1, 1], [0, -2], [-1, -2]], "01": [[-1, 0], [-1, -1], [0, 2], [-1, 2]], "03": [[1, 0], [1, -1], [0, 2], [1, 2]], "02": [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0]] }, i_kicks: { "10": [[-1, 0], [2, 0], [-1, 2], [2, -1]], "12": [[-1, 0], [2, 0], [-1, -2], [2, 1]], "13": [[1, 0]], "20": [[0, 1]], "21": [[-2, 0], [1, 0], [-2, -1], [1, 2]], "23": [[2, 0], [-1, 0], [2, -1], [-1, 2]], "30": [[1, 0], [-2, 0], [1, 2], [-2, -1]], "31": [[-1, 0]], "32": [[1, 0], [-2, 0], [1, -2], [-2, 1]], "01": [[1, 0], [-2, 0], [-2, 1], [1, -2]], "03": [[-1, 0], [2, 0], [2, 1], [-1, -2]], "02": [[0, -1]] } };

  // ../tetrio-hub/tools/butter/package-entry.js
  var shapes = {};
  for (const t of Object.keys(shapes_default)) shapes[t] = shapes_default[t].map((r) => r.map(([x, y]) => [x, y]));
  var c = [[0, 0, 0, 3], [2, 0, 0, 1], [2, 2, 1, 2], [0, 2, 2, 3]];
  var TABLES = { shapes, kicks: kicks_srsplus_default.kicks, ikicks: kicks_srsplus_default.i_kicks || kicks_srsplus_default.kicks, corner: [c, c, c, c] };
  var W = 10;
  var EMBED = typeof __VA_TREE_EMBED__ !== "undefined" ? __VA_TREE_EMBED__ : null;
  var dataOf = (files) => {
    if (EMBED && EMBED.data) return EMBED.data;
    for (const name of Object.keys(files || {})) if (/\.json$/i.test(name)) {
      try {
        const d = JSON.parse(new TextDecoder().decode(files[name]));
        if (d && d.kind === "va-tree-player" && d.options) return d;
      } catch {
      }
    }
    return null;
  };
  LocalExternalAI.register({
    id: EMBED ? EMBED.id : "va-tree",
    label: EMBED ? EMBED.label : "Butter",
    async create(files) {
      const iters = 200;
      const data = dataOf(files), opts = data ? data.options : {};
      const rev = (m) => {
        let r = 0;
        for (let x = 0; x < W; x++) if (m >> x & 1) r |= 1 << W - 1 - x;
        return r;
      };
      const PM = { l: "j", j: "l", s: "z", z: "s" }, revBook = (b) => b && b.map((q) => ({ t: PM[q.t] || q.t, c: q.c.map(([x, k]) => [W - 1 - x, k]) }));
      const openers = data && data.openers ? data.openers.flatMap((o) => o.mirror ? [o, { ...o, rows: o.rows.map(rev), empty: (o.empty || []).map(rev), book: revBook(o.book) }] : [o]) : null;
      const like = data ? { openers, pickBeta: data.beta || 0, misdrop: 0 } : {};
      let live = false, lastCells = -1, ready = null, follow = null;
      return {
        begin(input) {
          import_ai_spin_planner.default.setTables(TABLES);
          const H = Math.max(40, (input.board || []).length);
          const board = [];
          for (let y = 0; y < H; y++) {
            const row = input.board[H - 1 - y] || [];
            board.push(Array.from({ length: W }, (_, x) => row[x] ? "x" : null));
          }
          let g = 0;
          for (let y = H - 1; y >= 0; y--) {
            const n = board[y].filter(Boolean).length;
            if (n === W - 1) g++;
            else break;
          }
          const inc = (input.incoming || []).reduce((a, n) => a + (Number(n) || 0), 0);
          {
            const cells = board.reduce((a, r) => a + r.filter(Boolean).length, 0), rowsB = board.map((r) => r.reduce((m, c2, x) => c2 ? m | 1 << x : m, 0)).reverse();
            if (!cells) {
              live = true;
              follow = null;
              ready = null;
            } else if (lastCells < 0 || cells - lastCells > 4) {
              live = false;
              follow = null;
            } else if (cells < lastCells) {
              const lines = Math.max(1, Math.round((lastCells + 4 - cells) / 10));
              follow = null;
              live = false;
            }
            if (live && like.openers) ready = like.openers.find((o) => o.rows.every((m, k) => (m & ~(rowsB[k] || 0)) === 0) && (o.empty || []).every((m, k) => (m & (rowsB[k] || 0)) === 0)) || ready;
            lastCells = cells;
          }
          const fol = follow && follow.then.length ? { followKind: follow.then[0], protect: follow.protect } : {};
          const fol0 = live && ready && ready.then && ready.then.length ? { followKind: ready.then[0], protect: ready.empty || null } : {};
          const job = import_ai_tree_planner.default.create(
            null,
            { board, falling: input.current, hold: input.hold || null, queue: (input.queue || []).slice(0, 5), holdAllowed: true, b2b: Math.max(0, input.b2b | 0), combo: Math.max(0, input.combo | 0) },
            { ...opts, ...like, ...fol0, ...fol, ...fol0.followKind || fol.followKind ? { maxTail: 5 } : {}, openLive: live && !!like.openers, ...input.human ? { maxTail: 2, pickBeta: 0 } : {}, ms: 1e9, maxIters: iters, incoming: inc, gRows: g, seed: (Date.now() & 65535) + 1 }
          );
          const conv = (p) => {
            if (!p) return null;
            const cells = TABLES.shapes[p.type][p.r].map(([cx, cy]) => [p.x + cx, H - 1 - (p.y + cy)]);
            return { piece: p.type, usedHold: !!p.hold, cells };
          };
          let spent = 0;
          return {
            get done() {
              return !job || job.done;
            },
            get spent() {
              return spent;
            },
            step(ms = 4) {
              if (!job) return true;
              const t0 = performance.now();
              const d = job.step(ms);
              spent += performance.now() - t0;
              return d;
            },
            stop() {
              if (job) job.stop();
            },
            result() {
              return job ? conv(job.result()) : null;
            }
          };
        }
      };
    }
  });
})();
