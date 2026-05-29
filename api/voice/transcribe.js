import { verifyAuth, rateLimit } from '../_auth.js';

// Transcribe a short voice memo using Gemini 2.5 Flash (audio in,
// text out). The client sends base64 audio + the MIME type the
// browser chose (audio/webm on Chrome/Android, audio/mp4 on Safari).
//
// We don't store the audio anywhere — only the transcript ends up
// in Supabase. That keeps cost + privacy footprint minimal and means
// no Supabase Storage setup is required.

const ALLOWED_MIMES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
]);

// 8 MB of base64 is roughly 6 MB of audio — about 30 minutes of opus,
// well past anything that should land here from a voice memo.
const MAX_BASE64_BYTES = 8 * 1024 * 1024;

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req)) return res.status(429).json({ error: 'Too many requests' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.GEMINI_API_KEY
    || process.env.Gemini_API_Key
    || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { audio, mime } = req.body || {};
  if (typeof audio !== 'string' || !audio) {
    return res.status(400).json({ error: 'audio (base64 string) is required' });
  }
  if (audio.length > MAX_BASE64_BYTES) {
    return res.status(413).json({ error: 'audio too large (max ~6MB decoded)' });
  }
  // Strip a data: prefix if the client forgot to.
  const cleanAudio = audio.startsWith('data:')
    ? audio.slice(audio.indexOf(',') + 1)
    : audio;

  // Normalize the mime — strip codec parameters for the allowlist check
  // but pass the full string through to Gemini (it accepts both).
  const baseMime = (mime || 'audio/webm').split(';')[0].trim().toLowerCase();
  const fullMime = (mime || 'audio/webm').trim();
  if (!ALLOWED_MIMES.has(baseMime) && !ALLOWED_MIMES.has(fullMime.toLowerCase())) {
    return res.status(400).json({ error: `unsupported mime: ${mime}` });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: fullMime, data: cleanAudio } },
          { text: 'Transcribe this voice memo verbatim. Return only the transcription as plain text — no preamble, no quotation marks, no commentary. If the audio is silent or unintelligible, return an empty string.' },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[transcribe] gemini error:', response.status, errText.slice(0, 500));
      return res.status(response.status).json({ error: 'transcription failed', detail: errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ transcript: text.trim() });
  } catch (e) {
    console.error('[transcribe] threw:', e?.message || e);
    return res.status(500).json({ error: e.message || 'transcription failed' });
  }
}
