#!/usr/bin/env python3
"""Build the browser QP OFFLINE bookmarklet folder from a desktop vO source zip.

The browser version starts from the official https://tetr.io/js/tetrio.js and
rebuilds the vO offline client (O/offline/client.js) with a byte patch: segments
that also exist in the current official file are copied from it, only the rest
ships as client.patch.bin. So the patch must be regenerated whenever TETR.IO
updates tetrio.js (the loader refuses a different source by length + SHA-256).

Usage:
  python3 build_browser_offline.py VO_SOURCE_ZIP OUT_DIR --version 4.8235 \
      --tetrio tetrio.js --extra-from OLD_BROWSER_DIR
"""
import argparse, hashlib, json, re, shutil, zipfile
from pathlib import Path

BLOCK = 32       # window used to find shared segments
MIN_COPY = 48    # shorter shared runs ship as additions


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def make_ops(source, target):
    index = {}
    for i in range(0, len(source) - BLOCK + 1, 8):
        index.setdefault(source[i:i + BLOCK], i)
    ops, additions = [], bytearray()
    pending = bytearray()

    def flush():
        if pending:
            ops.append([1, len(additions), len(pending)])
            additions.extend(pending)
            pending.clear()

    t = 0
    n = len(target)
    while t < n:
        hit = index.get(target[t:t + BLOCK]) if t + BLOCK <= n else None
        if hit is None:
            pending.append(target[t]); t += 1
            continue
        s = hit
        # extend backwards into pending bytes
        back = 0
        while back < len(pending) and s - back > 0 and source[s - back - 1] == pending[-1 - back]:
            back += 1
        end_t, end_s = t + BLOCK, s + BLOCK
        while end_t < n and end_s < len(source) and target[end_t] == source[end_s]:
            end_t += 1; end_s += 1
        length = (end_t - t) + back
        if length < MIN_COPY:
            pending.append(target[t]); t += 1
            continue
        if back:
            del pending[-back:]
        flush()
        ops.append([0, s - back, length])
        t = end_t
    flush()
    # verify
    out = bytearray()
    for kind, off, ln in ops:
        out += (source if kind == 0 else additions)[off:off + ln]
    if bytes(out) != target:
        raise SystemExit('patch round-trip failed')
    return ops, bytes(additions)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vo_zip', type=Path)
    ap.add_argument('out_dir', type=Path)
    ap.add_argument('--version', required=True)
    ap.add_argument('--tetrio', required=True, type=Path)
    ap.add_argument('--extra-from', required=True, type=Path, help='previous browser folder (qpo.svg, standalone-loader.js)')
    a = ap.parse_args()
    if a.out_dir.exists():
        raise SystemExit('output exists: ' + str(a.out_dir))
    base = f'https://kei1215.github.io/tetrio-hub/bookmarklets/offline-v{a.version}/'
    a.out_dir.mkdir(parents=True)
    with zipfile.ZipFile(a.vo_zip) as z:
        read = lambda n: z.read('O/offline/' + n)
        index_html = read('index.html').decode('utf-8')
        scripts = re.findall(r'<script src="/([\w-]+\.js)"', index_html)
        modules = sorted(set(s for s in scripts if s != 'client.js')) + ['reverse-hyper-browser.js']
        for m in modules:
            data = read(m)
            if m == 'local-shell.js':
                text = data.decode('utf-8')
                if text.count("icon.src='/res/local/qpo.svg'") != 1:
                    raise SystemExit('qpo.svg anchor')
                text = text.replace("icon.src='/res/local/qpo.svg'", f"icon.src='{base}qpo.svg'")
                data = text.encode('utf-8')
            (a.out_dir / m).write_bytes(data)
        (a.out_dir / 'mission-editor.html').write_bytes(read('mission-editor.html'))
        client = read('client.js')
    shutil.copy2(a.extra_from / 'qpo.svg', a.out_dir / 'qpo.svg')

    # Page template (the loader puts the patched client's Blob URL in place).
    t = index_html
    head = ('<head>\n\t<base href="https://tetr.io/">\n<script>\n'
            '// Blob documents inherit the TETR.IO origin, but browsers still reject a\n'
            '// cross-scheme history URL. Keep the current Blob URL when the stock client\n'
            '// clears its hash during startup; every other history call remains native.\n'
            "if(location.protocol==='blob:'){\n const nativeReplaceState=history.replaceState.bind(history);\n"
            ' history.replaceState=(state,title,url)=>{\n  try{return nativeReplaceState(state,title,url)}\n'
            "  catch(error){\n   if(error?.name==='SecurityError')return nativeReplaceState(state,title);\n   throw error;\n  }\n };\n}\n"
            f"window.__qpMissionEditorUrl='{base}mission-editor.html';\n</script>")
    if t.count('<head>') != 1:
        raise SystemExit('head anchor')
    t = t.replace('<head>', head, 1)
    t = re.sub(r'<title>[^<]*</title>', f'<title>TETR.IO — OFFLINE BOOKMARKLET v{a.version}</title>', t, count=1)
    log_fetch = "if(location.protocol==='http:'&&location.hostname==='127.0.0.1')fetch('/local-log',{method:'POST',body:String(value)}).catch(()=>{})"
    if t.count(log_fetch) != 1:
        raise SystemExit('local-log anchor')
    t = t.replace(log_fetch, '')
    # custom-missions.js is listed twice in the desktop page; the first (in <head>) is enough.
    dup = '<script src="/custom-missions.js"></script>'
    first = t.find(dup)
    second = t.find(dup, first + 1)
    if second > 0:
        t = t[:second] + t[second + len(dup):]
    t = t.replace('src="/client.js"', 'src="__CLIENT_BLOB_URL__"')
    t = re.sub(r'src="/([\w-]+\.js)"', lambda m: f'src="{base}{m.group(1)}"', t)
    shell_tag = f'<script src="{base}local-shell.js"></script>'
    if t.count(shell_tag) != 1:
        raise SystemExit('local-shell tag')
    t = t.replace(shell_tag, shell_tag + f'\n<script src="{base}reverse-hyper-browser.js"></script>')
    if t.count('__CLIENT_BLOB_URL__') != 1 or re.search(r'src="/[\w-]+\.js"', t):
        raise SystemExit('template check failed')
    (a.out_dir / 'offline-template.html').write_text(t, encoding='utf-8')

    # Client byte patch against the current official tetrio.js.
    source = a.tetrio.read_bytes()
    ops, additions = make_ops(source, client)
    meta = {'version': a.version, 'sourceUrl': 'https://tetr.io/js/tetrio.js',
            'sourceLength': len(source), 'sourceSha256': sha256(source),
            'targetLength': len(client), 'targetSha256': sha256(client), 'ops': ops}
    (a.out_dir / 'client.patch.json').write_text(json.dumps(meta, separators=(',', ':')), encoding='utf-8')
    (a.out_dir / 'client.patch.bin').write_bytes(additions)

    loader = (a.extra_from / 'standalone-loader.js').read_text(encoding='utf-8')
    old = re.search(r"const VERSION = '([\d.]+)';", loader)
    if not old:
        raise SystemExit('loader version anchor')
    loader = loader.replace(old.group(0), f"const VERSION = '{a.version}';")
    # Core client: reuse the previous core folder when the patched client is identical,
    # otherwise this version's client.patch.* becomes the core.
    core = re.search(r"const CORE_VERSION = '([\d.]+)';", loader)
    if not core:
        raise SystemExit('loader core version anchor')
    core_meta = a.extra_from.parent / f'offline-v{core.group(1)}' / 'client.patch.json'
    same = core_meta.exists() and json.loads(core_meta.read_text())['targetSha256'] == sha256(client) \
        and json.loads(core_meta.read_text())['sourceSha256'] == sha256(source)
    if same:
        (a.out_dir / 'client.patch.json').unlink()
        (a.out_dir / 'client.patch.bin').unlink()
        print('core client unchanged: loader keeps offline-v' + core.group(1))
    else:
        loader = loader.replace(core.group(0), f"const CORE_VERSION = '{a.version}';")
        loader = re.sub(r'// client\.patch\.\* \(vO [\d.]+ client', f'// client.patch.* (vO {a.version} client', loader, count=1)
        print('core client changed: loader reads offline-v' + a.version)
    loader = re.sub(r'/\* tetrio-patch [\d.]+ standalone', f'/* tetrio-patch {a.version} standalone', loader, count=1)
    (a.out_dir / 'standalone-loader.js').write_text(loader, encoding='utf-8')
    print('modules', len(modules), 'ops', len(ops), 'additions', len(additions), 'copied', len(client) - len(additions))


if __name__ == '__main__':
    main()
