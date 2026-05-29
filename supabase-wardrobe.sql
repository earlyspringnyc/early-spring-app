-- Talent wardrobe tracker — one row per person on a project, with
-- their sizing, shipping address, what's been purchased, and where
-- the package is. Lives inside the Creative section of a project.
--
-- RLS: anyone who can read the project can read its wardrobe rows;
-- anyone who can write the project can edit wardrobe rows. That
-- mirrors how project_notes scopes, so EPs / producers all see the
-- same wardrobe list for an active production.
--
-- Headshots are stored in the wardrobe-headshots Supabase Storage
-- bucket. We keep just the storage path here (not the public URL) so
-- the bucket can stay private if we ever want signed URLs.

create table if not exists project_wardrobe (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,

  -- Identity
  name text not null,
  headshot_path text,                    -- path in wardrobe-headshots bucket
  source_staff_id text,                  -- StaffConnect user id, if imported
  source_url text,                       -- original source URL (presentation, etc.)

  -- Sizing
  waist_size text,
  shoe_size text,
  shirt_size text,

  -- Logistics
  shipping_address text,
  phone text,
  email text,

  -- Purchase tracking — the five garments from the brief
  purchased_shorts boolean not null default false,
  purchased_shirt boolean not null default false,
  purchased_sunglasses boolean not null default false,
  purchased_scarf boolean not null default false,
  purchased_shoes boolean not null default false,

  -- Delivery
  tracking_number text,
  delivery_status text,                  -- 'not_shipped' | 'in_transit' | 'delivered'
  delivery_eta date,

  -- Misc
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_wardrobe_project_idx on project_wardrobe(project_id, sort_order);
create index if not exists project_wardrobe_source_idx on project_wardrobe(project_id, source_staff_id);

alter table project_wardrobe enable row level security;

drop policy if exists "project_wardrobe_select" on project_wardrobe;
drop policy if exists "project_wardrobe_insert" on project_wardrobe;
drop policy if exists "project_wardrobe_update" on project_wardrobe;
drop policy if exists "project_wardrobe_delete" on project_wardrobe;

-- Read/write: anyone in the project's org. Matches the pattern used
-- by projects/vendors/contacts elsewhere in this schema — RLS gates
-- by org membership, not per-user ownership.
create policy "project_wardrobe_select" on project_wardrobe for select
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );

create policy "project_wardrobe_insert" on project_wardrobe for insert
  with check (
    user_id = auth.uid()
    and project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );

create policy "project_wardrobe_update" on project_wardrobe for update
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );

create policy "project_wardrobe_delete" on project_wardrobe for delete
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );

create or replace function set_project_wardrobe_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists project_wardrobe_updated_at on project_wardrobe;
create trigger project_wardrobe_updated_at
  before update on project_wardrobe
  for each row execute function set_project_wardrobe_updated_at();


-- ============================================================
-- Storage bucket for headshots. Public-read (so the UI can render
-- thumbnails without signed-URL roundtrips); write restricted to
-- authenticated users.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('wardrobe-headshots', 'wardrobe-headshots', true)
  on conflict (id) do nothing;

drop policy if exists "wardrobe_headshots_public_read" on storage.objects;
drop policy if exists "wardrobe_headshots_auth_write" on storage.objects;
drop policy if exists "wardrobe_headshots_auth_update" on storage.objects;
drop policy if exists "wardrobe_headshots_auth_delete" on storage.objects;

create policy "wardrobe_headshots_public_read" on storage.objects for select
  using (bucket_id = 'wardrobe-headshots');

create policy "wardrobe_headshots_auth_write" on storage.objects for insert
  with check (bucket_id = 'wardrobe-headshots' and auth.role() = 'authenticated');

create policy "wardrobe_headshots_auth_update" on storage.objects for update
  using (bucket_id = 'wardrobe-headshots' and auth.role() = 'authenticated');

create policy "wardrobe_headshots_auth_delete" on storage.objects for delete
  using (bucket_id = 'wardrobe-headshots' and auth.role() = 'authenticated');
