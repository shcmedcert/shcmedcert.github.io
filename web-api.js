// ============================================================
// window.api for the ONLINE version: same method names the desktop app used,
// but backed by Supabase (database + login) and the browser's print dialog.
// ============================================================
(function () {
  const CFG = window.MEDCERT_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !/YOUR-PROJECT-ID/.test(CFG.SUPABASE_URL) &&
    CFG.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(CFG.SUPABASE_ANON_KEY);

  const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

  const DEFAULT_SETTINGS = {
    logo1: null, logo2: null, logo1Size: 70, logo2Size: 70,
    orgName: 'Island Garden City of Samal',
    orgSubtitle: 'Province of Davao del Norte.',
    officeLine: 'Office of the Super Health Center Babak',
    cityProvince: 'Island Garden City of Samal, Davao del Norte',
    closingVenue: 'Babak Super Health Center of Island Garden City of Samal',
    footerAddress: '', footerEmail: '', footerTagline: '"Towards A Healthy IGACOS"',
    controlPrefix: 'IGACOS-BABAK', qrEnabled: true, templateMode: 'builtin',
    paperSize: 'letter', logo3: null, logo3Size: 70
  };

  function unwrap({ data, error }) {
    if (error) throw new Error(error.message || String(error));
    return data;
  }

  // ---------- Auth ----------
  const auth = {
    configured,
    async session() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signOut() { if (sb) await sb.auth.signOut(); },
    async isAdmin() {
      if (!sb) return false;
      const { data, error } = await sb.rpc('is_admin');
      return !error && data === true;
    },
    async changeOwnPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    }
  };

  // ---------- Users (admin only; runs on the manage-users Edge Function) ----------
  async function callUsers(payload) {
    const { data, error } = await sb.functions.invoke('manage-users', { body: payload });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      if (/not found|failed to send|404/i.test(msg)) msg = 'The user-management function is not set up yet (see SETUP.md, part A6).';
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  const users = {
    list: async () => (await callUsers({ action: 'list' })).users,
    add: (email, password) => callUsers({ action: 'add', email, password }),
    reset: (email, password) => callUsers({ action: 'reset', email, password }),
    remove: (email) => callUsers({ action: 'remove', email })
  };

  // ---------- Settings ----------
  async function getSettings() {
    const row = unwrap(await sb.from('settings').select('data').eq('id', 1).maybeSingle());
    return { ...DEFAULT_SETTINGS, ...((row && row.data) || {}) };
  }
  async function saveSettings(patch) {
    const merged = { ...(await getSettings()), ...patch };
    unwrap(await sb.from('settings').upsert({ id: 1, data: merged, updated_at: new Date().toISOString() }));
    return merged;
  }

  // Reads an image file, shrinks it (so settings stay small and fast), returns a data URL.
  function pickLogo() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/gif,image/webp';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const max = 400;
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const jpeg = /jpe?g/i.test(file.type);
            resolve(canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9));
          };
          img.onerror = () => resolve(null);
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      };
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  // ---------- Physicians ----------
  const physFields = (p) => ({ name: p.name, title: p.title || '', license: p.license || '', ptr: p.ptr || '' });
  async function listPhysicians() {
    return unwrap(await sb.from('physicians').select('id,name,title,license,ptr').order('name'));
  }
  async function upsertPhysician(p) {
    if (p.id) return unwrap(await sb.from('physicians').update(physFields(p)).eq('id', p.id).select().single());
    return unwrap(await sb.from('physicians').insert(physFields(p)).select().single());
  }
  async function deletePhysician(id) { unwrap(await sb.from('physicians').delete().eq('id', id)); }

  // ---------- Patients ----------
  const patientOut = (r) => ({ ...r.data, id: r.id, name: r.name });
  const patientData = (p) => {
    const { id, name, ...rest } = p;
    return rest;
  };
  const esc = (q) => String(q).replace(/[\\%_]/g, (m) => '\\' + m);
  async function listPatients() {
    return unwrap(await sb.from('patients').select('*').order('name')).map(patientOut);
  }
  async function searchPatients(q) {
    q = (q || '').trim();
    if (!q) return [];
    return unwrap(await sb.from('patients').select('*').ilike('name', '%' + esc(q) + '%').order('name').limit(8)).map(patientOut);
  }
  async function upsertPatient(p) {
    const name = (p.name || '').trim();
    if (!name) return null;
    const existing = unwrap(await sb.from('patients').select('id').ilike('name', esc(name)).limit(1));
    const payload = { name, data: patientData(p), updated_at: new Date().toISOString() };
    if (existing.length) return patientOut(unwrap(await sb.from('patients').update(payload).eq('id', existing[0].id).select().single()));
    return patientOut(unwrap(await sb.from('patients').insert(payload).select().single()));
  }
  async function deletePatient(id) { unwrap(await sb.from('patients').delete().eq('id', id)); }

  // ---------- Certificates ----------
  const certOut = (r) => ({
    ...r.data, id: r.id, name: r.patient_name, controlNumber: r.control_number,
    verifyToken: r.verify_token, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at
  });
  const certData = (c) => {
    const { id, name, controlNumber, verifyToken, status, createdAt, updatedAt, qrDataUrl, ...rest } = c;
    return rest;
  };
  async function listCertificates() {
    return unwrap(await sb.from('certificates').select('*').order('created_at', { ascending: false }).limit(1000)).map(certOut);
  }
  async function getCertificate(id) {
    return certOut(unwrap(await sb.from('certificates').select('*').eq('id', id).single()));
  }
  async function addCertificate(c) {
    const row = unwrap(await sb.from('certificates').insert({ patient_name: c.name, data: certData(c) }).select().single());
    await upsertPatient(patientFromCert(c));
    return certOut(row);
  }
  async function updateCertificate(id, c) {
    const row = unwrap(await sb.from('certificates').update({ patient_name: c.name, data: certData(c) }).eq('id', id).select().single());
    await upsertPatient(patientFromCert(c));
    return certOut(row);
  }
  async function setCertificateStatus(id, status) {
    return certOut(unwrap(await sb.from('certificates').update({ status }).eq('id', id).select().single()));
  }
  function patientFromCert(c) {
    return {
      name: c.name, age: c.age, addressMode: c.addressMode, addressOther: c.addressOther,
      purok: c.purok, barangay: c.barangay, district: c.district
    };
  }

  // Staff look-up by certificate number or name (used on the phone with employers).
  async function verifyLookup(query) {
    const q = String(query || '').replace(/[,()*%\\]/g, ' ').trim();
    if (!q) return [];
    const rows = unwrap(await sb.from('certificates').select('*')
      .or(`control_number.ilike.%${q}%,patient_name.ilike.%${q}%`)
      .order('created_at', { ascending: false }).limit(50));
    return rows.map(certOut);
  }

  // ---------- QR + preview + printing ----------
  function verifyUrl(token) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + 'verify.html?t=' + encodeURIComponent(token);
  }
  function qrDataUrl(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 2);
  }
  function withQr(settings, cert) {
    if (!settings.qrEnabled) return cert;
    return { ...cert, qrDataUrl: qrDataUrl(verifyUrl(cert.verifyToken || 'preview-not-a-real-certificate')) };
  }

  async function previewHtml(settings, cert) {
    return window.buildCertificateHtml(settings, withQr(settings, cert));
  }

  // Opens the browser print dialog for the certificate. In that dialog, pick
  // your printer — or "Save as PDF" to get a PDF file.
  async function printHtml(html, title) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    doc.title = title;
    await new Promise((r) => setTimeout(r, 250));
    await Promise.all(Array.from(doc.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));

    const oldTitle = document.title;
    document.title = title; // browsers use the page title as the suggested PDF file name
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    document.title = oldTitle;
    setTimeout(() => iframe.remove(), 60000);
  }

  const fileTitle = (c) => 'MedicalCertificate-' + String(c.name || 'patient').replace(/[^a-z0-9]+/gi, '_');

  // The paper size picked on this computer (kept in this browser) wins over the default.
  const paper = {
    get() { try { return localStorage.getItem('medcert.paper') || ''; } catch (e) { return ''; } },
    set(v) { try { localStorage.setItem('medcert.paper', v); } catch (e) {} },
    apply(settings) { const v = paper.get(); return v ? { ...settings, paperSize: v } : settings; }
  };

  async function exportPdf(id) {
    const [base, cert] = await Promise.all([getSettings(), getCertificate(id)]);
    const settings = paper.apply(base);
    await printHtml(window.buildCertificateHtml(settings, withQr(settings, cert)), fileTitle(cert));
    return { saved: true, path: '' };
  }
  async function previewExportPdf(draft) {
    const settings = paper.apply(await getSettings());
    await printHtml(window.buildCertificateHtml(settings, withQr(settings, draft)), fileTitle(draft));
    return { saved: true, path: '' };
  }

  window.api = {
    auth, users, paper,
    getSettings, saveSettings, pickLogo,
    listPhysicians, upsertPhysician, deletePhysician,
    listPatients, searchPatients, upsertPatient, deletePatient,
    listCertificates, addCertificate, updateCertificate, setCertificateStatus,
    exportPdf, previewExportPdf, verifyLookup, previewHtml,
    verifyUrl
  };
})();
