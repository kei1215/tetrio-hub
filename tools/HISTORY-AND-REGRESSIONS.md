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
- v4.8261:REPLAY の行が出ない結果画面(ルーム・QP・ファイルから開いたもの)にも左上に「▶ MP4」。
- v4.8260:TETR.IO のリプレイ画面で合成した DUO の .ttrm を DUO 表示(DUO の位置・ボード・塔の背景、閉じると元の背景)。結果画面の REPLAY の行(X とダウンロードの間)と CONFIG に MP4(パッチ版のみ)。
- v4.8259:QP DUO の「2人の TTR を合成」(各自が保存した .ttr → 1つの .ttrm)。
- v4.8258:DUO 保存が自分のゲームを見失っていたのを修正(QP は塔の数百人のゲームもつかまり、200件で古い順に捨てていた)。自分のゲームは別に持つ。
- v4.8257:オンライン DUO はまず自分の分だけ保存(.ttr)。相方を待つ処理で保存されなかったため。診断ログと CONFIG > QP DUO REPLAYS を追加。
- 2026-11-13(未ビルド・ai-src):AI(allspin MOD なし)は消去なし Spin をしない・T を TSD/TST に残す。Node の自己対局で .ttr を作る tools/ai-sim/ai-selfplay-replay.mjs。
- 2026-11-13(未ビルド・ai-src):実戦リプレイで AI を直した。TL は Spin B2B モードが切れていて T-Spin 0%(6ラウンド)→ TL でも有効に。All-Spin でも消去なし Spin を減点(QP リプレイで 3589 ミノ中 160 回)。通常時のテンプレートは TSD/TST だけ使う。T-Spin 寄りの planner 設定(T_STYLE、atkOther)。QP の APP 0.82 は All-Spin を all+ にした影響(S/Z/L/J/I の Spin シングルが 2 火力。all-mini+ だと 0.59 相当)。
- 2026-11-13(未ビルド・ai-src):「外部AI対戦」の入り口(engine/ai-external.js)。外部AIはパッチに入れず、ユーザーが読み込む。CC2 S2 パッケージは private-ai/package(非公開)。
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
- リプレイ → MP4(2026-11-13、未 push):裏 DUO(Bleeding Hearts)の倒れる・蘇生(盤面・NEXT・HOLD・B2B のリセット、せり上げ)・味方が倒れている間は自分に返る攻撃。2人分の .ttrm では相方の記録から蘇生時刻を補う(linkDuoRevives)。
- リプレイ → MP4:合成した QP DUO の .ttrm を DUO 専用ボード(duoleft / duoright)で描く。TL 扱いにしない(開始演出 DUO、点数表示なし)。
- QP DUO リプレイ保存のブックマークレット(docs/duo-save/)。gsm の受け口はリプレイ盤面修正・カウンターと共有(__rpe)。

