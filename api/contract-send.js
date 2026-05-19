import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/contract-send
//   { contractId, to, message?, accessToken }
//
// Sends the contract to `to` via Gmail (using the signed-in user's
// Google OAuth access token, so the email arrives FROM Kamil's own
// address and lands in his Sent folder for record-keeping).
//
// Server-side responsibilities:
//   1. Auth the caller (Supabase JWT)
//   2. Load the contract row (RLS scopes to the caller via the
//      Supabase access token they sent us)
//   3. Generate or reuse share_token
//   4. Render the SOW body inline-styled for email clients
//   5. Send via Gmail API
//   6. Mark status=sent, sent_at=now, store last_sent_to email
//
// The contract body is mirrored from contractTemplate.js so this
// route is self-contained. If you change the SOW text there,
// mirror it here too.

const TEMPLATE = `# SCOPE OF WORK

## Early Spring × {{client_legal_name}}

This Scope of Work (this "SOW"), together with the Early Spring Standard Terms and Conditions (attached hereto as Exhibit A and incorporated herein by reference) shall form the entire agreement ("Agreement") entered into and effective as of {{effective_date}} (the "Effective Date"), by and between EARLY SPRING, LLC, a New York limited liability company of 385 Van Brunt Street, Brooklyn, New York 11231 ("Agency") and {{client_legal_name}} of {{client_legal_address}} ("Client" and, together with Agency, the "Parties", or each individually, a "Party").

In consideration of the mutual promises contained herein, and for other good and valuable consideration, the receipt and sufficiency of which is hereby acknowledged, the Parties agree as follows:

### 1. PROJECT MANAGERS

The Parties' project managers for **{{project_name}}** (the "Project") are:

| EARLY SPRING, LLC | {{client_legal_name}} |
| --- | --- |
| Name: Kamil Tyebally | Name: {{client_pm_name}} |
| Email: kamil@earlyspring.nyc | Email: {{client_pm_email}} |
| Phone: +1.646.701.2844 | Phone: {{client_pm_phone}} |

### 2. BACKGROUND

Agency has been engaged by Client to deliver the Project on or around {{event_date}}, pursuant to the terms and conditions of this Agreement.

As a partner to {{client_legal_name}}, Early Spring will develop and execute {{background}}.

### 3. SERVICES AND DELIVERABLES

Agency's Services and deliverables provided to Client in connection with the Project (collectively, the "Deliverables") will consist of the following:

#### Phase 01: Development & Production

**Deliverables**

{{phase_1_deliverables}}

**Client's Responsibilities**

{{phase_1_client_resp}}

**Timing:** {{phase_1_timing}}

#### Phase 02: Installation & Launch

**Deliverables**

{{phase_2_deliverables}}

**Timing:** {{phase_2_timing}}

### 4. ASSUMPTIONS

Client will provide Agency with written approval and acceptance of all Deliverables provided. Delays in approval or responses from Client and/or Client-managed individuals/entities could result in delays and will affect Agency's successful completion of Services.

The scope of this SOW allows for reviews and revisions as outlined in the Deliverables and Services in Section 3 ({{revision_rounds}} rounds). Additional rounds of review and revisions will have an impact on the overall timeline, budget, and fees for the Project.

### 9. FEES AND EXPENSES

In exchange for the Services and Deliverables, Client shall pay Agency a project fee of {{total_fee}} USD (the "Fee").

Payment of the Fee and reimbursable out-of-pocket expenses or other incidentals (the "Expenses") shall be invoiced as follows:

| Fee/Expense Type | Amount | Invoice Date |
| --- | --- | --- |
| Project Deposit ({{deposit_pct}}%) | {{deposit_amount_calc}} | {{deposit_date}} |
| Final Amount Due ({{final_pct}}%) | {{final_amount_calc}} | {{final_due_date}} |
| Pre-Approved Incidentals / Out of Pocket Expenses | To be confirmed / If applicable | {{incidentals_date}} |

Agency will send invoices in accordance with the instructions set forth by Client as follows:

| Billing Address (provided by Client) | {{client_billing_addr}} |
| --- | --- |
| Invoice Instructions (provided by Client) | Agency will submit project invoices via email to {{client_billing_email}}. |

Full payment of all invoiced amounts shall be due {{payment_terms_phrase}} days after Client's receipt of the applicable, accurate invoice.`;

// ─── Helpers ────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtUSD(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) {
    const d = new Date(String(v) + 'T00:00:00');
    if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return String(v);
}

const ONES_W = ['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS_W = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function numToWord(n) {
  const v = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(v) || v === 0) return String(n);
  if (v < 20) return ONES_W[v];
  if (v < 100) { const t = Math.floor(v/10), o = v%10; return o === 0 ? TENS_W[t] : `${TENS_W[t]}-${ONES_W[o]}`; }
  return String(v);
}

