/* Browser fallback for reverse HYPERSPEED music (bookmarklet/offline). */
(() => {
  'use strict';
  if (window.__qpBrowserReverseHyperMusic) return;
  const url = 'https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3';
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.55;
  audio.dataset.qpReverseHyper = 'true';
  let active = false;
  const games = () => [...(window.__qpGameRegistry || [])].filter(game => game && typeof game.getZenithSpeedrunState === 'function');
  const isReverse = game => (game.options?.zenith_mods || []).some(mod => String(mod).endsWith('_reversed'));
  const tick = () => {
    const game = games().find(item => item.isPlaying?.());
    const speed = game?.getZenithSpeedrunState?.()?.state === 'on';
    const shouldPlay = !!game && speed && isReverse(game);
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
  const timer = window.setInterval(tick, 120);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); audio.pause(); });
  window.__qpBrowserReverseHyperMusic = { audio, tick, stop() { active = false; audio.pause(); audio.currentTime = 0; } };
})();
