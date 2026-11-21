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
- 2026-11-14 ブラウザ版 AI 入り QP OFFLINE(offline-va4.8283、tools/patch/build_browser_ai.py):auth.html の Discord 確認後だけボタンを出す。本体差分は offline-v4.8255 を共有。AI のワーカーは Blob から作る。
- 2026-11-14 ブラウザ版 QP OFFLINE:TETR.IO 本体の更新(hv 20261113T221312, tetrio.js SHA 1244839b…)に合わせて差分を作り直し。中身は vO 4.8283 のオフライン版。フォルダ名 offline-v4.8255 は据え置き(ブックマークを変えなくてよい)。
- v4.8285:外部AI対戦に「かんたんインストール」(CC2 S2・CC1・MisaMino、docs/ext-ai/catalog.json、private-ai/publish-ext-ai.sh)。アプリの connect-src に https://kei1215.github.io を追加。
- 2026-11-14 web AI 版(offline-va4.8284):外部AI(Cold Clear 2 S2・Cold Clear 1・MisaMino)を最初から入れた(private-ai/add-web-external.sh)。本体差分を自分のフォルダに持ち、vO の web 版を作り直しても影響しない。
- v4.8284:オフラインの CONFIG を読み込み・保存とも項目ごとに混ぜる(client.js fix_config_keep)。新しい TETR.IO の項目が消えない・古い本体の項目が抜けない。ブラウザ版はリプレイ付き記録を最新5個まで(browser-limits.js)、AI 版ブラウザの自作AIは1体まで。
- v4.8282:AI 対戦(TL/CUSTOM)は勝敗が決まると保存した試合の結果画面へ移る。毎ラウンド 3,2,1,GO(client.js fix_rsg → window.__qpRsg)。盤面修正は操作中だけ次ラウンド自動再生を止め、やめたら戻す。
- 2026-11-14(未ビルド・ai-src、v4.8283 予定):BOT の PPS を一定に(1ミノずつ決まった時刻、遅れは次で少しだけ取り戻す)。REN・被弾中・Quad・スピンで PPS を無視して即置きしていたのをやめた。接地する経路は固定猶予で早く置かれないよう開始を遅らせる。プレーヤーと同時モードは最低思考時間(相手の間隔の6割、6〜40F)。止まったまま DAS を押し続ける(最大 90F)のを、動かなくなって3F で離して経路やり直し。Tab「ミノの落下(TL/CUSTOM)」:通常 / BOTだけなし / 両方なし(リプレイの options にも g=0)。Node テスト tools/ai-sim/drive-pps-test.mjs。 対局中にお互いが同じフレームでゴミを送ったとき、ライブでだけ打ち消しが起きてリプレイがずれていたのを修正(room が送り手の outgoing を書かない)。 外部AIの強さを 0〜100 に(0 が最弱、置きミスを増やす)。 外部AI対戦で、時間切れの手が vAI の手に変わっていたのをやめ、必ず外部AIの手を置く。 AI 戦にカスタムルームと同じ盤面のカウントダウン(3,2,1,GO!)。 方針:AI のテスト相手は CC1(CC2 は外れ値なので基準にしない、CC2 のプレイは手本にしない)。v4.8267 の CC2 由来の盤面の重み 11 個を CC1 戦で確認(Node・4 PPS・同じ32シード):残す APP 0.88・4勝/外す APP 0.71・2勝。悪くなるので残し、人のリプレイで作り直すまで使う。

- v5.0(2026-11-15):版番号を 5.0 に。以降は小数2桁まで(5.01, 5.02…)。build_release.py の --old/--new は 8290(=4.8290)か 5.0 形式。package.json は version 5 / update = 小数2桁の数(5.0→0, 5.01→1)。shared/release.py に 4→5 の移行を許可。アップデーターは latest-v5.json を読み、[メジャー, 小数] で比較。docs/patch/latest.json は v4 のアップデーター用の橋渡し(version 4.9999、同じランチャーを 4.9999 の名前で同じリリースに置く)。毎リリース両方を書き出す。make_uninstall.sh も 5.0 形式。再発チェック:latest.json を 5.x 形式にすると v4 からの更新が止まる。vR のドライランは 8290 から「v4.11のReplay変換形式」で失敗(既存)。

- v5.01(2026-11-15):マネ練習を最後まで置いたら1秒後に再生ボタンで元のプレイへ(演出はそのまま出る)。連続再生:埋め込みが変わった(次のラウンド)/外から巻き戻ったら修正の途中の状態を消す(injectAt は n.__rpeLastF を更新)。CC 盤面修正の修正・救済・改善案は「次のミノが出たフレーム」(an.spawnAt, 押していたキーは離す)から。改善案は今のミノではなく次のミノから。救済の練習のあと「もっと伸ばせた」も見せて始まりから操作。改善案の AI を CC1/CC2 で選択(S.impAi)。スピンカウンターの開幕は内蔵テンプレ(four.lol の図 14 種、左右反転、1〜16 手目の各盤面と比べる、組み途中・置きミス少しは可)、vA のみ(__qpCcFixSrc / LocalAI)、ユーザー登録は削除。build_release:ヘッダーの版番号は完全一致で置換(5.0 が 5.01 の中に当たらない)、タグは 5.01 表記。

- v5.02(2026-11-15):vR が v4.8260 から入らなかった(DUO 表示が patchQPReplay を包み、R/patch_asar.py の完全一致の目印が外れた)。build_release が R/patch_asar.py を「包まれていても1つなら置換」に書き換える。再発チェック:transform.js の patchQPReplay を変えたら vR のドライランを必ず通す。

