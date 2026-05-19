import { verifyAuth, rateLimit } from './_auth.js';

// POST /api/contract-polish
//   { text: "...", field: "background" | "phase_1_deliverables" | ... }
//
// Light-touch copy-edit pass via Claude Haiku. Tightens prose,
// fixes grammar, preserves the user's intent — does NOT
// rewrite the whole thing or add facts. Returns
//   { polished: "...", original: "..." }
// so the UI can show a before/after the user accepts or reverts.

const MODEL = 'claude-haiku-4-5-20251001';

// Per-field guidance so the polish stays in the right register.
// Bullet-style fields get bullet preservation; the background line
// needs to remain a noun phrase that slots after "develop and execute…".
const FIELD_GUIDANCE = {
  background:
    'This text gets inserted after "Early Spring will develop and execute …" in a contract. ' +
    'It must read as a noun phrase (not a full sentence) — e.g., "a multi-sensory pop-up activating Brooklyn during Climate Week". ' +
    'Keep it descriptive and concrete. Strip filler. One or two clauses max.',
  phase_1_deliverables:
    'A bulleted list of what Early Spring will deliver during development + production. ' +
    'Keep the same number of bullets, preserve any "- " prefixes, keep each bullet short (≤8 words ideally), action-oriented, no period at end. ' +
    'Do not invent deliverables — just tighten what the user wrote.',
  phase_1_client_resp:
    'A bulleted list of what the client must provide during Phase 01. ' +
    'Keep "- " prefixes, keep each bullet short, action-oriented. Do not invent items.',
  phase_2_deliverables:
    'A bulleted list of what Early Spring will deliver during installation + launch (on-site execution). ' +
    'Keep "- " prefixes, keep each bullet short, action-oriented. Do not invent deliverables.',
};

const SYSTEM = `You are a copy editor for SOW (Statement of Work) language. You tighten prose, fix grammar, and improve clarity while preserving the author's exact intent.

Hard rules:
- Never invent facts (dollar amounts, dates, deliverables, party names).
- Preserve formatting markers exactly. If a line begins with "- " keep it as a bullet.
- Match the requested register — concise, professional, plain English. No legalese, no marketing fluff.
- If the input is already tight and clear, return it unchanged.
- Output ONLY the polished text. No preface, no quote marks, no commentary, no JSON.`;

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

  const text = String(req.body?.text || '').trim();
  const field = String(req.body?.field || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > 4000) return res.status(400).json({ error: 'text too long (max 4000 chars)' });

  const guidance = FIELD_GUIDANCE[field] || 'Tighten this prose without changing its meaning.';
  const userPrompt = `Polish the following text for an Early Spring SOW.

Context for this field:
${guidance}

INPUT:
${text}

POLISHED:`;

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
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `Anthropic ${upstream.status}`,
        detail: detail.slice(0, 300),
      });
    }
    const data = await upstream.json();
    const polished = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (!polished) {
      return res.status(502).json({ error: 'Empty polish response' });
    }
    return res.status(200).json({ polished, original: text, field });
  } catch (e) {
    return res.status(502).json({ error: 'Polish failed', detail: e.message });
  }
}
