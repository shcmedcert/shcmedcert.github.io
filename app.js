// ============================================================
// MedCert online — app logic (runs in the browser, talks to Supabase
// through window.api, see web-api.js). In-page dialogs below are used
// instead of alert/confirm.
// ============================================================
const modalOverlay = document.getElementById('modal-overlay');
const modalMessage = document.getElementById('modal-message');
const modalActions = document.getElementById('modal-actions');

function showToast(message) {
  return new Promise((resolve) => {
    modalMessage.textContent = message;
    modalActions.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.className = 'btn primary';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => { modalOverlay.style.display = 'none'; resolve(); };
    modalActions.appendChild(okBtn);
    modalOverlay.style.display = 'flex';
    okBtn.focus();
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    modalMessage.textContent = message;
    modalActions.innerHTML = '';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => { modalOverlay.style.display = 'none'; resolve(false); };
    const okBtn = document.createElement('button');
    okBtn.className = 'btn primary';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => { modalOverlay.style.display = 'none'; resolve(true); };
    modalActions.appendChild(cancelBtn);
    modalActions.appendChild(okBtn);
    modalOverlay.style.display = 'flex';
    okBtn.focus();
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Wraps a task that talks to the server so a network/permission error is
// shown in a dialog instead of failing silently.
async function guarded(fn) {
  try { return await fn(); }
  catch (err) { await showToast('Something went wrong:\n\n' + (err && err.message ? err.message : err)); return undefined; }
}

// ---------- Tab switching ----------
const navBtns = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab');
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
    if (btn.dataset.tab === 'patients') loadPatients();
    if (btn.dataset.tab === 'settings') { loadSettingsIntoForm(); refreshSettingsPreview(); }
    if (btn.dataset.tab === 'new') refreshCertPreview();
    if (btn.dataset.tab === 'users') loadUsers();
    if (btn.dataset.tab === 'verify') document.getElementById('verify-query').focus();
  });
});

// ---------- Helpers ----------
function val(id) { return document.getElementById(id).value.trim(); }
function setVal(id, v) { document.getElementById(id).value = v || ''; }

let physiciansList = [];
let currentSettings = null;

function collectCertForm() {
  const physicianId = val('f-physician');
  const physician = physiciansList.find(p => p.id === physicianId) || {};
  return {
    name: val('f-name'),
    age: val('f-age'),
    addressMode: val('f-addr-mode') || 'samal',
    addressOther: val('f-address-other'),
    purok: val('f-purok'),
    barangay: val('f-barangay'),
    district: val('f-district'),
    dateExamined: val('f-date-examined'),
    diagnosis: val('f-diagnosis'),
    remarks: val('f-remarks'),
    dateIssuedDay: val('f-day'),
    dateIssuedMonth: val('f-month'),
    dateIssuedYear: val('f-year'),
    purposePronoun: val('f-pronoun'),
    physicianId: physicianId || null,
    physicianName: physician.name || '',
    physicianTitle: physician.title || '',
    physicianLicense: physician.license || '',
    physicianPtr: physician.ptr || ''
  };
}

// ---------- Address mode (Samal Island vs. other / blank) ----------
function applyAddressMode() {
  const other = document.getElementById('f-addr-mode').value === 'other';
  document.querySelectorAll('.samal-only').forEach(el => { el.style.display = other ? 'none' : ''; });
  document.querySelectorAll('.other-only').forEach(el => { el.style.display = other ? '' : 'none'; });
}
document.getElementById('f-addr-mode').addEventListener('change', applyAddressMode);
document.getElementById('cert-form').addEventListener('reset', () => setTimeout(() => { applyAddressMode(); refreshCertPreview(); }, 0));

// ---------- Patient autofill ----------
const nameInput = document.getElementById('f-name');
const suggestionsBox = document.getElementById('patient-suggestions');

nameInput.addEventListener('input', async () => {
  const q = nameInput.value.trim();
  if (!q) { suggestionsBox.classList.remove('show'); return; }
  const results = await window.api.searchPatients(q);
  if (!results.length) { suggestionsBox.classList.remove('show'); return; }
  suggestionsBox.innerHTML = results.map(p =>
    `<div data-id="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.barangay || p.addressOther || '')}</div>`
  ).join('');
  suggestionsBox.classList.add('show');
});

