import { createClient } from '@supabase/supabase-js';

// GET /api/share?token=...
// Looks up a share token in project_shares (O(1) indexed), enforces
// expiry + revoke, returns client-safe project data. Replaces the old
// O(n) full-table scan that searched data->>'shareToken'.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(400).json({ error: 'Missing share token' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up the token
    const { data: shareRow, error: shareErr } = await supabase
      .from('project_shares')
      .select('project_id, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle();
    if (shareErr) {
      console.error('[share] token lookup error:', shareErr);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!shareRow) return res.status(404).json({ error: 'Project not found or link expired' });
    if (shareRow.revoked_at) return res.status(404).json({ error: 'This link has been revoked' });
    if (shareRow.expires_at && new Date(shareRow.expires_at) < new Date()) {
      return res.status(404).json({ error: 'This link has expired' });
    }

    // Fetch the project
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', shareRow.project_id)
      .maybeSingle();
    if (projErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const d = project.data || {};
    const clientData = {
      name: d.name || project.name,
      client: d.client || project.client,
      eventDate: d.eventDate,
      logo: d.logo,
      stage: d.stage,
      cats: (d.cats || []).map(c => ({
        name: c.name,
        items: c.items.map(it => ({
          name: it.name,
          clientPrice: it.actualCost === 0 ? 0 : it.actualCost * (1 + (it.margin || 0)),
        })),
      })),
      timeline: (d.timeline || []).map(t => ({
        name: t.name, category: t.category, status: t.status,
        startDate: t.startDate, endDate: t.endDate,
      })),
      clientFiles: d.clientFiles || [],
      meetings: (d.meetings || []).filter(m => m.isClientMeeting).map(m => ({
        title: m.title, date: m.date, time: m.time, location: m.location, summary: m.summary,
      })),
      creativeAssets: (d.creativeAssets || []).filter(a => a.approvalStatus === 'sent-to-client').map(a => ({
        name: a.name, category: a.category, fileData: a.fileData, fileName: a.fileName,
      })),
    };

    // Short cache so revokes propagate fast (15s instead of 60s).
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
    return res.status(200).json(clientData);
  } catch (e) {
    console.error('[share] Error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