- 2026-11-13(未ビルド):AI のルーム対戦(TL・CUSTOM)を1試合1つの .ttrm で保存。ラウンドごとに上書きし、ローカル記録に「名前 vs 名前 勝ち数」で出す(ai-src/engine/local-ai-room.js、offline-src/local-replays.js)。
- 2026-11-13(未ビルド→v4.8266 に入れる):T-Spin の地形の見方。ユーザーと 5han の TL リプレイ(1.5万ミノ)から「数手以内に TSD/TST」になる地形パターン表を学習(ai-tshape-table.js、ユーザーの試合で AUC 0.74)。planner の tShape 10。CC2 戦(4 PPS・32試合)APP 0.59→0.64、T-Spin 割合 47→55%、勝ちはまだ 0〜1。
- 2026-11-13(v4.8266 ローカルビルド・未公開。CC2 入りをユーザーのアプリに導入):vAI テスト設定と外部AI対戦を Tab パネルへ。計算量(自動=PC の速さを測り目標 PPS に合わせる)、計画は PPS の時刻で打ち切り。プレーヤーと同時に置くモード(TL/CUSTOM)。対プレーヤー戦の AI を Web Worker で計画(人がいると 1〜2ms×6回で計画が終わらなかった)。BOT の持ち時間を左右均等に(左が先取りしていた)。TL/CUSTOM の勝率予測ゲージ(Tab で非表示可。Node 対戦 88 試合で学習、的中 71%)。Node 対戦ハーネス(private-ai/vA-cc2/versus.mjs、CC2 入りは非公開):同じ 4 PPS で vA は CC2 に 0勝16敗(APP 0.59 対 0.89)。
- 2026-11-13(v4.8267):vA の評価を CC2 戦で作り直し(Node・4 PPS・各32試合)。CC2 の選んだ手に合う重みを学習し(softmax ランキング)、その半分を採用=平らで庇・端の井戸を嫌う。高さ+被弾 ≤14 なら受けて攻撃を送り、超えたら相殺(B2B は切らない)。縦に掘れる列を評価。1ラインの T 以外 mini は 0 点。APP 0.71→0.80、勝ち 2→3〜4。先読み幅を広げると弱くなる(24→48→96 で 4→1→0勝)ので、ゲーム内も幅 24 まで。効かなかった案(端の穴、ドネイトの選別、REN の準備、自分の積み4ライン、庇の減点、攻撃量の地形表、5han テンプレ)は planner に既定 0 で残す。Tab に「vAI 重みの自動調整」:ローカル AI 対戦のラウンドごとに報酬(勝ち・APM 差・APP・TSD/TST・B2B、Tミニ・普通消しは減点。Tab で変更可)を出し、(1+1)-ES で重みを調整(ai-weight-tuner.js)。データ:5han の TL 15試合(APP≥1)の比較で、vA は TSD の回数は足りているが B2B が平均2で切れる(5han 5、CC2 9)、庇が5hanの約3倍。

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
| QP の DUO 保存が何も保存しない | QP では塔のほかのプレイヤーのゲームも受け口に入り、件数で古い順に捨てると自分のゲームが消えた。自分のゲームは mine に持ち、終わったほかの人のゲームだけを外す | 診断ログに自分(keyboard)の state と end・saved が出る。ほかの人は others の件数だけ |
| 合成した DUO の .ttrm が MP4 で TL として描かれる | leaderboard が2人なので TL と判定していた。zenith_duo があれば TL にしない | 開始演出が DUO、上に点数表示が出ない |
| DUO 表示の書き換えがパッチ版で効かない | パッチのリプレイ演出が先に盤面の位置を -.4/.4 に変えていた。位置の数字を正規表現で受ける | 合成した DUO の .ttrm を本体で開くと2人が寄って並び、背景が塔になる。TL のリプレイは今までどおり |
| CONFIG の QP DUO REPLAYS が消える | ほかの項目が CONFIG を作り直すと消えた。1秒ごとに付け直す | CONFIG > QP PATCH TOOLS に QP DUO REPLAYS と REPLAY → MP4 が出続ける |
| MP4 の DUO で盤面が離れすぎ・高度メーターの位置・MOD アイコンがない | DUO は TETR.IO の位置 ±0.32(17.07 マス間隔、中央、少し下)。メーターは左盤面の右 3.15 マスに台座つき。MOD アイコンを盤面の絵から描く | 左の NEXT の下に右の HOLD が収まる。メーターが2枚の間。DUO アイコンが左右の盤面の下 |
| テストでページの音を止めると MP4 が無音になる | AudioScheduledSourceNode.start を丸ごと止めていた。止めるのは OfflineAudioContext 以外だけにする | 作った MP4 に音がある |
| ファイルから開いたリプレイ・ルーム・QP で MP4 ボタンが出ない | リプレイ ID がないと TETR.IO が REPLAY の行ごと隠す。行が隠れているときは BACK の下に自前の「▶ MP4」を出す | ファイルから TTRM/TTR を開いても左上に ▶ MP4 が出て、押すとパネルが開く |
| TL の AI が T-Spin を全くしない | live-bot-controller が TL/CUSTOM で Spin B2B モードを切っていた | ゴミあり自己対局(GARB=4,120)で T-Spin 割合 55%・倒れない。実 TL のリプレイで T-Spin が出る |
| All-Spin MOD で消去なし Spin が多い | zeroSpinUseful が allspin も含めていた。Warlock だけにした | All-Spin の QP で消去なし Spin がほぼ 0 |
| AI が消去なしの Spin(穴埋めだけ)をする | planner の zeroSpin 減点が小さかった(-1.5)。allspin MOD なしでは -20(bot-ai.js) | ai-selfplay-replay.mjs を 8 シード×300 ミノで回し、zeroSpin が平均 0.5 未満 |
| 裏 DUO の MP4 が1回目に倒れたところで止まる | エンジンに DUO の「倒れて蘇生を待つ」がなく、そのまま GAME OVER にしていた。倒れたときの盤面の黒化で rngex を1ブロック1回使う点、ロック中に自分に返る攻撃では押し上げをしない点も合わせた | 2人分の裏 DUO .ttrm を MATCH=1 の verify-stats で:相方 ALL OK、自分 622/629 以上。ほかの QP・TL・40L・Warlock・AI のリプレイも ALL OK |
| AI 版が GitHub のリリースから誰でも取れる | 未解決。配布方法はユーザーが決める | — |
| AI のルーム対戦が1人ずつの .ttr に分かれ、試合として見られない | 1試合を1つの .ttrm(公式と同じ rounds の形)にまとめる | 実 TL の .ttrm をこの形で作り直して verify-stats:ALL OK(8ラウンド×2人)。ゲーム内は未確認 |
| 対プレーヤー戦で AI が極端に弱い | humanActive で planner が 1〜2ms×最大6スライス。Worker(createAsync)で最後まで計画 | Node の Worker 代替で同期版と同じ答え。ゲーム内は未確認 |
| AI 同士の対戦で地形がひどい(v4.8266 初版) | Worker 1つを左右で共有し、新しい計画が前の計画を捨てていた(片方は途中打ち切り)。Worker を複数にし、計画を順番に進める | Node で4つ同時に計画:全部完了し同期版と同じ答え |
| ゲーム内の AI が浅い計画で置く・CC2 がほぼ手を出さない(v4.8266 の TTRM 診断) | アプリでは blob の Worker が作れず同期計画に戻り、幅 64 のまま約 45ms で打ち切り。CC2 は1フレームの予算が足りず PPS の期限で空の結果。Worker をパッチ内ファイル(ai-plan-worker.js)から作る、同期時は幅 16、外部AIは1フレーム 6ms 以上で期限まで考え早期終了 | TTRM の replay.aiDebug(async・cut・noPlan・external)。Node の Worker 代替で4件同時が同期版と一致 |
| v4.8266 修正版で vA の計画が1回も動かない(plans 0)・CC2 が手を出さない | Worker 失敗時の処理で変数が範囲外(例外で planner なし)。CC2 は短い探索で早期終了すると手なし。変数を外へ、CC2 は合計 150ms まで探索を足してから終了 | CSP で file Worker を拒む Node 代替で4件同時が同期版と一致。CC2 は Node で 20ms 手なし・60ms 以上で手あり |
| TL/CUSTOM で左の BOT が速く右が負けやすい | フレーム予算 4.5ms を先着順で配分(左が 2.4ms 取る)。BOT ごとに均等配分 | 2 BOT の模擬で 1350 対 1350 ms。ゲーム内は未確認 |
| vA の受ける/相殺の重みが効かない | bot-ai(と versus)が残り高さで cancelW を毎回上書きしていた。T_STYLE に cancelW:0 と takeMax を入れ、planner が高さで判断する | 被弾中、高さ+被弾 ≤14 なら相殺せず受け、超えたら相殺する。B2B を切って相殺しない |
| 先読み幅を広げると vA が弱くなる | 評価の甘い所(Tスロットの見込み点など)を広い探索が拾う。Spin B2B では幅 24 まで | Node 対戦で幅 24 が 48・96 より勝つ |

