// Applies the saved theme before first paint so there is no flash.
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
