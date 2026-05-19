import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/news  { company: "Lonely Planet", context?: "..." }
//
// Calls Claude with the web_search tool to summarize the company's
// recent news (last ~60 days). Returns one tight paragraph the
// prep brief can drop into its "Company news" section.
//
// Server-side because:
//   1. ANTHROPIC_API_KEY must not ship to the browser.
//   2. We want to keep prompt construction in one place — the
//      client just asks for "news about X".

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are a research assistant preparing a one-paragraph briefing for an experiential marketing studio's founder ahead of a sales call.
Given a company name, search the web for credible news from the last ~60 days and write a single tight paragraph (3–5 sentences) covering:
- Notable launches, campaigns, or pivots
- Leadership changes
- Anything indicating budget, expansion, or new directions
Keep it factual, neutral, and useful for a strategy conversation. No filler, no "exciting news!", no "I found that...". Just the paragraph.`;

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

  const company = String(req.body?.company || '').trim();
  if (!company) return res.status(400).json({ error: 'company is required' });
  const context = String(req.body?.context || '').trim();

  const userMsg = context
    ? `Company: ${company}\nExtra context: ${context}\n\nWrite the one-paragraph briefing.`
    : `Company: ${company}\n\nWrite the one-paragraph briefing.`;

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
        max_tokens: 1024,
        system: SYSTEM,
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
        ],
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `Anthropic ${upstream.status}`,
        detail: text.slice(0, 400),
      });
    }
    const data = await upstream.json();

    // Claude returns content as an array of blocks. We want the
    // final text block — that's the paragraph. Citations/searches
    // come as separate blocks we can surface as sources.
    const blocks = data.content || [];
    const textBlocks = blocks.filter(b => b.type === 'text').map(b => b.text);
    const text = textBlocks.join('\n\n').trim();

    // Collect citation URLs from the search-result blocks.
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

    return res.status(200).json({
      text,
      sources: sources.slice(0, 8),
      fetched_at: new Date().toISOString(),
      company,
    });
  } catch (e) {
    return res.status(502).json({ error: 'News fetch failed', detail: e.message });
  }
}
