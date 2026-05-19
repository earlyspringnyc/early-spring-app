// Daily overdue-invoice digest. Wired to a Vercel Cron at 09:00.
//
// For each project (across all orgs the cron sees), walks
// project.docs and finds:
//   - client invoices (type='client_invoice', status='sent') with
//     a dueDate in the past
//   - vendor invoices (type='invoice', status!='paid') with a
//     dueDate in the past
//
// Posts a single Slack message summarizing both. Doesn't email
// the clients automatically — those are gated behind a manual
// "Send reminder" click from the AR row. The goal is to keep
// the studio in the loop without surprising clients.

import { createClient } from '@supabase/supabase-js';

function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(s))) {
    const d = new Date(String(s) + (String(s).length === 10 ? 'T00:00:00' : ''));
    return isNaN(d) ? null : d;
  }
  const m = String(s).split('/');
  if (m.length === 3) {
    const d = new Date(+m[2], +m[0] - 1, +m[1]);
    return isNaN(d) ? null : d;
  }
  return null;
}
function daysOverdue(s) {
  const d = parseDate(s);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

async function slackNotify(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return r.ok;
  } catch (e) { return false; }
}

export default async function handler(req, res) {
  // Vercel cron POSTs without auth header; allow only if invoked
  // by cron secret OR no secret configured (dev).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = req.headers.authorization || '';
    if (got !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Pull every project (across all orgs). The cron runs with the
  // service role so RLS doesn't apply.
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, client, org_id, data');
  if (error) {
    return res.status(500).json({ error: 'Project fetch failed: ' + error.message });
  }

  const ar = []; // overdue client invoices
  const ap = []; // overdue vendor invoices
  for (const p of projects || []) {
    const docs = p.data?.docs || [];
    const vendors = p.data?.vendors || [];
    for (const d of docs) {
      if (d.type === 'client_invoice' && d.status !== 'paid') {
        const days = daysOverdue(d.dueDate);
        if (days != null && days > 0) {
          ar.push({
            projectName: p.name, client: p.client || '',
            number: d.name, amount: Number(d.amount) || 0,
            daysOverdue: days,
          });
        }
      } else if (d.type === 'invoice' && d.status !== 'paid') {
        const days = daysOverdue(d.dueDate);
        if (days != null && days > 0) {
          const vendor = vendors.find(v => v.id === d.vendorId);
          ap.push({
            projectName: p.name, vendor: vendor?.name || '',
            number: d.name,
            remaining: (Number(d.amount) || 0) - (Number(d.paidAmount) || 0),
            daysOverdue: days,
          });
        }
      }
    }
  }

  const totalAr = ar.reduce((a, r) => a + r.amount, 0);
  const totalAp = ap.reduce((a, r) => a + r.remaining, 0);

  // Compose a Slack digest only if there's something to say.
  let slackSent = false;
  if (ar.length || ap.length) {
    const arLines = ar.slice(0, 10).sort((a, b) => b.daysOverdue - a.daysOverdue).map(r =>
      `• ${r.number || '(untitled)'} · *${r.client || r.projectName}* — $${r.amount.toLocaleString()} (${r.daysOverdue}d overdue)`
    ).join('\n');
    const apLines = ap.slice(0, 10).sort((a, b) => b.daysOverdue - a.daysOverdue).map(r =>
      `• ${r.number || '(untitled)'} · *${r.vendor || r.projectName}* — $${r.remaining.toLocaleString()} (${r.daysOverdue}d overdue)`
    ).join('\n');
    const text = [
      `📋 *Daily collections digest*`,
      ar.length ? `\n*Outstanding from clients (AR)* — ${ar.length} invoice${ar.length === 1 ? '' : 's'}, *$${totalAr.toLocaleString()}* total:\n${arLines}` : '',
      ar.length > 10 ? `_+${ar.length - 10} more…_` : '',
      ap.length ? `\n*Owed to vendors (AP)* — ${ap.length} invoice${ap.length === 1 ? '' : 's'}, *$${totalAp.toLocaleString()}* total:\n${apLines}` : '',
      ap.length > 10 ? `_+${ap.length - 10} more…_` : '',
    ].filter(Boolean).join('\n');
    slackSent = await slackNotify(text);
  }

  return res.status(200).json({
    ok: true,
    arCount: ar.length, arTotal: totalAr,
    apCount: ap.length, apTotal: totalAp,
    slackSent,
  });
}
