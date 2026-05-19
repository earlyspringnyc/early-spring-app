import { supabase } from './supabase.js';

// Upload a contract file (PDF or DOCX) to the private `contracts`
// bucket. Path is `{user_id}/{contract_id}-{timestamp}.{ext}` so
// storage RLS scopes each user to their own folder.
//
// Returns the storage path (NOT a public URL — bucket is private).
// Use signedUrlForContract() to mint a short-lived URL for downloads.

const ALLOWED_EXTS = ['pdf', 'docx', 'doc'];
const MAX_BYTES = 25 * 1024 * 1024; // 25MB cap — typical signed PDF + scans

export async function uploadContractFile(authUserId, contractId, file) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!authUserId) throw new Error('Not signed in');
  if (!file) throw new Error('No file');
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 25MB.`);
  }
  const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : null;
  if (!ext) throw new Error('Only PDF, DOC, or DOCX files are accepted.');

  const path = `${authUserId}/${contractId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('contracts')
    .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
  if (upErr) throw new Error('Upload failed: ' + (upErr.message || 'unknown'));

  return { path, name: file.name };
}

// Mint a 1-hour signed URL for downloading an uploaded contract.
// Bucket is private — the URL is the only way to fetch.
export async function signedUrlForContract(path) {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from('contracts')
    .createSignedUrl(path, 60 * 60); // 1 hour
  if (error) {
    console.warn('[contract-upload] signed url failed:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

// Remove an uploaded file (best-effort). Called when the user
// replaces or clears the attachment.
export async function deleteContractFile(path) {
  if (!supabase || !path) return;
  const { error } = await supabase.storage.from('contracts').remove([path]);
  if (error) console.warn('[contract-upload] delete failed:', error.message);
}
