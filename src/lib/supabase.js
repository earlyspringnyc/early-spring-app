import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
let supabaseError = false;

if (supabaseUrl && supabaseAnonKey) {
  try {
    // Passthrough lock — bypasses the default navigator.locks-based lock
    // that supabase-js v2 uses to coordinate auth across tabs. That lock
    // can deadlock in certain browser/storage states (incognito, partitioned
    // storage, third-party-cookie blocks), causing getSession() to hang
    // forever on every refresh. Single-tab use is fine; multi-tab races
    // are extremely unlikely for Morgan's actual usage.
    const passthroughLock = async (_name, _acquireTimeout, fn) => fn();

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        lock: passthroughLock,
      },
    });
  } catch (e) {
    console.error('Supabase init failed:', e);
    supabaseError = true;
  }
}

export { supabase };
export const isSupabaseConfigured = () => !!supabase && !supabaseError;
