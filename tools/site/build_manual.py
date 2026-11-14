#!/usr/bin/env python3
"""docs/manual/*.md を、サイトと同じ入れ物の HTML にする(GitHub Pages は .md をそのまま文字で返すため)。
FEATURE-MANUAL.md -> manual/index.html、FEATURE-BASELINE.md -> manual/baseline.html
使い方: python3 tools/site/build_manual.py docs
対応する書き方: 見出し(#〜####)、---、- / 1. の箇条書き、| 表 |、**太字**、`コード`、[文字](URL)
"""
import html, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_pages import shell, DOCS  # noqa: E402


def inline(text):
    out = html.escape(text, quote=False)
    out = re.sub(r'`([^`]+)`', r'<code>\1</code>', out)
    out = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', out)
    out = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', out)
    return out


def md_to_html(md):
    lines, out, i = md.splitlines(), [], 0
    para = []

    def flush():
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            flush(); i += 1; continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            flush()
            level = len(m.group(1))
            tag = {1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4'}[level]
            cls = {1: ' class="display-6 fw-bold mb-3"', 2: ' class="h4 mt-5 mb-3"', 3: ' class="h5 mt-4"', 4: ' class="h6 mt-3"'}[level]
            out.append(f'<{tag}{cls}>{inline(m.group(2))}</{tag}>'); i += 1; continue
        if re.match(r'^-{3,}$', s):
            flush(); out.append('<hr />'); i += 1; continue
        if s.startswith('|'):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.match(r'^:?-{3,}:?$', c) for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                head, body = rows[0], rows[1:]
                t = ['<div class="table-responsive"><table class="table table-sm">', '<thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>']
                t += ['<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body]
                t.append('</tbody></table></div>')
                out.append('\n'.join(t))
            continue
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', line)
        if m:
            flush()
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < len(lines):
                mm = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', lines[i])
                if mm:
                    items.append(mm.group(3)); i += 1
                elif lines[i].startswith('  ') and lines[i].strip() and items:
                    items[-1] += ' ' + lines[i].strip(); i += 1
                else:
                    break
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag}>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>')
            continue
        para.append(s); i += 1
    flush()
    return '\n'.join(out)


def page(md_path, title, other):
    body = md_to_html(md_path.read_text(encoding='utf-8'))
    links = ' '.join(f'<a href="{h}" class="btn btn-sm btn-outline-dark">{t}</a>' for h, t in other)
    return shell(1, title, f'''  <section class="my-5 manual">
    <div class="d-flex gap-2 flex-wrap mb-4">{links}</div>
{body}
  </section>''')


def main():
    man = DOCS / 'manual'
    pages = {
        'index.html': page(man / 'FEATURE-MANUAL.md', 'TETR.IO Patch 機能説明書', [('baseline.html', '機能基準書'), ('../bookmarklets/#desktop', 'ダウンロードへ戻る')]),
        'baseline.html': page(man / 'FEATURE-BASELINE.md', 'TETR.IO Patch 機能基準書', [('./', '機能説明書'), ('../bookmarklets/#desktop', 'ダウンロードへ戻る')]),
    }
    for name, text in pages.items():
        (man / name).write_text(text, encoding='utf-8')
        print('wrote manual/' + name, len(text))


if __name__ == '__main__':
    main()
