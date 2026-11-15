// QP OFFLINE の記録を docs/ranking/data/records.json に足す。
//  ・Issue「QP PB 登録」(issues イベント): 本文の JSON と、添付された .ttr.json
//  ・GAS 中継(repository_dispatch "pb"): ゲーム内の「ランキングに送る」から。TTR は GAS が Discord に投稿済み
// TTR はリポジトリに置かない。Discord(webhook)に投稿し、そのメッセージ番号と CDN の URL を記録に持たせる
// (CDN の URL は約1日で切れるので pb-refresh.js が定期的に新しくする)。
// 送られてくる値は誰でも書けるので、決めた項目・型・範囲だけを取り出す(それ以外は捨てる)。
const fs = require('fs');
const FILE = 'docs/ranking/data/records.json';
const MODS = ['expert', 'nohold', 'messy', 'gravity', 'volatile', 'doublehole', 'invisible', 'allspin', 'duo'];
const REPLAY_MAX = 25 * 1024 * 1024, DISCORD_MAX = 9.5 * 1024 * 1024;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const load = () => fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { schema: 1, records: [] };
const save = db => fs.writeFileSync(FILE, JSON.stringify(db, null, 1) + '\n');
const cdnOk = u => typeof u === 'string' && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\/\d+\/\d+\/[^\s"<>]+$/.test(u) && u.length < 600;

// 記録データ → 保存する形。だめなら文字列(理由)
function clean(d, meta) {
  if (!d || typeof d !== 'object' || d.v !== 1) return '記録データの版が違います。パッチを更新してください。';
  const mode = d.mode === 'zenithex' ? 'zenithex' : d.mode === 'zenith' ? 'zenith' : null;
  const altitude = num(d.altitude, 0.01, 100000), floor = num(d.floor, 1, 10), revives = num(d.revives ?? 0, 0, 1000);
  const time = num(d.time ?? 0, 0, 86400000), apm = num(d.apm ?? 0, 0, 10000), pps = num(d.pps ?? 0, 0, 100);
  if (!mode || altitude === null || floor === null || revives === null || time === null || apm === null || pps === null) return '記録データの値が範囲外です。';
  const mods = [...new Set((Array.isArray(d.mods) ? d.mods : []).map(String))];
  if (mods.some(x => !MODS.includes(x.replace(/_reversed$/, '')))) return '知らない MOD が入っています。';
  mods.sort();
  const name = String(d.name || '').replace(/[\u0000-\u001f<>@`]/g, '').trim().slice(0, 32) || meta.user;
  return {
    id: meta.id, user: meta.user, src: meta.src, name, mode, altitude: Math.round(altitude * 100) / 100, floor, revives,
    time: Math.round(time), apm: Math.round(apm * 100) / 100, pps: Math.round(pps * 100) / 100, mods,
    floor10: d.floor10 === true, lull: d.lull !== false, hyper: d.hyper === true,
    test: ['solo', 'duo-dead', 'duo-reverse-dead'].includes(d.test) ? d.test : 'solo',
    bot: d.bot === true, engine: typeof d.engine === 'string' ? d.engine.slice(0, 40) : null,
    patch: String(d.patch || '').slice(0, 16), date: String(d.date || '').slice(0, 30), added: new Date().toISOString(),
  };
}

// 総合の順位(同じモード・ソロ・BOT なし・1人1記録)
function rankOf(db, rec) {
  const best = new Map();
  for (const r of db.records) if (r.mode === rec.mode && r.test === 'solo' && !r.bot) { const c = best.get(r.user); if (!c || r.altitude > c.altitude) best.set(r.user, r); }
  return [...best.values()].filter(r => r.altitude > rec.altitude).length + 1;
}
const summary = (rec, rank) => `${rank ? '#' + rank + ' ' : ''}${rec.name} ${rec.mode === 'zenithex' ? 'EXPERT ' : ''}${rec.altitude}m (F${rec.floor})` +
  `${rec.mods.length ? ' MOD ' + rec.mods.join(', ') : ''}${rec.floor10 ? (rec.lull ? ' 10F相当・猶予あり' : ' 10F相当・猶予なし') : ''}${rec.hyper ? ' HYPERSPEED' : ''}${rec.bot ? ' BOT' : ''}`;

async function postDiscord(rec, rank, buf) {
  const hook = process.env.PB_DISCORD_WEBHOOK;
  if (!hook) return null;
  const { replay, ...plain } = rec;
  const content = ('🏔 ' + summary(rec, rank) + '\n```json\n' + JSON.stringify(plain) + '\n```').slice(0, 1990);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content, allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: `PB-${rec.id}.ttr` }] }));
  form.append('files[0]', new Blob([buf], { type: 'application/json' }), `PB-${rec.id}.ttr`);
  const res = await fetch(hook + '?wait=true', { method: 'POST', body: form });
  if (!res.ok) throw Error('Discord ' + res.status);
  const m = await res.json();
  return { message: String(m.id), url: m.attachments?.[0]?.url || null };
}

async function add(rec, buf, discord) {
  const db = load();
  if (db.records.some(r => r.id === rec.id)) return { ok: false, text: 'この記録はもう登録されています。' };
  if (db.records.some(r => r.user === rec.user && r.date === rec.date && r.altitude === rec.altitude)) return { ok: false, text: '同じ記録はもう登録されています。' };
  const rank = rankOf(db, rec);
  let note = '';
  if (!discord && buf) { try { discord = await postDiscord(rec, rank, buf); note = discord ? '\nリプレイも保存しました。' : ''; } catch (e) { note = '\nリプレイを保存できませんでした。'; } }
  if (discord && /^\d{5,25}$/.test(String(discord.message || ''))) { rec.discord = String(discord.message); if (cdnOk(discord.url)) rec.replayUrl = discord.url; }
  db.records.push(rec);
  save(db);
  return { ok: true, rank, text: `登録しました: ${summary(rec, rank)}\nランキング: https://kei1215.github.io/tetrio-hub/ranking/` + note };
}

// Issue に添付された .ttr.json(GitHub の添付 URL だけ)
async function attachment(body) {
  const m = body.match(/https:\/\/github\.com\/user-attachments\/files\/\d+\/[^\s)\]"'<>]+?\.json\b/);
  if (!m) return null;
  const res = await fetch(m[0], { redirect: 'follow' });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > REPLAY_MAX) return null;
  const j = JSON.parse(buf.toString('utf8'));
  if (!j || typeof j !== 'object' || !j.replay || typeof j.replay !== 'object') return null;
  const out = Buffer.from(JSON.stringify(j));
  return out.length <= DISCORD_MAX ? out : null;
}

module.exports = async issue => {
  const body = String(issue.body || '');
  const m = body.match(/```json\s*(\{[\s\S]*?\})\s*```/) || body.match(/(\{[^{}]*\})/);
  if (!m) return { ok: false, text: '記録データ(JSON)が見つかりませんでした。オフラインの記録一覧の「ランキングに送る」から開いてください。' };
  let d; try { d = JSON.parse(m[1]); } catch { return { ok: false, text: '記録データを読めませんでした(JSON の形が壊れています)。' }; }
  const rec = clean(d, { id: issue.number, user: issue.user.login, src: 'issue' });
  if (typeof rec === 'string') return { ok: false, text: rec };
  let buf = null; try { buf = await attachment(body); } catch {}
  return add(rec, buf, null);
};

// GAS から: { id, record, discord:{message,url} }。名前でまとめる(GitHub アカウントがないので)
module.exports.dispatch = async p => {
  const id = num(p?.id, 1e12, 1e14);
  if (id === null) return { ok: false, text: 'id がありません' };
  const name = String(p.record?.name || '').replace(/[\u0000-\u001f<>@`]/g, '').trim().slice(0, 32) || 'LOCAL';
  const rec = clean(p.record, { id, user: 'name:' + name.toLowerCase(), src: 'game' });
  if (typeof rec === 'string') return { ok: false, text: rec };
  return add(rec, null, p.discord || null);
};
module.exports.rankOf = rankOf;
