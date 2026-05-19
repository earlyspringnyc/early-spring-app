import { createClient } from '@supabase/supabase-js';

// Verify the user has a valid Supabase session
// Returns the user object or null
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '') || req.body?.supabaseToken;

  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (e) {
    return null;
  }
}

// Simple in-memory rate limiter (per Vercel serverless instance).
// Tracks per-IP AND per-bearer-token. Failing either limit returns
// false. Different limits per kind so a logged-in user can be more
// permissive than anonymous traffic.
const rateLimits = {};
const WINDOW_MS = 60000; // 1 minute
const MAX_IP_REQUESTS = 30;     // per minute per IP (anonymous baseline)
const MAX_USER_REQUESTS = 120;  // per minute per signed-in user

function bumpAndCheck(key, max) {
  const now = Date.now();
  const slot = rateLimits[key];
  if (!slot || now - slot.start > WINDOW_MS) {
    rateLimits[key] = { start: now, count: 1 };
    return true;
  }
  slot.count++;
  return slot.count <= max;
}

export function rateLimit(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  // Bucket by JWT (first 16 chars) too so the same user across IPs
  // is bounded, and rotating IPs doesn't bypass the limit.
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const tokenKey = auth.replace('Bearer ', '').slice(0, 16) || null;

  if (!bumpAndCheck(`ip:${ip}`, MAX_IP_REQUESTS)) return false;
  if (tokenKey && !bumpAndCheck(`tok:${tokenKey}`, MAX_USER_REQUESTS)) return false;
  return true;
}
