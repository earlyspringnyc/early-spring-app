import { verifyAuth, rateLimit } from './_auth.js';

// Strict allowlist + caps so an authenticated user can't burn through
// expensive models/large contexts on the org account.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-opus-4-7',
  // Legacy aliases used by older code paths in this repo:
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
]);
const MAX_TOKENS_CAP = 4096;
const MAX_MESSAGES = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!rateLimit(req)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // Verify user is authenticated (skip if Supabase not configured)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  // Sanitize the request body — only allow known fields and clamp the limits.
  const body = req.body || {};
  const model = typeof body.model === 'string' && ALLOWED_MODELS.has(body.model)
    ? body.model
    : 'claude-sonnet-4-20250514';
  const max_tokens = Math.min(MAX_TOKENS_CAP, Math.max(1, Number(body.max_tokens) || 1024));
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, MAX_MESSAGES) : [];
  if (!messages.length) return res.status(400).json({ error: 'messages required' });
  const system = typeof body.system === 'string' ? body.system : undefined;
  const temperature = body.temperature !== undefined ? Math.max(0, Math.min(1, Number(body.temperature))) : undefined;
  const safeBody = { model, max_tokens, messages, ...(system ? { system } : {}), ...(temperature !== undefined ? { temperature } : {}) };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(safeBody),
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
