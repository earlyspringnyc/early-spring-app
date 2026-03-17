export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accessToken, query } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: "Missing accessToken" });
  }

  try {
    // Search "other contacts" (people you've emailed)
    const url = query
      ? `https://people.googleapis.com/v1/otherContacts:search?query=${encodeURIComponent(query)}&readMask=names,emailAddresses&pageSize=10`
      : `https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses&pageSize=50`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      // Fallback: try regular contacts
      const fallback = await fetch(
        `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query || '')}&readMask=names,emailAddresses&pageSize=10`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      if (!fallback.ok) {
        return res.status(200).json({ contacts: [] });
      }
      const data = await fallback.json();
      const contacts = (data.results || [])
        .filter(r => r.person?.emailAddresses?.length)
        .map(r => ({
          name: r.person.names?.[0]?.displayName || '',
          email: r.person.emailAddresses[0].value,
        }));
      return res.status(200).json({ contacts });
    }

    const data = await response.json();
    // Handle search results vs list results
    const people = data.results?.map(r => r.person) || data.otherContacts || [];
    const contacts = people
      .filter(p => p?.emailAddresses?.length)
      .map(p => ({
        name: p.names?.[0]?.displayName || '',
        email: p.emailAddresses[0].value,
      }));

    return res.status(200).json({ contacts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