suggestionsBox.addEventListener('click', (e) => {
  const div = e.target.closest('div[data-id]');
  if (!div) return;
  window.api.searchPatients(nameInput.value).then(results => {
    const p = results.find(r => r.id === div.dataset.id);
    if (p) {
      setVal('f-name', p.name);
      setVal('f-age', p.age);
      document.getElementById('f-addr-mode').value = p.addressMode || 'samal';
      setVal('f-address-other', p.addressOther);
      applyAddressMode();
      setVal('f-purok', p.purok);
      setVal('f-barangay', p.barangay);
      setVal('f-district', p.district);
    }
    suggestionsBox.classList.remove('show');
    refreshCertPreview();
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrap')) suggestionsBox.classList.remove('show');
});

// ---------- Paper size + true-shape preview ----------
// The preview shows the whole sheet, shrunk to fit its box, so what you see
// has the same shape as the paper you will print on.
function fitPreview(frame, settings) {
  const p = window.PAPER_SIZES[settings.paperSize] || window.PAPER_SIZES.letter;
  const wrap = frame.parentElement;
  const avail = Math.max(200, wrap.clientWidth - 24);
  const k = Math.min(1, avail / p.w);
  frame.style.cssText = 'width:' + p.w + 'px;height:' + p.h + 'px;transform:scale(' + k + ');transform-origin:top left;' +
    'margin-bottom:' + (-(p.h * (1 - k))) + 'px;border:1px solid #c7cfd8;background:#fff;display:block;';
  frame.dataset.paper = settings.paperSize || 'letter';
}
window.addEventListener('resize', debounce(() => { refreshCertPreview(); refreshSettingsPreview(); }, 200));

function initPaperSelects() {
  const chosen = window.api.paper.get() || (currentSettings && currentSettings.paperSize) || 'letter';
  document.querySelectorAll('.paper-select').forEach(sel => { sel.value = chosen; });
}
document.querySelectorAll('.paper-select').forEach(sel => {
  sel.addEventListener('change', () => {
    window.api.paper.set(sel.value);
    document.querySelectorAll('.paper-select').forEach(o => { o.value = sel.value; });
    refreshCertPreview();
  });
});

// ---------- Live preview: New Certificate ----------
const certPreviewFrame = document.getElementById('cert-preview-frame');
const refreshCertPreview = debounce(async () => {
  if (!currentSettings) currentSettings = await window.api.getSettings();
  const cert = collectCertForm();
  const effective = window.api.paper.apply(currentSettings);
  const html = await window.api.previewHtml(effective, cert);
  fitPreview(certPreviewFrame, effective);
  certPreviewFrame.srcdoc = html;
}, 300);

document.getElementById('cert-form').addEventListener('input', refreshCertPreview);
document.getElementById('cert-form').addEventListener('change', refreshCertPreview);

// ---------- Edit-certificate state ----------
let editingCertId = null;

function enterEditMode(cert) {
  editingCertId = cert.id;
  setVal('f-name', cert.name);
  setVal('f-age', cert.age);
  document.getElementById('f-addr-mode').value = cert.addressMode || 'samal';
  setVal('f-address-other', cert.addressOther);
  applyAddressMode();
  setVal('f-purok', cert.purok);
  setVal('f-barangay', cert.barangay);
  setVal('f-district', cert.district);
  setVal('f-date-examined', cert.dateExamined);
  setVal('f-diagnosis', cert.diagnosis);
  setVal('f-remarks', cert.remarks);
  setVal('f-day', cert.dateIssuedDay);
  setVal('f-month', cert.dateIssuedMonth);
  setVal('f-year', cert.dateIssuedYear);
  document.getElementById('f-pronoun').value = cert.purposePronoun || 'her';
  if (cert.physicianId) document.getElementById('f-physician').value = cert.physicianId;

  document.getElementById('editing-banner').style.display = 'flex';
  document.getElementById('btn-save-cert').textContent = 'Update & Print';
  document.querySelector('[data-tab="new"]').click();
  refreshCertPreview();
}

function exitEditMode() {
  editingCertId = null;
  document.getElementById('editing-banner').style.display = 'none';
  document.getElementById('btn-save-cert').textContent = 'Save & Print';
  document.getElementById('cert-form').reset();
  refreshCertPreview();
}

document.getElementById('btn-cancel-edit').addEventListener('click', exitEditMode);

// ---------- New Certificate form ----------
document.getElementById('cert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cert = collectCertForm();
  if (!cert.name) { await showToast('Patient name is required.'); return; }

  const saveBtn = document.getElementById('btn-save-cert');
  saveBtn.disabled = true;
  try {
    const wasEditing = !!editingCertId;
    const saved = wasEditing
      ? await window.api.updateCertificate(editingCertId, cert)
      : await window.api.addCertificate(cert);
    await window.api.exportPdf(saved.id);   // opens the print window
    await showToast(
      (wasEditing ? 'Certificate updated.' : 'Certificate saved.') +
      '\n\nCertificate No. ' + (saved.controlNumber || '') +
      '\n\nIn the print window, choose your printer — or "Save as PDF" to keep a PDF file. (If it did not open, allow pop-ups/printing for this site and use History > Save & Print.)'
    );
    exitEditMode();
  } catch (err) {
    await showToast('Could not save the certificate:\n\n' + (err && err.message ? err.message : err));
  } finally {
    saveBtn.disabled = false;
  }
});

document.getElementById('btn-preview').addEventListener('click', async () => {
  const cert = collectCertForm();
  if (!cert.name) { await showToast('Enter a patient name first.'); return; }
  await guarded(() => window.api.previewExportPdf(cert));
});

// ---------- History ----------
let historyCache = [];

async function loadHistory() {
  historyCache = await window.api.listCertificates();
  renderHistory(historyCache);
}

function renderHistory(list) {
  const body = document.getElementById('history-body');
  body.innerHTML = list.map(c => {
    const cancelled = c.status === 'cancelled';
    return `
    <tr${cancelled ? ' class="row-cancelled"' : ''}>
      <td>${escapeHtml(c.controlNumber)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.age)}</td>
      <td>${escapeHtml(c.dateExamined)}</td>
      <td>${escapeHtml([c.dateIssuedDay, c.dateIssuedMonth, c.dateIssuedYear].filter(Boolean).join(' '))}</td>
      <td>${cancelled ? '<span class="badge bad">Cancelled</span>' : '<span class="badge good">Valid</span>'}</td>
      <td>
        <button class="btn secondary" data-action="edit" data-id="${c.id}">Edit</button>
        <button class="btn secondary" data-action="reprint" data-id="${c.id}">Save &amp; Print</button>
        <button class="btn ghost" data-action="${cancelled ? 'reinstate' : 'cancel'}" data-id="${c.id}">${cancelled ? 'Reinstate' : 'Cancel'}</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">No certificates yet.</td></tr>';
}

document.getElementById('history-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'edit') {
    const cert = historyCache.find(c => c.id === id);
    if (cert) enterEditMode(cert);
  } else if (btn.dataset.action === 'reprint') {
    await guarded(() => window.api.exportPdf(id));
  } else if (btn.dataset.action === 'cancel') {
    if (await showConfirm('Cancel this certificate? Its QR page will show CANCELLED and any reprint is watermarked CANCELLED. You can reinstate it later.')) {
      await guarded(() => window.api.setCertificateStatus(id, 'cancelled'));
      loadHistory();
    }
  } else if (btn.dataset.action === 'reinstate') {
    await guarded(() => window.api.setCertificateStatus(id, 'valid'));
    loadHistory();
  }
});

document.getElementById('history-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderHistory(historyCache.filter(c => (c.name || '').toLowerCase().includes(q) || (c.controlNumber || '').toLowerCase().includes(q)));
});

// ---------- Patients tab ----------
async function loadPatients() {
  const list = await window.api.listPatients();
  renderPatients(list);
}

function renderPatients(list) {
  const body = document.getElementById('patients-body');
  body.innerHTML = list.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.age)}</td>
      <td>${escapeHtml(p.purok)}</td>
      <td>${escapeHtml(p.barangay)}</td>
      <td>${escapeHtml(p.district)}</td>
      <td><button class="btn ghost" data-action="delete-patient" data-id="${p.id}">Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">No patients yet.</td></tr>';
}

document.getElementById('patients-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.action === 'delete-patient') {
    const row = btn.closest('tr');
    const name = row ? row.children[0].textContent.trim() : '';
    if (await showConfirm('Delete this patient record?\n\nThis only removes the saved patient (used for auto-fill). Certificates already issued stay valid and their QR codes keep saying GENUINE until you cancel them.')) {
      await guarded(async () => {
        await window.api.deletePatient(btn.dataset.id);
        const certs = (await window.api.listCertificates()).filter(c =>
          c.status !== 'cancelled' && String(c.name || '').trim().toLowerCase() === name.toLowerCase());
        if (certs.length && await showConfirm(
          name + ' still has ' + certs.length + ' valid certificate(s):\n' +
          certs.map(c => '• ' + c.controlNumber).join('\n') +
          '\n\nCancel them too? Their QR codes will then show CANCELLED. (You can reinstate them later in History.)')) {
          for (const c of certs) await window.api.setCertificateStatus(c.id, 'cancelled');
        }
      });
      loadPatients();
    }
  }
});

document.getElementById('patients-search').addEventListener('input', async (e) => {
  const list = await window.api.listPatients();
  const q = e.target.value.toLowerCase();
  renderPatients(list.filter(p => p.name.toLowerCase().includes(q)));
});

// ---------- Physicians ----------
let editingPhysicianId = null;

async function loadPhysicians() {
  physiciansList = await window.api.listPhysicians();
  renderPhysiciansTable();
  renderPhysicianSelect();
}

function renderPhysiciansTable() {
  const body = document.getElementById('physicians-body');
  body.innerHTML = physiciansList.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.license)}</td>
      <td>${escapeHtml(p.ptr)}</td>
      <td>
        <button class="btn ghost" data-action="edit-physician" data-id="${p.id}">Edit</button>
        <button class="btn ghost" data-action="delete-physician" data-id="${p.id}">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">No physicians saved yet.</td></tr>';
}

function renderPhysicianSelect() {
  const select = document.getElementById('f-physician');
  const previousValue = select.value;
  if (!physiciansList.length) {
    select.innerHTML = '<option value="">No physicians saved — add one in Settings</option>';
    return;
  }
  select.innerHTML = physiciansList.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name)}${p.license ? ' — Lic. ' + escapeHtml(p.license) : ''}</option>`
  ).join('');
  if (physiciansList.some(p => p.id === previousValue)) select.value = previousValue;
}

document.getElementById('physicians-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'edit-physician') {
    const p = physiciansList.find(x => x.id === id);
    if (!p) return;
    editingPhysicianId = p.id;
    setVal('p-name', p.name);
    setVal('p-title', p.title);
    setVal('p-license', p.license);
    setVal('p-ptr', p.ptr);
    document.getElementById('btn-save-physician').textContent = 'Update Physician';
    document.getElementById('btn-cancel-physician-edit').style.display = 'inline-block';
  } else if (btn.dataset.action === 'delete-physician') {
    if (await showConfirm('Delete this physician? Past certificates already keep their own copy of the physician info, so history is unaffected.')) {
      await window.api.deletePhysician(id);
      loadPhysicians();
    }
  }
});