- v5.03(2026-11-15):元の版(埋め込みなし・元の版で再生)のマネ練習で、リプレイのキー以外のイベント(おじゃま)を元のフレームで流す(feedOrig)。相手の盤面も同じフレームまで lm.Update で進め、戻す・1手戻す(undo の ps)・やり直しで相手も戻す。相手のシークバー通知は進めている間だけ止める。

- v5.04(2026-11-15):修正(手で直した/CC の lazy seg)の途中へシークすると、その修正が済んだ扱いになり元のプレイが流れ、マネ練習の手本も元のプレイだった。InjectState のフックで、途中の修正は始まりの状態(segState、無ければ playHook を付けた時の n.__rpeStart から元のプレイで作る)から修正のとおりにそのフレームまで進める。

- v5.05(2026-11-15):マネ練習のおじゃま・相手を仮のリプレイ時刻 vf で進める(次の手本のミノを元が置いたフレームの手前で待つ、置いたらそこまで進む。undo に vf/ve)。手本どおりに置いたら simulate で取った「その手を置いた直後の状態」(tg.st/tg.sf)へ合わせる(相殺・上昇のズレ対策)。合わせた後は applyHandling で自分の DAS/ARR に戻す(戻さないと元のプレイヤーの操作速度になった)。修正の手前で止めたら次の修正が手本(以前は「手本なし」)、修正がこの先に無ければ元のプレイが手本。simulate は途中で始まった修正が終わったら止める。リプレイの最後まである修正でも「止めて操作」(終端の処理に無かった)。IsFinished は修正中ずっと false。修正の再生中にフレームが 0.5 秒止まったら自分で lm.Update(救済・もっと伸ばせたがリプレイの最後より先)。重力は修正から借りた値を保存しない(gravBack)。
- 2026-11-15(5.05 のまま差し替え・未アップロード):ランチャーが失敗したら出力をデスクトップの TETRIO-patch-update-error.txt に保存し、場所を表示(tools/patch/add_fail_report.py、ヘッダーだけ変更・payload 同じ・次の版に引き継がれる)。9本+4.9999 コピー、SHA256SUMS と latest.json / latest-v5.json を更新。Mac で失敗時・dry-run 成功時を確認、Windows は未確認。4.9999 の人の失敗は 4.8277 未満の Windows 旧アップデーター(待機 PowerShell が TETR.IO と一緒に終了)が有力 → 5.05 ランチャーの手動実行を案内。

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
- 2026-11-14(未 push・パッチ未ビルド):リプレイ盤面修正に3つ。
  - 修正を .ttrm/.ttr に埋め込んで保存(各プレイヤーの replay.results.qp_replay_edit に、止めた場面の状態・操作・重力なし・ハンドリング)。TETR.IO 自身の保存ボタンの中身を受け取って足す。ツールがあれば止めた場面から修正後で再生・シークも修正後、なければ元のリプレイ。
  - 地形のマネ練習:止めた場面からリプレイのとおりに裏で進め、実際に置いた所(最大80手)を目標のミノとして重ねて描く。同じ所に置くと次へ、違えば置く前に戻す。せり上がりの差はずらして合わせる。
  - 「操作が反応しない・ミノが滑る」:下の再発チェックの行。オンライン版では再現できず(ブラウザ枠から tetr.io にテスト用リプレイを渡せない)、コードから原因を特定し OFFLINE 版クライアントで確認。
  - 埋め込みのある ttrm はパネルの「埋め込みの再生」で 修正後 / 地形練習 / 元の版 を切り替え(S.embMode、teardown 後も保持)。再生中はシークし直すと反映。
- 2026-11-15(v4.8290 で公開):リプレイ盤面修正の埋め込み再生を作り直し。修正後 / 元の版 は別々(元の版は修正を一切描かない)。手で直した修正は差し込み(相手を止めて修正を見せ、終わったら元の盤面に戻して続ける、何か所でも=segs)。CC 盤面修正は相手を動かし、CC の火力を相手に届ける(embed.sends)。マネ練習はその修正の中だけ。
- 2026-11-15(v4.8290 で公開):CC 盤面修正(vA だけ。CONFIG > QP PATCH TOOLS > CC 盤面修正、app-src/cc-fix-config.js → Pages の docs/cc-fix/tetrio-cc-fix.js)。.ttr/.ttrm とプレイヤーを選ぶと、そのプレイヤーの各ミノを Cold Clear(CC2 既定 / CC1。vA の外部AIにインストール済みならそれを使い、なければかんたんインストールと同じく catalog.json から入れて IndexedDB qp-external-ai に保存してから使う。QP OFFLINE では LocalExternalAI.addFiles/load)が置き直した .ttrm を作る。ソース tools/cc-fix(cc-fix-core.mjs、MP4 ツールのエンジンで再現、ハードドロップは元のプレイヤーが同じ手数目を置いたフレーム)。埋め込みは frame 0・state なし・keep(元のキー以外=受けたおじゃまはそのまま流す)・キーの subframe s。リプレイ盤面修正側:state なしは再生の最初に取った状態からシーク時に早送り、keep の上に手で直すと keepUntil で止めた場面まで。Node テスト tools/cc-fix/test-node.mjs(CC1)、OFFLINE クライアントで再生しても Node と同じ手数・火力(79 手・63)。

