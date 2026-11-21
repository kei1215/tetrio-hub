// Butter in the app (appended to butter-preinstalled.js after the package is registered).
// User (2026-11-16): 外部AIでも Butter だけアプリ内で学習できるように。Butter は最初から入れておく(内部AIの扱いでもいい)。
// Learning uses only human play: TTR / TTRM files the player picks, and this device's offline records
// that are not BOT / outside AI games (user: AIのプレイからは学習しない). The other outside AIs never learn.
// The result is a separate "Butter <name>" package (several players can be kept side by side).
(() => {
  const slug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 22);
  let worker = null;
  function localReplays(name) {
    const out = []; const Z = window.QPLocalZen, L = window.LocalReplayLibrary;
    if (!Z || typeof Z.records !== "function") return out;
    for (const r of Z.records()) {
      try {
        const rep = Z.replay(r); const loc = rep?.local || r.replay?.local || {};
        if (loc.bot || loc.engine) continue;                       // BOT / outside AI games are not learned
        const file = L?.portable ? L.portable(rep) : rep;
        const users = (file.users || []).map((u) => String(u.username || "").toLowerCase());
        if (users.length && !users.includes(String(name).toLowerCase())) continue;
        out.push(file);
      } catch {}
    }
    return out;
  }
  // replays the player picked, kept per name so the automatic re-learn after a match uses them too
  const db = () => new Promise((ok, ng) => { const r = indexedDB.open("qp-butter", 1); r.onupgradeneeded = () => r.result.createObjectStore("picked"); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
  async function pickedOf(name) { try { const d = await db(); return await new Promise((ok) => { const q = d.transaction("picked").objectStore("picked").get(String(name).toLowerCase()); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }); } catch { return []; } }
  async function keepPicked(name, texts) { if (!texts.length) return; try { const all = [...new Set([...(await pickedOf(name)), ...texts])].slice(-40); const d = await db(); d.transaction("picked", "readwrite").objectStore("picked").put(all, String(name).toLowerCase()); } catch {} }
  // one learning run in a Worker; say(text) reports progress
  async function learnRun(name, files, say) {
    if (worker) return say("学習中です");
    say(files.length + " 個のリプレイから「" + name + "」を学習します…");
    try {
      const src = await (await fetch('/engine/butter-learn.js')).text();
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    } catch (e) { worker = null; return say("学習を始められません: " + e.message); }
    worker.onmessage = async (e) => {
      const m = e.data;
      if (m.t === "p") { const q = m.p; say(q.phase === "read" ? `リプレイを読んでいます ${q.file}/${q.files}(${q.games} 試合・${q.pieces} 手)` : `合わせています ${q.phase === "fit1" ? "1" : "2"}/2  ${q.epoch}/${q.epochs}(${q.pieces} 手)`); return; }
      worker.terminate(); worker = null;
      if (m.t === "err") return say("学習できませんでした: " + m.msg);
      try {
        const ids = await window.LocalExternalAI.addFiles([new File([m.pkg.script], m.pkg.name, { type: "text/javascript" })]);
        window.dispatchEvent(new Event("qp-ext-ai-refresh"));
        say(`できました: ${m.pkg.label}(${m.data.games} 試合・${m.data.pieces} 手、置きミスらしい手 ${(m.data.misdrop.rate * 100).toFixed(1)}%)\n外部AIの一覧から選べます(${ids.join(", ")})`);
      } catch (err) { say("保存できませんでした: " + err.message); }
    };
    worker.onerror = (ev) => { try { worker.terminate(); } catch {} worker = null; say("学習でエラー: " + (ev.message || "worker")); };
    worker.postMessage({ files, player: name, base: SCRIPT });
  }
  // automatic re-learn (user: 同じ名前の Butter と対戦したら試合のあとに自動で学習し直す): an AI room match of
  // "Butter <name>" against <name> is saved after every round; 45 s after the last save, <name>'s own moves (the
  // learner reads only that side, never Butter's) are learned again together with the replays picked before.
  let autoT = 0;
  function watchMatches() {
    const L = window.LocalReplayLibrary; if (!L) return false; if (L.__butterAuto) return true; L.__butterAuto = true;
    const real = L.saveMatch;
    L.saveMatch = function (match) {
      const r = real.apply(this, arguments);
      try {
        // the Butter side is just "Butter" in the game; its package id (va-tree-<player slug>) says whose it is
        const names = (match.names || []).map(String), eng = match.engines || [];
        const me = names.find((n, i) => { const o = eng[1 - i]; return !eng[i] && o && o === ("va-tree-" + slug(n)).slice(0, 32); });
        if (me) { clearTimeout(autoT); autoT = setTimeout(async () => {
          const files = [...(await pickedOf(me)), ...localReplays(me)];
          if (files.length) learnRun(me, files, (t) => console.log("[Butter 自動学習]", t));
        }, 45000); }
      } catch (e) { console.warn("[Butter 自動学習]", e); }
      return r;
    };
    return true;
  }
  if (!watchMatches()) { const iv = setInterval(() => { if (watchMatches()) clearInterval(iv); }, 1000); }
  // passing a player's Butter around (user 2026-11-21: プレイヤーの Butter を受け渡しできるように): "Butter <name>" is
  // written out as Butter-<name>.js (the same file 外部AIを読み込む takes) and read back here. Only its data is taken
  // from a file (a .js made by Butter or the player data .json of tools/ai-sim): the code is always this patch's own
  // Butter, so a file from someone else runs no code of theirs, and an old file plays with the new Butter.
  const EMBED = "var __VA_TREE_EMBED__=";
  const slugOf = (name) => { let s = slug(name); if (!s) { let h = 2166136261; for (const c of String(name)) h = Math.imul(h ^ c.codePointAt(0), 16777619); s = (h >>> 0).toString(16); } return s; };
  function dataOf(text) {
    text = String(text || "");
    if (text.startsWith(EMBED)) { const end = text.indexOf(";\n"); try { const e = JSON.parse(text.slice(EMBED.length, end)); if (e?.data?.kind === "va-tree-player") return e.data; } catch {} return null; }
    try { const d = JSON.parse(text); if (d?.kind === "va-tree-player" && d.options) return d; } catch {}
    return null;
  }
  function packageOf(data) {   // = playerPackage in learn-core.mjs, with this patch's Butter
    const s = slugOf(data.player), id = ("va-tree-" + s).slice(0, 32), label = "Butter " + data.player;
    return { id, label, name: "Butter-" + s + ".js", script: EMBED + JSON.stringify({ id, label, data }) + ";\n" + SCRIPT };
  }
  const extDb = () => new Promise((ok, ng) => { const r = indexedDB.open("qp-external-ai", 1); r.onupgradeneeded = () => r.result.createObjectStore("packages", { keyPath: "name" }); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
  async function storedButters() {   // [{name, script, data}] of the installed "Butter <name>" packages
    try { const d = await extDb(); const all = await new Promise((ok) => { const q = d.transaction("packages").objectStore("packages").getAll(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); });
      return all.map((p) => ({ name: p.name, script: p.script, data: dataOf(p.script) })).filter((p) => p.data); } catch { return []; }
  }
  async function install(data) { const pkg = packageOf(data); const ids = await window.LocalExternalAI.addFiles([new File([pkg.script], pkg.name, { type: "text/javascript" })]); window.dispatchEvent(new Event("qp-ext-ai-refresh")); return { pkg, ids }; }
  // an installed "Butter <name>" made with an older Butter plays with this one (same data): checked once after start,
  // when the stored packages have been loaded
  setTimeout(async () => { for (const p of await storedButters()) { if (p.script.endsWith(SCRIPT)) continue;
    try { await install(p.data); console.log("[Butter] " + p.data.player + " を今の Butter に更新しました"); } catch (e) { console.warn("[Butter] 更新できません", e); } } }, 8000);
  function mount(p) {
    if (!p || p.querySelector("[data-butter]")) return;
    const box = document.createElement("div"); box.dataset.butter = "1"; box.className = "butter";
    box.innerHTML = `<div class="row"><button data-b="open" type="button">Butter に学習させる</button></div>
<div data-b="form" style="display:none">
<label>プレーヤー名 <input data-b="name" type="text" maxlength="32"></label>
<div class="row"><button data-b="pick" type="button">リプレイを選ぶ(.ttr / .ttrm)</button></div>
<label><input data-b="local" type="checkbox" checked> この端末のオフライン記録も使う(BOT・外部AIの記録は使わない)</label>
<div class="row"><button data-b="go" type="button">学習する</button><button data-b="cancel" type="button">やめる</button></div>
<input data-b="files" type="file" multiple accept=".ttr,.ttrm,.json" style="display:none">
<label>受け渡し <select data-b="mine"></select></label>
<div class="row"><button data-b="out" type="button">ファイルに書き出す</button><button data-b="in" type="button">ファイルから読み込む</button></div>
<input data-b="infile" type="file" multiple accept=".js,.json" style="display:none">
<div data-b="s"></div></div>`;
    p.appendChild(box);
    const $ = (q) => box.querySelector(q), say = (t) => { $('[data-b="s"]').textContent = t; };
    let picked = [];
    const fillMine = async () => { const sel = $('[data-b="mine"]'), keep = sel.value; sel.innerHTML = ""; const list = await storedButters();
      if (!list.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "(学習した Butter はまだありません)"; sel.appendChild(o); }
      for (const p of list) { const o = document.createElement("option"); o.value = p.name; o.textContent = "Butter " + p.data.player + "(" + p.data.games + " 試合)"; sel.appendChild(o); }
      if (keep && list.some((p) => p.name === keep)) sel.value = keep; };
    window.addEventListener("qp-ext-ai-refresh", () => { fillMine(); });
    $('[data-b="open"]').onclick = () => { const f = $('[data-b="form"]'); f.style.display = f.style.display === "none" ? "" : "none"; if (!$('[data-b="name"]').value) { try { $('[data-b="name"]').value = localStorage.getItem("qp-local-username") || ""; } catch {} } if (f.style.display !== "none") fillMine(); };
    $('[data-b="out"]').onclick = async () => {
      const p = (await storedButters()).find((q) => q.name === $('[data-b="mine"]').value); if (!p) return say("書き出す Butter を選んでください");
      const pkg = packageOf(p.data), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([pkg.script], { type: "text/javascript" })); a.download = pkg.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      say(`書き出しました: ${pkg.name}\n受け取った人は「ファイルから読み込む」(または 外部AIを読み込む)で入れられます`);
    };
    $('[data-b="in"]').onclick = () => $('[data-b="infile"]').click();
    $('[data-b="infile"]').onchange = async (ev) => {
      const done = [], bad = [];
      for (const f of ev.target.files) { try { const d = dataOf(await f.text()); if (!d) { bad.push(f.name); continue; } const { pkg } = await install(d); done.push(pkg.label); } catch (e) { bad.push(f.name + "(" + e.message + ")"); } }
      ev.target.value = ""; fillMine();
      say((done.length ? "読み込みました: " + done.join(", ") + "\n外部AIの一覧から選べます" : "") + (bad.length ? (done.length ? "\n" : "") + "Butter のファイルではありません: " + bad.join(", ") : ""));
    };
    $('[data-b="pick"]').onclick = () => $('[data-b="files"]').click();
    $('[data-b="files"]').onchange = async (ev) => { picked = []; for (const f of ev.target.files) { try { picked.push(await f.text()); } catch {} } say(picked.length + " 個のリプレイを選びました"); ev.target.value = ""; };
    $('[data-b="cancel"]').onclick = () => { if (worker) { worker.terminate(); worker = null; say("やめました"); } else $('[data-b="form"]').style.display = "none"; };
    $('[data-b="go"]').onclick = async () => {
      const name = $('[data-b="name"]').value.trim();
      if (!name) return say("プレーヤー名(TETR.IO のユーザー名)を入れてください");
      await keepPicked(name, picked);
      const files = [...(await pickedOf(name)), ...($('[data-b="local"]').checked ? localReplays(name) : [])];
      if (!files.length) return say("リプレイがありません。.ttr / .ttrm を選ぶか、オフラインで遊んだ記録を使ってください");
      learnRun(name, files, say);
    };
  }
  const tryMount = () => { const p = document.querySelector("#qp-ext-ai .p"); if (p) { mount(p); return true; } return false; };
  if (!tryMount()) { const mo = new MutationObserver(() => { if (tryMount()) mo.disconnect(); }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
  window.LocalButter = { script: SCRIPT, slug, localReplays, dataOf, packageOf, storedButters };
})();
