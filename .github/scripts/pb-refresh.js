// Discord の CDN の URL は約1日で切れるので、webhook でメッセージを読み直して records.json の replayUrl を新しくする。
// 表に出すのは各ランキングの上位3人だけだが、どの表で上位かは条件で変わるので、Discord にある記録は全部更新する。
const fs = require('fs');
const FILE = 'docs/ranking/data/records.json';
const cdnOk = u => typeof u === 'string' && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\/\d+\/\d+\/[^\s"<>]+$/.test(u) && u.length < 600;
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = async () => {
  const hook = process.env.PB_DISCORD_WEBHOOK;
  if (!hook) return 0;
  const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let changed = 0;
  for (const r of db.records) {
    if (!/^\d{5,25}$/.test(String(r.discord || ''))) continue;
    try {
      const res = await fetch(`${hook}/messages/${r.discord}`);
      if (res.status === 429) { await sleep(5000); continue; }
      if (!res.ok) continue;
      const url = (await res.json()).attachments?.[0]?.url;
      if (cdnOk(url) && url !== r.replayUrl) { r.replayUrl = url; changed++; }
    } catch {}
    await sleep(300);
  }
  if (changed) fs.writeFileSync(FILE, JSON.stringify(db, null, 1) + '\n');
  return changed;
};
