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
    const clientName = d.client || project.client || null;

    // ── Pull linked CRM contacts (project's "client team")
    // Two sources merged, same as the internal project dashboard:
    //   1. Explicit contact_projects links
    //   2. Implicit: contacts whose company matches project.client
    // Service role bypasses RLS — careful to only return safe fields.
    const safeContact = c => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      title: c.title,
      company: c.company,
      avatar_url: c.avatar_url,
      // intentionally omit: email, phone, notes, bio, brief_data,
      // last_contacted_at, status — these are internal-only.
    });
    let contacts = [];
    try {
      const { data: explicit } = await supabase
        .from('contact_projects')
        .select('role, contacts:contact_id(*)')
        .eq('project_id', shareRow.project_id);
      const seenIds = new Set();
      for (const row of explicit || []) {
        const c = row?.contacts;
        if (c && !seenIds.has(c.id)) {
          seenIds.add(c.id);
          contacts.push({ ...safeContact(c), role: row.role });
        }
      }
      if (clientName) {
        // Normalize via lowercase + suffix strip (mirrors
        // companyDedup.normalizeCompany) so "Lonely Planet" matches
        // "Lonely Planet, Inc." etc. ilike with the raw name catches
        // most real-world variants; we don't need full normalization
        // here since the data is small.
        const { data: byCompany } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', project.user_id || project.created_by)
          .ilike('company', `%${clientName}%`);
        for (const c of byCompany || []) {
          if (seenIds.has(c.id)) continue;
          seenIds.add(c.id);
          contacts.push({ ...safeContact(c), role: 'client_team' });
        }
      }
    } catch (e) {
      console.warn('[share] contacts load failed:', e.message);
    }

    // ── Pull linked CRM meetings — client-safe summary only
    const safeMeeting = m => ({
      title: m.title,
      occurred_at: m.occurred_at,
      duration_minutes: m.duration_minutes,
      summary: m.summary,
    });
    let crmMeetings = [];
    try {
      const { data: explicit } = await supabase
        .from('meeting_projects')
        .select('meetings:meeting_id(*)')
        .eq('project_id', shareRow.project_id);
      const seenMeetingIds = new Set();
      for (const row of explicit || []) {
        const m = row?.meetings;
        if (m && !seenMeetingIds.has(m.id)) {
          seenMeetingIds.add(m.id);
          crmMeetings.push(safeMeeting(m));
        }
      }
      // Also pull meetings via contact_id chain — any meeting with
      // an attendee in our resolved contacts list.
      const contactIds = contacts.map(c => c.id);
      if (contactIds.length) {
        const { data: viaContacts } = await supabase
          .from('meeting_contacts')
          .select('meetings:meeting_id(*)')
          .in('contact_id', contactIds);
        for (const row of viaContacts || []) {
          const m = row?.meetings;
          if (m && !seenMeetingIds.has(m.id)) {
            seenMeetingIds.add(m.id);
            crmMeetings.push(safeMeeting(m));
          }
        }
      }
      crmMeetings.sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));
    } catch (e) {
      console.warn('[share] meetings load failed:', e.message);
    }

    // Legacy JSONB-blob meetings (the pre-CRM "Add meeting" form
    // entries with isClientMeeting flag). Merged with CRM meetings
    // so old client links don't lose data.
    const legacyMeetings = (d.meetings || []).filter(m => m.isClientMeeting).map(m => ({
      title: m.title, date: m.date, time: m.time, location: m.location, summary: m.summary,
    }));

    const clientData = {
      name: d.name || project.name,
      client: clientName,
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
      meetings: legacyMeetings,
      crmMeetings,
      contacts,
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
