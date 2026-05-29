import { verifyAuth, rateLimit } from '../_auth.js';

// Classify a voice-memo transcript into one of three destinations:
//   - 'reminder'     → goes into user_notes with reminder_date set,
//                      so the existing sticky-notes reminder UI picks
//                      it up and offers an "add to calendar" action.
//   - 'project_note' → goes into project_notes attached to a project
//                      Claude picked from the active-projects list.
//   - 'general_note' → goes into user_notes as a plain personal note.
//
// The client posts { transcript, projects: [{id, name, client}] }. We
// forward to Claude with the project list as context and a strict
// JSON schema, then return the parsed suggestion. The client shows it
// as a confirm card; nothing is filed until the user accepts.

const MAX_PROJECTS = 60;       // cap context size
const MAX_TRANSCRIPT_CHARS = 4000;

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

  const { transcript, projects } = req.body || {};
  if (typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript required' });
  }
  const safeTranscript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);

  const projectList = Array.isArray(projects)
    ? projects.slice(0, MAX_PROJECTS).map(p => ({
        id: String(p?.id || ''),
        name: String(p?.name || '').slice(0, 120),
        client: String(p?.client || '').slice(0, 120),
      })).filter(p => p.id && p.name)
    : [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dow = today.toLocaleDateString('en-US', { weekday: 'long' });

  const projectsBlock = projectList.length
    ? projectList.map(p => `- id="${p.id}" — ${p.name}${p.client ? ` (${p.client})` : ''}`).join('\n')
    : '(no active projects)';

  const system = `You triage short personal voice memos for a producer running a creative studio. Pick where this thought belongs.

Today is ${todayStr} (${dow}).

Active projects the user can route to:
${projectsBlock}

Return STRICT JSON ONLY (no prose, no code fences) with this exact shape:
{
  "kind": "reminder" | "project_note" | "general_note",
  "summary": string,                        // 4-8 words, sentence case, what this is
  "body": string,                           // cleaned-up version of what the user said, lightly punctuated, NO new content
  "reminder_date": "YYYY-MM-DDTHH:MM:00" | "YYYY-MM-DD" | null,
  "reminder_action": string,                // imperative phrase, 3-8 words, present only if kind=reminder
  "project_id": string | null,              // must match one of the ids above if kind=project_note
  "confidence": "high" | "medium" | "low",
  "reasoning": string                       // one short sentence, internal; user won't see it
}

Rules:
- kind=reminder when the memo contains a clear time-bound task or follow-up ("remind me tomorrow to…", "next week call…", "monday morning send…"). Resolve relative dates to absolute. Prefer the next future occurrence. If no time-of-day is given, omit it (date-only).
- kind=project_note when the memo is clearly about ONE of the active projects above — match on project name, client name, or distinctive terms. Set project_id to the matching id. If it could fit multiple projects, pick the most specific match and use medium confidence.
- kind=general_note for everything else: brain-dumps, observations, ideas, gratitude, thoughts with no project hook or time.
- Never invent a project_id that isn't in the list above. If unsure, fall back to general_note.
- "body" is just a cleaned transcript — fix obvious filler words and add punctuation. Do NOT add information the user did not say.`;

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
        max_tokens: 600,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: safeTranscript }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[classify] claude error:', response.status, errText.slice(0, 500));
      return res.status(response.status).json({ error: 'classification failed', detail: errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[classify] non-JSON response:', text.slice(0, 200));
      return res.status(502).json({ error: 'classifier returned invalid JSON', raw: text.slice(0, 200) });
    }

    // Normalize: enforce kind, enforce project_id is in the allowed set,
    // normalize reminder_date to ISO.
    const allowedKinds = new Set(['reminder', 'project_note', 'general_note']);
    if (!allowedKinds.has(parsed.kind)) parsed.kind = 'general_note';

    if (parsed.kind === 'project_note') {
      const ok = projectList.find(p => p.id === parsed.project_id);
      if (!ok) {
        parsed.kind = 'general_note';
        parsed.project_id = null;
      } else {
        parsed.project_name = ok.name;
        parsed.project_client = ok.client;
      }
    } else {
      parsed.project_id = null;
    }

    if (parsed.kind === 'reminder' && parsed.reminder_date) {
      let iso = String(parsed.reminder_date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = iso + 'T09:00:00';
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        parsed.reminder_date = d.toISOString();
      } else {
        parsed.reminder_date = null;
      }
    } else {
      parsed.reminder_date = null;
    }

    return res.status(200).json({ suggestion: parsed });
  } catch (e) {
    console.error('[classify] threw:', e?.message || e);
    return res.status(500).json({ error: e.message || 'classification failed' });
  }
}
