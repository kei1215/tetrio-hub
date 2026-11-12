#!/usr/bin/env python3
"""TETR.IO tools のページを kei1215.com(Clean Blog + Bootstrap)と同じ作りで書き出す。

共通: ナビバー「TETR.IO tools」→ 灰色の帯 → カード型の本文 → コピーライト1行。
- index.html / bookmarklets/index.html(QP OFFLINE とパッチ)はここで本文を持つ
- spin/ と replay-edit/ は、今の本文(説明とブックマーク登録の仕組み)をカード型に変換する
- bookmarklets/auth.html(AI 版の取得)も同じ入れ物に入れる
使い方: python3 tools/site/build_pages.py docs
"""
import re, sys
from pathlib import Path

DOCS = Path(sys.argv[1])
PATCH = '4.8255'
OFFLINE = '4.8241'
REL = f'https://github.com/kei1215/tetrio-hub/releases/download/patch-v{PATCH}/'

NAV = [('', 'Home'), ('spin/', '盤面回転'), ('replay-edit/', '盤面修正'), ('replay-video/', 'MP4変換'), ('bookmarklets/', 'QP OFFLINE・パッチ')]


def shell(depth, title, body, scripts=''):
    up = '../' * depth
    nav = '\n'.join(f'                        <li class="nav-item"><a class="nav-link px-lg-3 py-3 py-lg-4" href="{up}{p}">{t}</a></li>' for p, t in NAV)
    return f'''<!DOCTYPE html>
<html lang="ja">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{title}</title>
        <script src="{up}assets/tools.js"></script>
        <link href="https://fonts.googleapis.com/css?family=Lora:400,700,400italic,700italic" rel="stylesheet" type="text/css" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:300italic,400italic,600italic,700italic,800italic,400,300,600,700,800" rel="stylesheet" type="text/css" />
        <link rel="stylesheet" href="{up}assets/clean-blog.css" />
        <link rel="stylesheet" href="{up}assets/tools.css" />
    </head>
    <body>
        <nav class="navbar navbar-expand-lg navbar-light" id="mainNav">
            <div class="container px-4 px-lg-5">
                <a class="navbar-brand" href="{up}">TETR.IO tools</a>
                <button class="navbar-toggler" type="button" aria-controls="navbarResponsive" aria-expanded="false" aria-label="メニュー">Menu ☰</button>
                <div class="collapse navbar-collapse" id="navbarResponsive">
                    <ul class="navbar-nav ms-auto py-4 py-lg-0">
{nav}
                        <li class="nav-item"><button class="nav-link px-lg-3 py-3 py-lg-4" id="themeToggle" type="button">☾ ダーク</button></li>
                    </ul>
                </div>
            </div>
        </nav>
        <header class="tools-band"></header>
<main class="container px-4 px-lg-5 tools-main">
{body}
</main>
        <footer class="border-top tools-footer">
            <div class="container px-4 px-lg-5">
                <div class="small text-center text-muted fst-italic">Copyright &copy; Kei's HomePages 2025</div>
            </div>
        </footer>
{scripts}
    </body>
</html>
'''


def hero(label, title, lead, note=None):
    out = f'''  <section class="my-5">
    <p class="text-uppercase text-primary fw-bold mb-2">{label}</p>
    <h1 class="display-5 fw-bold">{title}</h1>
    <p class="lead">{lead}</p>'''
    if note:
        out += f'\n    <div class="alert alert-info">{note}</div>'
    return out + '\n  </section>'


def card(title, inner, mb=4):
    return f'''  <section class="card shadow-sm mb-{mb}"><div class="card-body p-4">
    <h2 class="h4">{title}</h2>
{inner}
  </div></section>'''


# ---------------- トップ ----------------
def tool_card(href, title, text, meta):
    return f'''      <div class="col-md-6"><div class="card h-100 shadow-sm"><div class="card-body p-4">
        <h2 class="h5"><a href="{href}">{title}</a></h2>
        <p class="mb-2">{text}</p>
        <p class="small text-muted mb-0">{meta}</p>
      </div></div></div>'''


