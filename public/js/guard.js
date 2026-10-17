// Drop `<script src="/js/guard.js" data-role="patient"></script>` (or
// doctor/admin) near the top of any protected page. It blocks rendering
// until the session is confirmed, then exposes the user as window.MB_USER
// and fires a 'mb:auth-ready' event so the page's own script can run.
(function () {
  const scriptTag = document.currentScript;
  const requiredRole = scriptTag.getAttribute('data-role');

  async function guard() {
    try {
      const { user } = await api.get('/auth/me');
      if (requiredRole && user.role !== requiredRole) {
        window.location.href = '/unauthorized.html';
        return;
      }
      window.MB_USER = user;
      // /auth/me can resolve before the page's own inline script has run (e.g. while a
      // CDN <script> is still downloading), so wait for parsing to finish before firing
      // the event - otherwise the page's listener misses it and stays on skeletons.
      const ready = () => {
        document.documentElement.classList.remove('mb-auth-pending');
        document.dispatchEvent(new CustomEvent('mb:auth-ready', { detail: user }));
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
      else ready();
    } catch (e) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/auth/login.html?next=${next}`;
    }
  }

  document.documentElement.classList.add('mb-auth-pending');
  guard();
})();
