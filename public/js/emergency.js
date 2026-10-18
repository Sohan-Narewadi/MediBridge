// Emergency Connect: the signed-in patient's critical details on one page.
// Used by /patient/emergency.html and the profile section of /emergency.html.
// Depends on api.js and toast.js.
const MB_EMERGENCY = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GENDER = { male: 'Male', female: 'Female', other: 'Other' };

  const parseDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (iso) => parseDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const splitList = (s) => String(s || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function ageOf(dob) {
    if (!dob) return null;
    const d = parseDate(dob); const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a -= 1;
    return a;
  }

  const placeholder = (msg) => `<div class="data-placeholder">${msg}</div>`;
  const row = (title, detail, meta) => `
    <div class="fact-row">
      <div class="fact-main"><strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ''}</div>
      ${meta ? `<div class="fact-meta">${esc(meta)}</div>` : ''}
    </div>`;

  function shell({ callout }) {
    return `
    <div class="emergency-shell">
      ${callout ? `
      <section class="emergency-topline">
        <div>
          <div class="eyebrow-label">MEDIBRIDGE &middot; EMERGENCY CONNECT</div>
          <h1>Critical information.<br><em>Without the guesswork.</em></h1>
          <p class="emergency-intro">A concise, patient-specific handover for the moments when explaining your history is difficult.</p>
        </div>
        <div class="profile-status" id="em-status">
          <span class="status-pulse" aria-hidden="true"></span>
          <span><strong id="em-status-title">Loading profile</strong><small id="em-status-sub">Fetching your saved details</small></span>
        </div>
      </section>

      <section class="emergency-callout" aria-labelledby="em-urgent">
        <div class="callout-symbol" aria-hidden="true">!</div>
        <div class="callout-copy">
          <div class="callout-kicker">If this is happening now</div>
          <h2 id="em-urgent">Call emergency services first.</h2>
          <p>MediBridge does not dispatch an ambulance and this page is not a diagnosis or a substitute for emergency care.</p>
        </div>
        <div class="callout-actions no-print">
          <a class="emergency-call-button" href="tel:112" aria-label="Call India's emergency number 112">Call 112 <span aria-hidden="true">&nearr;</span></a>
          <span>Ambulance: <a href="tel:108">108</a></span>
        </div>
      </section>` : ''}

      <section class="patient-banner" aria-labelledby="em-name">
        <div class="patient-avatar" id="em-avatar" aria-hidden="true">?</div>
        <div class="patient-primary">
          <div class="eyebrow-label">PATIENT IDENTIFICATION</div>
          <h2 id="em-name">Loading&hellip;</h2>
          <div class="patient-meta" id="em-meta"></div>
        </div>
        <div class="patient-quickfacts" aria-label="Key patient facts">
          <div><span>Blood group</span><strong id="em-blood">&ndash;</strong></div>
          <div><span>Known allergies</span><strong id="em-allergy-n">&ndash;</strong></div>
          <div><span>Current medicines</span><strong id="em-med-n">&ndash;</strong></div>
        </div>
      </section>

      <div class="emergency-grid">
        <section class="emergency-card critical-card" aria-labelledby="em-h-allergy">
          <div class="section-heading">
            <div class="section-icon allergy-icon" aria-hidden="true">!</div>
            <div><div class="eyebrow-label">PRIORITY 01</div><h2 id="em-h-allergy">Allergies &amp; reactions</h2></div>
            <span class="section-tag tag-critical">Tell clinicians first</span>
          </div>
          <div id="em-allergies" class="fact-list"></div>
          <p class="section-footnote">A blank list does not mean &ldquo;no allergies&rdquo;. Confirm with the patient or their clinician.</p>
        </section>

        <section class="emergency-card" aria-labelledby="em-h-meds">
          <div class="section-heading">
            <div class="section-icon meds-icon" aria-hidden="true">Rx</div>
            <div><div class="eyebrow-label">PRIORITY 02</div><h2 id="em-h-meds">Current medication</h2></div>
          </div>
          <div id="em-meds" class="fact-list"></div>
          <p class="section-footnote">Ask for the last dose time. Do not stop or change medicines based on this page.</p>
        </section>

        <section class="emergency-card" aria-labelledby="em-h-cond">
          <div class="section-heading">
            <div class="section-icon condition-icon" aria-hidden="true">+</div>
            <div><div class="eyebrow-label">PRIORITY 03</div><h2 id="em-h-cond">Conditions &amp; clinical notes</h2></div>
          </div>
          <div id="em-conditions" class="fact-list"></div>
        </section>

        <section class="emergency-card" aria-labelledby="em-h-contact">
          <div class="section-heading">
            <div class="section-icon contact-icon" aria-hidden="true">&nearr;</div>
            <div><div class="eyebrow-label">PRIORITY 04</div><h2 id="em-h-contact">Emergency contact</h2></div>
          </div>
          <div id="em-contacts" class="fact-list"></div>
          <a class="subtle-link no-print" href="/patient/profile.html">Review your profile <span aria-hidden="true">&rarr;</span></a>
        </section>

        <section class="emergency-card records-card" aria-labelledby="em-h-rec">
          <div class="section-heading">
            <div class="section-icon records-icon" aria-hidden="true">&#9636;</div>
            <div><div class="eyebrow-label">RECENT CONTEXT</div><h2 id="em-h-rec">Latest medical records</h2></div>
            <a class="subtle-link no-print" href="/patient/medical-records.html">View all <span aria-hidden="true">&rarr;</span></a>
          </div>
          <div id="em-records" class="record-list"></div>
        </section>

        <section class="emergency-card handover-card no-print" aria-labelledby="em-h-share">
          <div class="section-heading">
            <div class="section-icon handover-icon" aria-hidden="true">&nearr;</div>
            <div><div class="eyebrow-label">HANDOVER</div><h2 id="em-h-share">Share a clear summary</h2></div>
          </div>
          <p class="handover-copy">Give a clinician a concise snapshot of the information currently on this page.</p>
          <div class="handover-actions">
            <button class="btn btn-primary" type="button" id="em-print">Print / Save PDF</button>
            <button class="btn btn-outline" type="button" id="em-copy">Copy summary</button>
          </div>
          <div class="privacy-note"><span aria-hidden="true">&#9672;</span><p><strong>Share deliberately.</strong> This summary contains sensitive health information. Share it only with the patient's consent or where the law permits for emergency care.</p></div>
        </section>
      </div>

      <section class="freshness-bar no-print" aria-label="Data freshness">
        <div class="freshness-mark" aria-hidden="true">&check;</div>
        <div><strong id="em-fresh-title">Data status: checking&hellip;</strong><p id="em-fresh-copy">Retrieving the latest information for your account.</p></div>
        <button class="btn btn-outline btn-sm" type="button" id="em-refresh">Refresh details</button>
      </section>

      <p class="emergency-disclaimer">MediBridge is a college project using fictional demonstration data. It is not a certified emergency medical record. Always verify critical information with the patient, a caregiver or the treating clinician.</p>
    </div>`;
  }

  function mount(root, { callout = true } = {}) {
    root.innerHTML = shell({ callout });
    const $ = (id) => root.querySelector(`#${id}`);
    let summary = '';

    function setStatus(ready, title, sub) {
      const box = $('em-status');
      if (!box) return;
      box.classList.toggle('is-ready', ready);
      $('em-status-title').textContent = title;
      $('em-status-sub').textContent = sub;
    }

    function render(p, allMeds, allRecords) {
      const today = new Date().toISOString().slice(0, 10);
      const meds = allMeds.filter((m) => m.is_active && String(m.start_date).slice(0, 10) <= today && (!m.end_date || String(m.end_date).slice(0, 10) >= today));
      const allergies = splitList(p.allergies);
      const conditions = splitList(p.chronic_conditions);
      const records = allRecords.slice(0, 3);
      const age = ageOf(p.date_of_birth);
      const pid = `MB-${String(p.id).padStart(6, '0')}`;

      $('em-name').textContent = p.full_name;
      $('em-avatar').innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : esc(initials(p.full_name));
      const bits = [
        age != null ? `${age} years` : '',
        p.gender ? GENDER[p.gender] || '' : '',
        p.phone ? `Phone: ${p.phone}` : '',
        p.city || '',
        p.height_cm ? `${Number(p.height_cm)} cm` : '',
        p.weight_kg ? `${Number(p.weight_kg)} kg` : '',
        `ID: ${pid}`,
      ].filter(Boolean);
      $('em-meta').innerHTML = bits.map((b) => `<span>${esc(b)}</span>`).join('');
      $('em-blood').textContent = p.blood_group || 'Not recorded';
      $('em-allergy-n').textContent = allergies.length ? `${allergies.length} recorded` : 'None recorded';
      $('em-med-n').textContent = meds.length ? `${meds.length} active` : 'None recorded';

      $('em-allergies').innerHTML = allergies.length
        ? allergies.map((a) => row(a)).join('')
        : placeholder('No allergies recorded. This is not confirmation that the patient has none. <a href="/patient/profile.html">Add in profile</a>');
      $('em-meds').innerHTML = meds.length
        ? meds.map((m) => row(m.medicine_name, [m.dosage, m.frequency].filter(Boolean).join(' · '), m.end_date ? `until ${fmtDate(m.end_date)}` : '')).join('')
        : placeholder('No active medicines on file. Ask the patient or a caregiver about medicines and the last dose.');
      const recDx = [...new Set(allRecords.map((r) => r.diagnosis).filter(Boolean))].slice(0, 4);
      const condRows = [...conditions.map((c) => row(c, 'Chronic condition (profile)')), ...recDx.filter((d) => !conditions.includes(d)).map((d) => row(d, 'From a recent consultation'))];
      $('em-conditions').innerHTML = condRows.length ? condRows.join('') : placeholder('No conditions or diagnoses recorded. Verify directly with the patient or clinician.');
      $('em-contacts').innerHTML = p.emergency_contact_name
        ? `<div class="fact-row"><div class="fact-main"><strong>${esc(p.emergency_contact_name)}</strong><p>${esc(p.emergency_contact_phone || 'No number recorded')}</p></div>
            ${p.emergency_contact_phone ? `<a class="btn btn-outline btn-sm no-print" href="tel:${esc(p.emergency_contact_phone.replace(/[^+\d]/g, ''))}">Call</a>` : ''}</div>`
        : placeholder('No emergency contact recorded. <a href="/patient/profile.html">Add one in your profile</a>');
      $('em-records').innerHTML = records.length
        ? records.map((r) => `<article class="record-item"><div class="record-date">${esc(fmtDate(r.record_date))}</div><strong>${esc(r.diagnosis || 'Consultation')}</strong>${r.doctor_name ? `<p>${esc(r.doctor_name)}</p>` : ''}</article>`).join('')
        : placeholder('No medical records yet.');

      summary = [
        `EMERGENCY SUMMARY (MediBridge, ${new Date().toLocaleDateString()})`,
        `Name: ${p.full_name}`,
        `Patient ID: ${pid}`,
        age != null ? `Age: ${age} years (DOB ${fmtDate(p.date_of_birth)})` : null,
        p.gender ? `Gender: ${GENDER[p.gender] || 'Not stated'}` : null,
        `Blood group: ${p.blood_group || 'Not recorded'}`,
        `Allergies: ${allergies.length ? allergies.join(', ') : 'None recorded'}`,
        `Conditions: ${conditions.length ? conditions.join(', ') : 'None recorded'}`,
        `Current medications: ${meds.length ? meds.map((m) => `${m.medicine_name} (${m.dosage}, ${m.frequency})`).join('; ') : 'None recorded'}`,
        p.emergency_contact_name ? `Emergency contact: ${p.emergency_contact_name}${p.emergency_contact_phone ? `, ${p.emergency_contact_phone}` : ''}` : 'Emergency contact: Not recorded',
        p.height_cm || p.weight_kg ? `Height / weight: ${p.height_cm ? `${Number(p.height_cm)} cm` : '-'} / ${p.weight_kg ? `${Number(p.weight_kg)} kg` : '-'}` : null,
        '',
        'Verify with the patient, caregiver or clinician. Not a certified medical record. In India call 112 (ambulance 108).',
      ].filter((l) => l !== null).join('\n');

      setStatus(true, 'Profile loaded', 'Some fields may still be unrecorded');
      $('em-fresh-title').textContent = 'Data status: fetched just now';
      $('em-fresh-copy').textContent = `Loaded ${allRecords.length} medical record(s) and ${meds.length} active medicine(s). Verify critical facts before relying on them.`;
    }

    async function load() {
      const btn = $('em-refresh');
      btn.disabled = true;
      $('em-fresh-title').textContent = 'Data status: checking…';
      try {
        const [{ profile }, medsRes, recRes] = await Promise.all([
          api.get('/users/me/profile'),
          api.get('/medications').catch(() => ({ medications: [] })),
          api.get('/medical-records').catch(() => ({ records: [] })),
        ]);
        render(profile, medsRes.medications || [], recRes.records || []);
      } catch (err) {
        setStatus(false, 'Could not load', 'Patient information is protected');
        $('em-fresh-title').textContent = 'Data status: not available';
        $('em-fresh-copy').textContent = `${err.message} For an immediate emergency, call 112 first.`;
        ['em-allergies', 'em-meds', 'em-conditions', 'em-contacts', 'em-records'].forEach((id) => { $(id).innerHTML = placeholder('Unavailable right now.'); });
      } finally {
        btn.disabled = false;
      }
    }

    $('em-refresh').addEventListener('click', load);
    $('em-print').addEventListener('click', () => window.print());
    $('em-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(summary); toast.success('Summary copied.'); }
      catch (err) {
        const ta = document.createElement('textarea'); ta.value = summary; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast.success('Summary copied.'); } catch (e2) { toast.error('Could not copy. Use Print instead.'); }
        ta.remove();
      }
    });
    load();
  }

  return { mount };
})();