function fillTemplate(values = {}) {
  const total = Number(values.total_fee) || 0;
  const dPct = Number(values.deposit_pct) || 0;
  const fPct = Number(values.final_pct) || 0;
  const termsDays = Number(values.payment_terms_days) || 30;
  const computed = {
    ...values,
    deposit_amount_calc: total && dPct ? Math.round(total * dPct / 100) : '',
    final_amount_calc:   total && fPct ? Math.round(total * fPct   / 100) : '',
    payment_terms_phrase: `${numToWord(termsDays)} (${termsDays})`,
  };
  const CURRENCY = new Set(['total_fee', 'deposit_amount_calc', 'final_amount_calc']);
  const DATES = new Set(['effective_date', 'event_date', 'deposit_date', 'final_due_date', 'incidentals_date']);
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const raw = computed[k];
    if (raw == null || raw === '') return '';
    if (CURRENCY.has(k)) return fmtUSD(raw);
    if (DATES.has(k)) return fmtDate(raw);
    return String(raw);
  });
}

// Inline-styled markdown → HTML for email clients. All styles
// are inline because Gmail and Outlook strip <style> tags from
// most contexts. Layout uses simple block elements + tables.
function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}
function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
}

const INK = '#0F52BA';
const RULE = 'rgba(15,82,186,0.18)';
const SOFT = 'rgba(15,82,186,0.05)';

