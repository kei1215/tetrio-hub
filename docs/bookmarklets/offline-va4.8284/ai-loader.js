/* vA-only AI loader. vO never includes this file. */
(() => {
  // This runs only in the vA overlay, so the title itself is a reliable way
  // to confirm that vA—not a previous vO build—was installed.
  document.title = 'TETR.IO — OFFLINE BOOKMARKLET vA-4.8284';
  document.documentElement.dataset.qpPatchKind = 'A';
  const ENGINE = [
    'ai-policy-model.js', 'reinforcement-core.js', 'ai-behavior.js', 'ai-spin-templates.js', 'ai-preview.js',
    'ai-routing.js', 'ai-movegen.js', 'ai-tshape-table.js', 'ai-spin-planner.js', 'ai-templates.js', 'ai-information.js', 'ai-player-settings.js', 'ai-quick-planner.js', 'bot-ai.js', 'ai-external.js', 'external-preinstalled.js', 'local-ai-room.js', 'win-gauge.js', 'local-room-ui.js', 'live-bot-controller.js',
    'bot-learning-core.js', 'bot-learning.js', 'rl-launcher.js', 'ttr-learning-format.js',
    'ai-ranking-training.js', 'ttr-learning.js', 'reinforcement-ui.js',
    'reinforcement-charts.js', 'ai-manager.js',
    'mode-capabilities.js', 'postgame-coach.js', 'qp-ai-options.js', 'ai-weight-tuner.js'
  ];
  const state = { loaded: false, loading: null, enabled: false, model: null, engineVersion: 'vA-4.8284' };
  const script = src => new Promise((resolve, reject) => {
    const tag = document.createElement('script'); tag.src = src; tag.async = false;
    tag.onload = resolve; tag.onerror = () => reject(Error('AIモジュールを読み込めません: ' + src));
    document.head.appendChild(tag);
  });
  const load = async () => {
    if (state.loaded) return state;
    if (state.loading) return state.loading;
    state.loading = (async () => {
      // vA is the AI edition: load the complete local engine here so that the
      // AI LAB card and Tab controls always address the same initialized API.
      for (const name of ENGINE) await script('https://kei1215.github.io/tetrio-hub/bookmarklets/offline-va4.8284/engine/' + name);
      state.model = window.LocalBotLearning?.modeLearner?.('qp')?.snapshot?.() || null;
      state.loaded = true;
      document.title = 'TETR.IO — OFFLINE BOOKMARKLET vA-4.8284';
      document.documentElement.dataset.qpPatchKind = 'A';
      return state;
    })();
    try { return await state.loading; } finally { state.loading = null; }
  };
  window.LocalAI = { state, load };
  window.addEventListener('local-game-started', () => { if (state.enabled) load(); });
  const attach = () => {
    const panel = document.getElementById('local-panel');
    if (!panel || document.getElementById('local-ai-load')) return;
    const button = document.createElement('button');
    button.id = 'local-ai-load';
    button.textContent = 'AI管理を開く';
    button.onclick = async () => {
      button.disabled = true; button.textContent = 'AIを読み込み中…';
      try { await load(); state.enabled = true; button.textContent = 'AI管理を開く'; window.LocalAIManager?.open(); }
      catch (error) { console.error(error); button.textContent = 'AIの読み込みに失敗'; }
      finally { button.disabled = false; }
    };
    const utilities = document.getElementById('local-utility-actions');
    (utilities || panel).appendChild(button);
    // vA is the AI edition: load its local engine once when the client is
    // ready, rather than requiring a preliminary click before every use.
    button.disabled = true; button.textContent = 'AIを準備中…'; state.enabled = true;
    load().then(() => { button.disabled = false; button.textContent = 'AI管理を開く'; })
      .catch(error => { console.error(error); button.disabled = false; button.textContent = 'AIの読み込みに失敗'; });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true }); else attach();
})();
