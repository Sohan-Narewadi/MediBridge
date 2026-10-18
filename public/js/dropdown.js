// Styled dropdown that wraps a native <select>. The select stays in the DOM
// (hidden), so existing code that reads select.value or listens for "change"
// keeps working; programmatic value changes and late-added options are synced.
// Usage: MB_SELECT.enhance(document.getElementById('f-mode'));
const MB_SELECT = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, s) => (window.MB_ICON ? window.MB_ICON(n, s) : '');
  let uid = 0;

  function enhance(select) {
    if (!select || select.dataset.enhanced) return;
    select.dataset.enhanced = '1';
    const id = `sel-${++uid}`;
    const labelEl = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
    const labelText = (labelEl && labelEl.textContent) || select.getAttribute('aria-label') || '';

    const wrap = document.createElement('div');
    wrap.className = 'sel';
    wrap.innerHTML = `
      <button type="button" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(labelText)}">
        <span class="sel-val"></span><span class="sel-chev">${icon('chevronRight', 15)}</span>
      </button>
      <div class="sel-panel" hidden><ul class="sel-list" id="${id}" role="listbox" tabindex="-1" aria-label="${esc(labelText)}"></ul></div>`;
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('sel-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const btn = wrap.querySelector('.sel-btn');
    const val = wrap.querySelector('.sel-val');
    const panel = wrap.querySelector('.sel-panel');
    const list = wrap.querySelector('.sel-list');
    let active = 0;
    let typed = '';
    let timer;

    const options = () => [...select.options];
    const items = () => [...list.querySelectorAll('[role="option"]')];

    function render() {
      const opts = options();
      list.innerHTML = opts.map((o, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${o.value === select.value}"><span class="tick">${o.value === select.value ? icon('check', 15) : ''}</span><span class="nm">${esc(o.textContent)}</span></li>`).join('');
      const cur = opts.find((o) => o.value === select.value) || opts[0];
      val.textContent = cur ? cur.textContent : '';
      // The first option (e.g. "Any") reads as a placeholder until something is chosen.
      const hasPlaceholder = !!opts[0] && opts[0].value === '';
      val.classList.toggle('is-placeholder', hasPlaceholder && !select.value);
      wrap.classList.toggle('has-value', hasPlaceholder && !!select.value);
    }
    function setActive(i) {
      const els = items();
      if (!els.length) return;
      active = Math.max(0, Math.min(els.length - 1, i));
      els.forEach((el, k) => el.classList.toggle('is-active', k === active));
      list.setAttribute('aria-activedescendant', els[active].id);
      els[active].scrollIntoView({ block: 'nearest' });
    }
    function open() {
      document.querySelectorAll('.sel-panel:not([hidden])').forEach((p) => { if (p !== panel) p.previousElementSibling.click(); });
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      list.focus();
      setActive(Math.max(0, options().findIndex((o) => o.value === select.value)));
    }
    function close(focusBtn = true) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    function choose(i) {
      const o = options()[i];
      if (o && select.value !== o.value) { select.value = o.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      render();
      close();
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close()));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    list.addEventListener('click', (e) => { const li = e.target.closest('[role="option"]'); if (li) choose(Number(li.dataset.i)); });
    list.addEventListener('mousemove', (e) => { const li = e.target.closest('[role="option"]'); if (li && Number(li.dataset.i) !== active) setActive(Number(li.dataset.i)); });
    list.addEventListener('keydown', (e) => {
      const n = items().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close(false);
      else if (e.key.length === 1) {
        typed += e.key.toLowerCase();
        clearTimeout(timer);
        timer = setTimeout(() => { typed = ''; }, 600);
        const hit = options().findIndex((o) => o.textContent.toLowerCase().startsWith(typed));
        if (hit >= 0) setActive(hit);
      }
    });
    document.addEventListener('mousedown', (e) => { if (!panel.hidden && !wrap.contains(e.target)) close(false); });

    // Keep in sync when code sets select.value or adds options later.
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); render(); } });
    new MutationObserver(render).observe(select, { childList: true });
    render();
  }

  return { enhance };
})();
