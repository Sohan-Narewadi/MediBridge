/* Emergency Connect: uses existing MediBridge endpoints and renders only data returned by the signed-in account. */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { user: null, profile: null, records: [], prescriptions: [], medications: [] };

  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const key of keys) {
      const value = obj[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }
  function listFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['data', 'items', 'records', 'medicalRecords', 'prescriptions', 'medications', 'results']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  }
  async function getJson(path) {
    const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  }
  function safe(value, fallback = 'Not recorded') {
    return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
  }
  function textNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  function placeholder(containerId, message) {
    $(containerId).replaceChildren(textNode('div', 'data-placeholder', message));
  }
  function renderRows(containerId, items, emptyMessage, mapper) {
    const container = $(containerId);
    container.replaceChildren();
    if (!items.length) {
      container.append(textNode('div', 'data-placeholder', emptyMessage));
      return;
    }
    items.forEach((item) => {
      const row = textNode('div', 'fact-row', '');
      const main = textNode('div', 'fact-main', '');
      const title = textNode('strong', '', safe(mapper.title(item)));
      main.append(title);
      const detail = mapper.detail(item);
      if (detail) main.append(textNode('p', '', detail));
      row.append(main);
      const meta = mapper.meta(item);
      if (meta) row.append(textNode('div', 'fact-meta', meta));
      container.append(row);
    });
  }
  function renderRecords(records) {
    const container = $('record-list');
    container.replaceChildren();
    if (!records.length) {
      container.append(textNode('div', 'data-placeholder', 'No medical records were returned for this account. If a recent visit or diagnosis is missing, verify it with the treating clinician.'));
      return;
    }
    records.slice(0, 6).forEach((record) => {
      const item = textNode('article', 'record-item', '');
      const date = pick(record, ['record_date', 'date', 'created_at', 'createdAt', 'appointment_date']);
      item.append(textNode('div', 'record-date', safe(date ? new Date(date).toLocaleDateString() : '', 'Date not recorded')));
      item.append(textNode('strong', '', safe(pick(record, ['diagnosis', 'title', 'record_type', 'type', 'consultation_summary']), 'Medical record')));
      const note = pick(record, ['notes', 'summary', 'consultation_summary', 'doctor_name', 'follow_up_date']);
      if (note) item.append(textNode('p', '', note));
      container.append(item);
    });
  }
  function extractProfile(payload) {
    if (!payload || typeof payload !== 'object') return {};
    return payload.data || payload.user || payload.profile || payload.patient || payload;
  }
  function renderProfile() {
    const p = state.profile || {};
    const u = state.user || {};
    const fullName = pick(p, ['full_name', 'fullName', 'name', 'patient_name']) ||
      [pick(u, ['first_name', 'firstName']), pick(u, ['last_name', 'lastName'])].filter(Boolean).join(' ') ||
      pick(u, ['name', 'full_name', 'fullName']);
    $('patient-name').textContent = safe(fullName, 'Patient profile');
    $('patient-avatar').textContent = fullName ? fullName.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() : '?';

    const age = pick(p, ['age']);
    const dob = pick(p, ['date_of_birth', 'dateOfBirth', 'dob', 'birth_date']);
    const gender = pick(p, ['gender', 'sex']);
    const phone = pick(p, ['phone', 'phone_number', 'phoneNumber', 'mobile']);
    const meta = $('patient-meta');
    meta.replaceChildren();
    [age ? `${age} years` : (dob ? `DOB: ${new Date(dob).toLocaleDateString()}` : ''),
      gender, phone ? `Phone: ${phone}` : '', pick(p, ['patient_id', 'patientId', 'id']) ? `Patient ID: ${pick(p, ['patient_id', 'patientId', 'id'])}` : '']
      .filter(Boolean).forEach(item => meta.append(textNode('span', '', item)));
    if (!meta.childElementCount) meta.append(textNode('span', '', 'Add patient identity details in your profile'));

    const blood = pick(p, ['blood_group', 'bloodGroup', 'blood_type', 'bloodType']);
    $('blood-group').textContent = safe(blood);
    const allergies = normaliseAllergies(p);
    $('allergy-count').textContent = allergies.length ? `${allergies.length} recorded` : 'Not confirmed';
    const meds = [...state.medications, ...state.prescriptions];
    $('medicine-count').textContent = meds.length ? `${new Set(meds.map(m => pick(m, ['medicine_name','medication_name','name','drug_name','medicine','drug'])).filter(Boolean)).size || meds.length} listed` : 'Not confirmed';

    renderRows('allergy-list', allergies, 'No allergy data was found. This is not confirmation that the patient has no allergies.', {
      title: x => pick(typeof x === 'string' ? { name:x } : x, ['name','allergen','allergy','substance','title']),
      detail: x => pick(typeof x === 'string' ? {} : x, ['reaction','reaction_description','severity','notes','response']),
      meta: x => pick(typeof x === 'string' ? {} : x, ['severity'])
    });

    const medItems = dedupe([...state.medications, ...state.prescriptions]);
    renderRows('medication-list', medItems, 'No current medication list was returned. Ask the patient or caregiver about medicines and the last dose.', {
      title: x => pick(x, ['medicine_name','medication_name','name','drug_name','medicine','drug','medication']),
      detail: x => [pick(x, ['dosage','dose','strength']), pick(x, ['frequency','instructions','schedule']), pick(x, ['route'])].filter(Boolean).join(' · '),
      meta: x => pick(x, ['status','duration'])
    });

    const conditions = normaliseConditions(p);
    const recordConditions = state.records.filter(r => pick(r, ['diagnosis','condition','diagnosis_name'])).map(r => ({
      name: pick(r, ['diagnosis','condition','diagnosis_name']),
      detail: [pick(r, ['doctor_name','clinician_name']), pick(r, ['record_date','date','created_at'])].filter(Boolean).join(' · ')
    }));
    renderRows('condition-list', dedupe([...conditions, ...recordConditions]), 'No condition or diagnosis was found in the available profile and recent records. Verify directly with the patient or clinician.', {
      title: x => typeof x === 'string' ? x : pick(x, ['name','condition','diagnosis','title']),
      detail: x => typeof x === 'string' ? '' : pick(x, ['detail','notes','status','severity']),
      meta: x => typeof x === 'string' ? '' : pick(x, ['status'])
    });

    const contacts = normaliseContacts(p);
    renderRows('contact-list', contacts, 'No emergency contact was found in the available profile. Ask the patient/caregiver and update the profile when appropriate.', {
      title: x => pick(x, ['name','full_name','fullName','contact_name','relationship']) || 'Emergency contact',
      detail: x => [pick(x, ['relationship','relation']), pick(x, ['phone','phone_number','mobile','number'])].filter(Boolean).join(' · '),
      meta: x => pick(x, ['priority','type'])
    });
    renderRecords(state.records);
  }
  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = (typeof item === 'string' ? item : JSON.stringify(item)).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function normaliseAllergies(p) {
    let values = pick(p, ['allergies','known_allergies','knownAllergies','allergy_list','allergyList']);
    if (typeof values === 'string') return values.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
    if (Array.isArray(values)) return values;
    const single = pick(p, ['allergy','allergen']);
    return single ? [single] : [];
  }
  function normaliseConditions(p) {
    let values = pick(p, ['conditions','chronic_conditions','chronicConditions','medical_conditions','medicalConditions','diagnoses']);
    if (typeof values === 'string') return values.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
    if (Array.isArray(values)) return values;
    const single = pick(p, ['condition','diagnosis']);
    return single ? [single] : [];
  }
  function normaliseContacts(p) {
    const values = pick(p, ['emergency_contacts','emergencyContacts','emergency_contact','emergencyContact','contacts']);
    if (Array.isArray(values)) return values;
    if (values && typeof values === 'object') return [values];
    const name = pick(p, ['emergency_contact_name','emergencyContactName','contact_name']);
    const phone = pick(p, ['emergency_contact_phone','emergencyContactPhone','contact_phone']);
    return name || phone ? [{ name, phone, relationship: pick(p, ['emergency_contact_relationship','emergencyContactRelationship']) }] : [];
  }
  async function load() {
    $('refresh-profile').disabled = true;
    $('freshness-title').textContent = 'Checking available patient data…';
    $('freshness-copy').textContent = 'Retrieving information from MediBridge.';
    try {
      const auth = await getJson('/api/auth/me');
      state.user = extractProfile(auth);
      const profileResult = await getJson('/api/users/me/profile').catch(() => null);
      state.profile = extractProfile(profileResult) || state.user;
      const [records, prescriptions, medications] = await Promise.all([
        getJson('/api/medical-records').catch(() => []),
        getJson('/api/prescriptions').catch(() => []),
        getJson('/api/medications?bucket=today').catch(() => [])
      ]);
      state.records = listFrom(records);
      state.prescriptions = listFrom(prescriptions);
      state.medications = listFrom(medications);
      renderProfile();
      $('profile-status').classList.add('is-ready');
      $('status-title').textContent = 'Signed-in profile loaded';
      $('status-subtitle').textContent = 'Some fields may still be unrecorded';
      $('freshness-title').textContent = 'Data status: fetched just now';
      $('freshness-copy').textContent = `Loaded ${state.records.length} medical record(s), ${state.prescriptions.length + state.medications.length} medication/prescription item(s). Verify critical facts before relying on them.`;
    } catch (error) {
      $('profile-status').classList.remove('is-ready');
      $('status-title').textContent = 'Sign-in required';
      $('status-subtitle').textContent = 'Patient-specific information is protected';
      $('freshness-title').textContent = 'Data status: not available';
      $('freshness-copy').textContent = 'Sign in to MediBridge, then refresh. For an immediate emergency, call 112 first.';
      placeholder('allergy-list', 'Sign in to view patient-specific allergy information.');
      placeholder('medication-list', 'Sign in to view available prescription and medication records.');
      placeholder('condition-list', 'Sign in to view patient-specific diagnoses and conditions.');
      placeholder('contact-list', 'Sign in to view saved emergency contacts, if recorded.');
      placeholder('record-list', 'Sign in to view recent medical records.');
      $('patient-name').textContent = 'Sign in to load your profile';
      $('patient-avatar').textContent = '?';
      $('patient-meta').replaceChildren(textNode('span', '', 'No patient data is displayed while signed out'));
      $('blood-group').textContent = 'Not recorded';
      $('allergy-count').textContent = 'Not confirmed';
      $('medicine-count').textContent = 'Not confirmed';
    } finally {
      $('refresh-profile').disabled = false;
    }
  }
  function makeSummary() {
    const lines = [
      'MEDIBRIDGE — EMERGENCY HANDOVER SUMMARY',
      `Patient: ${$('patient-name').textContent}`,
      `Identity: ${$('patient-meta').innerText || 'Not recorded'}`,
      `Blood group: ${$('blood-group').textContent}`,
      `Allergies: ${$('allergy-list').innerText}`,
      `Current medication: ${$('medication-list').innerText}`,
      `Conditions and notes: ${$('condition-list').innerText}`,
      `Emergency contacts: ${$('contact-list').innerText}`,
      `Recent records: ${$('record-list').innerText}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'Important: verify information with the patient/caregiver/clinician. This is not a certified medical record or a diagnosis. In India, call 112 for an emergency.'
    ];
    return lines.join('\n');
  }
  $('refresh-profile').addEventListener('click', load);
  $('print-summary').addEventListener('click', () => window.print());
  $('copy-summary').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(makeSummary());
      if (window.MBToast && typeof window.MBToast.success === 'function') window.MBToast.success('Emergency summary copied.');
      else $('freshness-copy').textContent = 'Summary copied. Share it only with the patient’s consent or where legally permitted.';
    } catch {
      const area = document.createElement('textarea');
      area.value = makeSummary(); area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      const copied = document.execCommand('copy'); area.remove();
      $('freshness-copy').textContent = copied ? 'Summary copied. Share it carefully.' : 'Copy was blocked by your browser. Use Print / Save PDF instead.';
    }
  });
  load();
})();
