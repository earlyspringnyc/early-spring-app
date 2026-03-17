export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accessToken, event, conferenceDataVersion } = req.body;
  if (!accessToken || !event) {
    return res.status(400).json({ error: "Missing accessToken or event data" });
  }

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${conferenceDataVersion ? `&conferenceDataVersion=${conferenceDataVersion}` : ''}`;
    const response = await fetch(url, {
      method: "POST",
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
