(function () {
  const NAV = `
<nav class="site-nav" aria-label="Site navigation">
  <details class="nav-mobile-details">
    <summary class="nav-mobile-summary">
      <span class="nav-mobile-title">ORI</span>
      <span class="nav-mobile-toggle">Menu</span>
    </summary>
    <div class="nav-mobile-menu">
      <a href="index.html">Projects</a>
      <a href="about.html">About</a>
    </div>
  </details>
  <div class="nav-left">
    <a class="nav-home" href="index.html">Open Research Network</a>
  </div>
  <div class="nav-right">
    <a href="about.html">About</a>
  </div>
</nav>`;

  const root = document.getElementById('site-nav-root');
  if (!root) return;
  root.outerHTML = NAV;

  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a[href="' + page + '"]').forEach(function (a) {
    a.setAttribute('aria-current', 'page');
  });
})();