def page_index():
    body = hero('TETR.IO tools', 'TETR.IO tools', '公式の TETR.IO で使う、個人用のブックマークレットとデスクトップ版パッチです。',
                '対戦中のゲームの判定や、ほかの人の画面には影響しません(盤面修正はリプレイの中だけで動きます)。ゲームの更新で動かなくなることがあります。')
    body += '\n  <section class="mb-4"><div class="row g-3">\n' + '\n'.join([
        tool_card('spin/', '盤面回転', '回転入れの判定が出たときだけ、その向きへ盤面を回すブックマークレット(中心はプレイ範囲の真ん中)。', 'SOLO・リプレイ・ルームで使えます。2人以上は「それぞれ回す/まとめて回す」を選べます。'),
        tool_card('replay-edit/', 'リプレイ盤面修正', 'リプレイを止めると、その場面から自分で操作できるブックマークレット(再生すると元に戻る)。', '火力は表示だけで相手に送りません。fumen 書き出し・2人の左右入れ替え・スピンカウンター付き。'),
        tool_card('replay-video/', 'リプレイ → MP4 変換', 'リプレイ(.ttr / .ttrm)を 1080p の MP4 動画にするブックマークレット。', 'TETR.IO の画面はそのままで、裏で計算・描画します。TL・QP(MOD 付きも)・40L など。'),
        tool_card('bookmarklets/', 'QP OFFLINE', 'TETR.IO 上で、別タブに OFFLINE 版を起動するブックマークレット(30日キャッシュ版)。', 'QP・ZEN・ローカルリプレイ・端末内保存。'),
        tool_card('bookmarklets/#desktop', 'デスクトップ版パッチ', f'Mac・Windows・Linux の TETR.IO に入れるパッチ v{PATCH}(O形式・R形式・A形式)。', 'ミッションエディタ・機能基準書もこちら。'),
    ]) + '\n  </div></section>'
    return shell(0, 'TETR.IO tools', body)


