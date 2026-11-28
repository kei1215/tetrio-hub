/* tetrio-patch 4.8235 standalone Blob OFFLINE loader (30-day cache). Based on the v4.8233 loader. */
(() => {
  'use strict';
  const VERSION = '4.8235';
  const CORE_VERSION = '4.8235';   // client.patch.* (vO 4.8235 client, patched against the TETR.IO client of 2026-11-09)
  const BASE = `https://kei1215.github.io/tetrio-hub/bookmarklets/offline-v${VERSION}/`;
  const CORE_BASE = `https://kei1215.github.io/tetrio-hub/bookmarklets/offline-v${CORE_VERSION}/`;
  const CACHE = `tetrio-patch-offline-v${VERSION}-hold1`;
  const MARKER = `${BASE}core-cache-marker`;
  const MONTH = 30 * 24 * 60 * 60 * 1000;
  const stateKey = '__tetrioStandaloneOfflineLoading';
  if (window[stateKey]) return;
  window[stateKey] = true;
  let popup = window.__tetrioStandaloneOfflineTarget || window.open('', '_blank');
  delete window.__tetrioStandaloneOfflineTarget;
  if (popup && popup.closed) popup = null;
  const target = popup || window;
  const show = message => { try { target.document.open(); target.document.write(`<!doctype html><meta charset="utf-8"><title>OFFLINE v${VERSION}</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#0d1018;color:#eaf2ff;font:16px/1.6 system-ui}.box{max-width:720px;padding:28px;border:1px solid #50739a;border-radius:12px;background:#151b27;white-space:pre-wrap}</style><div class="box">${String(message).replace(/[&<>]/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[value]))}</div>`); target.document.close(); } catch {} };
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  const read = async (cache, url, type) => {
    const response = await cache.match(url);
    if (!response) throw Error(`キャッシュがありません: ${url}`);
    return type === 'buffer' ? response.arrayBuffer() : type === 'json' ? response.json() : response.text();
  };
  const request = async (url, type) => {
    let response;
    try { response = await fetch(url, { cache: 'no-store' }); }
    catch (error) { throw Error(`取得失敗: ${url} (${error.message})`); }
    if (!response.ok) throw Error(`${response.status} ${url}`);
    return type === 'buffer' ? response.arrayBuffer() : type === 'json' ? response.json() : response.text();
  };
  const save = (cache, url, body, type) => cache.put(url, new Response(body, { headers: { 'content-type': type } }));
  const cachedBundle = async cache => ({
    sourceBuffer: await read(cache, 'https://tetr.io/js/tetrio.js', 'buffer'),
    metadata: await read(cache, CORE_BASE + 'client.patch.json', 'json'),
    patchBuffer: await read(cache, CORE_BASE + 'client.patch.bin', 'buffer'),
    template: await read(cache, BASE + 'offline-template.html', 'text')
  });
  const bundle = async () => {
    const cache = await caches.open(CACHE);
    let stale = true;
    try { stale = Date.now() - Number((await read(cache, MARKER, 'json')).savedAt || 0) >= MONTH; } catch {}
    if (!stale) {
      try { return await cachedBundle(cache); }
      catch { stale = true; try { await cache.delete(MARKER); } catch {} }
    }
    try {
      const [sourceBuffer, metadata, patchBuffer, template] = await Promise.all([
        request('https://tetr.io/js/tetrio.js', 'buffer'),
        request(CORE_BASE + 'client.patch.json', 'json'),
        request(CORE_BASE + 'client.patch.bin', 'buffer'),
        request(BASE + 'offline-template.html', 'text')
      ]);
      if (sourceBuffer.byteLength !== metadata.sourceLength || await digest(sourceBuffer) !== metadata.sourceSha256) throw Error('TETR.IO本体が更新されています。');
      await Promise.all([
        save(cache, 'https://tetr.io/js/tetrio.js', sourceBuffer, 'text/javascript'),
        save(cache, CORE_BASE + 'client.patch.json', JSON.stringify(metadata), 'application/json'),
        save(cache, CORE_BASE + 'client.patch.bin', patchBuffer, 'application/octet-stream'),
        save(cache, BASE + 'offline-template.html', template, 'text/html')
      ]);
      await save(cache, MARKER, JSON.stringify({ savedAt: Date.now() }), 'application/json');
      return { sourceBuffer, metadata, patchBuffer, template };
    } catch (error) {
      try { return await cachedBundle(cache); } catch { throw error; }
    }
  };
  (async () => {
    if (location.hostname !== 'tetr.io') throw Error('このブックマークは https://tetr.io/ で実行してください。');
    show(`TETR.IO OFFLINE v${VERSION}\n初回は本体と差分を保存します。以後30日間は保存済みの本体を優先します…`);
    const { sourceBuffer, metadata, patchBuffer, template } = await bundle();
    const source = new Uint8Array(sourceBuffer), additions = new Uint8Array(patchBuffer), targetBytes = new Uint8Array(metadata.targetLength);
    let cursor = 0;
    for (const [kind, offset, length] of metadata.ops) { targetBytes.set((kind === 0 ? source : additions).subarray(offset, offset + length), cursor); cursor += length; }
    if (cursor !== targetBytes.length || await digest(targetBytes.buffer) !== metadata.targetSha256) throw Error('OFFLINE差分の検証に失敗しました。');
    const clientUrl = URL.createObjectURL(new Blob([targetBytes], { type: 'text/javascript' }));
    target.location.replace(URL.createObjectURL(new Blob([template.replace('__CLIENT_BLOB_URL__', clientUrl)], { type: 'text/html' })));
    setTimeout(() => { window[stateKey] = false; }, 1500);
  })().catch(error => { window[stateKey] = false; show(`OFFLINEを起動できませんでした。\n${error.message}`); console.error('[tetrio-patch standalone offline]', error); });
})();
