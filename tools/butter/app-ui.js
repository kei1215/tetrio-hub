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
<div data-b="s"></div></div>`;
    p.appendChild(box);
    const $ = (q) => box.querySelector(q), say = (t) => { $('[data-b="s"]').textContent = t; };
    let picked = [];
    $('[data-b="open"]').onclick = () => { const f = $('[data-b="form"]'); f.style.display = f.style.display === "none" ? "" : "none"; if (!$('[data-b="name"]').value) { try { $('[data-b="name"]').value = localStorage.getItem("qp-local-username") || ""; } catch {} } };
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
  window.LocalButter = { script: SCRIPT, slug, localReplays };
})();