document.getElementById('btn-cancel-physician-edit').addEventListener('click', () => {
  editingPhysicianId = null;
  document.getElementById('physician-form').reset();
  document.getElementById('btn-save-physician').textContent = 'Add Physician';
  document.getElementById('btn-cancel-physician-edit').style.display = 'none';
});

document.getElementById('physician-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = val('p-name');
  if (!name) { await showToast('Physician name is required.'); return; }
  const physicianPayload = {
    name,
    title: val('p-title'),
    license: val('p-license'),
    ptr: val('p-ptr')
  };
  if (editingPhysicianId) physicianPayload.id = editingPhysicianId; // omit entirely when adding new
  await window.api.upsertPhysician(physicianPayload);
  editingPhysicianId = null;
  document.getElementById('physician-form').reset();
  document.getElementById('btn-save-physician').textContent = 'Add Physician';
  document.getElementById('btn-cancel-physician-edit').style.display = 'none';
  loadPhysicians();
  refreshSettingsPreview();
});

// ---------- Settings ----------
const currentLogos = { 1: null, 2: null, 3: null };

async function loadSettingsIntoForm() {
  const s = await window.api.getSettings();
  currentSettings = s;
  setVal('s-orgName', s.orgName);
  setVal('s-orgSubtitle', s.orgSubtitle);
  setVal('s-officeLine', s.officeLine);
  setVal('s-cityProvince', s.cityProvince);
  setVal('s-closingVenue', s.closingVenue);
  setVal('s-footerAddress', s.footerAddress);
  setVal('s-footerEmail', s.footerEmail);
  setVal('s-footerTagline', s.footerTagline);
  setVal('s-controlPrefix', s.controlPrefix || 'MEDCERT');
  setVal('s-logo1Size', s.logo1Size || 70);
  setVal('s-logo2Size', s.logo2Size || 70);
  setVal('s-logo3Size', s.logo3Size || 70);
  setVal('s-paperSize', s.paperSize || 'letter');
  initPaperSelects();
  document.getElementById('s-qrEnabled').checked = !!s.qrEnabled;

  [1, 2, 3].forEach(n => {
    currentLogos[n] = s['logo' + n] || null;
    document.getElementById('logo' + n + '-preview').src = s['logo' + n] || '';
  });

  if (!physiciansList.length) await loadPhysicians();
}

