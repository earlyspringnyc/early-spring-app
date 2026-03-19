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

// Simple in-memory rate limiter (per Vercel serverless instance)
const rateLimits = {};
const WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS = 30; // per minute per IP

export function rateLimit(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();

  if (!rateLimits[ip] || now - rateLimits[ip].start > WINDOW_MS) {
    rateLimits[ip] = { start: now, count: 1 };
    return true;
  }

  rateLimits[ip].count++;
  if (rateLimits[ip].count > MAX_REQUESTS) return false;
  return true;
}
