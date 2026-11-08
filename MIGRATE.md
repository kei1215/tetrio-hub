# 旧サイト(kei1215.GitHub.io)から TETR.IO 関連を「コピー」する

## 読み取りで確認した結果(2026-11-08)

TETR.IO 関連として **コピーする**
| 旧サイト内 | 内容 | 新リポジトリ内 |
|---|---|---|
| `tetrio-patch/v4.8217/` | Linux / Mac / Windows × vO・vR の6ファイル | `docs/patch/v4.8217/` |
| `tetrio-patch/v4.8233/` | QP-Mission-Editor-v6.3.html、kugelhagel-overdrive.mp3 | `docs/patch/v4.8233/` |
| `bookmarklets/` 全体 | index.html(TETR.IO OFFLINE の案内ページ)、`tetrio-offline-*.js/.txt`、`offline-v4.8213/14/16/` | `docs/bookmarklets/` |

`bookmarklets/` は、`index.html` と `offline-v4.8216/` の中身(standalone-loader.js、board-rotation-effects.js、
rotate-command.js、client.patch.bin など)まで読んで確認した。TETR.IO 以外のものは見つからなかった。
(`offline-v4.8213/` と `offline-v4.8214/` の中身は名前だけで判断しているので、コピー後に目で確認すること。)

コピー **しない**(ブログ側)
- 旧サイトのルートの `index.html`、`README.md`、`IMG_7657.jpg`
- 他のリポジトリ(HP、web-site、discord、flask-hello-world)は TETR.IO と無関係なので対象外

## 旧サイトは消さない・変えない理由
既存のブックマークレットは、旧サイトのファイルを `raw.githubusercontent.com/kei1215/kei1215.GitHub.io/main/...` で
読んでいる(例: `standalone-loader.js` の `BASE`)。旧サイトのファイルを動かすと、配布済みのブックマークが壊れる。
そのため旧サイトは **そのまま残し**、新しいリポジトリに **コピー** して、コピー側の接続先だけを GitHub Pages に書き換える。

## 接続先の書き換え(import-from-old-site.sh が自動で行う)
- 対象: `docs/bookmarklets/` 内の `.js` / `.txt` / `index.html` だけ
- `raw.githubusercontent.com/kei1215/kei1215.GitHub.io/main/bookmarklets/` → `https://kei1215.github.io/tetrio-hub/bookmarklets/`
- `.../tetrio-patch/` → `https://kei1215.github.io/tetrio-hub/patch/`
- 触らない: patch の `.sh/.cmd/.command`、`.bin`、`.json`、`offline-template.html`
- 最後に、旧サイトを指したままの参照を一覧表示する(バイナリ内の文字列などは手作業で確認)

## 手順
1. GitHub で、空の **公開** リポジトリ `tetrio-hub` を作る(README なし)。
2. この zip を展開し、そのフォルダを `git init` → 新リポジトリに紐づける。
3. フォルダのルートで `sh import-from-old-site.sh` を実行。
   `git remote -v` に旧サイトが出ていないことを確認する。
4. `docs/` の中身を目で確認(特に offline-v4.8213 / v4.8214)。
5. commit して push。Settings → Pages で Branch `main` / Folder `/docs`。
6. 新 URL で `docs/bookmarklets/index.html` などが開けるのを確認してから、新しいブックマークに切り替える。

## 注意
- `kugelhagel-overdrive.mp3` は、権利が自分にない音源なら、公開リポジトリへのコピーを避ける(コピー後に `docs/patch/v4.8233/` から消す)。
- 旧サイトのファイルを消すのは、ブログと既存ブックマークへの影響がないと確認できてから、自分で判断する。