[1, 2, 3].forEach(n => {
  document.getElementById('btn-logo' + n).addEventListener('click', async () => {
    const dataUrl = await window.api.pickLogo();
    if (dataUrl) {
      currentLogos[n] = dataUrl;
      document.getElementById('logo' + n + '-preview').src = dataUrl;
      refreshSettingsPreview();
    }
  });
  document.getElementById('btn-logo' + n + '-clear').addEventListener('click', () => {
    currentLogos[n] = null;
    document.getElementById('logo' + n + '-preview').src = '';
    refreshSettingsPreview();
  });
});

function collectSettingsDraft() {
  return {
    logo1: currentLogos[1],
    logo2: currentLogos[2],
    logo3: currentLogos[3],
    logo1Size: parseInt(val('s-logo1Size'), 10) || 70,
    logo2Size: parseInt(val('s-logo2Size'), 10) || 70,
    logo3Size: parseInt(val('s-logo3Size'), 10) || 70,
    paperSize: document.getElementById('s-paperSize').value || 'letter',
    orgName: val('s-orgName'),
    orgSubtitle: val('s-orgSubtitle'),
    officeLine: val('s-officeLine'),
    cityProvince: val('s-cityProvince'),
    closingVenue: val('s-closingVenue'),
    footerAddress: val('s-footerAddress'),
    footerEmail: val('s-footerEmail'),
    footerTagline: val('s-footerTagline'),
    controlPrefix: val('s-controlPrefix') || 'MEDCERT',
    templateMode: 'builtin',
    qrEnabled: document.getElementById('s-qrEnabled').checked
  };
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saved = await guarded(() => window.api.saveSettings(collectSettingsDraft()));
  if (!saved) return;
  currentSettings = saved;
  initPaperSelects();
  await showToast('Settings saved.');
  refreshCertPreview();
});

