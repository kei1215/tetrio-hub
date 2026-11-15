# QP PB ランキングの送信のしくみ

## 流れ
1. オフライン版(アプリ版・ブラウザ版)の記録一覧で「ランキングに送る」を押す。送れるのはオフラインの記録だけ。
2. ゲームが `docs/ranking/api.json` の `url`(GAS ウェブアプリ)に、記録と TTR を POST する。
3. GAS(`gas/Code.gs`)の処理:
   1. 値を確かめ、連投を制限する。
   2. Discord(webhook)に、順位・記録(JSON)・TTR の添付を投稿する。
   3. GitHub に `repository_dispatch: pb` で記録と Discord のメッセージ番号を渡す。
4. `.github/workflows/pb-ranking.yml` が `.github/scripts/pb-ingest.js` で値を確かめ直し、`docs/ranking/data/records.json` に足して commit する。
5. `pb-refresh.yml` が6時間ごとに Discord のメッセージを読み直し、CDN の URL(約1日で切れる)を新しくする。
6. ページは各表の上位3人だけ、リプレイのリンクを出す。

`api.json` の `url` が空のときや送信に失敗したときは、ゲームは GitHub の Issue「QP PB 登録」を開き、TTR(.ttr.json)を保存する。Issue に TTR を添付すると、Actions がそれを Discord に移す(リポジトリには TTR を置かない)。

## 保持
- 記録: `records.json` に全部残る。表に出るのは1人1件で、いちばん高いもの。
  - Issue からの記録は GitHub アカウントでまとめる。
  - ゲームからの記録は名前でまとめる。
- TTR: Discord のメッセージの添付として残る。
  - 記録には Discord のメッセージ番号(`discord`)と、最新の CDN URL(`replayUrl`)を持たせる。
  - webhook かメッセージを消すと、TTR も消える。

## 設定(1回だけ)
1. GitHub リポジトリの Secret `PB_DISCORD_WEBHOOK` に、Discord の webhook URL を入れる。
   - Issue 経由の TTR と、URL の更新に使う。
   - 入れ方: `gh secret set PB_DISCORD_WEBHOOK -R kei1215/tetrio-hub` を実行し、URL を貼る。
2. GitHub で fine-grained トークンを作る。
   - 場所: Settings → Developer settings → Fine-grained tokens。
   - Repository access: tetrio-hub だけ。
   - Permissions: Contents = Read and write。
3. GAS プロジェクトを作る。
   1. https://script.google.com で新しいプロジェクトを作り、`gas/Code.gs` の中身を貼る。
   2. 「プロジェクトの設定 → スクリプト プロパティ」に、次の2つを入れる。
      - `DISCORD_WEBHOOK`(webhook URL)
      - `GITHUB_TOKEN`(2 のトークン)
   3. 「デプロイ → 新しいデプロイ → ウェブアプリ」で、実行するユーザーを「自分」、アクセスできるユーザーを「全員」にしてデプロイする。
   4. 出た `https://script.google.com/macros/s/…/exec` を `docs/ranking/api.json` の `url` に入れて push する。
   - コードを変えたときは「デプロイを管理 → 編集 → 新しいバージョン」で更新する。こうすると URL は変わらない。
