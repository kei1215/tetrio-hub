// QP patch: automatic port to a new TETR.IO client (v5.11, user: 自動で修正するようにできない？ 更新のたびにアップデートするのは終わってる).
// TETR.IO rebuilds rename the short minified names (ki -> wi ...), so the anchors in transform.js stop matching
// and OFFLINE shows "EXIT TETR.IO?" (tools/patch/CLIENT-UPDATES.md). When the stock transform fails on the
// tetrio.js the app just got, this does what the manual port did, inside the app:
//  1. run the transform while watching String split / includes / match / replace / indexOf and RegExp test on
//     the client source; the first anchor with no match is the one that broke,
//  2. turn its short names (1-3 chars) into capture groups and look for exactly one way it fits the new client,
//  3. rename those names in the transform's own text (all at once, from the original text), load that text,
//     and run again, until the patch applies (or nothing more can be found).
// The names found are cached per tetrio.js (userData/qp-autoport.json), so this runs once per TETR.IO build.
// If it cannot fix everything, the stock result is used (same as before).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MARKERS = ['/* tetrio-local-patch-vO-', '/* qp-replay-presentation-vO-'];
const EXPECTED_MISS = /^\/\* |^HOOK_LoadBgmFromBytes:$/;   // markers and "already added?" checks
const KEEP = new Set(['$', 'Sa', 'La', 'ha', 'if', 'do', 'in', 'of', 'new', 'var', 'let', 'for', 'try', 'e', 't', 'n', 'i', 's', 'r', 'o', 'a', 'l', 'c']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ID = /((?<![\w$.\\])[A-Za-z_$][\w$]{0,2}(?![\w$]))/;

function load(text) { const m = { exports: {} }; new Function('module', 'exports', 'require', '__filename', '__dirname', text)(m, m.exports, require, '', ''); return m.exports; }
// map: 2-3 letter names renamed everywhere (as build_release.py --port does); map.__lits: anchors with a
// one-letter name are replaced as whole text only (a one-letter name is also a local in the patch's own code)
// embedded bundles (const QP_..._SRC="..." lines) are other programs carried as text: never renamed
// (build_release.py also re-adds them fresh after its renames)
const EMB = /^const QP_\w+_SRC=".*$/gm;
function outside(text, f) { let out = '', last = 0; for (const m of text.matchAll(EMB)) { out += f(text.slice(last, m.index)) + m[0]; last = m.index + m[0].length; } return out + f(text.slice(last)); }
function renamed(text, map) { return outside(text, t => renamed0(t, map)); }
function renamed0(text, map) {
  const keys = Object.keys(map).filter(k => k !== '__lits');
  if (keys.length) { const pat = new RegExp('(?<![\\w$.])(' + keys.sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\w$])', 'g'); text = text.replace(pat, k => map[k]); }
  for (const [a, b] of map.__lits || []) { text = text.split(a).join(b); const qa = a.replace(/"/g, '\\"'), qb = b.replace(/"/g, '\\"'); if (qa !== a) text = text.split(qa).join(qb); }
  return text;
}
// run the transform; ok = patched (markers present, no "Unsupported"); misses = anchors with no match, in order
function trial(fn, src) {
  const P = String.prototype, R = RegExp.prototype, o = { split: P.split, includes: P.includes, replace: P.replace, replaceAll: P.replaceAll, match: P.match, indexOf: P.indexOf }, test = R.test;
  const miss = [], seen = new Set(), errs = [], ce = console.error, cw = console.warn;
  // the anchor and the text it was looked for in (the client source as the transform had changed it so far)
  const hay = new Map(), note = (k, h) => { if (!seen.has(k)) { seen.add(k); miss.push(k); hay.set(k, h); } };
  const big = s => typeof s === 'string' && s.length > 1e6;
  for (const k of Object.keys(o)) P[k] = function (a, ...r) {
    if (big(this)) { if (typeof a === 'string' && a.length > 6 && !o.includes.call(this, a)) note(a, String(this)); else if (a instanceof RegExp && !o.match.call(this, new RegExp(a.source, a.flags.replace('g', '')))) note(a, String(this)); }
    return o[k].call(this, a, ...r);
  };
  R.test = function (s) { const r = test.call(this, s); if (big(s) && !r) note(this, s); return r; };
  console.error = console.warn = (...a) => errs.push(a.join(' '));
  let out = src;
  try { out = fn(src); } catch (e) { errs.push(String(e)); }
  finally { Object.assign(P, o); R.test = test; console.error = ce; console.warn = cw; }
  const ok = out !== src && MARKERS.every(m => out.includes(m)) && !errs.some(e => /Unsupported|not found|Error/.test(e));
  return { out, ok, errs, hay, miss: miss.filter(m => !(typeof m === 'string' && EXPECTED_MISS.test(m))) };
}
// the anchor as it reads in the original transform text: renaming can merge two old names into one (old Ko ->
// Yo while old Yo stays), so the anchor is fitted with the original names, which keeps them apart
function original(text, map, anchor) {
  text = text.replace(EMB, '');
  const keys = Object.keys(map).filter(k => k !== '__lits'), a = typeof anchor === 'string' ? anchor : anchor.source;
  if (!keys.length) return anchor;
  const pat = new RegExp('(?<![\\w$.])(' + keys.sort((x, y) => y.length - x.length).map(esc).join('|') + ')(?![\\w$])', 'g');
  const seg = []; let out = '', last = 0;   // seg: [new start, old start, new len, old len] of each renamed name
  text.replace(pat, (k, _g, off) => { out += text.slice(last, off); seg.push([out.length, off, map[k].length, k.length]); out += map[k]; last = off + k.length; return k; });
  out += text.slice(last);
  const at = out.indexOf(a); if (at < 0 || out.indexOf(a, at + 1) >= 0 && out.indexOf(a, at + 1) !== at) { if (at < 0) return anchor; }
  const toOld = n => { let d = 0; for (const [ns, os, nl, ol] of seg) { if (ns >= n) break; if (n < ns + nl) return os; d = os + ol - (ns + nl); } return n + d; };
  const s0 = text.slice(toOld(at), toOld(at + a.length));
  return typeof anchor === 'string' ? s0 : (() => { try { return new RegExp(s0, anchor.flags); } catch { return anchor; } })();
}
// one anchor (string, or RegExp without back references) -> {cur name: new name} if it fits the client one way only
function fit(anchor, src, vacated) {
  let rx = '', ids = [], parts;
  if (typeof anchor === 'string') {
    parts = anchor.split(ID);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { rx += esc(parts[i]); continue; }
      const id = parts[i]; if (KEEP.has(id)) { rx += esc(id); continue; }
      const k = ids.indexOf(id); rx += k >= 0 ? '\\k<q' + k + '>' : (ids.push(id), '(?<q' + (ids.length - 1) + '>[A-Za-z_$][\\w$]{0,2})');
    }
  } else {
    if (/\\[1-9]/.test(anchor.source)) return null;
    parts = anchor.source.split(ID);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { rx += parts[i]; continue; }
      const id = parts[i]; if (KEEP.has(id) || /\\$/.test(parts[i - 1])) { rx += id; continue; }
      const k = ids.indexOf(id); rx += k >= 0 ? '\\k<q' + k + '>' : (ids.push(id), '(?<q' + (ids.length - 1) + '>[A-Za-z_$][\\w$]{0,2})');
    }
  }
  if (!ids.length) return null;
  let re; try { re = new RegExp(rx, 'g'); } catch { return null; }
  let maps = new Set();
  for (const m of src.matchAll(re)) { maps.add(ids.map((id, k) => m.groups['q' + k]).join(',')); if (maps.size > 64) return null; }
  // several fits for one name: minified renames move in chains (old ca -> pa frees ca, old la -> ca), so keep
  // the fits whose new name is a name already renamed away
  if (maps.size > 1 && ids.length === 1 && vacated) maps = new Set([...maps].filter(v => vacated.has(v)));
  if (maps.size !== 1) return null;
  const got = [...maps][0].split(','), out = {}; let lit = null;
  ids.forEach((id, k) => { if (got[k] !== id) out[id] = got[k]; });
  if (!Object.keys(out).length) return null;
  if (Object.keys(out).some(k => k.length === 1)) {
    if (typeof anchor !== 'string') return null;
    // the text as it reads after the 2-3 letter renames -> with the one-letter ones too
    const p = anchor.split(ID), q = p.slice();
    for (let i = 1; i < p.length; i += 2) { const n = out[p[i]]; if (n) { q[i] = n; if (p[i].length > 1) p[i] = n; } }
    // replaced as short windows around each one-letter name (12 chars before, 8 after, inside the anchor), so the
    // same text in the code the patch inserts (function x(e,n,i){ ... ) is renamed too
    lit = [];
    let pos = 0;
    for (let i = 0; i < p.length; i++) {
      if (i % 2 && out[parts[i]] && parts[i].length === 1) {
        const pre = p.slice(0, i).join('').slice(-12), post = p.slice(i + 1).join('').slice(0, 8);
        const preN = q.slice(0, i).join('').slice(-12), postN = q.slice(i + 1).join('').slice(0, 8);
        lit.push([pre + p[i] + post, preN + q[i] + postN]);
      }
    }
    for (const k of Object.keys(out)) if (k.length === 1) delete out[k];
  }
  return { names: out, lit };
}

module.exports = function autoPort(stock, transformPath, cacheDir) {
  let text = null; try { text = fs.readFileSync(transformPath, 'utf8'); } catch {}
  const cacheFile = cacheDir ? path.join(cacheDir, 'qp-autoport.json') : null;
  return function patch(src) {
    const first = trial(stock, src);
    if (first.ok || !text) return first.out;
    const sha = crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
    let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
    const tryMap = map => { try { return trial(load(renamed(text, map)), src); } catch (e) { return { ok: false, miss: [], out: src, errs: [String(e)] }; } };
    if (cache[sha]) { const r = tryMap(cache[sha]); if (r.ok) { console.log('[QP auto-port] cached names for this TETR.IO build'); return r.out; } }
    const map = {}; let r = first, tried = new Set();
    for (let round = 0; round < 60 && !r.ok; round++) {
      let step = null;
      for (const a of r.miss) {
        const key = String(a); if (tried.has(key)) continue;
        const vac = new Set(Object.keys(map).filter(k => k !== '__lits' && !Object.values(map).includes(k)));
        const a0 = original(text, map, a);
        const f = fit(a0, (r.hay && r.hay.get(a)) || src, vac); if (!f) { tried.add(key); continue; }
        // fitted with the original names: keep only names not mapped yet (a mapped name that fits differently
        // means the fit is wrong)
        const add = {}; let bad = false;
        for (const [o, n] of Object.entries(f.names)) { if (o in map) { if (map[o] !== n) { bad = true; break; } continue; } add[o] = n; }
        if (bad || (!Object.keys(add).length && !(f.lit && f.lit.length))) { tried.add(key); continue; }

        if (f.lit && f.lit.length) { tried.add(key); add.__lits = [...(map.__lits || []), ...f.lit]; }
        step = add; break;
      }
      if (!step) { tried = new Set(); }
      if (!step) break;
      Object.assign(map, step); r = tryMap(map);
    }
    if (!r.ok) { console.error('[QP auto-port] could not adapt to this TETR.IO build', first.errs.join(' | ')); return first.out; }
    console.log('[QP auto-port] adapted to the new TETR.IO build:', JSON.stringify(map));
    try { cache[sha] = map; fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch {}
    return r.out;
  };
};
