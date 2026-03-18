import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: "Missing share token" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find project with matching shareToken in its data
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*');

    if (error) {
      console.error('[share] Query error:', error);
      return res.status(500).json({ error: "Database error" });
    }

    const project = (projects || []).find(p => p.data?.shareToken === token);

    if (!project) {
      return res.status(404).json({ error: "Project not found or link expired" });
    }

    // Return only client-safe data
    const d = project.data || {};
    const clientData = {
      name: d.name || project.name,
      client: d.client || project.client,
      eventDate: d.eventDate,
      logo: d.logo,
      stage: d.stage,
      // Budget estimate (client prices only)
      cats: (d.cats || []).map(c => ({
        name: c.name,
        items: c.items.map(it => ({
          name: it.name,
          clientPrice: it.actualCost === 0 ? 0 : it.actualCost * (1 + (it.margin || 0)),
        })),
      })),
      // Timeline (no internal assignees)
      timeline: (d.timeline || []).map(t => ({
        name: t.name,
        category: t.category,
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
      // Client files
      clientFiles: d.clientFiles || [],
      // Meetings marked as client meetings
      meetings: (d.meetings || []).filter(m => m.isClientMeeting).map(m => ({
        title: m.title,
        date: m.date,
        time: m.time,
        location: m.location,
        summary: m.summary,
      })),
      // Creative assets sent to client
      creativeAssets: (d.creativeAssets || []).filter(a => a.approvalStatus === "sent-to-client").map(a => ({
        name: a.name,
        category: a.category,
        fileData: a.fileData,
        fileName: a.fileName,
      })),
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(clientData);
  } catch (e) {
    console.error('[share] Error:', e);
    return res.status(500).json({ error: "Internal error" });
  }
}
