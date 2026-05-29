import { f$ } from './format.js';
import { ci, ct } from './calc.js';
import DOMPurify from 'isomorphic-dompurify';

/* ── Early Spring email tokens ──
   Per Lab guidelines: paper #FFFFFF, sapphire #0F52BA, faint rule .18, faded ink .42.
   Email clients have inconsistent CSS support, so use inline styles + safe HTML only.
*/
const INK = '#0F52BA';
const FADED = '#7791C5';
const RULE = '#CDD7EB';
const PAPER = '#FFFFFF';
const PAGE = '#FFFFFF';

// Convert message to email-safe HTML. Uses DOMPurify with a strict
// whitelist for rich-paste; falls back to plain-text bullet rendering.
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p','br','div','span','ul','ol','li','b','strong','i','em','u','a','blockquote','h1','h2','h3','h4'],
  ALLOWED_ATTR: ['href','style','class','target','rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#)/i,
  FORBID_TAGS: ['script','style','iframe','object','embed','form','svg','math','link','meta','base'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onmouseenter','onbeforeunload','ontoggle','formaction'],
  ADD_ATTR: ['target'],
};

function formatMessage(msg) {
  if (!msg) return '';
  if (msg.includes('<') && (msg.includes('<br') || msg.includes('<div') || msg.includes('<li') || msg.includes('<ul') || msg.includes('<p') || msg.includes('<b'))) {
    return DOMPurify.sanitize(msg, PURIFY_CONFIG);
  }
  // Plain-text path — escape, then parse bullet patterns into a UL.
  const escaped = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = escaped.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-•*]\s+(.*)/);
    if (bulletMatch) {
      if (!inList) { html += `<ul style="margin:8px 0;padding-left:20px">`; inList = true; }
      html += `<li style="margin:4px 0;color:${INK}">${bulletMatch[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += (line.trim() === '' ? '<br>' : `<div>${line}</div>`);
    }
  }
  if (inList) html += '</ul>';
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

const FONT = "-apple-system,'Inter','Helvetica Neue',Arial,sans-serif";

// Shared shell — Lab-style header with sapphire wordmark + thin rule, paper card.
function shell({ kicker, title, project, message, body }) {
  let orgAddr = "385 Van Brunt St, Floor 2, Brooklyn, NY 11231", orgWeb = "earlyspring.nyc";
  try { const o = JSON.parse(localStorage.getItem("es_org") || "{}"); if (o.address) orgAddr = o.address; if (o.website) orgWeb = o.website; } catch (e) {}

  const meta = [
    project.name && { label: 'Project', value: project.name },
    project.client && { label: 'Client', value: project.client },
    { label: 'Date', value: project.date || new Date().toLocaleDateString() },
    project.eventDate && { label: 'Event', value: project.eventDate },
  ].filter(Boolean);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${PAGE};color:${INK};font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:0 auto;padding:40px 24px">
  <tr><td style="background:${PAPER};padding:40px">

    <!-- Brand row -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${RULE};padding-bottom:18px;margin-bottom:28px">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:11px;font-weight:700;color:${INK};letter-spacing:.18em;text-transform:uppercase">EARLY&nbsp;SPRING</div>
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Lab&nbsp;·&nbsp;${project.client || 'Client'}</div>
        </td>
      </tr>
    </table>

    <!-- Title block -->
    <div style="margin-bottom:32px">
      <div style="font-size:11px;font-weight:700;color:${INK};letter-spacing:.10em;text-transform:uppercase;margin-bottom:14px">${kicker}</div>
      <div style="font-size:32px;font-weight:800;color:${INK};letter-spacing:-0.022em;line-height:1.04;margin-bottom:14px">${title}</div>
      <div style="font-size:13px;color:${FADED};line-height:1.6">${meta.map(m => `<span style="margin-right:18px;display:inline-block"><strong style="color:${INK};font-weight:700">${m.label}</strong> · ${m.value}</span>`).join('')}</div>
    </div>

    ${message ? `<div style="margin-bottom:28px;padding:18px 20px;border-left:2px solid ${INK};background:transparent;color:${INK};font-size:14px;line-height:1.6">${formatMessage(message)}</div>` : ''}

    ${body}

    <!-- Footer -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};margin-top:36px;padding-top:18px">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:11px;font-weight:700;color:${INK};letter-spacing:.18em;text-transform:uppercase">EARLY&nbsp;SPRING</div>
          <div style="font-size:11px;color:${FADED};margin-top:8px;line-height:1.6">${orgAddr}</div>
        </td>
        <td style="text-align:right;vertical-align:top">
          <a href="https://${orgWeb.replace(/^https?:\/\//,'')}" style="font-size:11px;color:${FADED};text-decoration:none">${orgWeb.replace(/^https?:\/\//,'')}</a>
          <div style="font-size:10px;color:${FADED};margin-top:8px;letter-spacing:.06em;text-transform:uppercase">Prepared in Morgan</div>
        </td>
      </tr>
    </table>

  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────
// Production Estimate email
// ─────────────────────────────────────────────────────────────────────
export function budgetEmailHtml(project, cats, ag, comp, feeP, message) {
  const catRows = cats.map(c => {
    const t = ct(c.items).totals;
    const items = c.items.filter(it => ci(it).clientPrice > 0);
    if (!items.length) return '';
    const head = `<tr><td colspan="3" style="border-top:1px solid ${INK};padding:18px 0 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:16px;font-weight:800;color:${INK};letter-spacing:-0.01em">${c.name}</td>
          <td style="text-align:right;font-size:14px;font-weight:700;color:${INK};font-family:${FONT}">${f$(t.clientPrice)}</td>
        </tr>
      </table>
    </td></tr>`;
    const itemRows = items.map((it, i) =>
      `<tr><td style="padding:8px 0;color:${INK};font-size:13px;border-bottom:${i === items.length - 1 ? 'none' : `1px solid ${RULE}`}">${it.name}${it.details ? `<span style="color:${FADED};font-style:italic;margin-left:8px">${it.details}</span>` : ''}</td>
      <td style="padding:8px 0;text-align:right;font-family:${FONT};color:${FADED};font-size:13px;border-bottom:${i === items.length - 1 ? 'none' : `1px solid ${RULE}`}">${f$(ci(it).clientPrice)}</td></tr>`
    ).join('');
    return head + itemRows;
  }).join('');

  const agItems = (ag || []).filter(it => ci(it).clientPrice > 0);
  const agSection = agItems.length ? `
    <tr><td colspan="2" style="border-top:1px solid ${INK};padding:18px 0 8px">
      <div style="font-size:16px;font-weight:800;color:${INK};letter-spacing:-0.01em">Agency</div>
    </td></tr>
    ${agItems.map((it, i) => `<tr>
      <td style="padding:8px 0;color:${INK};font-size:13px;border-bottom:${i === agItems.length - 1 ? 'none' : `1px solid ${RULE}`}">${it.name}</td>
      <td style="padding:8px 0;text-align:right;font-family:${FONT};color:${FADED};font-size:13px;border-bottom:${i === agItems.length - 1 ? 'none' : `1px solid ${RULE}`}">${f$(ci(it).clientPrice)}</td>
    </tr>`).join('')}
    ${comp.agencyFee?.clientPrice ? `<tr>
      <td style="padding:10px 0 0;color:${INK};font-size:13px;font-weight:700;text-align:right">Agency Fee</td>
      <td style="padding:10px 0 0;text-align:right;font-family:${FONT};color:${INK};font-size:13px;font-weight:700">${f$(comp.agencyFee.clientPrice)}</td>
    </tr>` : ''}
  ` : '';

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tbody>${catRows}${agSection}</tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid ${INK};margin-top:8px">
      <tr>
        <td style="padding:18px 0;font-size:14px;font-weight:700;color:${INK};letter-spacing:.10em;text-transform:uppercase">Grand Total</td>
        <td style="padding:18px 0;text-align:right;font-size:24px;font-weight:800;color:${INK};font-family:${FONT}">${f$(comp.grandTotal)}</td>
      </tr>
    </table>
  `;

  return shell({ kicker: 'Production Estimate', title: project.name || 'Estimate', project, message, body });
}

