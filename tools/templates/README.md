# テンプレ取り込み(スピンカウンター用)

- four.lol: `crawl.cjs`(page-data.json → tetris-fumen で盤面)。
- shiwehi.com: ページ取得(1 秒に 1 回) → `text.cjs`(ページ内の文字の盤面 `<div class="ttt">`) と `sum.cjs` + `read.cjs`(手順 GIF・組み方 PNG の色を読む) → `curate.cjs`(開幕/中盤に分け、作りかけ・同形を除く)。
- 依存: omggif@1.0.10, pngjs@7.0.0, tetris-fumen。結果の一覧は tools/OPENER-TEMPLATES.md。
