# TETR.IO tools 更新履歴と「再発させない」チェック

> 変更履歴です。GitHub の編集ボタン(鉛筆)から誰でも変更を提案できます。

作業の前に読み、作業の後に追記すること。直したことが再び壊れていないかは、下の「再発チェック」で確かめる。

## 1. 更新履歴(要点)

### デスクトップ版パッチ(vA / vO / vR)
- v4.8233–4.8237:
  - リプレイ盤面修正とスピンカウンターを組み込み、CONFIG > QP PATCH TOOLS に REPLAY BOARD EDIT(初期 OFF)を追加。
  - ON の間は、リプレイ演出(背景・シークバー・自動再生)を切る。
- v4.8238:リバイブミッションの追加効果(消せない段・強制ゴミ・ボム・高さ・直列率・Spinルール・ミノ増減・I5)。
- v4.8239:即死ルール、報酬の距離・火力、裏HYPERSPEED曲の修正。
- v4.8240:ミッションエディタをアプリのウィンドウで開く。
- v4.8241–4.8242:PATCH UPDATE を追加。v4.8241 の更新処理は壊れていて、v4.8242 で Node https と GitHub API への切り替えにより直した。
- v4.8243–4.8244:fumen のオプション、Windows の更新処理の修正。
- v4.8245:AI の候補を全配置から作り、DAS で移動する。
- v4.8248:AI の Spin B2B モード。
- v4.8249–4.8253:AI のテンプレート学習・火力の先読み、オフライン版のリプレイ盤面修正。どれも公開していない。
- v4.8254:上の全部を公開。
- v4.8255:2026-11-10 の TETR.IO 再ビルドに対応(--port-2026-11-10b)。
- v4.8257:オンライン DUO はまず自分の分だけ保存(.ttr)。相方を待つ処理で保存されなかったため。診断ログと CONFIG > QP DUO REPLAYS を追加。
- v4.8256:QP DUO のリプレイ保存(オンラインは duo-save を常に有効、オフラインはローカル記録へ)、Warlock の Spin ルール(all+)。

### サイトとブックマークレット(docs/)
- 盤面回転:
  - スピンの判定が出たときだけ回す。
  - 回す向きは最後に押した回転キーで決める。
  - 180度回転のスピンは 180度・360度を交互に回す。
- リプレイ盤面修正:
  - 止めると操作できる。
  - R で止めた場面に戻る。Ctrl+Z/Y で1ミノずつ戻す・やり直す。
  - 自滅したら、その直前に戻す。
  - 重力をなくせる。
  - fumen を書き出す(1ミノ1ページ)。
  - 2人の左右を入れ替える。操作中の盤面を左へ寄せ、同じ組み合わせの間は維持する。
- スピンカウンター:SPIN(列ごと)、T-SPIN(mini を含む回数 / 置いた T の数)、QUAD を数える。
- ブラウザ版 QP OFFLINE:
  - 30日キャッシュの版を出した(v4.8235 → 4.8241)。
  - 2026-11-12 に v4.8255 を作り直した(2026-11-10 の tetrio.js、SHA 6b682a12…)。キャッシュ名 v4.8255-core6。何も保存していない状態からの起動と2回目の起動を Chrome で確認。公開(push)はまだ。
- QP OFFLINE / vO の Warlock:Spin ルールを all-mini+ → all+(T 以外のスピンが mini になっていた)、b2bcharge_base 4 → 3(offline-src/qp-options.js。次のパッチ版に入る)。
- オフライン版 QP Duo:終了時に左右2人を TTRM(leaderboard + rounds)で自動保存(offline-src/local-replays.js, test-qp.js)。
- サイト全体を Clean Blog 風に作り直した(ナビバー「TETR.IO tools」)。
- AI 版の取得ページに Discord のロール確認を付けた(auth.html)。
- リプレイ → MP4 変換のブックマークレット(docs/replay-video/)。
- QP DUO リプレイ保存のブックマークレット(docs/duo-save/)。gsm の受け口はリプレイ盤面修正・カウンターと共有(__rpe)。

## 2. 再発チェック(過去に壊れたもの)

| 壊れたこと | 原因と直し方 | 確かめ方 |
|---|---|---|
| 盤面修正中に Space でリプレイが再開する | 再生ボタンにフォーカスが残っていた。フォーカスを外し、keypress を止める | 止めて Space を押しても再開しない |
| 操作中にリプレイを閉じると盤面が残る | GameOver を止めるのは1フレームずつ進めている間だけにする | 操作中に閉じても盤面が消える |
| 戻した後に DAS が止まらない | InjectState が押したキーまで戻していた。syncKeys で送り直す | Ctrl+Z の後に左右キーが普通に効く |
| シークするとカウンターがずれる | Preprocess のタイムラインから数え直す | シーク後も数が合う |
| ライン消去で fumen のページが壊れる | clearFull(prev) と比べる | ライン消去の前後のページが正しい |
| TETR.IO の更新で CONFIG の項目が消える | ミニファイ名が変わった。--port-* で名前を変える(CLIENT-UPDATES.md) | QP TOOLS の停止・PATCH DELETE・REPLAY BOARD EDIT が出る |
| PATCH UPDATE が失敗する(v4.8241) | Node https と GitHub API への切り替えにした | v4.8242 以降から更新できる |
| QP OFFLINE が「TETR.IO本体が更新されています」で止まる | tetrio.js の SHA が変わった。build_browser_offline.py で作り直す | 何も保存していない状態から Chrome で起動できる |
| QP OFFLINE の2回目の起動で失敗する | キャッシュのキーに # を使っていた。?launcher-meta に変えた | 続けて2回起動できる |
| ブラウザ版で裏HYPERSPEED曲が鳴らない | reverse-hyper-browser.js でサイトの曲に差し替える | 曲が鳴る |
| ダークモードでナビバーの上に白い線が出る | tools.css で枠線を直した | ダークモードで線が出ない |
| Warlock で T 以外のスピンが mini になる | qp-options.js が spinbonuses を all-mini+ にしていた。実リプレイの値 all+ にした | Warlock の実リプレイ(allspin_reversed)を MP4 エンジンで照合して ALL OK。ゲーム内で S/Z/L/J スピンが mini 表示にならない |
| Duo の TTRM を開くと loadReplay で落ちる | 公式の形(replay.leaderboard と各プレイヤーの id・alive・stats)がなかった。duo() で公式と同じ形にした | 記録画面で ZENITH · DUO の REPLAY → LOCAL VS LOCAL PARTNER が出て、2人の盤面が再生される |
| DUO 保存とリプレイ盤面修正・カウンターが同時に動かない | gsm の受け口を3つで共有する(set.__rpe と W.__rpeGames)。どれかが受け口を消さないこと | 3つを同時に入れても、DUO 保存・盤面修正・カウンターがそれぞれ動く |
| AI 版が GitHub のリリースから誰でも取れる | 未解決。配布方法はユーザーが決める | — |

## 3. 守ること(ユーザーのルール)
- 旧サイト kei1215/kei1215.github.io は読み取り専用。
- 公開リポジトリの作成と push の前には、必ず確認する。例外は、確かめ終えた MP4 ツールの更新だけ。
- サイトに「GitHub のリリースに置いてある」と書かない。
- TETRIO-Resources-1.0.zip を公開しない。Tampermonkey は使わない。tetr.io の userConfig に書き込まない。
- ファイルの検索は ~/Downloads/tetrio-hub、all-tetrio-patch、tetrio-replay-video の中だけ。
