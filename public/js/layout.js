// Renders the shared marketing header/footer and the dashboard shell
// (sidebar + topbar) into placeholder elements, so every page markup file
// stays short and the chrome stays perfectly consistent.
const MB_LAYOUT = (() => {
  const MARKETING_LINKS = [
    ['/index.html', 'Home'],
    ['/doctors.html', 'Find Doctors'],
    ['/resources.html', 'Health Resources'],
    ['/emergency.html', 'Emergency Help'],
    ['/about.html', 'About'],
  ];

  function renderHeader() {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.innerHTML = `
      <header class="site-header">
        <div class="container">
          <a href="/index.html" class="brand" aria-label="MediBridge home">
            <span class="mark">+</span> MediBridge
          </a>
          <nav id="main-nav" class="main-nav" hidden>
            ${MARKETING_LINKS.map(([href, label]) => `<a href="${href}" data-nav>${label}</a>`).join('')}
          </nav>
          <div class="flex items-center gap-3">
            <div id="nav-auth-area" class="flex items-center gap-2"></div>
            <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>
          </div>
        </div>
      </header>
    `;
    // Default to visible nav on desktop widths; JS toggle only matters on mobile.
    const nav = document.getElementById('main-nav');
    if (window.innerWidth > 860) nav.hidden = false;
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <footer style="background:var(--color-ink-900); color:var(--color-ink-300); padding: var(--space-8) 0 var(--space-6);">
        <div class="container">
          <div class="grid" style="grid-template-columns: 2fr 1fr 1fr 1fr; gap: var(--space-6);">
            <div>
              <div class="brand" style="color:#fff;"><span class="mark">+</span> MediBridge</div>
              <p style="color:var(--color-ink-300); max-width: 320px; margin-top: var(--space-3); font-size: 0.88rem;">
                A smart healthcare access &amp; management platform connecting patients, doctors and care teams.
                Built to support SDG 3 (Good Health &amp; Well-being).
              </p>
            </div>
            <div>
              <h4 style="color:#fff; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.04em;">Platform</h4>
              <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem;">
                <li><a href="/doctors.html" style="color:var(--color-ink-300);">Find Doctors</a></li>
                <li><a href="/resources.html" style="color:var(--color-ink-300);">Health Resources</a></li>
                <li><a href="/emergency.html" style="color:var(--color-ink-300);">Emergency Help</a></li>
              </ul>
            </div>
            <div>
              <h4 style="color:#fff; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.04em;">Account</h4>
              <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem;">
                <li><a href="/auth/login.html" style="color:var(--color-ink-300);">Log in</a></li>
                <li><a href="/auth/register.html" style="color:var(--color-ink-300);">Create account</a></li>
                <li><a href="/about.html" style="color:var(--color-ink-300);">About MediBridge</a></li>
              </ul>
            </div>
            <div>
              <h4 style="color:#fff; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.04em;">Disclaimer</h4>
              <p style="color:var(--color-ink-300); font-size:0.8rem; margin-top:0.75rem;">
                MediBridge provides general health information and appointment coordination. It is not a diagnostic
                tool. Always consult a qualified healthcare professional for medical decisions. In an emergency,
                contact local emergency services immediately.
              </p>
            </div>
          </div>
          <hr class="divider" style="border-color: #1e293b; background: #1e293b;">
          <p style="color:var(--color-ink-500); font-size:0.8rem; margin:0;">&copy; ${new Date().getFullYear()} MediBridge. A student full-stack project. All data is fictional.</p>
        </div>
      </footer>
    `;
  }

  const SIDEBAR_LINKS = {
    patient: [
      ['/patient/dashboard.html', 'Dashboard', '&#9733;'],
      ['/patient/doctors.html', 'Find Doctors', '&#128269;'],
      ['/patient/appointments.html', 'Appointments', '&#128197;'],
      ['/patient/medical-records.html', 'Medical Records', '&#128203;'],
      ['/patient/prescriptions.html', 'Prescriptions', '&#128138;'],
      ['/patient/medications.html', 'Medications', '&#9201;'],
      ['/patient/notifications.html', 'Notifications', '&#128276;'],
      ['/patient/profile.html', 'Profile', '&#128100;'],
    ],
    doctor: [
      ['/doctor/dashboard.html', 'Dashboard', '&#9733;'],
      ['/doctor/appointments.html', 'Appointments', '&#128197;'],
      ['/doctor/patients.html', 'My Patients', '&#129658;'],
      ['/doctor/availability.html', 'Availability', '&#128336;'],
      ['/doctor/notifications.html', 'Notifications', '&#128276;'],
      ['/doctor/profile.html', 'Profile', '&#128100;'],
    ],
    admin: [
      ['/admin/dashboard.html', 'Dashboard', '&#9733;'],
      ['/admin/patients.html', 'Patients', '&#129658;'],
      ['/admin/doctors.html', 'Doctors', '&#129657;'],
      ['/admin/appointments.html', 'Appointments', '&#128197;'],
      ['/admin/specializations.html', 'Specializations', '&#127891;'],
      ['/admin/resources.html', 'Resources', '&#128218;'],
      ['/admin/reports.html', 'Reported Issues', '&#9888;'],
      ['/admin/audit-log.html', 'Audit Log', '&#128272;'],
    ],
  };

  function renderDashboardShell(role, title) {
    const topbar = document.getElementById('dash-topbar');
    const sidebar = document.getElementById('dash-sidebar');
    if (topbar) {
      topbar.innerHTML = `
        <header class="site-header">
          <div class="container">
            <a href="/index.html" class="brand"><span class="mark">+</span> MediBridge</a>
            <h2 style="margin:0; font-size:1.05rem; color:var(--color-ink-700);">${title || ''}</h2>
            <div class="flex items-center gap-3">
              <button id="sidebar-toggle" class="nav-toggle" style="display:inline-flex;" aria-label="Toggle menu">&#9776;</button>
              <div id="nav-auth-area" class="flex items-center gap-2"></div>
            </div>
          </div>
        </header>
      `;
    }
    if (sidebar) {
      const links = SIDEBAR_LINKS[role] || [];
      const current = window.location.pathname;
      sidebar.innerHTML = `
        <aside class="dash-sidebar" id="dash-sidebar-aside">
          <nav>
            ${links.map(([href, label, icon]) => `<a href="${href}" class="${current === href ? 'active' : ''}"><span aria-hidden="true">${icon}</span> ${label}</a>`).join('')}
          </nav>
        </aside>
      `;
      const toggle = document.getElementById('sidebar-toggle');
      const aside = document.getElementById('dash-sidebar-aside');
      if (toggle) toggle.addEventListener('click', () => aside.classList.toggle('open'));
    }
  }

  const ROLE_DASHBOARD = { patient: '/patient/dashboard.html', doctor: '/doctor/dashboard.html', admin: '/admin/dashboard.html' };
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }
  function renderUserMenu(user, { showDashboardLink = true } = {}) {
    const area = document.getElementById('nav-auth-area');
    if (!area) return;
    area.innerHTML = `
      ${showDashboardLink ? `<a href="${ROLE_DASHBOARD[user.role] || '/'}" class="btn btn-outline btn-sm">Dashboard</a>` : ''}
      <div class="avatar" title="${user.fullName}">${initials(user.fullName)}</div>
      <button id="nav-logout" class="btn btn-ghost btn-sm">Log out</button>
    `;
    document.getElementById('nav-logout').addEventListener('click', async () => {
      await api.post('/auth/logout');
      window.location.href = '/index.html';
    });
  }

  return { renderHeader, renderFooter, renderDashboardShell, renderUserMenu };
})();

document.addEventListener('DOMContentLoaded', () => {
  MB_LAYOUT.renderHeader();
  MB_LAYOUT.renderFooter();
});
