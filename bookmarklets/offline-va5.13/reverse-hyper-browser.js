/* Browser reverse HYPERSPEED music (bookmarklet/offline), v4.8239.
   The offline client asks for /res/bgm/qp-kugelhagel-overdrive.mp3, which tetr.io does
   not have. Serve that request from the published copy, so the game's own music engine
   plays the track exactly like the desktop build (game volume, loop points, fades).
   Only if that download fails, an <audio> fallback plays it for the running QP game. */
(() => {
  'use strict';
  if (window.__qpBrowserReverseHyperMusic) return;
  const url = 'https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3';
  const asset = '/res/bgm/qp-kugelhagel-overdrive.mp3';
  let nativeFailed = false;

  // 1) Native path: answer the client's request with the published file.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const target = typeof input === 'string' ? input : input?.url || '';
    if (target.endsWith(asset) || target === asset.slice(1)) {
      return nativeFetch(url, { mode: 'cors', credentials: 'omit' }).then(response => {
        if (!response.ok) nativeFailed = true;
        return response;
      }, error => { nativeFailed = true; throw error; });
    }
    return nativeFetch(input, init);
  };

  // 2) Register QP games (used by the fallback below).
  const registry = window.__qpGameRegistry || (window.__qpGameRegistry = new Set());
  const register = game => { if (game && typeof game.getZenithSpeedrunState === 'function') registry.add(game); };
  const wrapNative = () => {
    const native = window.LocalNative;
    if (!native || typeof native.qp !== 'function' || native.qp.__qpRegistered) return !!native?.qp?.__qpRegistered;
    const qp = native.qp;
    native.qp = function (...args) {
      const result = qp.apply(this, args);
      Promise.resolve(result).then(register, () => {});
      return result;
    };
    native.qp.__qpRegistered = true;
    return true;
  };
  const reviveAttach = window.LocalReviveMissions?.attach;
  if (typeof reviveAttach === 'function') {
    window.LocalReviveMissions.attach = function (game, ...rest) { register(game); return reviveAttach.call(this, game, ...rest); };
  }

  // 3) Fallback <audio>, only after the native download failed.
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0.55;
  audio.dataset.qpReverseHyper = 'true';
  let active = false;
  const isReverse = game => (game.options?.zenith_mods || []).some(mod => String(mod).endsWith('_reversed'));
  const tick = () => {
    wrapNative();
    for (const game of registry) if (!game?.isPlaying || game.destroyed) registry.delete(game);
    const game = nativeFailed ? [...registry].find(item => item.isPlaying?.()) : null;
    const shouldPlay = !!game && game.getZenithSpeedrunState?.()?.state === 'on' && isReverse(game);
    if (shouldPlay && !active) {
      active = true;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else if (!shouldPlay && active) {
      active = false;
      audio.pause();
      audio.currentTime = 0;
    }
  };
  const timer = window.setInterval(tick, 250);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); audio.pause(); });
  window.__qpBrowserReverseHyperMusic = { audio, tick, registry, get nativeFailed() { return nativeFailed; }, stop() { active = false; audio.pause(); audio.currentTime = 0; } };
})();