- 2026-11-13(未ビルド):AI のルーム対戦(TL・CUSTOM)を1試合1つの .ttrm で保存。ラウンドごとに上書きし、ローカル記録に「名前 vs 名前 勝ち数」で出す(ai-src/engine/local-ai-room.js、offline-src/local-replays.js)。
- 2026-11-13(未ビルド→v4.8266 に入れる):T-Spin の地形の見方。ユーザーと 5han の TL リプレイ(1.5万ミノ)から「数手以内に TSD/TST」になる地形パターン表を学習(ai-tshape-table.js、ユーザーの試合で AUC 0.74)。planner の tShape 10。CC2 戦(4 PPS・32試合)APP 0.59→0.64、T-Spin 割合 47→55%、勝ちはまだ 0〜1。
- 2026-11-13(v4.8266 ローカルビルド・未公開。CC2 入りをユーザーのアプリに導入):vAI テスト設定と外部AI対戦を Tab パネルへ。計算量(自動=PC の速さを測り目標 PPS に合わせる)、計画は PPS の時刻で打ち切り。プレーヤーと同時に置くモード(TL/CUSTOM)。対プレーヤー戦の AI を Web Worker で計画(人がいると 1〜2ms×6回で計画が終わらなかった)。BOT の持ち時間を左右均等に(左が先取りしていた)。TL/CUSTOM の勝率予測ゲージ(Tab で非表示可。Node 対戦 88 試合で学習、的中 71%)。Node 対戦ハーネス(private-ai/vA-cc2/versus.mjs、CC2 入りは非公開):同じ 4 PPS で vA は CC2 に 0勝16敗(APP 0.59 対 0.89)。
- 2026-11-13(v4.8267):vA の評価を CC2 戦で作り直し(Node・4 PPS・各32試合)。CC2 の選んだ手に合う重みを学習し(softmax ランキング)、その半分を採用=平らで庇・端の井戸を嫌う。高さ+被弾 ≤14 なら受けて攻撃を送り、超えたら相殺(B2B は切らない)。縦に掘れる列を評価。1ラインの T 以外 mini は 0 点。APP 0.71→0.80、勝ち 2→3〜4。先読み幅を広げると弱くなる(24→48→96 で 4→1→0勝)ので、ゲーム内も幅 24 まで。効かなかった案(端の穴、ドネイトの選別、REN の準備、自分の積み4ライン、庇の減点、攻撃量の地形表、5han テンプレ)は planner に既定 0 で残す。Tab に「vAI 重みの自動調整」:ローカル AI 対戦のラウンドごとに報酬(勝ち・APM 差・APP・TSD/TST・B2B、Tミニ・普通消しは減点。Tab で変更可)を出し、(1+1)-ES で重みを調整(ai-weight-tuner.js)。データ:5han の TL 15試合(APP≥1)の比較で、vA は TSD の回数は足りているが B2B が平均2で切れる(5han 5、CC2 9)、庇が5hanの約3倍。

## 2. 再発チェック(過去に壊れたもの)

