// CC 盤面修正 panel (runs in the tetr.io page; opened from the vA patch's CONFIG > QP PATCH TOOLS).
// Built into docs/cc-fix/tetrio-cc-fix.js by tools/cc-fix/build.sh.
import { ccFix, playersOf } from "./cc-fix-core.mjs";

const BASE = "https://kei1215.github.io/tetrio-hub/ext-ai/";
const ENGINES = {
  cc2: { label: "Cold Clear 2 S2", files: ["vA-external-ai-cc2.js", "cold_clear_2_s2.wasm"] },
  cc1: { label: "Cold Clear 1(オールスピンを知らない)", files: ["vA-external-ai-cc1.js", "cold_clear_1.wasm"] },
};
const bots = {};

// The package registers itself through LocalExternalAI.register (vA package contract).
async function loadBot(id) {
  if (bots[id]) return bots[id];
  const [js, ...data] = ENGINES[id].files;
  const files = {};
  for (const f of data) { const r = await fetch(BASE + f); if (!r.ok) throw Error(f + " を読み込めません (" + r.status + ")"); files[f] = await r.arrayBuffer(); }
  const prev = window.LocalExternalAI;
  let def = null;
  window.LocalExternalAI = { register: (d) => { if (d && d.id === id) def = d; } };
  try {
    await new Promise((ok, ng) => { const s = document.createElement("script"); s.src = BASE + js; s.onload = ok; s.onerror = () => ng(Error(js + " を読み込めません")); document.head.appendChild(s); });
  } finally { if (prev) window.LocalExternalAI = prev; else delete window.LocalExternalAI; }
  if (!def) throw Error(ENGINES[id].label + " が登録されませんでした");
  return (bots[id] = await def.create(files, { strength: null }));
}

const css = `#qp-ccfix{position:fixed;right:16px;top:80px;z-index:2147483646;width:330px;background:#15131fee;color:#eee;border:1px solid #7a6ad0;border-radius:8px;padding:12px;font:13px/1.5 sans-serif}
#qp-ccfix h3{margin:0 0 6px;font-size:15px}#qp-ccfix label{display:block;margin:6px 0 2px}#qp-ccfix select,#qp-ccfix input{width:100%;box-sizing:border-box;background:#0d0c16;color:#fff;border:1px solid #555;border-radius:4px;padding:3px}
#qp-ccfix .row{display:flex;gap:6px;margin-top:10px}#qp-ccfix button{flex:1;padding:6px;border-radius:4px;border:1px solid #888;background:#2c2650;color:#fff;cursor:pointer}#qp-ccfix button:disabled{opacity:.5}
#qp-ccfix .s{margin-top:8px;white-space:pre-wrap;opacity:.9}#qp-ccfix .n{opacity:.7;font-size:12px;margin-top:6px}`;

function open() {
  let root = document.getElementById("qp-ccfix");
  if (root) { root.style.display = ""; return; }
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  root = document.createElement("div"); root.id = "qp-ccfix";
  root.innerHTML = `<h3>CC 盤面修正</h3>
<label>リプレイ(.ttr / .ttrm)</label><input data-k="file" type="file" accept=".ttr,.ttrm,.json">
<label>直すプレイヤー</label><select data-k="user"></select>
<label>AI</label><select data-k="engine">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
<label>1手の考える時間(ミリ秒)</label><input data-k="ms" type="number" min="20" max="3000" value="150">
<div class="row"><button data-a="go" disabled>作る</button><button data-a="close">閉じる</button></div>
<div class="s"></div>
<div class="n">相手の記録と受けたおじゃまは元のまま、選んだプレイヤーの置き方だけ AI のものになります。ミノを置く速さは元のプレイヤーと同じです。
開くには CONFIG の REPLAY BOARD EDIT を ON にして、パネルの「埋め込みの再生」で 修正後 / 地形練習 / 元の版 を切り替えます。</div>`;
  document.body.appendChild(root);
  const $ = (q) => root.querySelector(q), status = (t) => { $(".s").textContent = t; };
  // stop TETR.IO's hotkeys while typing here
  for (const t of ["keydown", "keyup", "keypress"]) root.addEventListener(t, (e) => e.stopPropagation());
  let text = null, name = "replay.ttrm", busy = false;
  $('[data-a="close"]').onclick = () => { if (!busy) root.style.display = "none"; };
  $('[data-k="file"]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      text = await f.text(); name = f.name;
      const ps = playersOf(text);
      $('[data-k="user"]').innerHTML = ps.map((p) => `<option>${p.username.replace(/[<&>"]/g, (c) => "&#" + c.charCodeAt(0) + ";")}</option>`).join("");
      $('[data-a="go"]').disabled = !ps.length;
      status(ps.length + " 人: " + ps.map((p) => p.username + "(" + p.rounds.length + " ラウンド)").join(", "));
    } catch (err) { text = null; $('[data-a="go"]').disabled = true; status("読めません: " + err.message); }
  };
  $('[data-a="go"]').onclick = async () => {
    if (!text || busy) return;
    busy = true; $('[data-a="go"]').disabled = true;
    const id = $('[data-k="engine"]').value, user = $('[data-k="user"]').value;
    try {
      status(ENGINES[id].label + " を読み込み中…");
      const bot = await loadBot(id);
      const t0 = performance.now();
      const ms = Math.max(20, Math.min(3000, Number($('[data-k="ms"]').value) || 150));
      const idle = () => new Promise((r) => setTimeout(r, 0));
      const { json, report } = await ccFix(text, user, bot, {
        thinkMs: ms, engineId: id, idle,
        onProgress: (p) => status(`ラウンド ${p.round + 1}/${p.rounds}  ${p.pieces} 手目  (${Math.round(p.frame / Math.max(1, p.end) * 100)}%)`),
      });
      const m = /^(.*?)(\.ttrm|\.ttr|\.json)?$/i.exec(name);
      const out = m[1] + "-" + id + (m[2] && m[2] !== ".json" ? m[2] : ".ttrm");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      a.download = out; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      const sum = report.map((r) => `R${r.round + 1}: ${r.pieces} 手 / 置けた ${r.matched} / 火力 ${r.attack}${r.topout ? " / 窒息" : ""}`).join("\n");
      status(`保存しました: ${out}(${((performance.now() - t0) / 1000).toFixed(0)} 秒)\n${sum}`);
    } catch (err) { console.warn("[cc fix]", err); status("できませんでした: " + (err.message || err)); }
    busy = false; $('[data-a="go"]').disabled = false;
  };
}

window.__qpCcFix = { open, ccFix, playersOf, loadBot };
