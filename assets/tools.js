// TETR.IO tools: ナビバー(スクロールで隠す・メニュー開閉)とダーク/ライト切り替え
(() => {
  const KEY = 'tetrio-hub-theme';
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  const prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    // Clean Blog と同じ: 下へスクロールでナビバーを隠し、上へ戻すと出す
    const nav = document.getElementById('mainNav');
    if (nav) {
      let last = 0;
      const height = nav.clientHeight;
      window.addEventListener('scroll', () => {
        const y = -document.body.getBoundingClientRect().top;
        if (y < last) {
          if (y > 0 && nav.classList.contains('is-fixed')) nav.classList.add('is-visible');
          else nav.classList.remove('is-visible', 'is-fixed');
        } else if (y > height && !nav.classList.contains('is-fixed')) nav.classList.add('is-fixed');
        last = y;
      });
      // スマホのメニュー(Bootstrap の JS を使わずに開閉)
      const toggler = nav.querySelector('.navbar-toggler');
      const menu = document.getElementById('navbarResponsive');
      if (toggler && menu) toggler.addEventListener('click', () => {
        const open = menu.classList.toggle('show');
        toggler.setAttribute('aria-expanded', String(open));
      });
      // 今のページのメニューに印を付ける
      const here = location.pathname.replace(/index\.html$/, '');
      nav.querySelectorAll('.nav-link[href]').forEach(a => {
        const p = new URL(a.href, location.href).pathname.replace(/index\.html$/, '');
        if (p === here) a.classList.add('active');
      });
    }
    const btn = document.getElementById('themeToggle');
    const label = () => { if (btn) btn.textContent = root.getAttribute('data-theme') === 'dark' ? '☀ ライト' : '☾ ダーク'; };
    label();
    if (btn) btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
    });
  });
})();