| 壊れたこと | 原因と直し方 | 確かめ方 |
|---|---|---|
| CC 盤面修正の .ttrm で、受けたおじゃまが来ない/途中から盤面がずれる | 埋め込み後は元のイベントを全部止めていた。keep のときはキー以外を GetEventsAtFrame から流す。キーは subframe も同じに | test-node.mjs の再生チェックと、OFFLINE/オンラインで再生した最後の手数・火力が Node の報告と同じ |
| マネ練習が、後から足した修正以外の所でも目標を出す | 手本を止めた場面からの全部の配置にしていた。埋め込みの frame〜end の間の配置だけを目標にし(前は null で目標なし)、埋め込みがなければ出さない | 埋め込み ttrm の修正前・修正後で止めても目標が出ず、修正の中だけ出る |
| 埋め込み ttrm で修正の後の元のプレイが見られない/空の修正で前の修正が消える | 止めて再開しただけ(キーを押していない)でも修正として保存していた。押したキーがあるときだけ修正にする。手で直した修正は「差し込み」:そこに来たら修正を見せ(相手は止める)、終わったら止めた場面の元の盤面に戻し、次の修正か試合の終わりまで元のプレイ(segs で何か所でも) | 2か所直して保存→開くと、各修正の間だけ相手が止まり、修正の後は両方の置いた時刻が元のリプレイと同じ |
| CC 盤面修正で相手の火力・受けたおじゃまがおかしい | 相手は動かし、元の「直した側からのおじゃま」を消して CC の送った火力(sends)を ige で届ける。ige の id は TETR.IO が重複を捨てるので送るごとに別番号 | CC の ttrm を開くと相手の受けたおじゃまが CC の送った量(相殺分を除く)になる |
| 差し込みの修正の間も下のゲージ(時間)が進む | 修正を見せている間は直した側の elm 'frame'、止めた相手の 'frame' を出さない | 修正の間、タイムスタンプが修正の始まりのフレームのまま |
| 重力なしで作った修正のマネ練習で目標に置けない | 練習を始めるとき、手本の修正のその場面の重力(g イベント)に合わせ、離れるときに戻す | 重力なしの修正で練習を始めると重力なしになる |
| 埋め込みの再生に「地形練習」が別のモードとしてあった | ユーザー: 修正後でも元の版でも練習できればいらない。再生は 修正後 ⇄ 元の版 の2つ、マネ練習は別ボタン(修正後=修正の中だけ、元の版/埋め込みなし=リプレイの配置) | 元の版でマネ練習 ON で止めると目標が出る、修正後では修正の中だけ |
| CC 盤面修正がプレーを参考にしない(全部置き直し) | 既定を「弱い所だけ」に:10手ずつ、火力が平均の8割未満か REN/QUAD のある所を、元の盤面から同じ手数だけ AI が置き直し、火力が2以上増えた所だけを修正(segs、lazy=状態は再生がそこに来たときに取る)。「全部」も選べる | test-node.mjs で各修正の火力が再現と一致、OFFLINE で修正の間だけ相手が止まり元のフレームに戻る |
| CC 盤面修正の弱い所の修正で、ミノを置くフレームが元とずれる(おじゃまのせり上がり・相殺がずれる) | 修正の中も元のおじゃま(ige)は流し(seg.ige)、各手は元のプレイヤーの次のキーから同じ手の固定フレームまでに広げて動かす。接地中もロックディレイの範囲(locktime-4)で待ってから置く | SHIFTS=1 node test-node バンドルで各修正の lock shift が 0(最初の 1 手だけ +3 まで) |
| 修正の所の見方が1つしかない・回転が速くて見えない・修正後すぐ戻る | 「修正の所に来たら」流し見 / 止めて操作(修正が手本、見本あり/なし)。見せる間は playbackSpeed を 0.5 倍(既定)、終わったら segHold 秒(既定 2)止めてから元へ。相手は持ち主が __rpeSeg を持つ間止めたまま。止めて操作の分は新しい修正にしない | OFFLINE: 流し見で 0.5 倍→2 秒停止→元のフレームに戻り相手も同じ所から。止めて操作で修正の前のフレームから手本 10 手、再生ボタンで修正を済みにして元のプレイ |
| CC 盤面修正「トップアウト救済」(死んだ所の何手前に戻れば助かるか) | mode rescue:死んだラウンド(isTopout)で 1,2,3… 手前から AI が同じミノ・同じおじゃまで死んだフレーム+90F を越えて生きる最小手数(minBack)を探し、そこから 12 手前まで REN(3連続以上の消去)の最後が QUAD か T-Spin の助かり方を探す。seg.rescue。再生:救済の修正は元に戻さず助かった盤面で止める、次に置く所を光らせ上に何手前かを表示。修正がリプレイの最後まであると Pull が来ないので、ループで終わりの処理(相手の凍結も解く) | MODE=rescue の test-node で各ラウンド survived・攻撃一致。OFFLINE で救済を最後まで見せて止まり、相手は最後まで進む |
| 救済で REN QUAD / T-Spin が見えたら最後まで(ユーザー:「最短10手くらい、または結構下まで掘り切るもの」「掘りきって Quad を途中で打つ場合でもいい」「掘り REN は最後まで」) | 救済の AI は死んだ所の先も最低 10 手、REN 中なら切れるまで続ける。chainsOf(3連続以上の消去)で、QUAD/T-Spin 締めが 10 手以内か 4 段以上掘る、または 4 段以上掘って途中に QUAD があるものを採用し、REN が切れる所まで見せる(見つからなくても死んだ所で続いている掘り REN は最後まで)。再生はその間 IsFinished を false にしてリプレイの最後の先まで進める | test-node MODE=rescue で 4 ラウンドとも採用(3 つは死んだ所の先まで)・survived・攻撃一致。OFFLINE で 2020F で死ぬラウンドが 2338F まで進み Node と同じ火力、その後助かった盤面で止まる |
| 救済の「もっと伸ばせた」(ユーザー: (1) 同じ順番のままで REN を伸ばせた (2) 順番を変えれば(HOLD) 伸ばせた、REN の数より QUAD 締め優先、QUAD のあとの REN も続ける) | rescueOne が生き残る候補をすべて集め、(1) はプレイヤーの置いたミノを同じ順に置かせた別の試し(range.order、HOLD はこちらで決める)、(2) は自由な CC。1つ目より QUAD あり優先・REN/掘り/火力で明らかに上のものを segs に alt として足す。再生は 1つ目の後に alt を順に見せる(状態は通過時に取る/1つ目の始まりから早送り、入れ直しは Pull の中)。修正中は先頭の修正より前のフレームでも元のプレイを流さない。修正中・相手を止めている間は end も止める。ownerOf は見えているゲーム優先 | test-node:4 ラウンドとも alt あり、(1)(2) とも survived・攻撃一致。OFFLINE:2 つの alt を続けて見せ、各火力が Node と同じ(+21/+26) |
| 開幕テンプレ表示(ユーザー:「開幕の地形を見てなんのテンプレか、スピンカウンターに出す」) | カウンターが 7 手目・14 手目の盤面形(おじゃま行は除く)を記録し、登録テンプレ(localStorage qp-opener-templates-v1、リプレイの開幕から / fumen の 1 ページ目から登録)と差 2 マス以内(左右反転も)で照合、「開幕 名前」を出す。組み込みのテンプレ一覧はない | OFFLINE:登録した開幕が同じプレイヤーで名前表示 |
| fumen の色(1巡7=今の巡以外グレー、開幕は全色 / 1ミノごと=最後のミノ以外グレー)と回転入れの押下ページ | グレー切替ボタンを廃止しページ方式で自動。押下ページ(spin=ソフトドロップ後に回転が続くときだけ / all / off、rpe-fumen-v1.press):キーごとに動くミノのページを挟む | fumen をデコードして L が 1 キーずつ動くのを確認 |
| パネル整理(項目が多すぎ) | 見出し(操作・練習 / 修正・埋め込み / fumen / 表示)を details でたたむ、開閉は rpe-sections-v1 に覚える | OFFLINE で表示・開閉 |
| リプレイ再生中に「ここから改善案」 | vA の CC 盤面修正があるときだけ。ccImprove:今の落下中のミノを次のフレームから AI が引き継ぎ 10 手(押しっぱなしのキーは離す、その手で HOLD 済みなら次のミノから)。seg を埋め込み segs に足す。※ esm.replay.events は全イベント(379 個で正しい、見かけの空白はプレイヤーが置いていないだけ) | OFFLINE:368F で止めて押すと 369〜1426F の修正、再生でそこを見せて元に戻る |
| 2か所目の修正で相手が止まらない・ずれる | 相手の持ち主を games の最初から探していて、前に開いた(前のラウンドの)ゲームを拾っていた。いちばん新しい生きているゲームにする | 同じ ttrm を開き直しても各修正で相手が止まる |
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
| MP4 の BGM が選べない(自動の1曲だけ) | BGM を「リプレイの曲」「なし」「その他の曲」の3択に。その他は TETR.IO 全52曲(music.js SONG_LIST、抜けていた hyper-velocity を追加、zenith tower は QP 以外では1階の曲)。選択はブラウザに記憶 | 3択で MP4 を作り音声を曲と相関:なし=どの曲とも 0.15 以下、リプレイの曲=白いひょうたん 0.5、その他=選んだ曲 0.8 以上(QP でも) |
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
| アプリ内で vA の Web Worker が動かない(async 0、毎手打ち切り) | ローカル配信の CSP が worker-src 'none' だった。build_release.py で worker-src 'self' blob: に変える(v4.8268) | ローカル TTRM の aiDebug.plan.async が 0 でない、cut が手数とほぼ同じにならない |
| REN のときだけ BOT が PPS より速い・PPS が守られない | attackTiming が攻撃あり+被弾中・Quad・スピンを urgent にし、PPS の待ちを飛ばしていた(REN は毎手消去なので毎回即置き) | node tools/ai-sim/drive-pps-test.mjs:PPS 1/2/3、REN+被弾中、接地経路でも間隔が一定(旧版は1〜2F/ミノ) |
| BOT が DAS を押したまま止まる・ミノが滑る(AI 戦 TTRM で 27〜79F) | 長押しはミノが目標列に着くまで離さず、途中で止まると固定期限か 90F まで押し続けた | 同テスト:止まった長押しを 9F で離す(旧版 91F) |
| 盤面修正中にミノが滑り続け、同じキーを押しても効かない | キーを離した通知が抜けると(Mac は ⌘ 押下中に keyup が来ない、フォーカス移動など)押しっぱなし扱いが残り、同じキーの keydown は「押したまま」として捨てていた。押し直しは離してから押し直す、⌘ を離したら全部離す、画面が隠れたら全部離す | 左を押したまま keyup を送らずにもう一度左を押すと押し直しになる。⌘ の keyup で左右とも離れる |
| 盤面修正でハンドリングがおかしい(ARR 0 で長押しが動かない等) | userConfig の値をそのまま入れていた(文字列 "0" だと 0 === arr が外れる)。TETR.IO と同じ数・範囲(arr 0〜5、das 1〜20、sdf 5〜41 など)にそろえる | 操作中の gsm.handling がすべて数 |
| 盤面修正が勝手に終わって操作が効かない・Ctrl+Z の履歴が消える | 盤面が一瞬見えないだけで操作モードを抜けていた。ゲームが消えたときだけすぐ抜け、見えないだけなら30フレーム続いたら抜ける。勝ち・クリアなど自滅でない GameOver は操作中は無視 | 操作中に演出が入っても「操作中」のまま |
| 埋め込んだ .ttrm が TETR.IO 本体で開けない | 修正は replay.results の追加の項目にだけ入れる(本体は知らない項目を無視、本体の保存でも残る) | ツールを外した状態で -edit.ttrm を開くと元のリプレイどおり。ツールありでは修正の各ミノの盤面が操作中と同じ(シーク後も) |
| ローカル AI ルームの TTRM が TETR.IO の再生でずれる(ミノが無い所に置かれる) | local-ai-room.js の send が送り手の garbageacknowledgements.outgoing を書き、受け手の同フレーム逆向き送信がライブだけ相殺された(リプレイには残らない) | send は送り手の state を触らない(ackiid=全確認済み)。同フレーム双方向送信 39 回の TL を本物のエンジンで再生:全 full 盤面と最終 stats が一致 |
| 外部AIの強さを 0 にしても弱くならない | 0 は捨てられて既定(全力)のまま。数値はパッケージの探索量そのもので、CC1 は探索を減らしてもほぼ同じ強さ(Node: 3ms でも 3000ms でも APP 0.65) | 強さは 0〜100。(1-強さ)²×35% の手を1〜2列ずらす(bot-ai.js misdrop)。50 未満は探索も最小。Node(CC1 単独 150 手):APP 100/80/60/40 = 0.70/0.69/0.49/0.43、20 以下は自滅 |
| 外部AI(CC)の手が勝手に vAI の手に変わる(速い相手ほど CC が弱い) | CC の答えの後、候補を順に確かめる途中で PPS の時刻が来ると、確かめ済みの vAI 候補で置いた(TTRM aiDebug: 79 手中 14 手 forcedByPPS、CC1 との一致 約60%) | 外部AIの配置を最初に確かめ、時刻で打ち切っても必ずそれを置く(bot-ai.js externalPick)。TTRM の aiDebug.plan で played+playedLate = plans |
| AI 戦で盤面の 3,2,1,GO が動かない(上の文字だけ) | TL の設定(tlPreset)はカウントダウンが切ってあり、v4.8282 は部屋の掛け声(rsg)だけ出していた | local-ai-room.js が毎ラウンド countdown 3 / 1000ms を入れる(プレスタートの後に読まれるので間に合う)。デバッグ用アプリで 3→2→1→GO! が両方の盤面に出るのを確認 |

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
- v5.06(2026-11-15・公開): スピンカウンター: four.lol(開幕21・途中226)と shiwehi.com(開幕229・途中309、ページ内の文字の盤面＋画像読み取り)のテンプレを追加。途中テンプレ判定(17手目〜・vA のみ、表面6段、T と下地は見ない)を新設。何にでも合う小さい図は除外(ランダム盤面2000で誤検出0)。開幕データの行は下から。取り込み道具 tools/templates/、一覧 tools/OPENER-TEMPLATES.md。
- v5.06 公開(release patch-v5.06、ソース 142957f): 上のカウンター・replay-edit(spin fumen の回転前ページ)・失敗レポート付きランチャーを含む。ブラウザ版 vO は offline-v4.8255 の replay-edit-offline.js / render-diagnostics.js を差し替え、AI 版は offline-va5.06。Mac で R/O/A と UNINSTALL の dry-run OK、Windows 未確認。fumen の同じ盤面ページが 2 回続く件は未修正。
- (未リリース, v5.07 予定) オフラインの設定が残らない: デスクトップ版はオフラインを開くたびに preload-local.js が offline-preferences-v2.json を userConfig に書き戻すが、オフライン中の変更はファイルに保存されていなかった(実機で再現: video_kos/invert を変えて開き直すと戻る)。mt() から QPLocalStorage.saveConfig → qp-local-offline-config-save で保存(build_release fix_config_sync / fix_preload_config)。ブラウザ版は tetr.io と localStorage を共有し本物の userConfig に書いていた → ui-health.js 先頭で 'qp-offline-userConfig' に振り替え(初回だけ userConfig から写す。build_browser_offline CONFIG_SHIM、offline-v4.8255 / va5.06 / va5.05 の ui-health.js に適用済み)。ブラウザ版は実機未確認。
- (未リリース, v5.07 予定) 外部AIで QP SOLO(外部AI対戦の「ルール」に QP SOLO、MOD は QP 画面の選択。ai-src に rl-launcher.js を追加: LocalStartRL の7番目の引数 engine を game._aiEngine に入れ、学習しない)。10F相当の床攻撃にまれな空白(6% の待ちを r^4 で 30 秒まで伸ばす。QP設定「火力が来ない時間を入れる」OFF で今までどおり)。QP設定「開始前に 3,2,1,GO」(options.countdown、既定 OFF)。build_release fix_config_keep はfix_config_sync 後も素通り(LOCAL ビルドで anchor エラーになった)。
- 2026-11-16 PB ランキング: docs/ranking/(総合・MODなし・MOD別・組み合わせ別・10F相当・リバイブ回数、1人1記録)。登録は Issue フォーム .github/ISSUE_TEMPLATE/pb.yml → Action pb-ranking.yml + .github/scripts/pb-ingest.js が検証して docs/ranking/data/records.json に追加しIssueを閉じる。パッチの記録一覧に「ランキングに送る」(local-replays.js、記録に bot/engine/floor10/lull を保存)。ブラウザ版の offline-v4.8255 / va5.06 / va5.05 にも反映済み。デスクトップは v5.07 から。

