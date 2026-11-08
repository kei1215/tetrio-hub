/* ライト/ダーク切り替え。<head> で読み込むと、表示前にテーマが決まるのでちらつかない。
   保存は端末内(localStorage)だけ。保存がないときは OS の設定に従う。 */
(() => {
  const KEY = 'tetrio-hub-theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;

  const current = () => root.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = b => { b.textContent = current() === 'dark' ? '☀ ライトモード' : '☾ ダークモード'; };

  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-toggle';
    b.setAttribute('aria-label', 'ライトモードとダークモードを切り替え');
    label(b);
    b.onclick = () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label(b);
    };
    document.body.append(b);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => label(b));
  });
})();
