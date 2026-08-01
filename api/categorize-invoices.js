import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/categorize-invoices
//   body: { rows: [{ counterparty, amount, notes, due_date }, ...] }
//   returns: { rows: [{ ...input, suggested_category, ai_confidence, reasoning }, ...] }
//
// Walks Jennifer's XLS rows and asks Claude Haiku to bucket each one
// into the org_invoices category set. Cheap + fast classification —
// haiku handles this fine and keeps cost low for bulk imports.

const ALLOWED_CATEGORIES = [
  'project',
  'staffing',
  'rent',
  'utilities',
  'expenses',
  'vehicle',
  'professional_services',
  'taxes',
  'other',
  'uncategorized',
];

const MAX_ROWS = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, MAX_ROWS) : [];
  if (rows.length === 0) return res.status(400).json({ error: 'rows array required' });

  // Build a compact JSON payload Claude can scan in one shot. We index
  // by ix so the response can come back as an array of {ix, category,
  // confidence, reasoning}.
  const compact = rows.map((r, ix) => ({
    ix,
    counterparty: String(r.counterparty || '').slice(0, 140),
    notes: String(r.notes || r.description || '').slice(0, 200),
    amount: typeof r.amount === 'number' ? r.amount : Number(r.amount) || 0,
  }));

  const system = `You categorize accounts-payable invoice rows for a creative-production studio's bookkeeper. Pick the best category for each row from this exact list (use the lowercase id):

- project: tied to a specific client project (not crew/staff specifically — those go to staffing)
- staffing: crew, freelancers, talent payments, day-rate labor
- rent: office, studio, storage rent
- utilities: electric, internet, water, phone, gas
- expenses: office supplies, SaaS subscriptions, software, miscellaneous office overhead
- vehicle: vehicle insurance, gas, repairs, rentals, parking, tolls
- professional_services: accountant, lawyer, advisor, consultant fees
- taxes: federal, state, local, sales tax payments
- other: doesn't fit any of the above but you know what it is
- uncategorized: can't tell from the data, the human should triage

Return STRICT JSON ONLY (no prose, no code fences):
{
  "rows": [
    { "ix": <number>, "category": "<one of the ids above>", "confidence": "high" | "medium" | "low", "reasoning": "<one short phrase, internal>" },
    ...
  ]
}

Rules:
- Output one entry per input ix. Don't skip any.
- Default to "uncategorized" / "low" if the counterparty + notes don't hint at anything.
- A row mentioning a specific freelancer name + a "day rate" / "talent" / "crew" note → staffing.
- Generic "rent" / a landlord name → rent.
- ConEd / Verizon / Spectrum / WeWork internet → utilities.
- Notes mentioning a project name don't automatically mean category=project — only use that when nothing else fits.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: JSON.stringify({ rows: compact }) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[categorize-invoices] claude error:', response.status, errText.slice(0, 500));
      return res.status(response.status).json({ error: 'classification failed', detail: errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      console.warn('[categorize-invoices] non-JSON:', text.slice(0, 200));
      return res.status(502).json({ error: 'classifier returned invalid JSON', raw: text.slice(0, 200) });
    }

    // Normalize → map back onto input order
    const byIx = new Map();
    (parsed?.rows || []).forEach(r => {
      if (typeof r?.ix !== 'number') return;
      const cat = ALLOWED_CATEGORIES.includes(r.category) ? r.category : 'uncategorized';
      const conf = ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'low';
      byIx.set(r.ix, { category: cat, confidence: conf, reasoning: String(r.reasoning || '').slice(0, 140) });
    });
    const out = rows.map((r, ix) => {
      const guess = byIx.get(ix) || { category: 'uncategorized', confidence: 'low', reasoning: '' };
      return {
        ...r,
        suggested_category: guess.category,
        ai_confidence: guess.confidence,
        ai_reasoning: guess.reasoning,
      };
    });

    return res.status(200).json({ rows: out });
  } catch (e) {
    console.error('[categorize-invoices] threw:', e?.message || e);
    return res.status(500).json({ error: e.message || 'classification failed' });
  }
}
