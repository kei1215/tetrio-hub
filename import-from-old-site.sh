#!/bin/sh
# 旧サイト(kei1215.GitHub.io)から TETR.IO 関連を「コピー」し、接続先を GitHub Pages に書き換える。
# 旧サイトは clone して読むだけ。push も削除も書き換えもしない。
# このスクリプトは、新しいリポジトリ(tetrio-hub)のルートで実行する。
set -e
OLD=${OLD:-https://github.com/kei1215/kei1215.GitHub.io.git}
NEW_BASE=${NEW_BASE:-https://kei1215.github.io/tetrio-hub}
RAW_OLD=https://raw.githubusercontent.com/kei1215/kei1215.GitHub.io/main
PAGES_OLD=https://kei1215.github.io

TMP=$(mktemp -d)
git clone --depth 1 "$OLD" "$TMP/old"

mkdir -p docs/patch docs/bookmarklets
# TETR.IO 関連だけをコピーする(旧サイトの index.html / README.md / 画像などブログ側は対象外)
cp -R "$TMP/old/tetrio-patch/." docs/patch/
cp -R "$TMP/old/bookmarklets/." docs/bookmarklets/
rm -rf "$TMP"

# 接続先の書き換え: ブックマークレット側のテキストファイルだけ。
# (patch の .sh/.cmd/.command、.bin、.json には手を入れない。ハッシュ検証の対象は tetrio.js と client.patch のみなので、
#  offline-template.html は書き換えても検証に影響しない。raw.githubusercontent.com は text/plain+nosniff で
#  <script src> が拒否されるため、テンプレートも Pages の URL に向ける)
find docs/bookmarklets -type f \( -name '*.js' -o -name '*.txt' -o -name 'index.html' -o -name 'offline-template.html' \) | while read -r f; do
  perl -pi -e "s{\Q$RAW_OLD\E/bookmarklets/}{$NEW_BASE/bookmarklets/}g; s{\Q$RAW_OLD\E/tetrio-patch/}{$NEW_BASE/patch/}g; s{\Q$PAGES_OLD\E/bookmarklets/}{$NEW_BASE/bookmarklets/}g; s{\Q$PAGES_OLD\E/tetrio-patch/}{$NEW_BASE/patch/}g" "$f"
done

echo "--- 旧サイトを指したままの参照(あれば要確認) ---"
grep -rIl "kei1215.GitHub.io\|raw.githubusercontent.com/kei1215\|kei1215.github.io/tetrio-patch\|kei1215.github.io/bookmarklets" docs || echo "(なし)"
echo "--- この新リポジトリのリモート(旧サイトが出ないこと) ---"
git remote -v || true
git status --short | head -20
