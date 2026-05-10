import { supabase } from './supabase.js';

// Upload a File/Blob to the public avatars bucket. Path includes the
// auth user_id so storage RLS allows the write; the contact id +
// timestamp keep files distinct across re-uploads. Returns the
// public URL ready to drop into a contact's avatar_url column.
export async function uploadAvatar(authUserId, contactId, file) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!authUserId) throw new Error('Not signed in');
  if (!file) throw new Error('No file');

  const MAX_BYTES = 5 * 1024 * 1024; // 5MB cap
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file');
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
  const path = `${authUserId}/${contactId}-${Date.now()}.${safeExt}`;

  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
  if (upErr) throw new Error('Upload failed: ' + (upErr.message || 'unknown'));

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl || null;
}