const settingsPreviewFrame = document.getElementById('settings-preview-frame');
const SAMPLE_CERT = {
  name: 'Juan Dela Cruz',
  age: '34 M',
  addressMode: 'samal',
  purok: '5',
  barangay: 'Sto. Niño',
  district: 'Babak',
  dateExamined: '09/29/2026',
  diagnosis: 'Normal P.E. Findings',
  remarks: 'For work purposes',
  dateIssuedDay: '29',
  dateIssuedMonth: 'September',
  dateIssuedYear: '2026',
  purposePronoun: 'his'
};
const refreshSettingsPreview = debounce(async () => {
  const draft = collectSettingsDraft();
  const samplePhysician = physiciansList[0] || {};
  const cert = {
    ...SAMPLE_CERT,
    physicianName: samplePhysician.name || 'Dr. Juan P. Reyes',
    physicianTitle: samplePhysician.title || 'Rural Health Physician',
    physicianLicense: samplePhysician.license || '0000000',
    physicianPtr: samplePhysician.ptr || ''
  };
  const html = await window.api.previewHtml(draft, cert);
  fitPreview(settingsPreviewFrame, draft);
  settingsPreviewFrame.srcdoc = html;
}, 300);

document.getElementById('settings-form').addEventListener('input', refreshSettingsPreview);
document.getElementById('settings-form').addEventListener('change', refreshSettingsPreview);

// ---------- Verify (staff look-up while on the phone) ----------
function fmtIssued(c) {
  return [c.dateIssuedMonth, c.dateIssuedDay, c.dateIssuedYear].filter(Boolean).join(' ');
}

async function runVerifySearch() {
  const q = val('verify-query');
  const box = document.getElementById('verify-results');
  if (!q) { box.innerHTML = ''; return; }
  const results = await guarded(() => window.api.verifyLookup(q));
  if (!results) return;
  if (!results.length) {
    box.innerHTML = '<p class="hint">No certificate matches that name or Certificate No. If someone claims to hold one, do not confirm it.</p>';
    return;
  }
  box.innerHTML = results.map(c => `
    <div class="verify-card">
      <div class="verify-card-row"><strong>${escapeHtml(c.controlNumber)}</strong> ${c.status === 'cancelled' ? '<span class="badge bad">CANCELLED</span>' : '<span class="badge good">Valid</span>'}</div>
      <div class="verify-card-row">Patient: ${escapeHtml(c.name)} (${escapeHtml(c.age)})</div>
      <div class="verify-card-row">Date Examined: ${escapeHtml(c.dateExamined)}</div>
      <div class="verify-card-row">Date Issued: ${escapeHtml(fmtIssued(c))}</div>
      <div class="verify-card-row">Physician: ${escapeHtml(c.physicianName)}${c.physicianLicense ? ' (Lic. ' + escapeHtml(c.physicianLicense) + ')' : ''}</div>
    </div>
  `).join('');
}

