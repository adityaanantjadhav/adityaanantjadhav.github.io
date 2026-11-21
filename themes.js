/* Dark / light toggle. Dark (Black) is the default; "light" is the blue scheme (data-theme="light"). */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('mode');
  if (!btn) return;

  function apply(light, save) {
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    btn.setAttribute('aria-checked', String(light));
    btn.setAttribute('title', light ? 'Switch to dark mode' : 'Switch to light mode');
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
    if (save) { try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) { /* private mode */ } }
    window.dispatchEvent(new Event('themechange'));
  }

  btn.addEventListener('click', () => apply(root.getAttribute('data-theme') !== 'light', true));

  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
  apply(saved === 'light', false);
})();
