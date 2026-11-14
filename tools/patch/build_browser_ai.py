#!/usr/bin/env python3
"""Browser QP OFFLINE with the vA AI (bookmarklet shown only after the Discord check on auth.html).

Builds docs/bookmarklets/offline-va<VER>/ from a vA source zip:
  1. build_browser_offline.py on the vA zip (O/offline client + modules, byte patch vs tetrio.js);
  2. adds A/offline/ai-loader.js and engine/* with the desktop absolute paths pointed at the folder;
  3. loads ai-loader.js from the page template after local-shell.js;
  4. writes tetrio-offline-ai-v<VER>.txt (the bookmarklet, same 30-day cache design as the vO one).

Usage: python3 build_browser_ai.py VA_ZIP DOCS --version 4.8283 --tetrio tetrio.js --extra-from docs/bookmarklets/offline-v4.8255
"""
import argparse, re, shutil, subprocess, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('va_zip', type=Path)
    ap.add_argument('docs', type=Path)
    ap.add_argument('--version', required=True)
    ap.add_argument('--tetrio', required=True, type=Path)
    ap.add_argument('--extra-from', required=True, type=Path)
    a = ap.parse_args()
    tag = 'a' + a.version
    out = a.docs / 'bookmarklets' / f'offline-v{tag}'
    base = f'https://kei1215.github.io/tetrio-hub/bookmarklets/offline-v{tag}/'
    subprocess.run([sys.executable, str(HERE / 'build_browser_offline.py'), str(a.va_zip), str(out),
                    '--version', tag, '--tetrio', str(a.tetrio), '--extra-from', str(a.extra_from)], check=True)
    # The vO loader regex only knows numeric versions; build_browser_offline wrote tag-based names.
    with zipfile.ZipFile(a.va_zip) as z:
        names = [n for n in z.namelist() if n.startswith('A/offline/') and not n.endswith('/')]
        for n in names:
            rel = n[len('A/offline/'):]
            data = z.read(n)
            if rel.endswith('.js'):
                text = data.decode('utf-8')
                text = text.replace("script('/engine/' + name)", f"script('{base}engine/' + name)")
                text = text.replace("fetch('/engine/", f"fetch('{base}engine/")
                # The plan worker file path is desktop-only (cross-origin workers are refused on the
                # blob page); the planner then builds its worker from a Blob, which works here.
                text = text.replace('script[src*="/engine/ai-spin-planner.js"]', 'script[src*="qp-desktop-only-plan-worker"]')
                text = text.replace('OFFLINE vA-', 'OFFLINE BOOKMARKLET vA-')
                # user 2026-11-14: ブラウザ版の自作AIは1体まで
                text = text.replace("if(profiles.length>=64)throw Error('保存AIは64体までです')",
                                    "if(profiles.length>=1)throw Error('ブラウザ版の保存AIは1体までです。今のAIを削除してから作成してください')")
                if re.search(r"['\"]/engine/(?!ai-plan-worker)", text):
                    raise SystemExit('absolute /engine/ path left in ' + rel)
                data = text.encode('utf-8')
            dest = out / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    t = (out / 'offline-template.html').read_text(encoding='utf-8')
    shell = f'<script src="{base}local-shell.js"></script>'
    if t.count(shell) != 1:
        raise SystemExit('local-shell tag')
    t = t.replace(shell, shell + f'\n<script src="{base}ai-loader.js"></script>')
    (out / 'offline-template.html').write_text(t, encoding='utf-8')
    # Own copy of the core client patch (user: O版の最新とズレてても動く様に): a later vO browser
    # rebuild must not change the client this AI folder runs on.
    loader_path = out / 'standalone-loader.js'
    loader = loader_path.read_text(encoding='utf-8')
    core = re.search(r"const CORE_VERSION = '([^']+)';", loader)
    if core and core.group(1) != tag:
        src_dir = a.docs / 'bookmarklets' / f'offline-v{core.group(1)}'
        for n in ('client.patch.json', 'client.patch.bin'):
            shutil.copy2(src_dir / n, out / n)
        loader = loader.replace(core.group(0), f"const CORE_VERSION = '{tag}';")
        loader_path.write_text(loader, encoding='utf-8')
    vo =(a.docs / 'bookmarklets' / 'tetrio-offline-standalone-v4.8255.txt').read_text(encoding='utf-8')
    old_dir = re.search(r"bookmarklets/(offline-v[\w.]+)/standalone-loader\.js", vo).group(1)
    old_cache = re.search(r"n='([^']+)'", vo).group(1)
    bm = vo.replace(old_dir, f'offline-v{tag}').replace(old_cache, f'tetrio-patch-offline-v{tag}-core1')
    (a.docs / 'bookmarklets' / f'tetrio-offline-ai-v{a.version}.txt').write_text(bm, encoding='utf-8')
    bl = (out / 'engine' / 'bot-learning.js').read_text(encoding='utf-8')
    if 'ブラウザ版の保存AIは1体まで' not in bl:
        raise SystemExit('AI profile limit anchor')
    print('done', out)


if __name__ == '__main__':
    main()