document.getElementById('btn-verify-search').addEventListener('click', runVerifySearch);
document.getElementById('verify-query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runVerifySearch();
});

// ---------- Users (admin only) ----------
let myEmail = '';
async function loadUsers() {
  await guarded(async () => {
    const list = await window.api.users.list();
    document.getElementById('users-body').innerHTML = list.map(u => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.role === 'admin' ? '<span class="badge good">Admin</span>' : 'Staff'}</td>
        <td>${u.role === 'admin' ? '' : `
          <button class="btn secondary" data-action="reset" data-email="${escapeHtml(u.email)}">Reset password</button>
          <button class="btn ghost" data-action="remove" data-email="${escapeHtml(u.email)}">Remove</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="3">No users.</td></tr>';
  });
}

document.getElementById('users-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const email = btn.dataset.email;
  if (btn.dataset.action === 'reset') {
    const pw = window.prompt('New temporary password for ' + email + ' (8+ characters):');
    if (!pw) return;
    await guarded(async () => { await window.api.users.reset(email, pw); await showToast('Password changed for ' + email + '.'); });
  } else if (btn.dataset.action === 'remove') {
    if (await showConfirm('Remove ' + email + '? They will no longer be able to log in. Certificates they made stay in the records.')) {
      await guarded(() => window.api.users.remove(email));
      loadUsers();
    }
  }
});

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, n => chars[n % chars.length]).join('');
}
document.getElementById('u-generate').addEventListener('click', () => {
  document.getElementById('u-password').value = randomPassword();
});

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = val('u-email'), pw = document.getElementById('u-password').value;
  await guarded(async () => {
    await window.api.users.add(email, pw);
    await showToast('User added.\n\nE-mail: ' + email + '\nTemporary password: ' + pw + '\n\nGive these to the person. They can change the password after logging in.');
    document.getElementById('user-form').reset();
    loadUsers();
  });
});

document.getElementById('btn-chpw').addEventListener('click', async () => {
  const pw = window.prompt('Type your new password (8+ characters):');
  if (!pw) return;
  if (pw.length < 8) { await showToast('Password must be at least 8 characters.'); return; }
  await guarded(async () => { await window.api.auth.changeOwnPassword(pw); await showToast('Your password was changed.'); });
});

// ---------- Login + start-up ----------
const loginOverlay = document.getElementById('login-overlay');
let started = false;

async function startApp() {
  if (started) return;
  started = true;
  await guarded(async () => {
    currentSettings = await window.api.getSettings();
    initPaperSelects();
    await loadPhysicians();
    await loadSettingsIntoForm();
    refreshCertPreview();
    refreshSettingsPreview();
  });
}

function showLogin(note) {
  document.getElementById('login-note').textContent = note || 'Staff login';
  loginOverlay.style.display = 'flex';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('login-submit');
  errBox.textContent = '';
  btn.disabled = true;
  try {
    await window.api.auth.signIn(val('login-email'), document.getElementById('login-password').value);
    document.getElementById('login-password').value = '';
    await enterApp();
  } catch (err) {
    errBox.textContent = /invalid/i.test(err.message) ? 'Wrong e-mail or password.' : err.message;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.api.auth.signOut();
  location.reload();
});

async function enterApp() {
  const session = await window.api.auth.session();
  if (!session) { showLogin(); return; }
  loginOverlay.style.display = 'none';
  document.getElementById('user-email').textContent = session.user.email || '';
  myEmail = session.user.email || '';
  window.api.auth.isAdmin().then(ok => { document.getElementById('nav-users').style.display = ok ? '' : 'none'; });
  await startApp();
}

(async function init() {
  if (!window.api.auth.configured) {
    showLogin('Not set up yet: open config.js and paste your Supabase URL and key (see SETUP.md).');
    document.getElementById('login-submit').disabled = true;
    return;
  }
  await enterApp();
})();
