// QP PB ランキングの受付窓口(Google Apps Script のウェブアプリ)。
// ゲーム内の「ランキングに送る」→ doPost が記録と TTR を受け取る。
//  ・記録はスプレッドシート「QP PB ranking」に1行ずつ残す(user: すぷ氏にでもまとめてほしい)。消さない
//  ・スクリプト プロパティ DISCORD_WEBHOOK があれば、その場で Discord に順位・記録・TTR を投稿する(user: discordへの投稿はGASから)
//  ・なければ TTR を Google ドライブ「qp-pb-queue」に置き、GitHub Actions が Discord に投稿する
// ランキングページは開くたびに doGet(?list=1)で一覧を読み、まだ records.json にない記録もすぐ表に出す。
// GitHub Actions(pb-collect.yml)が一覧を records.json に移す(取り込み済みかは id で判断)。
const RECORDS = 'https://kei1215.github.io/tetrio-hub/ranking/data/records.json';
const MODS = ['expert', 'nohold', 'messy', 'gravity', 'volatile', 'doublehole', 'invisible', 'allspin', 'duo'];
const TTR_MAX = 9.5 * 1024 * 1024; // Discord の添付の上限(10MB)に収める
const FOLDER = 'qp-pb-queue';
const HEAD = ['id', '受付日時', '名前', 'モード', '高さ(m)', 'フロア', 'MOD', '10F相当', '猶予', 'HYPERSPEED', 'テスト', 'リバイブ', 'APM', 'PPS', 'Discord メッセージ', 'TTR(Discord)', '記録データ(JSON)'];

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function num(v, lo, hi) { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
function freshUrl(msg) {
  const cache = CacheService.getScriptCache(), key = 'm:' + msg, hit = cache.get(key);
  if (hit) return hit;
  const hook = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK');
  if (!hook) return null;
  const r = UrlFetchApp.fetch(hook + '/messages/' + msg, { muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) return null;
  const m = JSON.parse(r.getContentText()), url = m.attachments && m.attachments[0] && m.attachments[0].url;
  if (url) cache.put(key, url, 21600);
  return url || null;
}
function folder() { const it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }
function sheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('QP PB ranking'); props.setProperty('SHEET_ID', ss.getId()); }
  const sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return sh;
}
function addRow(id, d, discord) {
  sheet().appendRow([String(id), new Date(id), d.name, d.mode, Number(d.altitude), Number(d.floor), (d.mods || []).join(' '), d.floor10 ? 'あり' : '', d.floor10 ? (d.lull === false ? 'なし' : 'あり') : '',
    d.hyper ? 'あり' : '', d.test || 'solo', Number(d.revives) || 0, Number(d.apm) || 0, Number(d.pps) || 0, discord ? discord.message : '', discord && discord.url ? discord.url : '', JSON.stringify(d)]);
}

// エディタで1回実行: 権限の許可・スプレッドシート作成・前の受付(スクリプト プロパティ q:…)をシートへ移す
function setup() {
  folder();
  const sh = sheet(), props = PropertiesService.getScriptProperties(), all = props.getProperties();
  const have = {}; sh.getDataRange().getValues().slice(1).forEach(function (r) { have[String(r[0])] = 1; });
  Object.keys(all).filter(function (k) { return k.indexOf('q:') === 0; }).sort().forEach(function (k) {
    const id = k.slice(2), v = JSON.parse(all[k]), d = v && v.record ? v.record : v;
    if (!have[id]) addRow(Number(id), d, v && v.discord);
    props.deleteProperty(k);
  });
  Logger.log('ok: ' + sh.getParent().getUrl());
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.list) {
    const rows = sheet().getDataRange().getValues().slice(1);
    const items = [];
    rows.forEach(function (r) {
      let d = null; try { d = JSON.parse(r[16]); } catch (x) {}
      if (d) items.push({ id: Number(r[0]), record: d, discord: r[14] ? { message: String(r[14]), url: r[15] || null } : null });
    });
    return out({ ok: true, items: items.slice(-1000) });
  }
  // TTR: ドライブの控え → なければ Discord のメッセージから(URL は6時間キャッシュ。user: 必要なファイルのみ取ってきて6時間維持)
  if (p.ttr && /^\d{13}$/.test(p.ttr)) {
    const it = folder().getFilesByName(p.ttr + '.ttr');
    if (it.hasNext()) return ContentService.createTextOutput(it.next().getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
    let msg = /^\d{5,25}$/.test(p.m || '') ? p.m : null;
    if (!msg) sheet().getDataRange().getValues().slice(1).forEach(function (r) { if (String(r[0]) === p.ttr && r[14]) msg = String(r[14]); });
    const url = msg && freshUrl(msg);
    if (!url) return out({ ok: false, text: 'not found' });
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) { CacheService.getScriptCache().remove('m:' + msg); return out({ ok: false, text: 'discord ' + res.getResponseCode() }); }
    return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
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
    // 2026-11-16: ランキングは「最初から10F相当」(猶予あり / なし)だけ
    if (d.floor10 !== true) return out({ ok: false, text: 'ランキングに送れるのは「最初から10F相当」の記録だけです' });
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
    addRow(id, d, item.discord);
    return out({ ok: true, rank: rank, text: '送りました: ' + (rank ? '#' + rank + ' ' : '') + name + ' ' + Number(d.altitude).toFixed(1) + 'm\nランキングにすぐ載ります' });
  } catch (x) {
    return out({ ok: false, text: '受付でエラー: ' + String(x).slice(0, 200) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
