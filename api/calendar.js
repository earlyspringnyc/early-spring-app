import { verifyAuth, rateLimit } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!rateLimit(req)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { accessToken, event, conferenceDataVersion, eventId } = req.body;
  if (!accessToken || !event) {
    return res.status(400).json({ error: "Missing accessToken or event data" });
  }

  try {
    // If eventId is supplied we update in place (PATCH); otherwise create.
    // sendUpdates=all keeps invitees in the loop on either path.
    const isUpdate = !!eventId;
    const base = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    const url = isUpdate
      ? `${base}/${encodeURIComponent(eventId)}?sendUpdates=all${conferenceDataVersion ? `&conferenceDataVersion=${conferenceDataVersion}` : ''}`
      : `${base}?sendUpdates=all${conferenceDataVersion ? `&conferenceDataVersion=${conferenceDataVersion}` : ''}`;
    const response = await fetch(url, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
