-- Make the 'files' bucket public-read so creative assets, contracts,
-- and any other Storage-backed file can be rendered directly via
-- <img src=...>, downloaded, or opened in a new tab without minting
-- a signed URL on every render.
--
-- Object paths are <orgId>/<projectId>/<assetId>_<filename> — UUIDs
-- only, so the URLs are effectively unguessable. Same trade-off the
-- existing avatars / wardrobe-headshots / client-uploads buckets
-- already make. Writes stay gated to authenticated users.

update storage.buckets
  set public = true
  where id = 'files';

drop policy if exists "files_public_read" on storage.objects;
create policy "files_public_read" on storage.objects for select
  using (bucket_id = 'files');
