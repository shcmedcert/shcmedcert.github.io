function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function underline(value, minWidth, alwaysMin) {
  const v = escapeHtml(value || '');
  const style = (v && !alwaysMin) ? '' : ` style="min-width:${minWidth || 60}px"`;
  return `<span class="blank"${style}>${v || '&nbsp;'}</span>`;
}

// Renders a "Label:  <paragraph>" row: the text flows as a normal paragraph
// (no bullets, line breaks become spaces) written across ruled lines, with at
// least `minLines` ruled lines so there is always room to write by hand.
function fieldBlock(label, text, minLines) {
  const paragraph = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  return `
  <div class="field-row">
    <span class="field-label">${escapeHtml(label)}</span>
    <div class="field-para" style="min-height:${(minLines || 3) * 28}px">${escapeHtml(paragraph)}</div>
  </div>`;
}

// Inline underlined text that wraps naturally (used for the free-form
// address, which can be long). Empty => a wide blank line to write on.
function inlineLine(value, blankWidth) {
  const v = escapeHtml(value || '');
  return v
    ? `<span class="inline-line">${v}</span>`
    : `<span class="inline-line blank-wide" style="min-width:${blankWidth || 340}px">&nbsp;</span>`;
}

function buildCertificateHtml(settings, cert) {
  const s = settings || {};
  const c = cert || {};

  const logoLeft = s.logo1 ? `<img src="${s.logo1}" class="logo logo1" />` : '<div class="logo-spacer logo1"></div>';
  const logoRight = s.logo2 ? `<img src="${s.logo2}" class="logo logo2" />` : '<div class="logo-spacer logo2"></div>';
  const logo1Size = s.logo1Size || 70;
  const logo2Size = s.logo2Size || 55;

  const dateIssued = `${underline(c.dateIssuedDay, 30)} day of ${underline(c.dateIssuedMonth, 110)}, ${underline(c.dateIssuedYear, 60)}`;

  // Physician is now chosen per-certificate (multiple doctors supported),
  // so these come from the certificate record itself, not global settings.
  const physicianName = c.physicianName || '';
  const physicianTitle = c.physicianTitle || '';
  const physicianLicense = c.physicianLicense || '';
  const physicianPtr = c.physicianPtr || '';

  // Patients from Samal Island use Purok / Barangay / District + the city line.
  // Anyone else gets a single free-form address; if it is left empty it prints
  // as a blank line so it can be filled in by hand.
  const addressHtml = c.addressMode === 'other'
    ? inlineLine(c.addressOther, 180)
    : `Purok ${underline(c.purok, 40)}, Barangay
    ${underline(c.barangay, 110)}, ${underline(c.district, 90)} District, ${escapeHtml(s.cityProvince)}`;

  // an empty (to-be-handwritten) address line has no trailing comma
  const addressComma = (c.addressMode === 'other' && !String(c.addressOther || '').trim()) ? '' : ',';

  const qrBlock = c.qrDataUrl ? `
  <div class="verification">
    <img class="qr-code" src="${c.qrDataUrl}" />
    <div class="qr-caption">Scan to<br/>verify</div>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    margin: 0; padding: 40px 55px;
    color: #111;
    font-size: 14px;
    line-height: 1.8;
  }
  .header {
    display: flex; align-items: center;
    border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 4px;
  }
  .logo1 { height: ${logo1Size}px; width: ${logo1Size}px; object-fit: contain; margin-right: 12px; }
  .logo2 { height: ${logo2Size}px; width: ${logo2Size}px; object-fit: contain; }
  .header-spacer { flex: 1; }
  .org-block { text-align: left; line-height: 1.3; }
  .org-name { font-size: 20px; font-weight: bold; font-style: italic; color: #1a4d7a; }
  .org-subtitle { font-size: 12px; }
  .office-line { text-align: right; font-size: 12px; margin: 6px 0 18px; line-height: 1.3; }
  .title { text-align: center; font-weight: bold; font-size: 18px; margin: 10px 0 30px; }
  .body-text { text-align: justify; text-indent: 48px; }
  .blank { border-bottom: 1px solid #111; display: inline-block; padding: 0 6px; min-height: 16px; font-weight: bold; text-align: center; text-indent: 0; }
  .field-row { display: flex; align-items: flex-start; margin-top: 26px; }
  .field-label { font-weight: normal; white-space: nowrap; margin-right: 6px; }
  .field-para {
    flex: 1; line-height: 28px; padding-left: 2px; text-align: left;
    background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #111 27px, #111 28px);
    background-size: 100% 28px;
  }
  .inline-line { border-bottom: 1px solid #111; padding: 0 6px; font-weight: bold; }
  .blank-wide { display: inline-block; text-indent: 0; }
  .closing { margin-top: 30px; }
  .bottom-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
  .verification { text-align: center; font-size: 9px; }
  .qr-code { width: 80px; height: 80px; }
  .qr-caption { margin-top: 2px; }
  .signature { text-align: right; line-height: 1.2; }
  .sig-name { font-weight: bold; }
  .void-mark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: bold; color: rgba(200, 0, 0, 0.18); transform: rotate(-25deg); letter-spacing: 8px; pointer-events: none; }
  .footer {
    position: fixed; bottom: 24px; left: 55px; right: 55px;
    border-top: 3px solid #111; padding-top: 6px; text-align: center; font-size: 10px; line-height: 1.5;
  }
  .footer .tagline { font-weight: bold; margin-top: 2px; }
</style>
</head>
<body>
  ${c.status === 'cancelled' ? '<div class="void-mark">CANCELLED</div>' : ''}
  <div class="header">
    ${logoLeft}
    <div class="org-block">
      <div class="org-name">${escapeHtml(s.orgName)}</div>
      <div class="org-subtitle">${escapeHtml(s.orgSubtitle)}</div>
    </div>
    <div class="header-spacer"></div>
    ${logoRight}
  </div>
  <div class="office-line">${escapeHtml(s.officeLine)}</div>

  <div class="title">MEDICAL CERTIFICATE</div>

  <div class="body-text">
    This is to certify that ${underline(c.name, 300, true)}, ${underline(c.age, 56)} year of
    age, a resident of ${addressHtml}${addressComma} was seen and examined by the undersigned on ${underline(c.dateExamined, 110)}.
  </div>

  ${fieldBlock('Diagnosis:', c.diagnosis, 3)}

  ${fieldBlock('Remarks:', c.remarks, 3)}

  <div class="closing">
    This certification is being issued for whatever purpose this may serve ${escapeHtml(c.purposePronoun || 'her')} best.
  </div>

  <div class="closing">
    Given this ${dateIssued} at ${escapeHtml(s.closingVenue)}.
  </div>

  <div class="bottom-row">
    ${qrBlock || '<div></div>'}
    <div class="signature">
      <div class="sig-name">${escapeHtml(physicianName)}</div>
      <div>${escapeHtml(physicianTitle)}</div>
      <div>License No. ${escapeHtml(physicianLicense)}</div>
      ${physicianPtr ? `<div>PTR No. ${escapeHtml(physicianPtr)}</div>` : ''}
    </div>
  </div>

  <div class="footer">
    <div>${escapeHtml(s.footerAddress)}</div>
    ${s.footerEmail ? `<div>${escapeHtml(s.footerEmail)}</div>` : ''}
    <div class="tagline">${escapeHtml(s.footerTagline)}</div>
  </div>
</body>
</html>`;
}

window.buildCertificateHtml = buildCertificateHtml;
