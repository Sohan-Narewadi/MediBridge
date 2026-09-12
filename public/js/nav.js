// Marketing-page header behavior: mobile nav toggle, active-link
// highlighting, and populating the auth area via a session check.
// Not used on dashboard pages - they populate it directly from guard.js.
(function () {
  function highlightActiveLink() {
    const links = document.querySelectorAll('.main-nav a[data-nav]');
    const current = window.location.pathname;
    links.forEach((a) => {
      const target = a.getAttribute('href');
      if (target === current) a.classList.add('active');
    });
  }

  function wireMobileToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('main-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      nav.hidden = !nav.hidden;
      toggle.setAttribute('aria-expanded', String(!nav.hidden));
    });
  }

  async function renderAuthArea() {
    const area = document.getElementById('nav-auth-area');
    if (!area) return;
    try {
      const { user } = await api.get('/auth/me');
      MB_LAYOUT.renderUserMenu(user);
    } catch (e) {
      area.innerHTML = `
        <a href="/auth/login.html" class="btn btn-ghost btn-sm">Log in</a>
        <a href="/auth/register.html" class="btn btn-primary btn-sm">Get started</a>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    highlightActiveLink();
    wireMobileToggle();
    renderAuthArea();
  });
})();