## 2026-11-16 PB ランキング: ゲーム内送信(GAS 中継)・TTR は Discord
- 「ランキングに送る」は GAS(tools/ranking/gas/Code.gs)に POST する。URL は docs/ranking/api.json から読むので、変わってもパッチを作り直さなくてよい。空のときや失敗したときは Issue 方式に切り替え、.ttr.json を保存する。
- TTR はリポジトリに置かず、Discord の webhook に投稿する。records.json には discord(メッセージ番号)と replayUrl を持たせる。CDN の URL は約1日で切れるので、pb-refresh.yml が6時間ごとに更新する。
- デスクトップの CSP の connect-src に script.google.com と script.googleusercontent.com を追加した(build_release.py)。
- 火力が来ない猶予(attackLull)を、足して最大10秒に変えた(以前は合計最大30秒)。
- ページ:
  - 上位3人だけリプレイのリンクを出す。表は順位・名前・高さだけ。
  - HYPERSPEED は MOD ごとの表にした。
  - 組み合わせ別は、MOD 1つ(表/裏)と DUO 以外の全部(表/裏)だけにした。
- 設定がまだ: Secret PB_DISCORD_WEBHOOK、GAS のデプロイ、api.json の url。手順は tools/ranking/README.md。
- (同日) GAS は秘密を持たない受付窓口に変更: TTR をドライブ、記録をスクリプト プロパティに3日間置き、pb-collect.yml が10分ごとに取り込んで Discord に投稿する。BOT・外部AIの記録は送信ボタンを出さず、GAS とイングェストでも断る(user: botの記録は残さない)。ページの BOT チェック欄も削除。Secret PB_DISCORD_WEBHOOK は設定済み。
- 2026-11-16: v5.07 PUBLISHED (release patch-v5.07, target 0098de5). Browser: offline-va5.07 (va5.05/5.06 mirror it), offline-v4.8255 render-diagnostics from the vO zip, old v4.82xx re-mirrored. add-web-external.sh was not run (5.06 had no preinstalled external AIs either).