# ---------------- QP OFFLINE・パッチ ----------------
def page_patch():
    os_cards = []
    for os_name, key, ext in (('macOS', 'Mac', '.command'), ('Windows', 'Windows', '.cmd'), ('Linux', 'Linux', '.sh')):
        os_cards.append(f'''<div class="col-md-4"><div class="card h-100 shadow-sm"><div class="card-body"><h3 class="h5">{os_name}</h3><div class="d-grid gap-2"><a class="btn btn-outline-primary" href="{REL}tetrio-patch-{key}-vO{PATCH}{ext}">O形式をダウンロード</a><a class="btn btn-outline-secondary" href="{REL}tetrio-patch-{key}-vR{PATCH}{ext}">R形式をダウンロード</a><a class="btn btn-danger" href="auth.html">A形式をダウンロード</a></div></div></div></div>''')
    body = hero('TETR.IO Patch', f'v{PATCH} ダウンロード', 'ブックマークレット、各OS版パッチ、機能基準書をここから取得できます。',
                'ブックマークレットは TETR.IO tools(kei1215.github.io)を接続先に使用し、localhost は使いません。')
    body += '\n' + card('ブックマークレット', f'''    <p>TETR.IO を開いた状態で使う OFFLINE 版です。別タブに <code>blob:https://tetr.io/…</code> を起動します(v{OFFLINE})。</p>
    <div class="d-flex gap-2 flex-wrap"><a class="btn btn-primary" id="install" href="#" draggable="true">ブックマークバーへドラッグ</a><button class="btn btn-outline-primary" id="copy" type="button">コードをコピー</button><a class="btn btn-outline-secondary" href="tetrio-offline-standalone-v{OFFLINE}.txt" download>コードTXTを保存</a></div>
    <p class="small mt-2 mb-0" id="copy-status" aria-live="polite"></p>
    <p class="small text-success mt-2 mb-0">2026年11月9日の TETR.IO 更新に対応(デスクトップ版 vO 4.8241 が元)。裏HYPERSPEED曲のラグとリザルト画面の HYPER を修正、ブラウザ版でも裏HYPERSPEED曲が鳴るように。ミッション失敗で即死・達成時の距離/火力の設定を追加。リバイブミッションの追加効果(消せない段・強制ゴミ・ボム・盤面の高さ・直列率・Spinルール・ミノの増減・I5)、4分割ミッション画面効果・操作反転・リバースHYPERSPEED曲(Kugelhagel OVERDRIVE、3:08.499583でループ)対応。v4.8235 以前のブックマークは2回目の起動で失敗することがあるので、新しいコードに登録し直してください。</p>
    <p class="small text-muted mt-3 mb-0"><strong>PC:</strong> 左のボタンをブックマークバーへドラッグします。<strong>スマホ:</strong>「コードをコピー」→ ブックマーク編集の URL 欄へ貼り付けます。TXT をブックマークバーで開いても起動用ブックマークにはなりません。</p>
    <p class="small text-success mt-2 mb-0"><strong>30日キャッシュ版:</strong> いったん新しいコードへ貼り替え、オンラインで OFFLINE を1回起動してください。その後は TETR.IO タブをリロードせず開いたままなら、ネットが切れても保存済みの OFFLINE を起動できます。30日後、接続できる時だけ更新します。</p>
    <details class="mt-3"><summary class="small">コードを手動でコピーする</summary><textarea id="manual" class="code-box mt-2" readonly>Loading…</textarea></details>''')
    body += '\n' + card('ほかの取得・追加方法', '''    <div class="row g-3">
      <div class="col-md-4"><h3 class="h6">PCブラウザ</h3><p class="small mb-0">「コードをコピー」→ ブックマークを1つ作成 → URL 欄を貼り替えます。Chrome、Edge、Firefox、Safari に対応します。</p></div>
      <div class="col-md-4"><h3 class="h6">iPhone / iPad</h3><p class="small mb-0">Safari で任意のページをブックマークしてから、編集画面の URL 欄をコピーしたコードで置き換えます。ポップアップが止められたら TETR.IO のポップアップを許可してください。</p></div>
      <div class="col-md-4"><h3 class="h6">Android</h3><p class="small mb-0">Chrome 等でブックマークを作成し、編集画面の URL 欄をコードへ置き換えます。アドレスバーにブックマーク名を入力して実行します。OS 版を使う場合は下の OS 別パッチを選びます。</p></div>
    </div>''')
    body += f'''
  <section class="mb-4" id="desktop"><h2 class="h3">OS別パッチ</h2><p>使用中の OS と、必要な形式を選んでください。O と R はすぐにダウンロードできます。実行前に TETR.IO を完全に終了(Mac は ⌘Q)してください。</p>
    <div class="row g-3">{"".join(os_cards)}</div>
    <p class="small text-muted mt-3 mb-0"><strong>実行のしかた:</strong> Mac はターミナルで <code>sh ~/Downloads/tetrio-patch-Mac-vO{PATCH}.command</code>(ダブルクリックだと権限で止まります)。Windows は <code>.cmd</code> をダブルクリック。Linux は <code>sh tetrio-patch-Linux-vO{PATCH}.sh</code>。本体を変えずに確認だけするときは最後に <code>--dry-run</code> を付けます。<a href="{REL}SHA256SUMS.txt">SHA256 一覧</a></p>
    <p class="small text-muted mt-2 mb-0"><strong>O形式・A形式</strong>には TETRIO-Resources-1.0.zip(TETR.IO の素材。Discord で配布)が必要です。起動ファイルと同じフォルダ、その一つ上、または「ダウンロード」フォルダに置いてください。R形式は不要です。</p>
  </section>'''
    body += '\n' + card('A形式の Discord 認証', '    <p class="mb-0">A形式(AI 版)を選ぶと、Discord のログイン画面を開きます。指定の Discord サーバーでロールを持っていることを確かめたあと、ダウンロードできます。</p>')
    body += '\n' + card('パッチの更新(PATCH UPDATE)', '''    <p>v4.8242 から、CONFIG の一番下「QP PATCH TOOLS」の <strong>PATCH UPDATE</strong>(オフライン画面では Tab パネルの「パッチを更新」)で、新しいパッチに入れ替えられます。押すと、今の OS と今の種類(A・R・O)のパッチを取ってきて、TETR.IO を終了して入れ替え、自動で起動し直します。最新のときは何もしません。</p>
    <p class="small text-muted mb-0">O・A は、TETRIO-Resources-1.0.zip が「ダウンロード」(または ダウンロード/all-tetrio-patch)にあることが必要です。</p>''')
    body += '\n' + card('リバイブミッションの追加効果(v4.8238〜)', '''    <p>ミッションエディタ v6.5 の「追加効果」タブで設定します。複数を同時に使えます。</p>
    <ul class="small mb-0">
      <li>消せない段の追加・削除(開始時と、N秒ごと/Nミノごとの繰り返し)。</li>
      <li>強制ゴミ:即時上昇・地形変更(下からN段を書き換え/今あるゴミ段の穴だけ変更)・ゴミ予測バーに付与。地形指定なし、またはシード由来のパターン(1つ穴・2つ穴・2列の交互配置・市松模様・固定の列・特定の形・テンプレート)。ボムにもできます。</li>
      <li>盤面の高さ、直列率(攻撃間・攻撃内)、Spinルール、ミノの増減、I5ミノ。戻すタイミングは「ミッション終了時/復活し終えた時/ラン中」から選べます。MOD の変更はミッション終了時に必ず戻ります。</li>
    </ul>''')
    body += '\n' + card('REPLAY BOARD EDIT(パッチ版の盤面修正)', '''    <p>CONFIG の一番下「QP PATCH TOOLS」の <strong>REPLAY BOARD EDIT: ON/OFF</strong> で使います(最初は OFF)。ON にすると、<a href="../replay-edit/">リプレイ盤面修正</a>と同じく、リプレイを止めるとその場面から操作でき、スピンカウンターも出ます。</p>
    <ul class="small mb-0">
      <li>動き始めるのは、TETRA CHANNEL を開いたとき、またはリプレイを読み込んだとき。どちらでもなくなったときや HOME に戻ったときは止まります(操作中なら止めた場面に戻ります)。</li>
      <li>QP TOOLS を PAUSED にしていても動きます。</li>
      <li>ON の間は、パッチのリプレイ演出(背景変更・シークバー非表示・Z/X/C の演出切り替え・TL 演出・結果画面)と、次のラウンドの自動再生を切ります。名前はそのまま出ます。</li>
    </ul>''')
    body += '\n' + card('機能基準書・ミッションエディタ', f'''    <p>これまでに追加した機能は、機能説明書にまとめています(分かる範囲で、追加された版も書いています)。追加・変更する機能はこの基準書へ記録します。v5.3 の設定項目を維持した v6.5 エディタ(追加効果タブ付き)も利用できます。ゲームの「詳細エディタを開く」から開くと、今あるミッションを表示します。</p>
    <div class="d-flex gap-2 flex-wrap"><a href="offline-v{OFFLINE}/FEATURE-MANUAL.md" class="btn btn-dark">機能説明書を読む</a><a href="offline-v{OFFLINE}/FEATURE-BASELINE.md" class="btn btn-outline-dark">機能基準書を読む</a><a href="offline-v{OFFLINE}/mission-editor.html" class="btn btn-outline-primary" target="_blank" rel="noopener">ミッションエディタ v6.5</a><a href="../patch/v4.8233/QP-Mission-Editor-v6.3.html" class="btn btn-outline-secondary" target="_blank" rel="noopener">v6.3</a></div>''', mb=5)
    script = f'''        <script>
          let bookmarkCode = '';
          fetch('./tetrio-offline-standalone-v{OFFLINE}.txt').then(r => r.text()).then(code => {{
            bookmarkCode = code.trim();
            document.getElementById('install').href = bookmarkCode;
            document.getElementById('manual').value = bookmarkCode;
          }}).catch(() => {{ document.getElementById('install').textContent = '読み込めませんでした'; }});
          document.getElementById('install').addEventListener('click', e => {{ if (!bookmarkCode || location.hostname !== 'tetr.io') {{ e.preventDefault(); alert('ブックマークバーへドラッグして登録し、https://tetr.io/ で実行してください。'); }} }});
          document.getElementById('copy').onclick = async () => {{
            const status = document.getElementById('copy-status');
            try {{ if (!bookmarkCode) throw Error('読み込み中'); await navigator.clipboard.writeText(bookmarkCode); status.textContent = 'コピーしました'; }}
            catch (e) {{ document.querySelector('details').open = true; document.getElementById('manual').select(); status.textContent = '自動コピーできませんでした。下の欄からコピーしてください。'; }}
          }};
        </script>'''
    return shell(1, 'TETR.IO Patch', body, script)


