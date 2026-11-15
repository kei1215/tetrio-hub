# QP PB ランキングの送信のしくみ

## 流れ
1. オフライン版(アプリ版・ブラウザ版)の記録一覧で「ランキングに送る」を押す。送れるのはオフラインの記録だけ。
2. ゲームが、`docs/ranking/api.json` の `url`(GAS ウェブアプリ)に、記録と TTR を POST する。
3. GAS(`gas/Code.gs`)の受付:
   - 値を確かめ、連投を制限する。
   - TTR を Google ドライブの `qp-pb-queue` に、記録をスクリプト プロパティに置く(3日で消える)。
   - **GAS は秘密の値を持たない。**
4. `.github/workflows/pb-collect.yml` が10分ごとに、GAS の一覧(`?list=1`)と TTR(`?ttr=ID`)を取りに行く。
   - TTR を Discord(webhook = Secret `PB_DISCORD_WEBHOOK`)に投稿する。
   - `docs/ranking/data/records.json` に足して commit する。
5. `pb-refresh.yml` が6時間ごとに Discord のメッセージを読み直し、CDN の URL(約1日で切れる)を新しくする。
6. ページは、各表の上位3人だけリプレイのリンクを出す。

`api.json` の `url` が空のときや、送信に失敗したとき:
- ゲームは GitHub の Issue「QP PB 登録」を開き、TTR(.ttr.json)を保存する。
- Issue に TTR を添付すると、Actions がそれを Discord に移す(リポジトリには TTR を置かない)。

## 保持
- 記録: `records.json` に全部残る。表は1人1件(いちばん高いもの)。
  - Issue からの記録は GitHub アカウントでまとめる。
  - ゲームからの記録は名前でまとめる。
- TTR: Discord のメッセージの添付として残る。
  - 記録には `discord`(メッセージ番号)と `replayUrl`(最新の CDN URL)を持たせる。

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
