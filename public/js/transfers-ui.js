// TransferConnect UI shared by the doctor page and the hospital transfer desk:
// the "new transfer" wizard, the outgoing-request tracker, and the incoming
// queue for partner hospitals. Depends on api.js and toast.js.
const MB_TRANSFERS = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const URGENCY_BADGE = { critical: 'badge-danger', urgent: 'badge-warning', routine: 'badge-info' };
  const REQUEST_STATUS = {
    open: ['badge-info', 'Awaiting responses'],
    accepted: ['badge-success', 'Accepted'],
    completed: ['badge-neutral', 'Completed'],
    cancelled: ['badge-danger', 'Cancelled'],
  };
  const OFFER_STATUS = {
    pending: ['badge-warning', 'Waiting'],
    accepted: ['badge-success', 'Accepted'],
    declined: ['badge-danger', 'Declined'],
    withdrawn: ['badge-neutral', 'Stood down'],
  };

  function minutesLabel(mins) {
    const m = Math.max(0, Math.round(mins));
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
  const urgencyBadge = (u) => badge(URGENCY_BADGE[u] || 'badge-neutral', u);

  // Live "waiting" timers: elements carry data-base-minutes captured at render time.
  let loadedAt = Date.now();
  setInterval(() => {
    const extra = (Date.now() - loadedAt) / 60000;
    document.querySelectorAll('[data-live-minutes]').forEach((el) => {
      el.textContent = minutesLabel(Number(el.dataset.liveMinutes) + extra);
    });
  }, 15000);
  const live = (mins) => `<span data-live-minutes="${Number(mins) || 0}">${minutesLabel(mins)}</span>`;

  // -------------------------------------------------------------------------
  // Wizard
  // -------------------------------------------------------------------------
  function renderWizard(root, { onSent } = {}) {
    const params = new URLSearchParams(window.location.search);
    const prePatient = params.get('patientId');
    const preAdmission = params.get('admissionId');

    root.innerHTML = `
      <div class="tc-steps">
        <section class="tc-step">
          <div class="tc-step-head"><span class="tc-step-num">1</span><h4 class="mb-0">Who needs to move, and why</h4></div>
          <div class="form-row">
            <div class="field">
              <label for="tc-patient">Patient</label>
              <select id="tc-patient"><option value="">Loading patients...</option></select>
              <div class="hint">Admitted patients are listed first. Their records are pulled in automatically.</div>
            </div>
            <div class="field">
              <label for="tc-spec">Care needed (not available here)</label>
              <select id="tc-spec"><option value="">Loading...</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Urgency</label>
              <div class="pill-nav" id="tc-urgency">
                <button type="button" data-v="routine">Routine</button>
                <button type="button" data-v="urgent" class="active">Urgent</button>
                <button type="button" data-v="critical">Critical</button>
              </div>
            </div>
            <div class="field">
              <label class="tc-check"><input type="checkbox" id="tc-icu"> ICU bed required</label>
              <div class="hint">Hospitals without a free ICU bed drop down the list.</div>
            </div>
          </div>
          <div class="field">
            <label for="tc-reason">Reason for transfer</label>
            <input id="tc-reason" maxlength="255" placeholder="e.g. Needs neurosurgical evaluation; no neurosurgeon on site">
          </div>
          <button type="button" class="btn btn-primary" id="tc-find">Find hospitals</button>
        </section>

        <section class="tc-step" id="tc-step2" hidden>
          <div class="tc-step-head"><span class="tc-step-num">2</span><h4 class="mb-0">Choose who to ask</h4></div>
          <p class="text-sm text-muted">Ranked by specialty, free beds, ICU, distance and how quickly each hospital usually responds. The first hospital to accept gets the patient, and the others are stood down automatically.</p>
          <div id="tc-matches"></div>
        </section>

        <section class="tc-step" id="tc-step3" hidden>
          <div class="tc-step-head"><span class="tc-step-num">3</span><h4 class="mb-0">Review what they will see, then send</h4></div>
          <p class="text-sm text-muted">MediBridge writes this summary from records it already holds, so you don't need to type it. Receiving hospitals see only initials until they open the request, and every open is logged.</p>
          <pre class="tc-summary" id="tc-summary">Generating summary...</pre>
          <div class="field">
            <label class="tc-check"><input type="checkbox" id="tc-consent"> The patient (or their guardian) has agreed to share this summary with the selected hospitals</label>
          </div>
          <div class="field">
            <label for="tc-consent-note">Consent note <span class="text-muted">(optional)</span></label>
            <input id="tc-consent-note" maxlength="160" placeholder="e.g. Verbal consent from patient's wife at bedside">
          </div>
          <button type="button" class="btn btn-primary" id="tc-send" disabled>Send request</button>
        </section>
      </div>`;

    const $ = (id) => root.querySelector(`#${id}`);
    let urgency = 'urgent';
    let patients = [];
    let matches = [];

    root.querySelectorAll('#tc-urgency button').forEach((b) => b.addEventListener('click', () => {
      root.querySelectorAll('#tc-urgency button').forEach((x) => x.classList.toggle('active', x === b));
      urgency = b.dataset.v;
      if (!$('tc-step3').hidden) refreshSummary();
    }));

    (async () => {
      try {
        const [{ patients: list }, { specializations }] = await Promise.all([
          api.get('/transfers/candidates'), api.get('/specializations'),
        ]);
        patients = list;
        $('tc-patient').innerHTML = `<option value="">Select a patient</option>` + list.map((p, i) => `
          <option value="${i}">${esc(p.full_name)}${p.age != null ? `, ${p.age}y` : ''} &mdash; ${p.admission_id ? `admitted, ${esc(p.ward)} ${esc(p.bed || '')}` : 'outpatient'}</option>`).join('');
        $('tc-spec').innerHTML = `<option value="">Select specialty</option>` + specializations.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
        if (prePatient) {
          const idx = list.findIndex((p) => String(p.id) === prePatient && (!preAdmission || String(p.admission_id) === preAdmission));
          if (idx >= 0) $('tc-patient').value = String(idx);
        }
      } catch (err) {
        toast.error(err.message);
      }
    })();

    function payload() {
      const p = patients[Number($('tc-patient').value)];
      return {
        patientId: p ? p.id : null,
        admissionId: p ? p.admission_id : null,
        specializationId: Number($('tc-spec').value) || null,
        needsIcu: $('tc-icu').checked,
        urgency,
        reason: $('tc-reason').value.trim(),
      };
    }

    function syncSend() {
      const chosen = root.querySelectorAll('.tc-match-pick:checked').length;
      $('tc-send').disabled = !($('tc-consent').checked && chosen > 0);
      $('tc-send').textContent = chosen ? `Send request to ${chosen} hospital${chosen === 1 ? '' : 's'}` : 'Select at least one hospital';
    }

    async function refreshSummary() {
      const body = payload();
      try {
        const { summary } = await api.post('/transfers/preview-summary', body);
        $('tc-summary').textContent = summary;
      } catch (err) {
        $('tc-summary').textContent = `Could not build the summary: ${err.message}`;
      }
    }

    $('tc-find').addEventListener('click', async () => {
      const body = payload();
      if (!body.patientId) return toast.error('Choose a patient first.');
      if (!body.specializationId) return toast.error('Choose the care the patient needs.');
      if (body.reason.length < 5) return toast.error('Add a short reason for the transfer.');
      const btn = $('tc-find');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Matching...';
      try {
        ({ matches } = await api.post('/transfers/match', { specializationId: body.specializationId, needsIcu: body.needsIcu }));
        $('tc-step2').hidden = false;
        if (!matches.length) {
          $('tc-matches').innerHTML = `<div class="alert alert-warning">No partner hospital in the network lists this specialty right now. Escalate to the duty administrator.</div>`;
          $('tc-step3').hidden = true;
          return;
        }
        $('tc-matches').innerHTML = matches.map((m, i) => `
          <label class="tc-match ${m.score < 40 ? 'tc-match-weak' : ''}">
            <input type="checkbox" class="tc-match-pick" value="${m.hospital_id}" ${i < 3 && m.score >= 40 ? 'checked' : ''}>
            <div class="tc-match-body">
              <div class="flex items-center justify-between gap-3">
                <strong>${esc(m.name)}</strong>
                <span class="tc-score">${m.score}<span class="text-muted text-sm">/100</span></span>
              </div>
              <div class="tc-bar"><span style="width:${m.score}%"></span></div>
              <div class="tc-reasons">${m.reasons.map((r) => `<span>${esc(r)}</span>`).join('')}</div>
            </div>
          </label>`).join('');
        root.querySelectorAll('.tc-match-pick').forEach((c) => c.addEventListener('change', syncSend));
        $('tc-step3').hidden = false;
        syncSend();
        refreshSummary();
        $('tc-step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        toast.error(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Find hospitals';
      }
    });

    $('tc-consent').addEventListener('change', syncSend);

    $('tc-send').addEventListener('click', async () => {
      const body = {
        ...payload(),
        consentGiven: $('tc-consent').checked,
        consentNote: $('tc-consent-note').value.trim() || null,
        hospitalIds: [...root.querySelectorAll('.tc-match-pick:checked')].map((c) => Number(c.value)),
      };
      const btn = $('tc-send');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Sending...';
      try {
        const { request } = await api.post('/transfers', body);
        toast.success(`Request sent to ${request.hospitalsContacted} hospital${request.hospitalsContacted === 1 ? '' : 's'}. You'll be notified as they respond.`);
        if (onSent) onSent(request);
        renderWizard(root, { onSent });
      } catch (err) {
        toast.error(err.message);
        btn.disabled = false;
        syncSend();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Outgoing requests (sender side)
  // -------------------------------------------------------------------------
  function offerTiming(o, requestStatus) {
    if (o.responded_at) return `responded in ${minutesLabel(o.response_minutes)}`;
    if (o.status === 'pending' && requestStatus === 'open') return `waiting ${live(o.minutes_since_sent)}`;
    return '';
  }

  function renderOutgoing(root, { emptyText = 'No transfer requests yet.' } = {}) {
    let filter = 'active';
    root.innerHTML = `
      <div class="flex items-center justify-between gap-3" style="margin-bottom:var(--space-4); flex-wrap:wrap;">
        <div class="pill-nav" id="tc-out-filter">
          <button type="button" data-v="active" class="active">Active</button>
          <button type="button" data-v="history">History</button>
        </div>
        <span class="text-sm text-muted">Updates automatically every 20 seconds</span>
      </div>
      <div id="tc-out-list"><div class="skeleton" style="height:120px;"></div></div>`;
    const listEl = root.querySelector('#tc-out-list');
    root.querySelectorAll('#tc-out-filter button').forEach((b) => b.addEventListener('click', () => {
      root.querySelectorAll('#tc-out-filter button').forEach((x) => x.classList.toggle('active', x === b));
      filter = b.dataset.v;
      load();
    }));

    async function load() {
      try {
        const { requests } = await api.get('/transfers');
        loadedAt = Date.now();
        const shown = requests.filter((r) => (filter === 'active' ? ['open', 'accepted'].includes(r.status) : ['completed', 'cancelled'].includes(r.status)));
        if (!shown.length) {
          listEl.innerHTML = `<div class="empty-state"><p class="mb-0">${filter === 'active' ? esc(emptyText) : 'No closed requests yet.'}</p></div>`;
          return;
        }
        listEl.innerHTML = shown.map((r) => {
          const [cls, label] = REQUEST_STATUS[r.status] || ['badge-neutral', r.status];
          return `
          <article class="card tc-request">
            <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap;">
              <div>
                <h4 class="mb-0">${esc(r.patient_name)} <span class="text-muted text-sm">&middot; ${esc(r.specialization)}${r.needs_icu ? ' &middot; ICU' : ''}</span></h4>
                <div class="text-sm text-muted">Sent ${minutesLabel(r.minutes_ago)} ago by ${esc(r.requested_by_name || 'care team')} &middot; ${esc(r.reason)}</div>
              </div>
              <div class="flex items-center gap-2">${urgencyBadge(r.urgency)} ${badge(cls, label)}</div>
            </div>
            ${r.status === 'accepted' ? `<div class="alert alert-success" style="margin:var(--space-3) 0 0;">${esc(r.accepted_hospital)} accepted. Arrange transport, then mark the transfer complete.</div>` : ''}
            <ul class="tc-offers">
              ${r.offers.map((o) => {
                const shownStatus = o.status === 'pending' && r.status !== 'open' ? 'withdrawn' : o.status;
                const [oc, ol] = OFFER_STATUS[shownStatus] || ['badge-neutral', shownStatus];
                return `<li>
                  <div><strong class="text-sm">${esc(o.hospital_name)}</strong> <span class="text-sm text-muted">match ${o.match_score}</span>
                    ${o.response_note ? `<div class="text-sm text-muted">&ldquo;${esc(o.response_note)}&rdquo;</div>` : ''}</div>
                  <div class="flex items-center gap-2"><span class="text-sm text-muted">${offerTiming(o, r.status)}</span>${badge(oc, ol)}</div>
                </li>`;
              }).join('')}
            </ul>
            ${['open', 'accepted'].includes(r.status) ? `
            <div class="flex gap-2" style="margin-top:var(--space-3);">
              ${r.status === 'accepted' ? `<button class="btn btn-primary btn-sm" data-act="complete" data-id="${r.id}">Patient has left: mark complete</button>` : ''}
              <button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${r.id}">Cancel request</button>
            </div>` : ''}
          </article>`;
        }).join('');
        listEl.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, b.dataset.id, b)));
      } catch (err) {
        listEl.innerHTML = `<div class="alert alert-danger">Could not load transfer requests: ${esc(err.message)}</div>`;
      }
    }

    async function act(action, id, btn) {
      if (action === 'cancel' && !window.confirm('Cancel this transfer request? Hospitals that were asked will be told.')) return;
      btn.disabled = true;
      try {
        const { message } = await api.post(`/transfers/${id}/${action}`);
        toast.success(message);
        load();
      } catch (err) {
        toast.error(err.message);
        btn.disabled = false;
      }
    }

    load();
    const timer = setInterval(load, 20000);
    return { reload: load, stop: () => clearInterval(timer) };
  }

  // -------------------------------------------------------------------------
  // Incoming queue (receiving desk)
  // -------------------------------------------------------------------------
  function renderIncoming(root, statsRoot) {
    async function load() {
      try {
        const { offers } = await api.get('/transfers/incoming');
        loadedAt = Date.now();
        const pending = offers.filter((o) => o.status === 'pending' && o.request_status === 'open');
        const answered = offers.filter((o) => o.responded_at);
        const avg = answered.length ? answered.reduce((s, o) => s + o.minutes_waiting, 0) / answered.length : null;
        if (statsRoot) {
          statsRoot.innerHTML = `
            <div class="card stat-card"><span class="value">${pending.length}</span><span class="label">Waiting for your answer</span></div>
            <div class="card stat-card"><span class="value">${pending.filter((o) => o.urgency === 'critical').length}</span><span class="label">Critical</span></div>
            <div class="card stat-card"><span class="value">${offers.filter((o) => o.status === 'accepted').length}</span><span class="label">Accepted by you</span></div>
            <div class="card stat-card"><span class="value">${avg === null ? '&ndash;' : minutesLabel(avg)}</span><span class="label">Your average response</span></div>`;
        }

        const pendingHtml = pending.length ? pending.map((o) => `
          <article class="card tc-incoming tc-urgency-${esc(o.urgency)}">
            <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap;">
              <div class="flex items-center gap-2">${urgencyBadge(o.urgency)} <strong>${esc(o.specialization)}</strong>${o.needs_icu ? ' ' + badge('badge-danger', 'ICU bed') : ''}</div>
              <span class="text-sm">Waiting <strong>${live(o.minutes_waiting)}</strong></span>
            </div>
            <p class="mb-0" style="margin-top:var(--space-2);">${esc(o.patient_initials)}, ${o.patient_age ?? '?'}y ${esc(o.patient_gender)} &middot; from ${esc(o.from_hospital)}</p>
            <p class="text-sm text-muted">${esc(o.reason)}</p>
            <button class="btn btn-primary btn-sm" data-open="${o.request_id}">Open request and respond</button>
          </article>`).join('')
          : `<div class="empty-state"><p class="mb-0">No requests waiting. New ones appear here automatically.</p></div>`;

        const past = offers.filter((o) => !(o.status === 'pending' && o.request_status === 'open'));
        const pastHtml = past.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Patient</th><th>Care</th><th>From</th><th>Your answer</th><th>Note</th><th>Response time</th></tr></thead>
            <tbody>${past.map((o) => {
              const shown = o.status === 'pending' ? 'withdrawn' : o.status;
              const [c, l] = OFFER_STATUS[shown] || ['badge-neutral', shown];
              return `<tr><td>${esc(o.patient_initials)}, ${o.patient_age ?? '?'}y</td><td>${esc(o.specialization)}</td><td>${esc(o.from_hospital)}</td>
                <td>${badge(c, l)}</td><td class="text-sm">${esc(o.response_note || '')}</td><td>${o.responded_at ? minutesLabel(o.minutes_waiting) : '&ndash;'}</td></tr>`;
            }).join('')}</tbody>
          </table></div>` : '<p class="text-muted text-sm">Nothing yet.</p>';

        root.innerHTML = `
          <h3>Waiting for your answer</h3>
          <div class="tc-incoming-list">${pendingHtml}</div>
          <h3 style="margin-top:var(--space-6);">Past requests</h3>
          ${pastHtml}`;
        root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openRequest(b.dataset.open, load)));
      } catch (err) {
        root.innerHTML = `<div class="alert alert-danger">Could not load incoming requests: ${esc(err.message)}</div>`;
      }
    }
    load();
    setInterval(load, 15000);
    return { reload: load };
  }

  async function openRequest(requestId, onDone) {
    const modalRoot = document.getElementById('modal-root');
    try {
      const { request: r } = await api.get(`/transfers/${requestId}`);
      const offer = r.my_offer;
      const canRespond = offer && offer.status === 'pending' && r.status === 'open';
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="tc-backdrop">
          <div class="modal" style="max-width:640px;" role="dialog" aria-modal="true" aria-labelledby="tc-modal-title">
            <div class="modal-header">
              <h3 class="mb-0" id="tc-modal-title">${esc(r.specialization)} transfer from ${esc(r.from_hospital)}</h3>
              <button class="modal-close" id="tc-close" aria-label="Close">&times;</button>
            </div>
            <div class="flex items-center gap-2" style="margin-bottom:var(--space-3); flex-wrap:wrap;">
              ${urgencyBadge(r.urgency)} ${r.needs_icu ? badge('badge-danger', 'ICU bed required') : ''}
              <span class="text-sm text-muted">Sent ${minutesLabel(r.minutes_ago)} ago by ${esc(r.requested_by_name || 'care team')}</span>
            </div>
            <div class="alert alert-info">This summary was shared with the patient's consent${r.consent_note ? ` (${esc(r.consent_note)})` : ''}. Your access has been recorded in the audit trail.</div>
            <pre class="tc-summary">${esc(r.clinical_summary)}</pre>
            ${canRespond ? `
              <div class="field">
                <label for="tc-note">Note to the sending team</label>
                <textarea id="tc-note" maxlength="255" placeholder="e.g. Bed 4 in Neuro ICU reserved, send ambulance to Gate 2"></textarea>
              </div>
              <div class="flex gap-2 justify-between">
                <button class="btn btn-outline" id="tc-decline">Decline</button>
                <button class="btn btn-primary" id="tc-accept">Accept patient</button>
              </div>` : `<p class="text-muted text-sm mb-0">This request is no longer waiting for your answer.</p>`}
          </div>
        </div>`;
      const close = () => { modalRoot.innerHTML = ''; };
      document.getElementById('tc-close').addEventListener('click', close);
      document.getElementById('tc-backdrop').addEventListener('click', (e) => { if (e.target.id === 'tc-backdrop') close(); });
      if (canRespond) {
        const respond = async (decision) => {
          const note = document.getElementById('tc-note').value.trim();
          if (decision === 'decline' && !note) return toast.error('Add a short note so the sender knows why.');
          try {
            const { message } = await api.post(`/transfers/offers/${offer.offer_id}/respond`, { decision, note: note || null });
            toast.success(message);
            close();
            onDone();
          } catch (err) {
            toast.error(err.message);
            onDone();
          }
        };
        document.getElementById('tc-accept').addEventListener('click', () => respond('accept'));
        document.getElementById('tc-decline').addEventListener('click', () => respond('decline'));
      }
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return { esc, renderWizard, renderOutgoing, renderIncoming, minutesLabel };
})();
