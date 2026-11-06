// Applies the saved theme before first paint so there is no flash.
// Also catches the browser's "ready to install" event as early as possible:
// Chrome and Edge can send it before the app's modules have loaded, and a
// missed event means the Download app button could not install in one tap.
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__nxInstall = e;
  window.dispatchEvent(new Event('nx-installable'));
});
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('nxc:v1:settings') || '{}');
    var theme = s.theme || 'frost';
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'nexlyr-light' : 'nexlyr-dark';
    var r = document.documentElement;
    r.dataset.theme = theme;
    if (s.fontSize) r.dataset.font = s.fontSize;
    if (s.glass !== false) r.dataset.glass = '';
    if (s.motion && s.motion !== 'system') r.dataset.motion = s.motion;
    if (s.lang === 'ur') { r.lang = 'ur'; r.dir = 'rtl'; }
  } catch (e) { /* storage blocked: defaults */ }
})();