# ---------------- 盤面回転・盤面修正(今の本文を変換) ----------------
def convert(path, depth, label, title):
    old = path.read_text(encoding='utf-8')
    if '<main class="container">' not in old:
        return old  # already converted (this conversion runs once)
    main = re.search(r'<main class="container">(.*?)</main>', old, re.S).group(1)
    script = re.search(r'(\s*<script>(?:(?!</script>).)*</script>)\s*</body>', old, re.S).group(1)
    h1 = re.search(r'<h1>(.*?)</h1>', main, re.S).group(1)
    main = main.replace(re.search(r'\s*<h1>.*?</h1>', main, re.S).group(0), '', 1)
    note = re.search(r'\s*<p class="note">(.*?)</p>', main, re.S)
    lead_note = note.group(1) if note else ''
    if note:
        main = main.replace(note.group(0), '', 1)
    # 「登録」部分(最初の section より前)をカードに
    first = main.find('<section>')
    register, rest = (main[:first], main[first:]) if first >= 0 else (main, '')
    register = register.replace('<h2>登録</h2>', '')
    register = register.replace('class="btn btn-outline"', 'class="btn btn-outline-primary"').replace('class="btn"', 'class="btn btn-primary"')
    register = register.replace('<p class="muted">', '<p class="small text-muted">')
    sections = re.findall(r'<section>(.*?)</section>', rest, re.S)
    cards = [card('登録', register.rstrip())]
    for sec in sections:
        m = re.search(r'\s*<h2>(.*?)</h2>', sec, re.S)
        t = m.group(1) if m else ''
        inner = sec.replace(m.group(0), '', 1) if m else sec
        inner = inner.replace('<table>', '<table class="table table-sm">').replace('<textarea id="manual" readonly>', '<textarea id="manual" class="code-box" readonly>')
        inner = inner.replace('<p class="muted">', '<p class="small text-muted">').replace('<p class="note">', '<div class="alert alert-info">').replace('class="btn btn-outline"', 'class="btn btn-outline-primary"')
        cards.append(card(t, inner.rstrip()))
    body = hero(label, h1.replace('TETR.IO ', ''), lead_note) + '\n' + '\n'.join(cards)
    return shell(depth, title, body, script)


