import { f$, fp } from './format.js';
import { ci, ct } from './calc.js';

// Convert message to email-safe HTML
// Handles both rich HTML (from contentEditable paste) and plain text with bullet markers
function formatMessage(msg) {
  if (!msg) return '';
  // If it already contains HTML tags (from rich paste), sanitize with whitelist
  if (msg.includes('<') && (msg.includes('<br') || msg.includes('<div') || msg.includes('<li') || msg.includes('<ul') || msg.includes('<p') || msg.includes('<b'))) {
    return msg
      // Strip dangerous elements entirely
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
      // Strip all event handlers
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      // Strip javascript: URLs
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
      .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '')
      // Strip data: URLs in src (potential XSS)
      .replace(/src\s*=\s*["']data:text\/html[^"']*["']/gi, '');
  }
  // Plain text — convert bullet patterns and newlines
  const escaped = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = escaped.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-•*]\s+(.*)/);
    if (bulletMatch) {
      if (!inList) { html += '<ul style="margin:8px 0;padding-left:20px">'; inList = true; }
      html += `<li style="margin:4px 0;color:#333">${bulletMatch[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += (line.trim() === '' ? '<br>' : `<div>${line}</div>`);
    }
  }
  if (inList) html += '</ul>';
  return html;
}

export function budgetEmailHtml(project, cats, ag, comp, feeP, message) {
  let orgName="Early Spring LLC",orgAddr="385 Van Brunt St, Floor 2, Brooklyn, NY 11231",orgWeb="earlyspring.nyc";
  try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgName=o.name;if(o.address)orgAddr=o.address;if(o.website)orgWeb=o.website}catch(e){}
  const catRows = cats.map(c => {
    const t = ct(c.items).totals;
    const catHeader = `<tr style="border-bottom:1px solid #F0F0F0;background:#FAFAF9"><td colspan="2" style="padding:12px 0;color:#333;font-size:14px;font-weight:600">${c.name}</td><td style="padding:12px 0;text-align:right;font-family:monospace;color:#333;font-size:14px;font-weight:600">${f$(t.clientPrice)}</td></tr>`;
    const itemRows = c.items.filter(it => ci(it).clientPrice > 0).map(it =>
      `<tr style="border-bottom:1px solid #F8F8F8"><td style="padding:8px 0 8px 20px;color:#555;font-size:13px">${it.name}</td><td style="padding:8px 0 8px 8px;color:#999;font-size:12px;font-style:italic">${it.details || ''}</td><td style="padding:8px 0;text-align:right;font-family:monospace;color:#555;font-size:13px">${f$(ci(it).clientPrice)}</td></tr>`
    ).join('');
    return catHeader + itemRows;
  }).join('');

  const agRows = ag.map(it => {
    const c = ci(it);
    return `<tr style="border-bottom:1px solid #F0F0F0"><td style="padding:10px 0;color:#333;font-size:13px">${it.name}</td><td style="padding:10px 0;text-align:right;font-family:monospace;color:#333;font-size:13px">${f$(c.clientPrice)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:40px 20px">
  <div style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <table style="width:100%;padding-bottom:20px;margin-bottom:28px;border-bottom:2px solid #432D1C"><tr>
      <td style="vertical-align:top">
        <div style="font-size:10px;font-weight:700;color:#432D1C;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${orgName.toUpperCase()}</div>
        <div style="font-size:24px;font-weight:700;color:#432D1C">Production Estimate</div>
        <div style="font-size:12px;color:#999;margin-top:4px">Prepared by ${orgName}</div>
      </td>
      <td style="text-align:right;font-size:13px;color:#777;line-height:1.8;vertical-align:top">
        <div><strong style="color:#555">Project:</strong> ${project.name || '\u2014'}</div>
        <div><strong style="color:#555">Client:</strong> ${project.client || '\u2014'}</div>
        <div><strong style="color:#555">Date:</strong> ${project.date || new Date().toLocaleDateString()}</div>
        ${project.eventDate ? `<div><strong style="color:#555">Event:</strong> ${project.eventDate}</div>` : ''}
      </td>
    </tr></table>

    ${message?`<div style="margin-bottom:28px;padding:16px 20px;background:#FAFAF9;border-radius:8px;border-left:3px solid #432D1C"><div style="font-size:13px;color:#333;line-height:1.6">${formatMessage(message)}</div></div>`:''}

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <thead><tr style="border-bottom:2px solid #E5E5E5"><th style="text-align:left;padding:8px 0;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Item</th><th style="text-align:left;padding:8px 0;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Description</th><th style="text-align:right;padding:8px 0;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Cost</th></tr></thead>
      <tbody>
        ${catRows}
        <tr style="border-top:2px solid #432D1C"><td colspan="2" style="padding:14px 0;font-weight:700;color:#432D1C;font-size:14px">PRODUCTION SUBTOTAL</td><td style="padding:14px 0;text-align:right;font-weight:700;font-family:monospace;color:#432D1C;font-size:14px">${f$(comp.productionSubtotal.clientPrice)}</td></tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <thead><tr style="border-bottom:1px solid #E5E5E5"><th style="text-align:left;padding:8px 0;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Agency Services</th><th style="text-align:right;padding:8px 0;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Cost</th></tr></thead>
      <tbody>
        ${agRows}
        <tr style="border-top:1px solid #DDD"><td style="padding:10px 0;font-weight:600;color:#555;font-size:13px">Agency Costs Subtotal</td><td style="padding:10px 0;text-align:right;font-weight:600;font-family:monospace;color:#555;font-size:13px">${f$(comp.agencyCostsSubtotal.clientPrice)}</td></tr>
        <tr><td style="padding:10px 0;color:#777;font-size:13px">Agency Fee (${fp(feeP)})</td><td style="padding:10px 0;text-align:right;font-family:monospace;color:#777;font-size:13px">${f$(comp.agencyFee.clientPrice)}</td></tr>
      </tbody>
    </table>

    <table style="width:100%;background:#432D1C;border-radius:10px" cellpadding="0" cellspacing="0"><tr>
      <td width="60%" style="padding:20px 28px;font-size:14px;font-weight:700;color:#fff;letter-spacing:.06em">GRAND TOTAL</td>
      <td width="40%" style="padding:20px 28px;text-align:right;font-size:24px;font-weight:700;color:#fff;font-family:monospace">${f$(comp.grandTotal)}</td>
    </tr></table>

    <div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #EEE">
      <div style="font-size:10px;color:#BBB">Sent from <a href="https://early-spring-app.vercel.app" style="color:#999;text-decoration:none">Morgan</a> @ <a href="https://${orgWeb.replace(/^https?:\/\//,'')}" style="color:#999;text-decoration:none">${orgName}</a></div>
      ${orgAddr?`<div style="font-size:9px;color:#CCC;margin-top:4px">${orgAddr}</div>`:''}
    </div>
  </div>
</div></body></html>`;
}

export function timelineEmailHtml(project, tasks, message) {
  let orgName="Early Spring LLC",orgAddr="385 Van Brunt St, Floor 2, Brooklyn, NY 11231",orgWeb="earlyspring.nyc";
  try{const o=JSON.parse(localStorage.getItem("es_org")||"{}");if(o.name)orgName=o.name;if(o.address)orgAddr=o.address;if(o.website)orgWeb=o.website}catch(e){}
  const dated = tasks.filter(t => t.startDate).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const taskRows = dated.map(t =>
    `<tr style="border-bottom:1px solid #F0F0F0">
      <td style="padding:10px 4px;color:#333;font-size:13px">${t.name}</td>
      <td style="padding:10px 4px;color:#777;font-size:12px">${t.category || ''}</td>
      <td style="padding:10px 4px;color:#555;text-align:center;font-family:monospace;font-size:12px">${t.startDate || '\u2014'}</td>
      <td style="padding:10px 4px;color:#555;text-align:center;font-family:monospace;font-size:12px">${t.endDate || '\u2014'}</td>
      <td style="padding:10px 4px;text-align:center"><span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:8px;background:${t.status === 'done' ? '#E8F5E9' : t.status === 'progress' ? '#E0F7FA' : '#FFF8E1'};color:${t.status === 'done' ? '#2E7D32' : t.status === 'progress' ? '#00838F' : '#F57F17'};text-transform:uppercase">${t.status === 'done' ? 'Done' : t.status === 'progress' ? 'In Progress' : 'To Do'}</span></td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:700px;margin:0 auto;padding:40px 20px">
  <div style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <table style="width:100%;padding-bottom:20px;margin-bottom:28px;border-bottom:2px solid #432D1C"><tr>
      <td style="vertical-align:top">
        <div style="font-size:10px;font-weight:700;color:#432D1C;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">${orgName.toUpperCase()}</div>
        <div style="font-size:24px;font-weight:700;color:#432D1C">Project Timeline</div>
        <div style="font-size:12px;color:#999;margin-top:4px">Prepared by ${orgName}</div>
      </td>
      <td style="text-align:right;font-size:13px;color:#777;line-height:1.8;vertical-align:top">
        <div><strong style="color:#555">Project:</strong> ${project.name || '\u2014'}</div>
        <div><strong style="color:#555">Client:</strong> ${project.client || '\u2014'}</div>
        ${project.eventDate ? `<div><strong style="color:#555">Event:</strong> ${project.eventDate}</div>` : ''}
      </td>
    </tr></table>

    ${message?`<div style="margin-bottom:28px;padding:16px 20px;background:#FAFAF9;border-radius:8px;border-left:3px solid #432D1C"><div style="font-size:13px;color:#333;line-height:1.6">${formatMessage(message)}</div></div>`:''}

    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:2px solid #E5E5E5">
        <th style="text-align:left;padding:8px 4px;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Task</th>
        <th style="text-align:left;padding:8px 4px;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Category</th>
        <th style="text-align:center;padding:8px 4px;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Start</th>
        <th style="text-align:center;padding:8px 4px;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">End</th>
        <th style="text-align:center;padding:8px 4px;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em">Status</th>
      </tr></thead>
      <tbody>${taskRows}</tbody>
    </table>

    ${dated.length === 0 ? '<p style="text-align:center;padding:20px;color:#999;font-size:13px">No dated tasks in the timeline.</p>' : ''}

    <div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #EEE">
      <div style="font-size:10px;color:#BBB">Sent from <a href="https://early-spring-app.vercel.app" style="color:#999;text-decoration:none">Morgan</a> @ <a href="https://${orgWeb.replace(/^https?:\/\//,'')}" style="color:#999;text-decoration:none">${orgName}</a></div>
      ${orgAddr?`<div style="font-size:9px;color:#CCC;margin-top:4px">${orgAddr}</div>`:''}
    </div>
  </div>
</div></body></html>`;
}
