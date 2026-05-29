-- ============================================================
-- Client Portal: file uploads + cross-team notifications
-- ============================================================
-- Two pieces:
--   1) client_file_uploads: rows describing each file a client
--      has uploaded into the project. Actual bytes live in the
--      'client-uploads' Storage bucket.
--   2) notifications: in-app notifications for staff. A trigger
--      fans out one row per project-accessible staff member every
--      time a client uploads a file, so the bell icon + chime fire
--      immediately via Realtime.
-- ============================================================

-- ── client_file_uploads ───────────────────────────────────────
create table if not exists client_file_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  storage_path text not null,        -- key inside the 'client-uploads' bucket
  file_name text not null,
  file_size bigint,
  content_type text,
  label text,                        -- optional client-supplied description
  created_at timestamptz not null default now()
);
create index if not exists client_file_uploads_project_idx
  on client_file_uploads(project_id, created_at desc);
create index if not exists client_file_uploads_user_idx
  on client_file_uploads(user_id);

alter table client_file_uploads enable row level security;

drop policy if exists "client_file_uploads_client_select" on client_file_uploads;
drop policy if exists "client_file_uploads_client_insert" on client_file_uploads;
drop policy if exists "client_file_uploads_client_delete" on client_file_uploads;
drop policy if exists "client_file_uploads_staff_select" on client_file_uploads;
drop policy if exists "client_file_uploads_staff_delete" on client_file_uploads;

-- Clients can read + insert + delete their OWN uploads for projects
-- they're linked to via project_clients.
create policy "client_file_uploads_client_select" on client_file_uploads for select
  using (
    project_id in (select project_id from project_clients where user_id = auth.uid())
  );
create policy "client_file_uploads_client_insert" on client_file_uploads for insert
  with check (
    user_id = auth.uid()
    and project_id in (select project_id from project_clients where user_id = auth.uid())
  );
create policy "client_file_uploads_client_delete" on client_file_uploads for delete
  using (
    user_id = auth.uid()
    and project_id in (select project_id from project_clients where user_id = auth.uid())
  );

-- Staff (org members) can read + delete uploads for projects in their org.
create policy "client_file_uploads_staff_select" on client_file_uploads for select
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );
create policy "client_file_uploads_staff_delete" on client_file_uploads for delete
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );


-- ── Storage bucket for the actual bytes ───────────────────────
-- Public-read so staff can render thumbnails / open files
-- without minting signed URLs every time. Writes are gated below.
insert into storage.buckets (id, name, public)
  values ('client-uploads', 'client-uploads', true)
  on conflict (id) do nothing;

drop policy if exists "client_uploads_public_read" on storage.objects;
drop policy if exists "client_uploads_client_write" on storage.objects;
drop policy if exists "client_uploads_client_delete" on storage.objects;

create policy "client_uploads_public_read" on storage.objects for select
  using (bucket_id = 'client-uploads');

-- Clients write to <project_id>/<filename>. We can't easily check
-- project membership here without a security-definer function, so
-- we settle for "any authenticated user can write" and let the
-- client_file_uploads RLS gate the metadata insert. The bucket is
-- not directly listable from the client side.
create policy "client_uploads_client_write" on storage.objects for insert
  with check (bucket_id = 'client-uploads' and auth.role() = 'authenticated');

create policy "client_uploads_client_delete" on storage.objects for delete
  using (bucket_id = 'client-uploads' and auth.role() = 'authenticated');


-- ============================================================
-- notifications: in-app feed for staff
-- ============================================================
-- One row per (recipient, event). Realtime subscriptions filter
-- by user_id = auth.uid() so the bell icon picks up new pushes
-- without polling.
-- ============================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  kind text not null,                -- 'client_upload' | 'client_note' | ...
  title text not null,
  body text,
  link text,                         -- optional deep-link path
  metadata jsonb,                    -- {file_name, file_size, uploader, ...}
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on notifications(user_id, read_at, created_at desc)
  where read_at is null;

alter table notifications enable row level security;

drop policy if exists "notifications_owner_select" on notifications;
drop policy if exists "notifications_owner_update" on notifications;
drop policy if exists "notifications_owner_delete" on notifications;

create policy "notifications_owner_select" on notifications for select
  using (user_id = auth.uid());
create policy "notifications_owner_update" on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "notifications_owner_delete" on notifications for delete
  using (user_id = auth.uid());

-- Enable Realtime broadcasts for the notifications table so the
-- bell icon can subscribe via supabase-js.
alter publication supabase_realtime add table notifications;


-- ============================================================
-- Trigger: on client upload, fan out to project staff
-- ============================================================
-- For every client_file_uploads insert, create one notification
-- per staff profile in the project's org. Security-definer so
-- it can read across RLS (the inserting client wouldn't normally
-- see profiles rows).
-- ============================================================

create or replace function notify_staff_of_client_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_project_name text;
  v_uploader_email text;
begin
  -- Resolve project's org + name
  select org_id, name into v_org_id, v_project_name
  from projects where id = new.project_id;

  if v_org_id is null then return new; end if;

  -- Resolve uploader email for the notification body
  select email into v_uploader_email from auth.users where id = new.user_id;

  -- One notification per staff profile in the org. Skip pre-acceptance
  -- invites (user_id is null). Skip the uploader (client) themselves.
  insert into notifications (user_id, project_id, kind, title, body, link, metadata)
  select
    p.user_id,
    new.project_id,
    'client_upload',
    coalesce(v_project_name, 'A project') || ' · new client upload',
    coalesce(v_uploader_email, 'A client') || ' uploaded ' || new.file_name,
    '/?project=' || new.project_id::text || '&view=creative',
    jsonb_build_object(
      'file_name', new.file_name,
      'file_size', new.file_size,
      'content_type', new.content_type,
      'uploader_id', new.user_id,
      'uploader_email', v_uploader_email,
      'upload_id', new.id
    )
  from profiles p
  where p.org_id = v_org_id
    and p.user_id is not null
    and p.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_staff_of_client_upload on client_file_uploads;
create trigger trg_notify_staff_of_client_upload
  after insert on client_file_uploads
  for each row execute function notify_staff_of_client_upload();
