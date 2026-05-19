-- Lets users attach an existing contract file (PDF / DOCX) to a
-- contract row. This is the "I already have a signed contract from
-- elsewhere, archive it here" path — distinct from the in-app
-- template + signing flow.
--
-- Storage: a private `contracts` bucket scoped by user_id in the
-- object path. RLS via storage.objects policies restricts each
-- user to their own folder.

alter table contracts
  add column if not exists uploaded_pdf_path text,
  add column if not exists uploaded_pdf_name text,
  add column if not exists uploaded_pdf_at   timestamptz;

-- Storage bucket. Private (must use a signed URL or auth-passthrough
-- to read).
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- Per-user RLS on the bucket — owner-only access keyed off the
-- first path segment (`{user_id}/...`).
drop policy if exists "contracts_storage_select_own" on storage.objects;
create policy "contracts_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_storage_insert_own" on storage.objects;
create policy "contracts_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_storage_update_own" on storage.objects;
create policy "contracts_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_storage_delete_own" on storage.objects;
create policy "contracts_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