# ---------------- リプレイ → MP4 ----------------
def page_replay_video():
    body = hero('Bookmarklet', 'リプレイ → MP4 変換', '公式の <code>https://tetr.io/</code> で、リプレイファイル(<code>.ttr</code> / <code>.ttrm</code>)を <strong>1080p の MP4 動画</strong>にします。リプレイの入力からゲームを計算し直し、TETR.IO の画像・音を使って裏で描画します。画面には進み具合だけが出ます。',
                'ファイルはどこにも送りません(読み込み・変換・保存はすべてブラウザの中です)。TETR.IO の画像・音楽・効果音は、実行時に tetr.io から読み込みます。')
    body += '\n' + card('登録', '''    <p>下のボタンを<strong>ブックマークバーへドラッグ</strong>してください(このページでクリックしても動きません)。</p>
    <p><a id="bmA" class="btn btn-primary" href="#">MP4変換</a></p>
    <p class="small text-muted">上が動かないときの代替: <a id="bmB" class="btn btn-outline-primary" href="#">MP4変換(fetch版)</a></p>
    <p><button id="copy" class="btn btn-outline-primary" type="button">ブックマークコードをコピー</button> <span id="copy-status" aria-live="polite"></span></p>
    <details class="mt-2"><summary class="small">コードを手動でコピーする</summary><textarea id="manual" class="code-box mt-2" readonly>Loading…</textarea></details>''')
    body += '\n' + card('使い方(PC)', '''    <ol>
      <li><code>https://tetr.io/</code> を開き、ブックマークをクリックします。右下に「リプレイ → MP4」のパネルが出ます。</li>
      <li>「リプレイを選ぶ」で <code>.ttr</code> / <code>.ttrm</code> を選びます。</li>
      <li>ラウンド(全ラウンド/1ラウンドだけ)、フレームレート(60 / 30fps)、画質を選んで「MP4 を作る」を押します。</li>
      <li>2人対戦では「開始演出(TR)」「点数演出(TL の長さ)」を選べます。点数演出なしのときは「ラウンド間 ○ 秒」で間隔を決められます。</li>
      <li>終わったら「MP4 を保存」で保存します。保存しないままページを閉じると消えます。</li>
    </ol>
    <ul class="small mb-0">
      <li>変換中も TETR.IO の画面はそのままです。タブを閉じたりリロードしたりすると中止になります。</li>
      <li>見た目は ULTRA 相当の固定設定です(自分の TETR.IO の設定は読み取るだけで、書き換えません)。</li>
      <li>Chrome / Edge などの WebCodecs(動画エンコード)に対応したブラウザで使ってください。</li>
    </ul>''')
    body += '\n' + card('対応しているリプレイ', '''    <ul class="mb-0">
      <li>TETRA LEAGUE・ルーム対戦(.ttrm)、40L・BLITZ など(.ttr)。</li>
      <li>QUICK PLAY(ZENITH)。MOD 付き(リバース MOD を含む)も計算できます。DUO は一部だけの対応です。</li>
      <li>QP の画面(高度メーターなど)はまだ通常の盤面で描いています。</li>
    </ul>''')
    body += '\n' + card('TL の演出', '''    <ul class="mb-0">
      <li><strong>開始演出</strong>:GET READY・青/赤のカード・VS・FT。TR・ランク・順位(100位以内のみ。1位は紫、10位以内は金、100位以内は銀)は、TETRA CHANNEL から試合のときの値を取ります(見つからないときは今の値)。その人の TL 平均(APM・PPS・VS)もカードに出します。</li>
      <li><strong>点数演出</strong>:ラウンドが決まった 1.5 秒後から 5 秒、点数が上がる画面(MATCH POINT・TIEBREAKER 付き)。ラウンドの間隔は TL と同じです。</li>
    </ul>''', mb=5)
    script = '''        <script>
          const url = new URL('tetrio-replay-video.js', location.href).href;
          const a = "javascript:(()=>{if(location.hostname!=='tetr.io')return alert('https://tetr.io/ で実行してください');const s=document.createElement('script');s.src='" + url + "?v='+Date.now();s.onerror=()=>alert('load failed');document.head.appendChild(s)})();";
          const b = "javascript:(()=>{if(location.hostname!=='tetr.io')return alert('https://tetr.io/ で実行してください');fetch('" + url + "?v='+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t)).catch(e=>alert('load failed: '+e))})();";
          document.getElementById('bmA').href = a;
          document.getElementById('bmB').href = b;
          document.getElementById('manual').value = a;
          for (const id of ['bmA', 'bmB']) document.getElementById(id).addEventListener('click', e => { e.preventDefault(); alert('ブックマークバーへドラッグして登録し、tetr.io で実行してください。'); });
          document.getElementById('copy').onclick = async () => {
            const status = document.getElementById('copy-status');
            try { await navigator.clipboard.writeText(a); status.textContent = 'コピーしました'; }
            catch (e) { document.querySelector('details').open = true; document.getElementById('manual').select(); status.textContent = '自動コピーできませんでした。下の欄からコピーしてください。'; }
          };
        </script>'''
    return shell(1, 'TETR.IO リプレイ → MP4 変換', body, script)


