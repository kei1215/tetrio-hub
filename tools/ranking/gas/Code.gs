// QP PB ランキングの受付窓口(Google Apps Script のウェブアプリ)。
// ゲーム内の「ランキングに送る」→ doPost が記録と TTR を受け取る。
//  ・スクリプト プロパティ DISCORD_WEBHOOK があれば、その場で Discord に順位・記録・TTR を投稿する(user: discordへの投稿はGASから)
//  ・なければ TTR を Google ドライブに一時保存し、GitHub Actions が Discord に投稿する
// ランキングページは開くたびに doGet(?list=1)で受付一覧を読み、まだ records.json にない記録もすぐ表に出す。
// GitHub Actions(pb-collect.yml)が受付を records.json に移す。受付は3日で消える(取り込み済みかは id で判断)。
const RECORDS = 'https://kei1215.github.io/tetrio-hub/ranking/data/records.json';
const MODS = ['expert', 'nohold', 'messy', 'gravity', 'volatile', 'doublehole', 'invisible', 'allspin', 'duo'];
const TTR_MAX = 9.5 * 1024 * 1024; // Discord の添付の上限(10MB)に収める
const KEEP_MS = 3 * 24 * 3600 * 1000;
const FOLDER = 'qp-pb-queue';

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function num(v, lo, hi) { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
function folder() { const it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }

// 初回だけエディタで実行して、ドライブの権限を許可する
function setup() { folder(); prune(); Logger.log('ok'); }

function prune() {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(function (k) { if (k.indexOf('q:') === 0 && now - Number(k.slice(2)) > KEEP_MS) props.deleteProperty(k); });
  const files = folder().getFiles();
  while (files.hasNext()) { const f = files.next(); if (now - f.getDateCreated().getTime() > KEEP_MS) f.setTrashed(true); }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.list) {
    const all = PropertiesService.getScriptProperties().getProperties();
    const items = Object.keys(all).filter(function (k) { return k.indexOf('q:') === 0; }).map(function (k) { const v = JSON.parse(all[k]); return v && v.record ? { id: Number(k.slice(2)), record: v.record, discord: v.discord || null } : { id: Number(k.slice(2)), record: v }; });
    items.sort(function (a, b) { return a.id - b.id; });
    return out({ ok: true, items: items });
  }
  if (p.ttr && /^\d{13}$/.test(p.ttr)) {
    const it = folder().getFilesByName(p.ttr + '.ttr');
    if (!it.hasNext()) return out({ ok: false, text: 'not found' });
    return ContentService.createTextOutput(it.next().getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
  }
  return out({ ok: true, service: 'qp-pb' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    let body; try { body = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, text: '送信データを読めませんでした' }); }
    const d = body && body.data, ttr = body && body.ttr;
    // 値の確認(GitHub 側でもう一度確かめる)
    if (!d || d.v !== 1 || (d.mode !== 'zenith' && d.mode !== 'zenithex')) return out({ ok: false, text: '記録データの版が違います。パッチを更新してください' });
    if (num(d.altitude, 0.01, 100000) === null || num(d.floor, 1, 10) === null) return out({ ok: false, text: '記録データの値が範囲外です' });
    if (!Array.isArray(d.mods) || d.mods.some(function (m) { return MODS.indexOf(String(m).replace(/_reversed$/, '')) < 0; })) return out({ ok: false, text: '知らない MOD が入っています' });
    if (d.bot === true || d.engine) return out({ ok: false, text: 'BOT・外部AIの記録は送れません' });
    if (typeof ttr !== 'string' || !ttr.length) return out({ ok: false, text: 'リプレイがありません' });
    if (ttr.length > TTR_MAX) return out({ ok: false, text: 'リプレイが大きすぎます' });
    let rj; try { rj = JSON.parse(ttr); } catch (x) { return out({ ok: false, text: 'リプレイを読めませんでした' }); }
    if (!rj || typeof rj.replay !== 'object') return out({ ok: false, text: 'リプレイの形が違います' });
    const name = String(d.name || '').replace(/[\u0000-\u001f<>@`]/g, '').trim().slice(0, 32) || 'LOCAL';
    d.name = name;
    // 連投よけ: 全体で 10 分に 30 件、同じ名前は 1 分に 1 件
    const cache = CacheService.getScriptCache(), slot = 'n' + Math.floor(Date.now() / 600000), n = Number(cache.get(slot) || 0), nk = 'u:' + name.toLowerCase();
    if (n >= 30) return out({ ok: false, text: '送信が混んでいます。少し待ってから送ってください' });
    if (cache.get(nk)) return out({ ok: false, text: '続けて送れません。1分待ってください' });
    cache.put(slot, String(n + 1), 700); cache.put(nk, '1', 60);
    prune();

    // 今の順位の目安(総合: 同じモード・ソロ・BOT なし・1人1記録)
    let rank = null;
    try {
      const db = JSON.parse(UrlFetchApp.fetch(RECORDS + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
      const best = {};
      (db.records || []).forEach(function (r) { if (r.mode === d.mode && r.test === 'solo' && !r.bot && (!best[r.user] || r.altitude > best[r.user])) best[r.user] = r.altitude; });
      if (d.test === 'solo' && !d.bot) rank = Object.keys(best).filter(function (k) { return best[k] > Number(d.altitude); }).length + 1;
    } catch (x) {}

    const id = Date.now();
    const item = { record: d };
    const hook = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK');
    if (hook) {
      const label = (rank ? '#' + rank + ' ' : '') + name + ' ' + (d.mode === 'zenithex' ? 'EXPERT ' : '') + Number(d.altitude).toFixed(2) + 'm (F' + d.floor + ')' +
        (d.mods.length ? ' MOD ' + d.mods.join(', ') : '') + (d.floor10 ? (d.lull === false ? ' 10F相当・猶予なし' : ' 10F相当・猶予あり') : '') + (d.hyper ? ' HYPERSPEED' : '');
      const content = ('🏔 ' + label + '\n```json\n' + JSON.stringify(Object.assign({ id: id }, d)) + '\n```').slice(0, 1990);
      const blob = Utilities.newBlob(ttr, 'application/json', 'PB-' + id + '.ttr');
      const dr = UrlFetchApp.fetch(hook + '?wait=true', { method: 'post', muteHttpExceptions: true, payload: { payload_json: JSON.stringify({ content: content, allowed_mentions: { parse: [] } }), 'files[0]': blob } });
      if (dr.getResponseCode() < 300) { const m = JSON.parse(dr.getContentText()); item.discord = { message: String(m.id), url: m.attachments && m.attachments[0] ? m.attachments[0].url : null }; }
    }
    if (!item.discord) folder().createFile(id + '.ttr', ttr, 'application/json');
    const rec = JSON.stringify(item);
    if (rec.length > 8000) return out({ ok: false, text: '記録データが大きすぎます' });
    PropertiesService.getScriptProperties().setProperty('q:' + id, rec);
    return out({ ok: true, rank: rank, text: '送りました: ' + (rank ? '#' + rank + ' ' : '') + name + ' ' + Number(d.altitude).toFixed(1) + 'm\nランキングにすぐ載ります' });
  } catch (x) {
    return out({ ok: false, text: '受付でエラー: ' + String(x).slice(0, 200) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