## 3. 守ること(ユーザーのルール)
- 旧サイト kei1215/kei1215.github.io は読み取り専用。
- 公開リポジトリの作成と push の前には、必ず確認する。例外は、確かめ終えた MP4 ツールの更新だけ。
- サイトに「GitHub のリリースに置いてある」と書かない。
- TETRIO-Resources-1.0.zip を公開しない。Tampermonkey は使わない。tetr.io の userConfig に書き込まない。
- ファイルの検索は ~/Downloads/tetrio-hub、all-tetrio-patch、tetrio-replay-video の中だけ。

## 4. memory から移した経緯(2026-11-13 整理)
- パッチ:v4.8233 を基に build_release.py で作り直し開始。2026-11-09 に旧リリースフォルダをすべてゴミ箱へ(~/.Trash/tetrio-cleanup-20261109-155815)。以後は最新フォルダから --incremental で作る。
- 2026-11-09 の TETR.IO 更新でミニファイ名が変わり --port-2026-11-09、11-10 に --port-2026-11-10 / 11-10b(同じコミットの再ビルド)。v4.8246・4.8247・4.8249〜4.8253 は公開していない。
- v4.8241 で PATCH UPDATE(docs/patch/latest.json)。リリースを公開してから site を push する。リリースは既存のリモート commit を target にする。
- AI:v4.8245 で movegen + DAS 実行、v4.8248 で Spin B2B planner、v4.8249 でテンプレート学習(5han の TL 106 ラウンド → 2372 テンプレート)、v4.8250 で TETR.IO の火力計算と B2B 解放・被弾の判断。v4.8254 で全部公開。当時の APP:Node 0.72、ゲーム内 0.55〜0.62(旧 AI 0.45)。ユーザー本人 1.31。
- MP4 ツール:2026-11-12 に方針が何度か変わった(自前描画 → TETR.IO 本体の録画 → blob ページ → 最終的に tetr.io 上でヘッドレス:自前エンジン + 自前描画、進み具合だけ表示)。capture/* は放棄。video_background のスライダーが userConfig を書き換えた件はユーザーに伝える必要あり。
