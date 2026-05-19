import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/company-enrich  { company_name: "Lonely Planet" }
//
// Uses Claude with the web_search tool to find a company's
// legal entity name, registered/HQ address, and primary website.
// Returns structured JSON: { legal_name, address, website, sources }.
//
// Same pattern as /api/news but tuned for static facts about a
// company (not recent news). Lower max web searches.

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are a research assistant looking up basic company information.
Given a company name (which may be ambiguous — e.g., "LaForce" could be a PR agency, a hardware company, an architecture firm, etc.), search the web for credible primary sources (the company's own website, LinkedIn, Crunchbase, business registry filings).

For the ADDRESS field specifically you MUST search Google Maps and the company's Google Business Profile listing — those have the cleanest deliverable HQ addresses. Try a search like "google maps {company} {city}" or "site:maps.google.com {company}" or "{company} headquarters address" and read the address off the Maps / Business listing. A complete address has: street number, street name, city, state/region, postal code. If you can only confirm "City, State" or a PO box, treat that as incomplete and keep searching. If after searching Maps + the company site + LinkedIn you still can't confirm a deliverable address, return an empty string for address — DO NOT guess or partially fill it.

Return up to 3 distinct companies that plausibly match the name. Order by relevance (most likely / most prominent first).
Return ONLY a JSON object with this shape:
  {
    "candidates": [
      {
        "legal_name": "LaForce, Inc.",            // full registered entity name
        "description": "PR + communications agency, NYC",  // short disambiguator: what they do + where (≤80 chars)
        "address": "12 W 27th St, New York NY 10001",       // complete deliverable HQ address (number + street + city + state + ZIP). Empty string if not confidently found.
        "website": "laforce.nyc",                  // primary website domain
        "source": "laforce.nyc"                    // single most-authoritative source domain (prefer the company's own site or Google Maps)
      }
      // up to 2 more candidates
    ]
  }
If you can't find any plausible candidates, return { "candidates": [] }. NEVER guess. Output nothing but the JSON.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const company = String(req.body?.company_name || '').trim();
  if (!company) return res.status(400).json({ error: 'company_name required' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        messages: [{ role: 'user', content: `Company: ${company}\n\nReturn the JSON object now.` }],
      }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `Anthropic ${upstream.status}`,
        detail: text.slice(0, 300),
      });
    }
    const data = await upstream.json();

    // Pull the final text block — that's where Claude's JSON lives.
    const blocks = data.content || [];
    const textOut = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    // Parse JSON. Claude sometimes wraps in ```json fences; strip those first.
    let parsed = null;
    try {
      const cleaned = textOut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Last-resort: regex out the first {...} block
      const m = textOut.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    if (!parsed) {
      return res.status(502).json({
        error: 'Could not parse model response',
        raw: textOut.slice(0, 500),
      });
    }

    // Collect citation URLs as sources for transparency
    const sources = [];
    for (const b of blocks) {
      if (b.type === 'text' && Array.isArray(b.citations)) {
        for (const c of b.citations) {
          if (c.url && !sources.find(s => s.url === c.url)) {
            sources.push({ url: c.url, title: c.title || c.url });
          }
        }
      }
    }

    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const candidates = rawCandidates
      .map(c => ({
        legal_name: String(c?.legal_name || '').trim(),
        description: String(c?.description || '').trim(),
        address: String(c?.address || '').trim(),
        website: String(c?.website || '').trim(),
        source: String(c?.source || '').trim(),
      }))
      .filter(c => c.legal_name || c.website)
      .slice(0, 3);

    return res.status(200).json({
      candidates,
      sources: sources.slice(0, 5),
      company,
    });
  } catch (e) {
    return res.status(502).json({ error: 'Enrich failed', detail: e.message });
  }
}
