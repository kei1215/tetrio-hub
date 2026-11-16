// Butter learning in the app (vA): runs in a Web Worker (bundled to tools/patch/ai-src/engine/butter-learn.js).
// message {files: [replay objects / texts], player, base: Butter package script} ->
//   {t:'p', p: progress} ... then {t:'done', data, pkg: {id, label, name, script}} or {t:'err', msg}
import { learn, playerPackage } from "./learn-core.mjs";
self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    const data = await learn(m.files || [], m.player, { onProgress: (p) => postMessage({ t: "p", p }), tick: () => new Promise((r) => setTimeout(r, 0)) });
    postMessage({ t: "done", data, pkg: playerPackage(data, m.base || "") });
  } catch (err) { postMessage({ t: "err", msg: String((err && err.message) || err) }); }
};