def page_auth():
    old = (DOCS / 'bookmarklets/auth.html').read_text(encoding='utf-8')
    script = re.search(r'(\s*<script>(?:(?!</script>).)*</script>)\s*</body>', old, re.S).group(1)
    script = re.sub(r"patch-v4\.82\d\d", f"patch-v{PATCH}", script)
    script = re.sub(r"vA4\.82\d\d", f"vA{PATCH}", script)
    script = script.replace("{ class: 'btn', href: '#' }", "{ class: 'btn btn-primary', href: '#' }")
    body = hero('TETR.IO Patch', 'A形式(AI 版)', 'AI 版は、指定の Discord サーバーでロールを持っている人だけがダウンロードできます。',
                'Discord でログインすると、そのサーバーでの自分のロールを確かめます。読み取るのは、そのサーバーでの自分のロールとユーザー情報だけです。')
    body += '\n' + card('ダウンロード', '    <div id="view"><p>確認しています…</p></div>\n    <p class="mb-0"><a href="./#desktop">← OS別パッチに戻る</a></p>', mb=5)
    page = shell(1, 'TETR.IO Patch A形式', body, script)
    return page.replace('<head>', '<head>\n        <meta name="referrer" content="no-referrer" />', 1)


def main():
    out = {
        'index.html': page_index(),
        'bookmarklets/index.html': page_patch(),
        'spin/index.html': convert(DOCS / 'spin/index.html', 1, 'Bookmarklet', 'TETR.IO 盤面回転'),
        'replay-edit/index.html': convert(DOCS / 'replay-edit/index.html', 1, 'Bookmarklet', 'TETR.IO リプレイ盤面修正'),
        'bookmarklets/auth.html': page_auth(),
        'replay-video/index.html': page_replay_video(),
    }
    for name, html in out.items():
        (DOCS / name).write_text(html, encoding='utf-8')
        print('wrote', name, len(html))


if __name__ == '__main__':
    main()
