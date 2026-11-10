# TETR.IO 本体の更新でパッチが外れたとき

デスクトップ版パッチ(vR / vO / vA)は、tetr.io から届く `js/tetrio.js` を
アプリ内(`O/standalone.js` → `O/transform.js`)で書き換えています。書き換え位置は
縮小された名前(`yl`, `Rt`, `Ko` など)を含む文字列なので、TETR.IO が更新されて
名前が付け替わると書き換えが合わなくなります。

## 症状
- HOME の **OFFLINE** を押すと「EXIT TETR.IO?」が出る(オフラインへ移れない)。
  オフライン用の書き換え(終了確認を出さない処理)が外れているため。
- オンラインのリプレイ・観戦の表示(TL の結果画面、ラウンド演出など)が標準のまま。
- メイン側のログ(下の確かめ方)に次のどちらか、または両方が出る:
  - `[Local patch] Unsupported client; preserving QP patch only.`
  - `[QP replay patch] Unsupported client version; leaving game unchanged.`
- CONFIG の QP PATCH TOOLS(リプレイ編集・PATCH UPDATE)は、名前に頼らない作りなので残ることが多い。
  ただし **QP TOOLS: ON/PAUSED(停止)と TETR.IO PATCH DELETE(削除)** はリプレイ用の書き換えの中で
  入れているので、`[QP replay patch] Unsupported client version` のときは一緒に消える。
- 同じ commit のまま build だけ新しくなって名前が変わることがある(2026-11-10b)。bootstrap の hv の
  最後(build 日時)も見比べる。

## 確かめ方
1. TETR.IO を ⌘Q で終了し、デバッグ用ポートを付けて起動する:
   `open -a /Applications/TETR.IO.app --args --remote-debugging-port=9333 --inspect=9334`
2. メイン側(`ws://127.0.0.1:9334`、`http://127.0.0.1:9334/json/list`)で `Runtime.enable` すると、
   起動時のログに上の `Unsupported` が出る。
3. 本体の版: ページのログ `Up to date. Local version … | Commit xxxxxxxxx@master | Build yyyymmddThhmmss`。
4. **新しい本体の取り方に注意**: `https://tetr.io/js/tetrio.js` を素で取ると CDN の古い版が返ることがある。
   アプリが実際に使う版は `?hv=<bootstrap.js の hv>` を付けて取る
   (例 `https://tetr.io/js/tetrio.js?hv=e84ebccd2.fdb11cd9b77b.20261109T164827`)。
   中身に commit id(例 `e84ebccd2`)が入っていれば正しい版。

## 直し方
1. 旧本体(前回動いていた版)と新本体を用意する。
2. 合わなくなった書き換え位置を洗い出す: `transform.js` の文字列リテラルのうち、
   旧本体では見つかるのに新本体で数が変わるもの。正規表現や組み立て式の位置は、
   `return originalSource` の前に印を付けて(`console.error('BAIL@行')`)どこで止まるかを見る。
3. 名前の対応を割り出す: 各位置の旧文字列を正規表現にし、短い名前(3文字以下、`.` の後ろ以外)を
   キャプチャにして新本体で **ちょうど1か所** 一致させる。キャプチャから旧→新の対応を取る。
   ファイル全体のトークン多数決は、同じ短い名前が別のものに再利用されるので当てにしない
   (2026-11-10 の `Rt` は 8 か所が `Rt` のまま、4 か所が `Ht`)。
4. `build_release.py` に対応表を足し(`CLIENT_RENAMES_<日付>`)、`--port-<日付>` で `transform.js` に当てる。
   パッチ自身の置き換え用の名前 `Sa` / `La` / `ha`(`adapt()` で差し替える)は対応表に入れない。
5. 確認: Node で `require('transform.js')(新本体)` を実行し、`Unsupported` が出ないこと、
   止まる位置がないこと、旧本体+旧 transform の出力と、パッチの目印(`qp-…`, `__qp…`)の数が同じことを比べる。
   その後 R/O/A の `--dry-run`、前の版との差分(消えたファイルなし)。

## 記録
| 日付 | 本体 | 対応 | パッチ |
|---|---|---|---|
| 2026-11-09 | (前回) | `CLIENT_RENAMES_2026_11_09`(Bc→Sc, El→Ml, Ht→Rt, Js→Zs, Mc→Ec, Ql→Yl, Qs→Ys, Ss→Bs, Yo→Qo, Zo→Jo)、Zenith の基底名を動的に読む | v4.8239〜 |
| 2026-11-10 | commit e84ebccd2 / build 20261109T164827 | `CLIENT_RENAMES_2026_11_10`(Ko→Vo, kc→Bc, Bs→Ls, Ml→Dl, _c→gc, yl→Al, vl→wl, Rt→Ht, Ys→Qs, Qo→Yo) | v4.8247 |
| 2026-11-10b | commit e84ebccd2 / build 20261109T191625(同じ commit の作り直し) | `CLIENT_RENAMES_2026_11_10B`(Bc→Lc, Gc→Xc, Kc→Qc, Ls→Bs, Vo→Ko, Yl→Jl)。症状: QP TOOLS の停止と PATCH DELETE が消えた、`Unsupported client version` | v4.8255 |