- (未リリース) 左右反転した形も同じ形として数える(本人が両向きで組んでいたら両向きで使う、y_kei1215 は片向きのみ)。形のあと確定で狙うのは最初の1回だけ(user: DT砲で確定で打つのは1回目のみ、2回目は J・Z スピンで B2B にする時がある)、それまで穴を塞がない。屋根の横に空けるのは穴のある側。
- v5.14(2026-11-16 公開、release patch-v5.14、ブラウザ版 offline-va5.14):「Butter 名前」が本人の DT砲を組めていなかった(実戦リプレイ:本人 13 ラウンド中 DT砲 10・PCO 3、Butter は 0)。原因2つ:(1) learn-core が開幕の盤面を上からそろえて比べていて、開幕中におじゃまを受けると「どのミノがどのマスか」がずれた(下からそろえる)。(2) マスの形だけ覚えていて、ミノ単位の置き場所が無かった(1巡目の T を形に入れられない等)。直し:開幕ごとに「本(book)」= 9割以上の盤面で同じ所に置いたミノ(種類+マス)を覚える(y_kei1215 の DT砲は1巡目7個+2巡目の左 J・L・右端 I、右側の O/S/Z は自由)。planner の bookPlan が、見えているミノ(バッグ最後の1個も)で一番多く本のミノを置ける順を探す(先に置いた Z の下へ J を滑り込ませるのも可)。置き場のないミノは HOLD か本・スロット以外へ、T は本の外に置かない、組めない順なら別の開幕(PCO)。組み終わったら今までどおり followKind(TSD)。Node(盤面だけの1人プレイ):開幕完成 2/12 → 41/48、DT砲から最初の消去が TSD 33/48。データなし Butter は CC1 戦 2 シードで前と同じ結果。既存の「Butter 名前」は学習し直しが必要。再発チェック:learn-core の開幕は下からそろえる/book の無い古いデータは今までの openPlan で動くこと。
- (未リリース) 形ごとに本人のその後の打ち方(最初の2回の消去、DT砲 = TSD>TST 8回)を覚え、形が完成したらその順に狙う(followKind +300)。打ち終わるまで形の穴を塞がない(protect -600)。狙っている間は回転を多めに探す(maxTail 5、DT砲の TSD は 3 では見つからない)。消去の行数は lk.res.lines を使う(lk.cleared はずれる)。Node:DT砲完成3回中2回 TSD>TST。
- (未リリース) 消す段より上は屋根(下に穴がある列のマス)だけ形、屋根の左と上は T を入れ終わるまで空ける(一度も埋められていなかったマス)(user: 屋根以外の二行目の必須系はなくてもいける / 屋根の左側や上も打ち終わるまで開けてなきゃいけない)。Node 24試合:18手以内に完成 8回(DT砲 2・PCO 6)。
- (未リリース) T-Spin で消す段(穴のある段で、3回に1回以上穴以外が全部埋まっていた段)は段全体を形にする(user: 右端は自由になっちゃダメ)。Node 12試合:18手以内に完成 7回(PCO 6・DT砲 1)。
- (未リリース) 2回以上見た形を比べ、毎回同じマスだけ形・違うマスは自由(user: 2回見たテンプレはどこを自由に組んでいいかわかる)。形のマスの下は自由にしない(穴になる)。自由側は形の高さ+1段まで。表示名:AI選択画面は「Butter 名前」、プレイ中・リプレイは「Butter」(自動学習はパッケージ id va-tree-<名前> で判定、match.engines を保存)。
- (未リリース) Butter 開幕の形 = 必ず埋めるマス(1巡目のミノ+T-Spinの穴に接する後のミノ)・空けておく穴・自由マス(user: DT砲は2巡目は左以外テンプレじゃない、右側は自由積み、Tは持ち越し)。T は HOLD に持ち越して形に使わない。自由マスは木探索の評価で置く。開幕中だけ有効(空の盤面から最初のライン消去・ゴミまで、パッケージ側で判定。DT砲の9マス行をゴミと誤認していたのも回避)。Node 10試合:20手以内に形が完成 4回、1手0.28秒。
- (未リリース) Butter 開幕の組み方:残りのマスをミノで埋められるか(タイリング)を、7種1巡で残っているミノと下から積める順番で確かめ、埋められる手だけで形を組む。下に回り込めないフタは置かない。Node 20試合で13手の形が6回完成(前は1〜2回、本人は24試合で5回くらい)。1手0.2秒くらい。
- (未リリース) Butter:開幕テンプレ = 3巡目までで最初にライン消去する直前の盤面(ゴミ段は除く)、2回以上組んだ形+その途中の形を数えて最大4つ(y_kei1215: DT砲・PCO型)。ツモ・NEXT・HOLD の順番で一番多く組める形を選んで組む(openPlan、探索 1500 ノード・5手)。攻撃の種類の割合を本人に寄せる kindBias(評価に足すだけ、地形で変わる)。同じ名前の Butter と対戦すると試合後 45 秒で自動学習し直す(選んだリプレイは IndexedDB qp-butter に保存)。Node:7手目は20/20で形どおり、13手目は平均1ミノずれ。pickBeta 0.004 で APP 0.66(本人 0.69 くらい)。
- v5.13(2026-11-16 公開、release patch-v5.13):Butter は本人が2回以上組んだ開幕形(DT砲・PCO など、左右反転は同じ形)をミノ順を見て組む。形のあとは本人の最初の打ち方(DT砲なら TSD)を狙い、固定するのは最初の1回だけ。攻撃の種類の割合も本人に寄せる。同じ名前の Butter と対戦すると試合後に自動で学習し直す。プレイ中の表示名は「Butter」。既存の「Butter 名前」は学習し直しが必要。ブラウザ版は offline-va5.13(va5.05〜5.12 は同じ中身に更新)。Mac で A/O/R の dry-run OK、Windows 未確認。
- v5.12(2026-11-16):v5.11 は起動時に「Cannot find module './auto-port'」で落ちた(インストーラ patch_asar.py が transform/standalone しかコピーしていなかった)。O/R のインストーラに auto-port.js を追加、standalone は auto-port が無くても落ちない。再発チェック:O/ に新しいファイルを足したら patch_asar.py(O と R)にも足し、本物の app.asar で組み立てて中身を確認すること。
- v5.11(2026-11-16):TETR.IO 更新での名前の付け替えにアプリ内で自動対応(O/auto-port.js、CLIENT-UPDATES.md)。v5.09 の書き換え位置を新しい本体に当てると手作業の v5.10 と同じ結果になることを確認。Butter はレベル設定なし(常に最大)。「Butter 名前」は本人の開幕形(7・14手目の盤面)に寄せ、B2B を本人くらい(peak の p75 まで)ためてから打ち、上位6手から少しばらつかせる(pickBeta)。置きミスは真似しない。学習メッセージの「undefined 試合」を修正。既存の「Butter 名前」は学習し直しが必要。再発チェック:埋め込みバンドル(QP_*_SRC)を自動ポートで書き換えないこと。
- v5.10(2026-11-16):TETR.IO 本体の更新(build 20261115T210526)で OFFLINE が「EXIT TETR.IO?」になったのを直した(--port-2026-11-16、tools/patch/CLIENT-UPDATES.md)。
- v5.09(2026-11-16):「Butter 名前」は本人の真似をする(重みは本人に全部寄せる MIX 1、本人がしない手の種類は禁止 ban、受けてからまとめ打ちはしない)。Butter 本体(データなし)は真似しない。再発チェック:本体に本人の癖が入らないこと。
- v5.08(2026-11-16 公開、ブラウザ版も tetrio.js 20261115T210526 に作り直し):Butter に「受けてからまとめ打ち」(tank:true, tankW 120, tankSafe 14:積み+来るゴミが14段以内なら、相殺だけになる火力を減点し、受けてから掘りで返す。Node・4 PPS・32試合:Butter 5han+これ 17勝10敗(時間切れ5) 対 Butter 5han。ほか 15-10、14-11、探索 2.5倍で 16-8。「必ず勝つ」までは届いていない)。ランキングは「最初から10F相当」(猶予あり / なし)だけ送れて表示も2つだけ(ゲーム・GAS・pb-ingest で確認)。Butter を vA に最初から入れた(butter-preinstalled.js、ai-loader で ai-external.js の次)。外部AIのうち Butter だけアプリ内で学習(「Butter に学習させる」、Worker の butter-learn.js、オフライン記録は local.bot / local.engine を除く)。再発チェック:他の外部AIが学習しないこと・AI の記録から学ばないこと。
- 2026-11-16(パッチ更新なし・Pages):新しい AI「Butter(バター)」= vA Tree(ai-src/engine/ai-tree-planner.js)を外部AIとして公開(かんたんインストール・リンク限定ページ)。名前の由来:「vATree」と打ったら自動変換で「butter」になったので、ユーザーが Butter と名付けた。プレーヤーのリプレイから「Butter <名前>」(例: Butter Y_Kei1215)を作れる(tools/ai-sim/tree-player-data.mjs、何人ぶんでも入る)。CC 盤面修正の AI に Butter(直すプレイヤーの Butter があれば使う / データなし / 入っている他のプレイヤーの Butter)を追加。人が入力できる置き方(接地後 2 キーまで)だけで選び、置きミスの所を「こう置けば火力 / 地形がきれい」で見せる。今までの AI は残す。外部AIは対戦中に学習しない。
- 2026-11-21(未公開):相殺外し(受けてから撃つ)。「Butter 名前」は tank:false だったのを、本人のリプレイから「積み+来るゴミ ≤14 段で、相殺した段数」と「受けて 3 手以内に撃った段数」を数えて、受ける割合 ≥15% なら tank:true・tankW=240×割合(learn-core.mjs、data.tank)。y_kei1215 0.65 / aotaku1039 0.61 / tacos_1017 0.62、ベース Butter 0.56、CC1 0.53。ベース Butter は v5.08 から tank:true(tankW 120)。Node 対 CC1 16 試合で受ける割合 off 0.54 → on 0.59、tankW 240 は APP が下がった(0.917)ので 120 のまま(調整ツールが tankW / tankSafe も調整する)。注意:learn-core の rowsOf は pre[0] が一番上の行。
- 2026-11-21(未公開):PPS 0.1 にしても Butter 1.67・CC1 1.58 PPS(ユーザーのリプレイ、aiDebug forcedByPPS 0・emergencyDrops 5 だけ)。原因の見立て:AI の「模倣プレイ」(profile.mimicPlay)が ON だと置く間隔をプレーヤーの記録(LocalAIBehavior.interval)から取り、BOT目標PPS を見ない。外部AIはキー用に借りた AI からこれを引き継ぐ。直し:外部AI(game._aiEngine)は模倣の間隔を使わない。vA の模倣は記録のリズムのまま、平均が設定 PPS になるよう伸ばす(ai-quick-planner.js mimicAvg)。アプリでは未確認。
- 2026-11-21(未公開):高 PPS。作業用に複製した TETR.IO(v5.15、--user-data-dir 別)で測定:プレーヤー対 Butter で設定 0.1/4 は守られる、10 は 6.1 PPS 止まり(1キー/フレーム+DAS 長押し待ち)。mochbot は 10 PPS で finesse OFF(1手の全キーを1フレーム)。直し(ai-quick-planner.js):間隔 ≤12 フレーム(5 PPS 以上)は経路の回転・横移動を1フレームでまとめて押す(ソフトドロップ経路は落とす前まで、次フレームで位置確認、ずれたらやり直し)、速い設定では catchUp を interval×0.8(スピンの遅れを普通の手で取り戻す)。結果:10→8.5、7→7.0(1区間 6.05)、5→4.7、4→4.00、0.5→0.50、経路失敗 0。
- 2026-11-21(未公開・TODO 2〜4):Butter テンプレの続き:本の空き側に置くミノは、形の段に穴を作らない・スロットの入口の上に置かない(Z の穴で DT砲の TST が消えていた)。2回目の撃ち方は固定せず、本人の割合(opener.then2、y_kei1215 は TST 0.63 / J・Z スピン 0.25)を followBias で足す。Node 48試合:TSD の後の TST 56%→77%。性能:途中経過の result() は木の最善だけ(Worker が 25ms ごとに聞くたびに bookPlan/openPlan を回していた)、bookPlan+openPlan は合計 2×openMs で打ち切り(1手 0.58 秒の例)。受け渡し:Butter パネルで「Butter 名前」をファイルに書き出し・読み込み(データだけ使い、コードは今のパッチの Butter。古い Butter で作った保存済みの「Butter 名前」も起動 8 秒後に今の Butter に更新)。アプリでは未確認。再発チェック:開幕(TSD 先打ち)を壊さないこと・他人のファイルのコードを実行しないこと。
