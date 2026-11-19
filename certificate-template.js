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

// Counts how many lines a paragraph will wrap to, using the same font the
// page uses, so there is exactly one ruled line per line of text.
function countLines(text, width) {
  if (!countLines.ctx) countLines.ctx = document.createElement('canvas').getContext('2d');
  const ctx = countLines.ctx;
  ctx.font = "14px 'Times New Roman', Georgia, serif";
  let lines = 1, cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (ctx.measureText(t).width > width && cur) { lines++; cur = word; } else cur = t;
  }
  return lines;
}

// Renders a "Label:  <paragraph>" row: the text flows as a normal paragraph
// (no bullets, line breaks become spaces) written on real ruled lines. There
// are always at least `minLines` lines, even when only one word is typed.
function fieldBlock(label, text, minLines, width) {
  const paragraph = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  const n = Math.max(minLines || 3, paragraph ? countLines(paragraph, width * 0.97) : 0);
  return `
  <div class="field-row">
    <span class="field-label">${escapeHtml(label)}</span>
    <div class="field-para" style="height:${n * 28}px">
      <div class="rules">${'<i></i>'.repeat(n)}</div>
      <div class="field-text">${escapeHtml(paragraph)}</div>
    </div>
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

// Paper sizes (96 dpi pixels). 'v' stretches the vertical spacing a little on
// the longer sheet so the certificate fills the page instead of looking small.
window.PAPER_SIZES = {
  letter: { w: 816, h: 1056, css: '8.5in 11in',  v: 1,    label: 'Letter (8.5 × 11 in)' },
  a4:     { w: 794, h: 1123, css: '210mm 297mm', v: 1.15, label: 'A4 (210 × 297 mm)' },
  long:   { w: 816, h: 1248, css: '8.5in 13in',  v: 1.6,  label: 'Long (8.5 × 13 in)' }
};

function buildCertificateHtml(settings, cert) {
  const s = settings || {};
  const c = cert || {};

  const paper = window.PAPER_SIZES[s.paperSize] || window.PAPER_SIZES.letter;
  const v = paper.v;
  const logoImg = (src, size, n) => src
    ? `<img src="${src}" class="logo logo${n}" style="height:${size || 70}px" />`
    : '';
  const logosHtml = logoImg(s.logo1, s.logo1Size, 1) + logoImg(s.logo2, s.logo2Size, 2) + logoImg(s.logo3, s.logo3Size, 3);

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
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  @page { size: ${paper.css}; margin: 0; }
  html { width: ${paper.w}px; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    position: relative; overflow: hidden;
    width: ${paper.w}px; height: ${paper.h - 2}px;
    margin: 0; padding: 40px 55px;
    color: #111; font-size: 14px; line-height: 1.8;
  }
  .header {
    display: flex; align-items: center; gap: 12px;
    border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 4px;
  }
  .logo { width: auto; max-width: 240px; object-fit: contain; flex: 0 0 auto; }
  .org-block { text-align: left; line-height: 1.3; margin-left: 4px; }
  .org-name { font-size: 20px; font-weight: bold; font-style: italic; color: #1a4d7a; }
  .org-subtitle { font-size: 12px; }
  .office-line { text-align: right; font-size: 12px; margin: 6px 0 ${Math.round(18 * v)}px; line-height: 1.3; }
  .title { text-align: center; font-weight: bold; font-size: 18px; margin: ${Math.round(10 * v)}px 0 ${Math.round(30 * v)}px; }
  .body-text { text-align: justify; text-indent: 48px; }
  .blank { border-bottom: 1px solid #111; display: inline-block; padding: 0 6px; min-height: 16px; font-weight: bold; text-align: center; text-indent: 0; }
  .field-row { display: flex; align-items: flex-start; margin-top: ${Math.round(26 * v)}px; }
  .field-label { font-weight: normal; white-space: nowrap; width: 84px; flex: 0 0 84px; margin-right: 6px; }
  .field-para { flex: 1; position: relative; text-align: left; }
  .rules { position: absolute; left: 0; right: 0; top: 0; }
  .rules i { display: block; height: 28px; border-bottom: 1px solid #111; }
  .field-text { position: relative; line-height: 28px; padding-left: 2px; }
  .inline-line { border-bottom: 1px solid #111; padding: 0 6px; font-weight: bold; }
  .blank-wide { display: inline-block; text-indent: 0; }
  .closing { margin-top: ${Math.round(30 * v)}px; text-indent: 48px; }
  .signature-row { display: flex; justify-content: flex-end; margin-top: ${Math.round(40 * v)}px; }
  .verification { position: absolute; left: 0; right: 0; bottom: 100px; text-align: center; font-size: 9px; line-height: 1.3; }
  .qr-code { width: 80px; height: 80px; }
  .qr-caption { margin-top: 2px; }
  .signature { text-align: right; line-height: 1.2; }
  .sig-name { font-weight: bold; }
  .void-mark { position: absolute; top: 38%; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: bold; color: rgba(200, 0, 0, 0.18); transform: rotate(-25deg); letter-spacing: 8px; pointer-events: none; }
  .footer {
    position: absolute; bottom: 24px; left: 55px; right: 55px;
    border-top: 3px solid #111; padding-top: 6px; text-align: center; font-size: 10px; line-height: 1.5;
  }
  .footer .tagline { font-weight: bold; margin-top: 2px; }
</style>
</head>
<body>
  ${c.status === 'cancelled' ? '<div class="void-mark">CANCELLED</div>' : ''}
  <div class="header">
    ${logosHtml}
    <div class="org-block">
      <div class="org-name">${escapeHtml(s.orgName)}</div>
      <div class="org-subtitle">${escapeHtml(s.orgSubtitle)}</div>
    </div>
  </div>
  <div class="office-line">${escapeHtml(s.officeLine)}</div>

  <div class="title">MEDICAL CERTIFICATE</div>

  <div class="body-text">
    This is to certify that ${underline(c.name, 300, true)}, ${underline(c.age, 56)} year of
    age, a resident of ${addressHtml}${addressComma} was seen and examined by the undersigned on ${underline(c.dateExamined, 110)}.
  </div>

  ${fieldBlock('Diagnosis:', c.diagnosis, 3, paper.w - 202)}

  ${fieldBlock('Remarks:', c.remarks, 3, paper.w - 202)}

  <div class="closing">
    This certification is being issued for whatever purpose this may serve ${escapeHtml(c.purposePronoun || 'her')} best.
  </div>

  <div class="closing">
    Given this ${dateIssued} at ${escapeHtml(s.closingVenue)}.
  </div>

  <div class="signature-row">
    <div class="signature">
      <div class="sig-name">${escapeHtml(physicianName)}</div>
      <div>${escapeHtml(physicianTitle)}</div>
      <div>License No. ${escapeHtml(physicianLicense)}</div>
      ${physicianPtr ? `<div>PTR No. ${escapeHtml(physicianPtr)}</div>` : ''}
    </div>
  </div>

  ${qrBlock}

  <div class="footer">
    <div>${escapeHtml(s.footerAddress)}</div>
    ${s.footerEmail ? `<div>${escapeHtml(s.footerEmail)}</div>` : ''}
    <div class="tagline">${escapeHtml(s.footerTagline)}</div>
  </div>
</body>
</html>`;
}

window.buildCertificateHtml = buildCertificateHtml;
