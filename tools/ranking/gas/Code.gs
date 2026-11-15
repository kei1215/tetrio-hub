// QP PB ランキングの中継(Google Apps Script のウェブアプリ)。
// ゲーム内の「ランキングに送る」→ この doPost → ①Discord に順位・記録・TTR を投稿 ②GitHub(repository_dispatch "pb")に記録を渡す
// → GitHub Actions(pb-ranking.yml)が records.json に足す。
// 秘密の値はスクリプト プロパティにだけ置く(コードには書かない):
//   DISCORD_WEBHOOK = Discord の webhook URL
//   GITHUB_TOKEN    = tetrio-hub だけに Contents: Read and write を持つ fine-grained トークン
const REPO = 'kei1215/tetrio-hub';
const RECORDS = 'https://kei1215.github.io/tetrio-hub/ranking/data/records.json';
const MODS = ['expert', 'nohold', 'messy', 'gravity', 'volatile', 'doublehole', 'invisible', 'allspin', 'duo'];
const TTR_MAX = 9.5 * 1024 * 1024; // Discord の添付の上限(10MB)に収める

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function num(v, lo, hi) { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }

function doGet() { return out({ ok: true, service: 'qp-pb' }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const props = PropertiesService.getScriptProperties();
    const hook = props.getProperty('DISCORD_WEBHOOK'), token = props.getProperty('GITHUB_TOKEN');
    if (!hook || !token) return out({ ok: false, text: '中継の設定が終わっていません' });
    let body; try { body = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, text: '送信データを読めませんでした' }); }
    const d = body && body.data, ttr = body && body.ttr;
    // 値の確認(GitHub 側でもう一度確かめる)
    if (!d || d.v !== 1 || (d.mode !== 'zenith' && d.mode !== 'zenithex')) return out({ ok: false, text: '記録データの版が違います。パッチを更新してください' });
    if (num(d.altitude, 0.01, 100000) === null || num(d.floor, 1, 10) === null) return out({ ok: false, text: '記録データの値が範囲外です' });
    if (!Array.isArray(d.mods) || d.mods.some(function (m) { return MODS.indexOf(String(m).replace(/_reversed$/, '')) < 0; })) return out({ ok: false, text: '知らない MOD が入っています' });
    if (typeof ttr !== 'string' || !ttr.length) return out({ ok: false, text: 'リプレイがありません' });
    let rj; try { rj = JSON.parse(ttr); } catch (x) { return out({ ok: false, text: 'リプレイを読めませんでした' }); }
    if (!rj || typeof rj.replay !== 'object') return out({ ok: false, text: 'リプレイの形が違います' });
    const name = String(d.name || '').replace(/[\u0000-\u001f<>@`]/g, '').trim().slice(0, 32) || 'LOCAL';
    d.name = name;
    // 連投よけ: 全体で 10 分に 30 件、同じ名前は 1 分に 1 件
    const cache = CacheService.getScriptCache(), slot = 'n' + Math.floor(Date.now() / 600000), n = Number(cache.get(slot) || 0), nk = 'u:' + name.toLowerCase();
    if (n >= 30) return out({ ok: false, text: '送信が混んでいます。少し待ってから送ってください' });
    if (cache.get(nk)) return out({ ok: false, text: '続けて送れません。1分待ってください' });
    cache.put(slot, String(n + 1), 700); cache.put(nk, '1', 60);

    // 順位(総合: 同じモード・ソロ・BOT なし・1人1記録)
    let rank = null;
    try {
      const db = JSON.parse(UrlFetchApp.fetch(RECORDS + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
      const best = {};
      (db.records || []).forEach(function (r) { if (r.mode === d.mode && r.test === 'solo' && !r.bot && (!best[r.user] || r.altitude > best[r.user])) best[r.user] = r.altitude; });
      if (d.test === 'solo' && !d.bot) rank = Object.keys(best).filter(function (k) { return best[k] > Number(d.altitude); }).length + 1;
    } catch (x) {}

    const id = Date.now();
    let blob = Utilities.newBlob(ttr, 'application/json', 'PB-' + id + '.ttr');
    if (blob.getBytes().length > TTR_MAX) { blob = Utilities.gzip(blob, 'PB-' + id + '.ttr.gz'); if (blob.getBytes().length > TTR_MAX) return out({ ok: false, text: 'リプレイが大きすぎます' }); }
    const label = (rank ? '#' + rank + ' ' : '') + name + ' ' + (d.mode === 'zenithex' ? 'EXPERT ' : '') + Number(d.altitude).toFixed(1) + 'm (F' + d.floor + ')' +
      (d.mods.length ? ' MOD ' + d.mods.join(', ') : '') + (d.floor10 ? (d.lull === false ? ' 10F相当・猶予なし' : ' 10F相当・猶予あり') : '') + (d.hyper ? ' HYPERSPEED' : '') + (d.bot ? ' BOT' : '');
    const content = ('🏔 ' + label + '\n```json\n' + JSON.stringify(Object.assign({ id: id }, d)) + '\n```').slice(0, 1990);
    const dr = UrlFetchApp.fetch(hook + '?wait=true', { method: 'post', muteHttpExceptions: true, payload: { payload_json: JSON.stringify({ content: content, allowed_mentions: { parse: [] } }), 'files[0]': blob } });
    if (dr.getResponseCode() >= 300) return out({ ok: false, text: 'Discord に保存できませんでした (' + dr.getResponseCode() + ')' });
    const msg = JSON.parse(dr.getContentText());
    const discord = { message: String(msg.id), url: msg.attachments && msg.attachments[0] ? msg.attachments[0].url : null };

    const gr = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: JSON.stringify({ event_type: 'pb', client_payload: { id: id, record: d, discord: discord } }),
    });
    if (gr.getResponseCode() >= 300) return out({ ok: false, text: 'ランキングに登録できませんでした (' + gr.getResponseCode() + ')。リプレイは Discord に保存済みです' });
    return out({ ok: true, rank: rank, text: '送りました: ' + label + '\n数分でランキングに載ります' });
  } catch (x) {
    return out({ ok: false, text: '中継でエラー: ' + String(x).slice(0, 200) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
