/* Browser QP OFFLINE: keep at most 5 local records with a replay (localStorage is small). */
(() => {
 const Z = window.QPLocalZen, LIMIT = 5;
 if (!Z || Z.__qpBrowserCap) return;
 Z.__qpBrowserCap = true;
 const record = Z.record.bind(Z);
 const oldest = () => { try { return Z.records().filter(r => r.replay).sort((a, b) => a.date - b.date); } catch { return []; } };
 Z.record = (...args) => {
  const list = oldest();
  while (list.length >= LIMIT) Z.deleteRecord(list.shift().id);
  for (let i = 0; ; i++) {
   try { return record(...args); }
   catch (error) {
    const left = oldest();
    if (i >= LIMIT || !left.length || !/quota/i.test(String(error && (error.name + error.message)))) throw error;
    Z.deleteRecord(left[0].id);
   }
  }
 };
})();
