/* vA 外部AI: Cold Clear 1 (MinusKelvin, MPL-2.0).
   vA-external-ai-cc1.js と cold_clear_1.wasm を一緒に読み込む。
   wasm は Cold Clear 1 の bot をワーカーなしで動かすように包んだもの
   (ソース: cold-clear + cc1-wasm、MPL-2.0。求めがあればソースを渡せます)。
   「外部AIの強さ」= 1手のノード数の上限(空欄なら 30000)。 */
(() => {
  const ORDER = ['i', 'o', 't', 'l', 'j', 's', 'z'];
  LocalExternalAI.register({
    id: 'cc1', label: 'Cold Clear 1',
    async create(files, { strength }) {
      const bin = files['cold_clear_1.wasm'];
      if (!bin) throw Error('cold_clear_1.wasm も一緒に選んでください');
      let e = (await WebAssembly.instantiate(bin, {})).instance.exports;
      // a trap (out of memory / panic) leaves the instance broken: start a new one, no move this time
      const fresh = async () => { try { e = (await WebAssembly.instantiate(bin, {})).instance.exports; } catch {} };
      const safe = (fn, dead) => { try { return fn(); } catch { fresh(); return dead; } };
      const buf = () => new Uint8Array(e.memory.buffer, e.cc_buf(), 1024);
      const maxNodes = strength ? Math.max(100, Math.round(strength)) : 30000;
      return {
        begin(input) {
          const b = buf(); b.fill(0);
          for (let y = 0; y < 40; y++) for (let x = 0; x < 10; x++) if (input.board[y]?.[x]) b[y * 10 + x] = 1;
          const h = ORDER.indexOf(input.hold); b[400] = h < 0 ? 255 : h;
          b[401] = input.b2b > 0 ? 1 : 0;
          new DataView(b.buffer, b.byteOffset).setUint32(402, input.combo || 0, true);
          new DataView(b.buffer, b.byteOffset).setUint32(406, (input.incoming || []).reduce((a, n) => a + n, 0), true);
          const q = [input.current, ...(input.queue || [])].map((p) => ORDER.indexOf(p)).filter((p) => p >= 0).slice(0, 14);
          b[410] = q.length; q.forEach((p, i) => (b[411 + i] = p));
          safe(() => e.cc_begin(maxNodes));
          let done = false, spent = 0, out;
          const job = {
            get done() { return done; }, get spent() { return spent; },
            step(ms) {
              if (done) return true;
              const t0 = performance.now(), end = t0 + ms;
              while (performance.now() < end) if (safe(() => e.cc_step(16), 1)) { done = true; break; }
              spent += performance.now() - t0; return done;
            },
            stop() { if (!done) { if (spent < 5) safe(() => e.cc_step(64), 1); done = true; } },
            result() {
              if (out !== undefined) return out;
              if (!safe(() => e.cc_result(), 0)) return (out = null);
              const r = buf(), cells = [];
              for (let i = 0; i < 4; i++) cells.push([r[3 + i * 2], r[4 + i * 2]]);
              return (out = { piece: ORDER[r[2]], usedHold: !!r[1], cells });
            },
          };
          return job;
        },
      };
    },
  });
})();
