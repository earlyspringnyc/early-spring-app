-- Public-read bucket for images attached to production topics
-- (venues, catering, permits, etc). Same trade-off as the other
-- public buckets — paths are UUIDs so URLs are unguessable, and
-- it lets staff render thumbnails without minting signed URLs.

insert into storage.buckets (id, name, public)
  values ('production-topics', 'production-topics', true)
  on conflict (id) do nothing;

drop policy if exists "production_topics_public_read" on storage.objects;
drop policy if exists "production_topics_auth_write" on storage.objects;
drop policy if exists "production_topics_auth_delete" on storage.objects;

create policy "production_topics_public_read" on storage.objects for select
  using (bucket_id = 'production-topics');
create policy "production_topics_auth_write" on storage.objects for insert
  with check (bucket_id = 'production-topics' and auth.role() = 'authenticated');
create policy "production_topics_auth_delete" on storage.objects for delete
  using (bucket_id = 'production-topics' and auth.role() = 'authenticated');
