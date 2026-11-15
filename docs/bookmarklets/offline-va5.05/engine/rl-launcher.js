/* vA local learning launcher.
   This is deliberately separated from the reward editor: opening an editor
   must never start a game.  The launcher waits for local-shell's visible
   controls and uses their local-only route. */
(() => {
  async function waitForLauncher() {
    for (let i = 0; i < 80; i++) {
      if (typeof window.LocalTrainingLaunch === 'function') return window.LocalTrainingLaunch;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('ローカルの開始処理を準備できませんでした。SOLO画面へ戻ってからもう一度実行してください');
  }
  window.LocalStartRL = async (mode, profileId, speed = 1, mods = [], firstTo = 1, controller = 'bot') => {
    const profile = window.LocalBotLearning?.getProfile?.(profileId);
    if (!profile) throw Error('保存AIを選択してください');
    const launch = await waitForLauncher();
    const game = await launch({ mode, profileId, mods, firstTo, controller });
    if (!game) throw Error('ローカルゲームを開始できませんでした');
    // TL/CUSTOM is a two-board match, whose room runner has already
    // connected exactly the configured AI sides via the original drive().
    // Attaching again here would turn a human-side board into a BOT.
    if (mode === 'tl' || mode === 'custom') return game;
    // The third argument is the requested BOT PPS, not the playback multiplier.
    // local-shell.start() has already applied the user's game-speed selection.
    // Passing PPS into game.playbackSpeed() made an 8 PPS training BOT run the
    // entire game at 8x even with the game-speed control set to 1x.
    // Keep speed/pps separate; never overwrite the user's currently set rate.
    // An explicit game-speed change is handled by LocalNative.setGameSpeed().
    game._localAIProfileId = profileId;
    if(controller==='bot'){game._localAIPlayerName=profile.name;game.options.username=profile.name;}
    game._localLearningMode = profile.model.mode;
    window.LocalAIRoom?.add(game);
    // A profile is stored as JSON, so create an isolated mutable learner for
    // this run and commit it only after a normal game end.  Previously this
    // launcher attached an observer only; no route was ever sent to the game.
    const learner = window.LocalBotLearning?.cloneLearner?.(profile.model);
    if (!learner) throw Error('選択AIの学習データを読み込めませんでした');
    const saved = snapshot => {
      try {
        window.LocalBotLearning.updateProfile(profileId, snapshot);
        window.LocalLearningToast?.show(`${profile.name} · 学習を保存`);
      } catch (error) { probeLog('AI学習保存: ' + error.message); }
    };
    if (controller === 'player') {
      // Human control is useful for the TL/CUSTOM training route.  The same
      // selected profile is updated; no invisible BOT input is sent.
      window.LocalBotLearning?.attachProfileHuman?.(game, learner, saved);
    } else {
      if(typeof window.LocalLiveBot?.attach!=='function')throw Error('BOT操作器を読み込めませんでした。Tabの描画診断で素材エラーを確認してください');
      const driver=window.LocalLiveBot.attach(game, profile, learner);
      if(!driver)throw Error('BOT操作器を開始できませんでした');
      if(profile.training) window.LocalBotLearning?.attachSelfplay?.(game, learner, saved);
      // The native pre-countdown can finish before the first piece event on
      // some builds.  Begin explicitly; the driver also keeps its own
      // lightweight retry poll until the board becomes playable.
      driver.begin?.();
    }
    game.on?.('end', 'local-ai-room-remove', () => window.LocalAIRoom?.remove(game));
    return game;
  };
})();
