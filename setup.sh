#!/bin/sh
# tetrio-hub の一括セットアップ。旧サイト(kei1215.GitHub.io)は読むだけで、一切変更しない。
# 必要なもの: git, gh (GitHub CLI, `gh auth login` 済み), perl
# 使い方: このフォルダで `sh setup.sh`   (mp3 を除外したいとき: SKIP_MP3=1 sh setup.sh)
set -e
OWNER=${OWNER:-kei1215}
REPO=${REPO:-tetrio-hub}
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 が見つかりません"; exit 1; }; }
need git; need gh; need perl
gh auth status >/dev/null 2>&1 || { echo "ERROR: 先に gh auth login を実行してください"; exit 1; }

[ -d .git ] || git init -q -b main

echo "== 1/4 旧サイトから TETR.IO 関連をコピー(読み取りのみ) =="
sh ./import-from-old-site.sh

if [ "$SKIP_MP3" = 1 ]; then
  rm -f docs/patch/v4.8233/kugelhagel-overdrive.mp3
  echo "mp3 を除外しました"
fi

echo "== 2/4 commit =="
git add -A
git commit -qm "Add TETR.IO tools, patches and bookmarklets (copied from kei1215.GitHub.io)" || echo "(commit なし)"

echo "== 3/4 公開リポジトリを作成して push =="
printf '公開リポジトリ %s/%s を作成して push します。旧サイトには触れません。よろしいですか? [y/N] ' "$OWNER" "$REPO"
read ans
[ "$ans" = y ] || { echo "中止しました(ここまでの変更はこのフォルダ内だけです)"; exit 0; }
gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --push

echo "== 4/4 GitHub Pages を有効化(main の /docs) =="
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null \
  || echo "Pages は自動で有効化できませんでした。Settings → Pages で Branch main / Folder /docs を選んでください。"

BASE="https://$OWNER.github.io/$REPO"
echo
echo "完了。数分後に、次の URL が開けるか確認してください:"
echo "  $BASE/"
echo "  $BASE/bookmarklets/index.html"
echo "  $BASE/spin/tetrio-spin-console.js"
echo "旧サイト側のブックマークは、そのまま動き続けます。"
