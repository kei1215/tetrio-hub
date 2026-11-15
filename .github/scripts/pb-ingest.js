// Issue「QP PB 登録」の本文(JSON)を確かめて docs/ranking/data/records.json に足す。
// 本文は誰でも書けるので、決めた項目・型・範囲だけを取り出す(それ以外は捨てる)。
const fs = require('fs');
const FILE = 'docs/ranking/data/records.json';
const MODS = ['expert', 'nohold', 'messy', 'gravity', 'volatile', 'doublehole', 'invisible', 'allspin', 'duo'];
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
module.exports = issue => {
  const body = String(issue.body || '');
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, text: '記録データ(JSON)が見つかりませんでした。オフラインの記録一覧の「ランキングに送る」から開いてください。' };
  let d; try { d = JSON.parse(m[0]); } catch { return { ok: false, text: '記録データを読めませんでした(JSON の形が壊れています)。' }; }
  if (d.v !== 1) return { ok: false, text: '記録データの版が違います。パッチを更新してください。' };
  const mode = d.mode === 'zenithex' ? 'zenithex' : d.mode === 'zenith' ? 'zenith' : null;
  const altitude = num(d.altitude, 0.01, 100000), floor = num(d.floor, 1, 10), revives = num(d.revives ?? 0, 0, 1000);
  const time = num(d.time ?? 0, 0, 86400000), apm = num(d.apm ?? 0, 0, 10000), pps = num(d.pps ?? 0, 0, 100);
  if (!mode || altitude === null || floor === null || revives === null || time === null) return { ok: false, text: '記録データの値が範囲外です。' };
  const mods = [...new Set((Array.isArray(d.mods) ? d.mods : []).map(String))];
  if (mods.some(x => !MODS.includes(x.replace(/_reversed$/, '')))) return { ok: false, text: '知らない MOD が入っています。' };
  mods.sort();
  const name = String(d.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32) || issue.user.login;
  const rec = {
    id: issue.number, user: issue.user.login, name, mode, altitude: Math.round(altitude * 100) / 100, floor, revives,
    time: Math.round(time), apm: Math.round(apm * 100) / 100, pps: Math.round(pps * 100) / 100, mods,
    floor10: d.floor10 === true, lull: d.lull !== false, test: ['solo', 'duo-dead', 'duo-reverse-dead'].includes(d.test) ? d.test : 'solo',
    bot: d.bot === true, engine: typeof d.engine === 'string' ? d.engine.slice(0, 40) : null,
    patch: String(d.patch || '').slice(0, 16), date: String(d.date || '').slice(0, 30), added: new Date().toISOString(),
  };
  const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { schema: 1, records: [] };
  if (db.records.some(r => r.id === rec.id)) return { ok: false, text: 'この Issue の記録はもう登録されています。' };
  // 同じ人の同じ記録(日時・高度が同じ)は 1 回だけ
  if (db.records.some(r => r.user === rec.user && r.date === rec.date && r.altitude === rec.altitude)) return { ok: false, text: '同じ記録はもう登録されています。' };
  db.records.push(rec);
  fs.writeFileSync(FILE, JSON.stringify(db, null, 1) + '\n');
  return { ok: true, text: `登録しました: ${rec.name} ${rec.mode === 'zenithex' ? 'EXPERT ' : ''}${rec.altitude}m (F${rec.floor})${rec.mods.length ? ' MOD ' + rec.mods.join(', ') : ''}${rec.floor10 ? ' 10F相当' : ''}${rec.bot ? ' BOT' : ''}\nランキング: https://kei1215.github.io/tetrio-hub/ranking/` };
};