// ─────────────────────────────────────────────────────────────────────
// Project Timeline email
// ─────────────────────────────────────────────────────────────────────
const STATUS = {
  done: { label: 'Done' },
  progress: { label: 'In progress' },
  todo: { label: 'To do' },
  roadblocked: { label: 'Blocked' },
};

// ─────────────────────────────────────────────────────────────────────
// Client portal invitation email
// ─────────────────────────────────────────────────────────────────────
export function clientInviteEmailHtml(project, email, password, portalUrl, message) {
  const body = `
    <div style="margin-bottom:28px">
      <p style="font-size:14px;color:${INK};line-height:1.6;margin:0 0 12px">
        You've been invited to view and collaborate on <strong>${project.name || 'this project'}</strong>
        in Morgan — Early Spring's production portal.
      </p>
      <p style="font-size:14px;color:${INK};line-height:1.6;margin:0 0 12px">
        Sign in to review the estimate and timeline, leave notes for the team,
        share asset links, and check off tasks as we go.
      </p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};margin:28px 0;background:transparent">
      <tr>
        <td style="padding:18px 0;width:160px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Portal URL</div>
        </td>
        <td style="padding:18px 0;vertical-align:top">
          <a href="${portalUrl}" style="font-size:14px;color:${INK};font-weight:600;text-decoration:underline">${portalUrl}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 18px;width:160px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Email</div>
        </td>
        <td style="padding:0 0 18px;vertical-align:top">
          <div style="font-size:14px;color:${INK};font-family:${FONT};font-weight:600">${email}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 18px;width:160px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Password</div>
        </td>
        <td style="padding:0 0 18px;vertical-align:top">
          <div style="font-size:14px;color:${INK};font-family:${FONT};font-weight:600">${password}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:12px;color:${FADED};line-height:1.6;margin:0 0 24px">
      Bookmark the portal link — it's where we'll keep our shared production view.
      If anything looks off, reply to this email and we'll sort it.
    </p>
  `;

  return shell({ kicker: 'Client Portal', title: `Welcome to ${project.name || 'your project'}`, project, message, body });
}