function mdToEmailHtml(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^####\s+/.test(line)) {
      blocks.push(`<h4 style="font-size:15px;font-weight:700;letter-spacing:-0.005em;margin:24px 0 12px;color:${INK};">${inline(line.replace(/^####\s+/, ''))}</h4>`);
      i++; continue;
    }
    if (/^###\s+/.test(line)) {
      blocks.push(`<h3 style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:28px 0 12px;color:${INK};">${inline(line.replace(/^###\s+/, ''))}</h3>`);
      i++; continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push(`<h2 style="font-size:16px;font-weight:600;letter-spacing:-0.012em;margin:6px 0 22px;color:${INK};opacity:.7;text-align:center;">${inline(line.replace(/^##\s+/, ''))}</h2>`);
      i++; continue;
    }
    if (/^#\s+/.test(line)) {
      blocks.push(`<h1 style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:0 0 4px;color:${INK};text-align:center;">${inline(line.replace(/^#\s+/, ''))}</h1>`);
      i++; continue;
    }
    if (/^---\s*$/.test(line)) {
      blocks.push(`<hr style="border:none;border-top:1px solid ${RULE};margin:32px 0;"/>`);
      i++; continue;
    }
    if (/^\|.+\|\s*$/.test(line)) {
      const rows = [splitRow(line)];
      let j = i + 1;
      let hasSeparator = false;
      if (j < lines.length && /^\|\s*-+\s*(\|\s*-+\s*)+\|\s*$/.test(lines[j])) { hasSeparator = true; j++; }
      while (j < lines.length && /^\|.+\|\s*$/.test(lines[j])) { rows.push(splitRow(lines[j])); j++; }
      const table = `<table cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:13px;">${rows.map((cells, idx) => {
        return `<tr>${cells.map((c, cidx) => {
          const isFirstCol = cidx === 0;
          const cellStyle = `border:1px solid ${RULE};padding:9px 11px;vertical-align:top;${isFirstCol ? `font-weight:600;background:${SOFT};width:38%;` : ''}`;
          return `<td style="${cellStyle}">${inline(c)}</td>`;
        }).join('')}</tr>`;
      }).join('')}</table>`;
      blocks.push(table);
      i = j; continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li style="margin-bottom:5px;">${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul style="margin:0 0 14px 0;padding-left:22px;font-size:13px;color:${INK};">${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    const para = [line];
    let k = i + 1;
    while (k < lines.length && lines[k].trim() && !/^(#{1,4}\s|---|\|.+\||[-*]\s)/.test(lines[k])) {
      para.push(lines[k]); k++;
    }
    blocks.push(`<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${INK};">${inline(para.join(' '))}</p>`);
    i = k;
  }
  return blocks.join('\n');
}

function emailHtml({ contractBodyHtml, signUrl, message, company, projectName, recipientName }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;">

<div style="max-width:680px;margin:0 auto;padding:32px 28px 56px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://earlyspring.nyc/early-spring-lockup-blue.svg" alt="Early Spring" style="height:32px;display:inline-block;"/>
  </div>
  <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${INK};opacity:.55;margin-bottom:18px;text-align:center;">
    Scope of Work
  </div>

  <!-- Greeting + optional message -->
  ${recipientName ? `<p style="font-size:15px;margin:0 0 12px;color:${INK};">Hi ${esc(recipientName.split(' ')[0])},</p>` : ''}
  <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:${INK};">
    Please find the proposed Scope of Work for <strong>${esc(projectName || 'our project')}</strong> below. The terms cover both the SOW and Early Spring's Standard Terms &amp; Conditions (Exhibit A).
  </p>
  ${message ? `<p style="font-size:14px;line-height:1.6;margin:0 0 18px;color:${INK};white-space:pre-wrap;">${esc(message)}</p>` : ''}
  <p style="font-size:14px;line-height:1.6;margin:0 0 22px;color:${INK};">
    Click the button below to review the full document, fill in the requested fields (address, billing email, etc.), and sign electronically. You can also download the agreement as a Word document for redlines if needed.
  </p>

  <!-- CTA (top) -->
  <table cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
    <tr><td style="background:${INK};border-radius:999px;">
      <a href="${esc(signUrl)}" style="display:inline-block;padding:12px 28px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;font-family:inherit;">Review &amp; sign ↗</a>
    </td></tr>
  </table>
  <p style="font-size:11px;color:${INK};opacity:.55;margin:0 0 32px;">
    Or paste this link into your browser:<br/>
    <span style="word-break:break-all;">${esc(signUrl)}</span>
  </p>

  <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 28px;"/>

  <!-- Embedded contract body -->
  ${contractBodyHtml}

  <hr style="border:none;border-top:1px solid ${RULE};margin:32px 0 28px;"/>

  <!-- CTA (bottom) -->
  <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:${INK};">
    Ready to proceed? Sign electronically at the link below:
  </p>
  <table cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
    <tr><td style="background:${INK};border-radius:999px;">
      <a href="${esc(signUrl)}" style="display:inline-block;padding:12px 28px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;font-family:inherit;">Review &amp; sign ↗</a>
    </td></tr>
  </table>

  <!-- Footer -->
  <div style="margin-top:48px;padding-top:20px;border-top:1px solid ${RULE};font-size:11px;line-height:1.55;color:${INK};opacity:.55;">
    Early Spring NYC · 385 Van Brunt St, Floor 2 · Brooklyn, NY 11231<br/>
    hi@earlyspring.nyc · earlyspring.nyc<br/>
    <em>This email contains a legally binding agreement awaiting your signature. Reply to discuss any revisions.</em>
  </div>

</div>

</body>
</html>`;
}

function randomToken() {
  // 24 url-safe bytes ≈ 128 bits — same scheme as contracts.js
  const arr = new Uint8Array(24);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(arr);
  return Buffer.from(arr).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ─── Handler ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { contractId, to, message, accessToken } = req.body || {};
  if (!contractId) return res.status(400).json({ error: 'contractId required' });
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    return res.status(400).json({ error: 'Valid recipient email required' });
  }
  if (!accessToken) return res.status(400).json({ error: 'Google access token required — sign in with Google first' });

  // Pull the contract through the user's Supabase JWT so RLS only
  // surfaces rows they own. Same fetch pattern as restFetch.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return res.status(500).json({ error: 'Supabase not configured' });

  const sbAuth = (req.headers.authorization || '').replace('Bearer ', '');
  const enc = encodeURIComponent;
  const sbHeaders = {
    apikey: supabaseAnon,
    Authorization: `Bearer ${sbAuth}`,
    'Content-Type': 'application/json',
  };

  let row;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/contracts?select=*&id=eq.${enc(contractId)}&limit=1`, { headers: sbHeaders });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Could not load contract: ${t.slice(0, 200)}` });
    }
    const rows = await r.json();
    row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(404).json({ error: 'Contract not found' });
  } catch (e) {
    return res.status(502).json({ error: 'Contract load failed: ' + (e.message || 'unknown') });
  }
  if (row.status === 'signed') return res.status(409).json({ error: 'Contract already signed' });

  // Generate token if missing.
  const token = row.share_token || randomToken();
  const signUrl = `https://earlyspring.nyc/contract/${token}`;

  // Render body
  const fields = row.filled_fields || {};
  const filledMd = fillTemplate(fields);
  const contractBodyHtml = mdToEmailHtml(filledMd);
  const company = fields.client_legal_name || 'Client';
  const projectName = fields.project_name || '';
  const recipientName = fields.client_pm_name || '';
  // Keep the subject ASCII so it renders cleanly in every mail
  // client. Body text can still use real Unicode.
  const subject = `Scope of Work : Early Spring x ${company}`;
  const html = emailHtml({ contractBodyHtml, signUrl, message, company, projectName, recipientName });

  // Send via Gmail API (FROM kamil's Gmail). Quoted-printable not
  // strictly required here — base64url encoded MIME is fine and
  // matches the existing api/email.js pattern.
  //
  // Subject contains non-ASCII (em dash, ×, ·) — RFC 2047 requires
  // encoded-word form for any header containing non-ASCII. Without
  // this, Gmail double-encodes the bytes and the client sees
  // "ÃƒÂ—" instead of "×".
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
  const mime = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ].join('\r\n');
  const encoded = Buffer.from(mime).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const gmRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!gmRes.ok) {
      const errTxt = await gmRes.text().catch(() => '');
      return res.status(gmRes.status).json({ error: 'Gmail send failed', detail: errTxt.slice(0, 300) });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Gmail fetch failed: ' + (e.message || 'unknown') });
  }

  // Mark contract sent. PATCH via the user's JWT so RLS update
  // policy applies (matches sendContract from src/lib/contracts.js).
  try {
    await fetch(`${supabaseUrl}/rest/v1/contracts?id=eq.${enc(contractId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        share_token: token,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // Email already went — don't fail the call, just log.
    console.warn('[contract-send] status update failed:', e.message);
  }

  return res.status(200).json({ ok: true, token, signUrl, sentTo: to });
}
