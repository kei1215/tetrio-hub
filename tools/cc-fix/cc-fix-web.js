// CC 盤面修正 panel (runs in the tetr.io page; opened from the vA patch's CONFIG > QP PATCH TOOLS).
// Built into docs/cc-fix/tetrio-cc-fix.js by tools/cc-fix/build.sh.
import { ccFix, ccImprove, playersOf } from "./cc-fix-core.mjs";

const CAT = "https://kei1215.github.io/tetrio-hub/ext-ai/";
// Choices: Cold Clear 2 S2 (default) / Cold Clear 1. The package file names match ext-ai/catalog.json.
const ENGINES = {
  cc2: { label: "Cold Clear 2 S2", js: "vA-external-ai-cc2.js" },
  cc1: { label: "Cold Clear 1(オールスピンを知らない)", js: "vA-external-ai-cc1.js" },
};
const bots = {};

// The AI installed in vA's 外部AI is used as it is. If the chosen one is not installed, it is
// installed first, the same way as かんたんインストール (catalog.json -> files -> saved in IndexedDB
// 'qp-external-ai' / 'packages', the store ai-external.js reads), then used.
// In the vA QP OFFLINE page LocalExternalAI does it (addFiles / load); on the online tetr.io page
// (no LocalExternalAI) this keeps the same store format in that page's IndexedDB.
const DB = "qp-external-ai", STORE = "packages";
const db = () => new Promise((ok, ng) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "name" }); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, ng) => { const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => ok(out?.result ?? out); t.onerror = () => ng(t.error); }); };
async function download(id, say) {
  const list = await (await fetch(CAT + "catalog.json", { cache: "no-store" })).json();
  const pkg = list.find((p) => p.files && p.files[0] === ENGINES[id].js);
  if (!pkg) throw Error(ENGINES[id].label + " がかんたんインストールの一覧にありません");
  say && say(pkg.label + " が入っていないので、インストールしています…");
  const files = [];
  for (const name of pkg.files) { const r = await fetch(CAT + name); if (!r.ok) throw Error(name + " を読み込めません (" + r.status + ")"); files.push(new File([await r.arrayBuffer()], name)); }
  return files;
}
// run a package script with a register() catcher; returns the definitions it registered
async function runScript(script) {
  const prev = window.LocalExternalAI, defs = {};
  window.LocalExternalAI = { register: (d) => { if (d && d.id) defs[d.id] = d; } };
  const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
  try { await new Promise((ok, ng) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => ng(Error("外部AIのスクリプトを実行できません")); document.head.appendChild(s); }); }
  finally { URL.revokeObjectURL(url); if (prev) window.LocalExternalAI = prev; else delete window.LocalExternalAI; }
  return defs;
}
async function loadBot(id, say) {
  if (bots[id]) return bots[id];
  const X = window.LocalExternalAI;
  if (X && typeof X.engines === "function" && typeof X.load === "function") {
    if (!X.engines().includes(id)) { await X.addFiles(await download(id, say)); }
    if (!X.engines().includes(id)) throw Error(ENGINES[id].label + " をインストールできませんでした");
    // the vA host may run it in a Worker; the core only needs begin/step/stop/result
    return (bots[id] = await X.load(id));
  }
  let pkg = (await tx("readonly", (s) => s.getAll())).find((p) => (p.ids || []).includes(id));
  if (!pkg) {
    const list = await download(id, say), js = list.find((f) => /\.m?js$/i.test(f.name)), files = {};
    for (const f of list) if (f !== js) files[f.name] = await f.arrayBuffer();
    pkg = { name: js.name, script: await js.text(), files, added: Date.now() };
    pkg.ids = Object.keys(await runScript(pkg.script));
    if (!pkg.ids.includes(id)) throw Error(ENGINES[id].label + " が登録されませんでした");
    await tx("readwrite", (s) => s.put(pkg));
  }
  const def = (await runScript(pkg.script))[id];
  if (!def) throw Error(ENGINES[id].label + " が登録されませんでした");
  return (bots[id] = await def.create(pkg.files, { strength: null }));
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
<label>直し方</label><select data-k="mode"><option value="weak">弱い所だけ(火力が出ていない所・REN/QUAD を見直し、何か所でも)</option><option value="all">全部 AI が置き直す</option><option value="rescue">トップアウト救済(死んだ所の何手前に戻れば助かるか)</option></select>
<label>1手の考える時間(ミリ秒)</label><input data-k="ms" type="number" min="20" max="3000" value="150">
<div class="row"><button data-a="go" disabled>作る</button><button data-a="close">閉じる</button></div>
<div class="s"></div>
<div class="n">弱い所だけ:プレイヤーの置き方はそのままで、10手ずつ見て、火力が平均より出ていない所や REN・QUAD の所を AI が同じミノで置き直し、火力が 2 以上増えた所だけを修正にします。再生ではその所に来ると修正を見せ(相手は止まる)、終わると元のプレイに戻ります。
全部:最初から最後まで AI が置き直します(相手は動き、AI の火力が届きます)。
トップアウト救済:そのプレイヤーが死んだラウンドで、1手前・2手前…と戻って AI が同じミノ・同じおじゃまで置き、死んだフレームを越えて生き残れる一番少ない手数を探します。そこから少し前まで、REN を QUAD か T-SPIN で締める助かり方(10 手以内、またはおじゃまを 4 段以上掘るもの)や、深く掘る REN の途中で QUAD を打つ助かり方も探し、見つかれば死んだ所の先も REN が切れるまで見せます。もっと REN を伸ばせた・深く掘れた・火力が出た助かり方があれば、そのあとに続けて見せます(あなたのプレイとの比較つき)。再生では戻る所と次に置く所を盤面に出し、助かった盤面で止まります。ミノを置く速さは元のプレイヤーと同じです。
開くには CONFIG の REPLAY BOARD EDIT を ON にして、パネルの「埋め込みの再生」で 修正後 / 元の版 を切り替えます(マネ練習はどちらでも使えます)。</div>`;
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
      const bot = await loadBot(id, status);
      const t0 = performance.now();
      const ms = Math.max(20, Math.min(3000, Number($('[data-k="ms"]').value) || 150));
      const idle = () => new Promise((r) => setTimeout(r, 0));
      const { json, report } = await ccFix(text, user, bot, {
        thinkMs: ms, engineId: id, idle, mode: $('[data-k="mode"]').value,
        onProgress: (p) => status(`ラウンド ${p.round + 1}/${p.rounds}  ` + (p.back ? `${p.back} 手前から試し中  ` : "") + (p.spots ? `候補 ${p.spot}/${p.spots}  ` : "") + `${p.pieces} 手目`),
      });
      const m = /^(.*?)(\.ttrm|\.ttr|\.json)?$/i.exec(name);
      const out = m[1] + "-" + id + (m[2] && m[2] !== ".json" ? m[2] : ".ttrm");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      a.download = out; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      const sum = report.map((r) => r.rescue !== undefined ? (r.died === false ? `R${r.round + 1}: 死んでいない` : !r.rescue ? `R${r.round + 1}: 戻っても助かる置き方が見つからない` : `R${r.round + 1}: ${r.rescue.minBack} 手前まで戻れば助かる。見せるのは ${r.rescue.back} 手前から` + (r.rescue.ren ? (r.rescue.ren === "dig-quad" ? `(掘り REN・QUAD 入り ${r.rescue.dug} 段を最後まで)` : `(REN を ${r.rescue.ren === "quad" ? "QUAD" : "T-SPIN"} で締める)`) : "(REN の QUAD / T-SPIN は見つからず)") + (r.rescue.betters || []).map((b) => `\n  もっと伸ばせた ${b.order === "same" ? "(1) 同じ順番のまま" : "(2) 順番を変えれば・HOLD"}: ${b.back} 手前から REN ${r.rescue.m.ren}→${b.m.ren}・掘り ${r.rescue.m.dug}→${b.m.dug}・火力 ${r.rescue.m.atk}→${b.m.atk}${b.m.quad ? "・QUAD あり" : ""}`).join("") + `\n  あなた: REN ${r.rescue.mine.ren}・掘り ${r.rescue.mine.dug}・火力 ${r.rescue.mine.atk}`)
        : r.fixed ? `R${r.round + 1}: 修正 ${r.fixed.length} か所` + r.fixed.map((x) => `\n  ${x.piece} 手目から 火力 ${x.orig} → ${x.cc}${x.ren ? " (REN)" : ""}${x.quad ? " (QUAD)" : ""}`).join("")
        : `R${r.round + 1}: ${r.pieces} 手 / 置けた ${r.matched} / 火力 ${r.attack}${r.topout ? " / 窒息" : ""}`).join("\n");
      status(`保存しました: ${out}(${((performance.now() - t0) / 1000).toFixed(0)} 秒)\n${sum}`);
    } catch (err) { console.warn("[cc fix]", err); status("できませんでした: " + (err.message || err)); }
    busy = false; $('[data-a="go"]').disabled = false;
  };
}

window.__qpCcFix = { open, ccFix, ccImprove, playersOf, loadBot };
