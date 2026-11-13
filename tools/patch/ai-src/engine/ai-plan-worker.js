/* vA spin planner worker (loaded by ai-spin-planner.js createAsync as a same-origin
   file: a page policy may refuse blob: workers). Runs every job it is given in turn,
   8 ms each, and posts the best line so far and the final result. Keep in step with
   WORKER_GLUE in ai-spin-planner.js. */
importScripts('ai-tshape-table.js', 'ai-spin-planner.js');
const SP = self.LocalSpinPlanner; const jobs = new Map(); let running = false, kick = null;
const ch = new MessageChannel(); ch.port1.onmessage = run; const later = () => ch.port2.postMessage(0);
self.onmessage = e => {
  const m = e.data; if (m.cancel) { jobs.delete(m.cancel); return; }
  if (m.kick !== kick) { SP.setTables(m.tables); kick = m.kick; }
  jobs.set(m.id, { id: m.id, p: SP.create(null, m.state, m.P), last: null }); if (!running) { running = true; later(); }
};
function run() {
  const it = jobs.values().next(); if (it.done) { running = false; return; }
  const j = it.value; jobs.delete(j.id); let fin = false; try { fin = j.p.step(8); } catch (err) { fin = true; }
  const b = j.p.result();
  if (fin) self.postMessage({ id: j.id, done: true, result: b });
  else { jobs.set(j.id, j); if (b && b !== j.last) { j.last = b; self.postMessage({ id: j.id, best: b }); } }
  later();
}
