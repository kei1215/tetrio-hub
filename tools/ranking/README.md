# QP PB ランキングの送信のしくみ

## 流れ(2026-11-16 現在)
1. オフライン版(アプリ版・ブラウザ版)の記録一覧で「ランキングに送る」を押す。送れるのはオフラインの記録だけ(BOT・外部AIの記録は送れない)。
2. ゲームが、`docs/ranking/api.json` の `url`(GAS ウェブアプリ)に、記録と TTR を POST する。
3. GAS(`gas/Code.gs`)の受付:
   - 値を確かめ、連投を制限する(全体 10 分に 30 件、同じ名前は 1 分に 1 件)。
   - 記録をスプレッドシート「QP PB ranking」に1行ずつ残す(消さない。ID はスクリプト プロパティ `SHEET_ID`)。
   - スクリプト プロパティ `DISCORD_WEBHOOK` があれば、その場で Discord に順位・記録・TTR を投稿する。なければ TTR をドライブ `qp-pb-queue` に置く。
4. ランキングページは開くたびに GAS の `?list=1` を読み、まだ `records.json` にない記録もすぐ表に出す。
5. TTR は押されたときだけ取りに行く: ページの「↓ TTR」(各表の上位3人)が GAS の `?ttr=ID&m=<Discordメッセージ>` を開き、GAS が webhook でメッセージを読んで今の CDN URL から中身を返す(URL は CacheService に6時間。CDN の URL は約1日で切れるため)。
6. `.github/workflows/pb-collect.yml`(10分ごと + 手動)が GAS の一覧を `docs/ranking/data/records.json` に移して commit する(取り込み済みかは id で判断。`rejected` の id は入れない)。

`api.json` の `url` が空のときや、送信に失敗したとき:
- ゲームは GitHub の Issue「QP PB 登録」を開き、TTR(.ttr.json)を保存する。
- Issue に TTR を添付すると、Actions(`pb-ranking.yml`)がそれを Discord(Secret `PB_DISCORD_WEBHOOK`)に移す(リポジトリには TTR を置かない)。

## 保持
- 記録: スプレッドシートと `records.json` に全部残る。表は1人1件(いちばん高いもの)。
  - Issue からの記録は GitHub アカウントでまとめる。ゲームからの記録は名前でまとめる。
- TTR: Discord のメッセージの添付として残る。記録には `discord`(メッセージ番号)を持たせる。
- 表: 総合・MOD なし・MOD・複合 MOD(1つ / 全部 × 表裏)・10F 相当(猶予あり / なし)・HYPERSPEED(MOD ごと、10F のみ)・リバイブ。

## GAS のデプロイ(clasp)
```bash
npm i -g @google/clasp
```
1. https://script.google.com/home/usersettings で「Google Apps Script API」をオンにする。
2. 次の順に実行する。
   ```bash
   clasp login
   ```
   ```bash
   cd tools/ranking/gas && clasp create --type webapp --title "QP PB ranking" --rootDir .
   ```
   ```bash
   clasp push -f
   ```
3. エディタ(`clasp open-script`)で関数 `setup` を1回実行し、ドライブと外部通信の権限を許可する。
4. デプロイする。
   ```bash
   clasp create-deployment -d "v1"
   ```
   出た ID から `https://script.google.com/macros/s/<ID>/exec` を作り、`docs/ranking/api.json` に入れる。
   - コードを更新したときは、URL を変えずに `clasp update-deployment <ID>` する。
   - `.clasp.json` はコミットしない(.gitignore)。

## 今のデプロイ(2026-11-16)
- プロジェクト: https://script.google.com/d/1TqshV6B9Rm5mqJqhIbPHW4CMC7pGNhuC2VCjNEZxpoxlnKS1xgNwIa33/edit
- デプロイ ID: `AKfycbzq9C_PX0tyCQE0fyvAg9e7tU5qwSjcIhWJCaBW1zVq70isVW78xct3IGFIdWJg1LpDIQ`(api.json の URL)
- 更新するとき: `cd tools/ranking/gas && clasp push -f && clasp update-deployment AKfycbzq9C_PX0tyCQE0fyvAg9e7tU5qwSjcIhWJCaBW1zVq70isVW78xct3IGFIdWJg1LpDIQ`
