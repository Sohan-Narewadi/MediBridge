// Renders the shared marketing header/footer and the dashboard shell
// (fixed sidebar + topbar) into placeholder elements, so every page markup
// file stays short and the chrome stays perfectly consistent.
// Icons come from /js/icons.js (MB_ICON); it is loaded automatically if a
// page did not include it, and placeholders are filled once it arrives.
(function ensureIcons() {
  if (window.MB_ICON) return;
  const s = document.createElement('script');
  s.src = '/js/icons.js';
  s.onload = () => window.MB_ICON && window.MB_ICON.hydrate();
  document.head.appendChild(s);
})();

const MB_LAYOUT = (() => {
  const BRAND_SVG = `
    <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="7" fill="currentColor"/>
      <path d="M7.5 19v-4.5a6.5 6.5 0 0 1 13 0V19" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <path d="M5.5 19.5h17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <path d="M14 11.2v4.6M11.7 13.5h4.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  const brand = (href = '/index.html') =>
    `<a href="${href}" class="brand" aria-label="MediBridge home"><span class="mark">${BRAND_SVG}</span>MediBridge</a>`;

  // Icon helper: real SVG when icons.js is ready, otherwise a placeholder hydrated later.
  function icon(name, size = 16) {
    if (window.MB_ICON) return window.MB_ICON(name, size);
    return `<span data-icon="${name}"${size !== 16 ? ` data-icon-size="${size}"` : ''}></span>`;
  }
  function hydrate(root) { if (window.MB_ICON) window.MB_ICON.hydrate(root || document); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 130 -> "2h 10m", 45 -> "45m", 2000 -> "1d 9h"
  function fmtMinutes(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    if (m < 60) return `${m}m`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
    return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  }

  const MARKETING_LINKS = [
    ['/index.html', 'Home'],
    ['/doctors.html', 'Find Doctors'],
    ['/resources.html', 'Health Resources'],
    ['/emergency.html', 'Emergency'],
    ['/about.html', 'About'],
  ];

  function renderHeader() {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.innerHTML = `
      <header class="site-header">
        <div class="container">
          ${brand()}
          <nav id="main-nav" class="main-nav" hidden>
            ${MARKETING_LINKS.map(([href, label]) => `<a href="${href}" data-nav>${label}</a>`).join('')}
          </nav>
          <div class="flex items-center gap-2">
            <div id="nav-auth-area" class="flex items-center gap-2"></div>
            <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">${icon('menu', 18)}</button>
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
      <footer class="site-footer" style="padding:var(--space-5) 0;">
        <div class="container flex items-center justify-between flex-wrap gap-4">
          ${brand()}
          <nav class="flex gap-5 text-sm" aria-label="Footer">
            <a href="/doctors.html">Doctors</a>
            <a href="/resources.html">Resources</a>
            <a href="/emergency.html">Emergency</a>
            <a href="/about.html">About</a>
          </nav>
          <span class="text-xs text-muted">Demo project &middot; fictional data &middot; not medical advice</span>
        </div>
      </footer>
    `;
  }

  // Grouped sidebar navigation. Paths are relied on by every page - keep them stable.
  const SIDEBAR = {
    patient: [
      ['Overview', [
        ['/patient/dashboard.html', 'Dashboard', 'dashboard'],
      ]],
      ['Care', [
        ['/patient/care-plan.html', 'My Care Plan', 'listChecks'],
        ['/patient/hospital-stay.html', 'Hospital Stay', 'hospital'],
        ['/patient/appointments.html', 'Appointments', 'calendar'],
        ['/patient/doctors.html', 'Find Doctors', 'search'],
      ]],
      ['Records', [
        ['/patient/medical-records.html', 'Medical Records', 'clipboard'],
        ['/patient/prescriptions.html', 'Prescriptions', 'fileText'],
        ['/patient/medications.html', 'Medications', 'pill'],
      ]],
      ['Account', [
        ['/patient/notifications.html', 'Notifications', 'bell'],
        ['/patient/profile.html', 'Profile', 'user'],
      ]],
    ],
    doctor: [
      ['Today', [
        ['/doctor/dashboard.html', 'Dashboard', 'dashboard'],
        ['/doctor/appointments.html', 'Appointments', 'calendar'],
      ]],
      ['Patients', [
        ['/doctor/patients.html', 'My Patients', 'users'],
        ['/doctor/inpatients.html', 'Inpatients & Discharge', 'bed'],
        ['/doctor/transfers.html', 'TransferConnect', 'transfer'],
      ]],
      ['Practice', [
        ['/doctor/availability.html', 'Availability', 'clock'],
        ['/doctor/notifications.html', 'Notifications', 'bell'],
        ['/doctor/profile.html', 'Profile', 'user'],
      ]],
    ],
    admin: [
      ['Overview', [
        ['/admin/dashboard.html', 'Dashboard', 'dashboard'],
        ['/admin/operations.html', 'Operations Center', 'activity'],
      ]],
      ['People', [
        ['/admin/patients.html', 'Patients', 'users'],
        ['/admin/doctors.html', 'Doctors', 'stethoscope'],
      ]],
      ['Activity', [
        ['/admin/appointments.html', 'Appointments', 'calendar'],
        ['/admin/reports.html', 'Reported Issues', 'alert'],
        ['/admin/audit-log.html', 'Audit Log', 'shield'],
      ]],
      ['Content', [
        ['/admin/specializations.html', 'Specializations', 'tag'],
        ['/admin/resources.html', 'Resources', 'book'],
      ]],
    ],
    staff: [
      ['Work', [
        ['/staff/dashboard.html', 'My Queue', 'inbox'],
        ['/staff/transfers.html', 'Transfers', 'transfer'],
      ]],
      ['Account', [
        ['/staff/notifications.html', 'Notifications', 'bell'],
      ]],
    ],
  };
  // Flat view kept for any code that still reads SIDEBAR_LINKS[role].
  const SIDEBAR_LINKS = Object.fromEntries(Object.entries(SIDEBAR).map(([role, groups]) => [role, groups.flatMap(([, links]) => links)]));

  // Pages that are not in the sidebar highlight their logical parent.
  const ACTIVE_ALIASES = {
    '/doctor/brief.html': '/doctor/dashboard.html',
    '/patient/intake.html': '/patient/appointments.html',
  };
  const ROLE_LABEL = { patient: 'Patient', doctor: 'Doctor', admin: 'Administrator', staff: 'Hospital staff' };
  const NOTIFICATIONS_PAGE = { patient: '/patient/notifications.html', doctor: '/doctor/notifications.html', staff: '/staff/notifications.html' };
  const PROFILE_PAGE = { patient: '/patient/profile.html', doctor: '/doctor/profile.html' };
  const DEPT_LABEL = { billing: 'Billing', insurance: 'Insurance desk', pharmacy: 'Pharmacy', nursing: 'Nursing', documentation: 'Medical records', transfer_desk: 'Transfer desk' };

  function renderDashboardShell(role, title) {
    const topbar = document.getElementById('dash-topbar');
    const sidebar = document.getElementById('dash-sidebar');
    const cleanTitle = String(title || '').replace(/^(patient|doctor|admin|staff)\s+/i, '') || 'Dashboard';
    const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    if (topbar) {
      const bellHref = NOTIFICATIONS_PAGE[role];
      topbar.innerHTML = `
        <header class="app-topbar">
          <button id="sidebar-toggle" class="icon-btn" aria-label="Open menu">${icon('menu', 18)}</button>
          <div class="crumbs">
            <span class="role">${ROLE_LABEL[role] || ''}</span><span class="sep">/</span>
            <span class="title">${esc(cleanTitle)}</span>
          </div>
          <div class="topbar-actions">
            <span class="topbar-date">${today}</span>
            ${bellHref ? `<a href="${bellHref}" class="icon-btn" id="topbar-bell" aria-label="Notifications">${icon('bell', 17)}<span class="dot" hidden></span></a>` : ''}
            <div id="nav-auth-area" class="flex items-center gap-2"></div>
          </div>
        </header>
      `;
      if (bellHref) refreshBell();
    }

    if (sidebar) {
      const groups = SIDEBAR[role] || [];
      const current = ACTIVE_ALIASES[window.location.pathname] || window.location.pathname;
      const user = window.MB_USER;
      sidebar.innerHTML = `
        <aside class="dash-sidebar" id="dash-sidebar-aside">
          <div class="side-brand">${brand(DASHBOARD_FOR(role))}</div>
          <nav aria-label="${ROLE_LABEL[role] || ''} navigation">
            ${groups.map(([label, links]) => `
              <div class="nav-group-label">${label}</div>
              ${links.map(([href, text, ic]) => `<a href="${href}" class="${current === href ? 'active' : ''}"${current === href ? ' aria-current="page"' : ''}>${icon(ic)}<span>${text}</span></a>`).join('')}
            `).join('')}
          </nav>
          ${user ? `
            <div class="side-user">
              <div class="avatar">${initials(user.fullName)}</div>
              <div class="who">
                <div class="name" title="${esc(user.fullName)}">${esc(user.fullName)}</div>
                <div class="role" id="side-user-role">${ROLE_LABEL[user.role] || user.role}</div>
              </div>
              <button class="icon-btn" id="side-logout" title="Log out" aria-label="Log out">${icon('logout')}</button>
            </div>` : ''}
        </aside>
        <div class="sidebar-scrim" id="sidebar-scrim"></div>
      `;
      const toggle = document.getElementById('sidebar-toggle');
      const aside = document.getElementById('dash-sidebar-aside');
      const scrim = document.getElementById('sidebar-scrim');
      const setOpen = (open) => { aside.classList.toggle('open', open); scrim.classList.toggle('open', open); };
      if (toggle) toggle.addEventListener('click', () => setOpen(!aside.classList.contains('open')));
      scrim.addEventListener('click', () => setOpen(false));
      const logout = document.getElementById('side-logout');
      if (logout) logout.addEventListener('click', doLogout);
      if (user && user.role === 'staff') describeStaff();
    }
    hydrate();
  }

  async function refreshBell() {
    try {
      const data = await api.get('/notifications');
      const unread = Number(data && (data.unread != null ? data.unread : data.unreadCount)) || 0;
      const dot = document.querySelector('#topbar-bell .dot');
      if (dot) dot.hidden = unread === 0;
      const bell = document.getElementById('topbar-bell');
      if (bell) bell.setAttribute('aria-label', unread ? `Notifications (${unread} unread)` : 'Notifications');
    } catch (e) { /* the bell is decorative if notifications fail */ }
  }

  async function describeStaff() {
    try {
      const { staff } = await api.get('/staff/me');
      const el = document.getElementById('side-user-role');
      if (el && staff) el.textContent = `${DEPT_LABEL[staff.department] || staff.department} · ${staff.hospital_name}`;
    } catch (e) { /* keep the generic label */ }
  }

  const ROLE_DASHBOARD = { patient: '/patient/dashboard.html', doctor: '/doctor/dashboard.html', admin: '/admin/dashboard.html', staff: '/staff/dashboard.html' };
  function DASHBOARD_FOR(role) { return ROLE_DASHBOARD[role] || '/index.html'; }

  function initials(name) {
    if (!name) return '?';
    return name.replace(/^Dr\.?\s+/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  async function doLogout() {
    try { await api.post('/auth/logout'); } catch (e) { /* ignore */ }
    window.location.href = '/index.html';
  }

  function renderUserMenu(user, { showDashboardLink = true } = {}) {
    const area = document.getElementById('nav-auth-area');
    if (!area) return;
    const inApp = !!area.closest('.app-topbar');
    if (inApp) {
      // Dashboard pages: the sidebar holds name + logout; the topbar shows a compact avatar.
      const profile = PROFILE_PAGE[user.role];
      area.innerHTML = profile
        ? `<a href="${profile}" class="avatar" title="${esc(user.fullName)} — profile" style="text-decoration:none;">${initials(user.fullName)}</a>`
        : `<div class="avatar" title="${esc(user.fullName)}">${initials(user.fullName)}</div>`;
      return;
    }
    area.innerHTML = `
      ${showDashboardLink ? `<a href="${DASHBOARD_FOR(user.role)}" class="btn btn-outline btn-sm">Open dashboard</a>` : ''}
      <div class="avatar" title="${esc(user.fullName)}">${initials(user.fullName)}</div>
      <button id="nav-logout" class="btn btn-ghost btn-sm">Log out</button>
    `;
    document.getElementById('nav-logout').addEventListener('click', doLogout);
  }

  // Runs fn({ detail: user }) once guard.js has confirmed the session - even if
  // 'mb:auth-ready' already fired (e.g. while a slow CDN script was blocking the parser).
  function onAuthReady(fn) {
    if (window.MB_USER && !document.documentElement.classList.contains('mb-auth-pending')) {
      fn({ detail: window.MB_USER });
    } else {
      document.addEventListener('mb:auth-ready', fn, { once: true });
    }
  }

  return { renderHeader, renderFooter, renderDashboardShell, renderUserMenu, onAuthReady, icon, hydrate, esc, fmtMinutes, initials, SIDEBAR_LINKS, ROLE_DASHBOARD };
})();

document.addEventListener('DOMContentLoaded', () => {
  MB_LAYOUT.renderHeader();
  MB_LAYOUT.renderFooter();
  MB_LAYOUT.hydrate();
});