// ─────────────────────────────────────────────────────────────────────
// Team invitation email — for staff teammates added via Settings.
// projectList is an optional array of project names so the invitee
// knows what they have access to up front.
// ─────────────────────────────────────────────────────────────────────
export function teamInviteEmailHtml({ orgName, recipientName, roleLabel, email, password, loginUrl, projectList = [], inviterName, message }) {
  const projectRows = projectList.length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:transparent">
        <tr>
          <td style="padding:0 0 8px;vertical-align:top">
            <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Projects you'll see</div>
          </td>
        </tr>
        ${projectList.map(name => `
        <tr>
          <td style="padding:6px 0;border-top:1px solid ${RULE}">
            <div style="font-size:13px;color:${INK};font-weight:600">${name}</div>
          </td>
        </tr>`).join('')}
      </table>
    `
    : '';

  const body = `
    <div style="margin-bottom:24px">
      <p style="font-size:14px;color:${INK};line-height:1.6;margin:0 0 12px">
        ${recipientName ? `Hi ${recipientName},` : 'Hi,'}
      </p>
      <p style="font-size:14px;color:${INK};line-height:1.6;margin:0 0 12px">
        ${inviterName ? `${inviterName} added you` : "You've been added"} to <strong>${orgName || 'Early Spring'}</strong>'s
        Morgan workspace as a <strong>${roleLabel || 'Teammate'}</strong>.
      </p>
      <p style="font-size:14px;color:${INK};line-height:1.6;margin:0">
        Use the credentials below to sign in — no Google account required.
      </p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};margin:24px 0;background:transparent">
      <tr>
        <td style="padding:16px 0;width:140px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Login URL</div>
        </td>
        <td style="padding:16px 0;vertical-align:top">
          <a href="${loginUrl}" style="font-size:14px;color:${INK};font-weight:600;text-decoration:underline">${loginUrl}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;width:140px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Email</div>
        </td>
        <td style="padding:0 0 16px;vertical-align:top">
          <div style="font-size:14px;color:${INK};font-family:${FONT};font-weight:600">${email}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;width:140px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${FADED};letter-spacing:.10em;text-transform:uppercase">Password</div>
        </td>
        <td style="padding:0 0 16px;vertical-align:top">
          <div style="font-size:14px;color:${INK};font-family:${FONT};font-weight:600">${password}</div>
        </td>
      </tr>
    </table>

    ${projectRows}

    <p style="font-size:12px;color:${FADED};line-height:1.6;margin:0 0 18px">
      First time in Morgan? Click around — the sidebar is the map. Hit reply if anything looks off.
    </p>
  `;

  return shell({
    kicker: 'Workspace Invitation',
    title: `Welcome to ${orgName || 'Early Spring'}`,
    project: { name: orgName || 'Early Spring', client: '', date: new Date().toLocaleDateString() },
    message,
    body,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Project Timeline email
// ─────────────────────────────────────────────────────────────────────
export function timelineEmailHtml(project, tasks, message) {
  const dated = tasks.filter(t => t.startDate).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const taskRows = dated.map((t, i) => {
    const status = STATUS[t.status] || { label: t.status || 'To do' };
    return `<tr>
      <td style="padding:14px 0;color:${INK};font-size:13px;font-weight:500;border-bottom:${i === dated.length - 1 ? 'none' : `1px solid ${RULE}`}">${t.name}${t.category ? `<span style="color:${FADED};font-style:italic;margin-left:8px">${t.category}</span>` : ''}</td>
      <td style="padding:14px 0;text-align:right;color:${FADED};font-family:${FONT};font-size:12px;white-space:nowrap;border-bottom:${i === dated.length - 1 ? 'none' : `1px solid ${RULE}`}">${t.startDate || ''}${t.endDate ? ` — ${t.endDate}` : ''}</td>
      <td style="padding:14px 0;padding-left:18px;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${t.status === 'done' ? INK : t.status === 'roadblocked' ? '#7A1F1F' : FADED};white-space:nowrap;border-bottom:${i === dated.length - 1 ? 'none' : `1px solid ${RULE}`}">${status.label}</td>
    </tr>`;
  }).join('');

  const body = dated.length === 0
    ? `<p style="padding:24px 0;color:${FADED};font-size:13px;border-top:1px solid ${INK}">No dated tasks in the timeline yet.</p>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${INK};margin-bottom:28px"><tbody>${taskRows}</tbody></table>`;

  return shell({ kicker: 'Project Timeline', title: project.name || 'Timeline', project, message, body });
}
