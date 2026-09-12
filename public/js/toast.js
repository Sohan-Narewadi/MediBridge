// Minimal toast/notification-banner system. Call toast.success('Saved') etc.
const toast = (() => {
  function ensureRoot() {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function show(message, type = 'default', duration = 3800) {
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.25s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  return {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
  };
})();
