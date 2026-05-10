-- ============================================================
-- Personal CRM — contacts, project links, communication log.
-- All tables are per-user (RLS = auth.uid()), not org-shared.
-- ============================================================

-- Drop in this order for clean re-runs (FKs cascade)
-- (commented — only enable if you really want a clean slate)
-- drop table if exists contact_interactions cascade;
-- drop table if exists contact_projects cascade;
-- drop table if exists contacts cascade;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- identity
  first_name text,
  last_name text,
  email text,                       -- nullable; some contacts are LinkedIn-only
  phone text,
  title text,
  company text,
  company_url text,
  location text,
  linkedin_url text,

  -- third-party-generated background (RocketReach summary, etc.)
  bio text,
  -- user-authored, free-form
  notes text,
  -- pipeline state: prospect | pitching | active | past | vendor | press
  status text not null default 'prospect',
  -- flexible labels (Beauty, DTC, Agency, etc.)
  tags jsonb not null default '[]'::jsonb,
  -- where this contact came from: 'rocketreach', 'linkedin', 'manual', 'gmail'
  sources jsonb not null default '[]'::jsonb,
  -- LinkedIn-specific: when you connected
  linkedin_connected_at timestamptz,
  -- updated by Gmail sync; null = never contacted via tracked email
  last_contacted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup key — case-insensitive LinkedIn URL is the primary match
create unique index if not exists contacts_user_linkedin_uniq
  on contacts(user_id, lower(linkedin_url))
  where linkedin_url is not null;

-- Email is a secondary dedup key when LinkedIn is missing or different
create unique index if not exists contacts_user_email_uniq
  on contacts(user_id, lower(email))
  where email is not null;

create index if not exists contacts_user_status_idx on contacts(user_id, status);
create index if not exists contacts_user_company_idx on contacts(user_id, company);
create index if not exists contacts_user_last_contacted_idx on contacts(user_id, last_contacted_at desc nulls last);

-- ============================================================
-- contact_projects — junction with role (rfp_sender, champion, point_of_contact, team_member)
-- ============================================================
create table if not exists contact_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null default 'point_of_contact',
  created_at timestamptz not null default now(),
  unique (contact_id, project_id, role)
);

create index if not exists contact_projects_contact_idx on contact_projects(contact_id);
create index if not exists contact_projects_project_idx on contact_projects(project_id);

-- ============================================================
-- contact_interactions — Gmail threads, Fireflies meetings, manual notes, calls
-- Bodies are NOT stored for emails (privacy + storage). We keep
-- subject + preview snippet + external thread id and re-fetch on demand.
-- ============================================================
create table if not exists contact_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,

  -- email_in | email_out | meeting | call | note | fireflies
  type text not null,
  -- gmail | fireflies | manual
  source text not null default 'manual',
  occurred_at timestamptz not null default now(),

  subject text,         -- email subject or meeting title or note title
  preview text,         -- short snippet (~200 chars) for emails / notes
  body text,            -- only for manual notes
  external_id text,     -- gmail thread id / fireflies transcript id
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists contact_interactions_contact_idx
  on contact_interactions(contact_id, occurred_at desc);
create index if not exists contact_interactions_user_idx
  on contact_interactions(user_id, occurred_at desc);
create unique index if not exists contact_interactions_external_uniq
  on contact_interactions(user_id, source, external_id)
  where external_id is not null;

-- ============================================================
-- RLS — every table is strictly per-user.
-- ============================================================
alter table contacts enable row level security;
alter table contact_projects enable row level security;
alter table contact_interactions enable row level security;

-- contacts
drop policy if exists "contacts_select" on contacts;
drop policy if exists "contacts_insert" on contacts;
drop policy if exists "contacts_update" on contacts;
drop policy if exists "contacts_delete" on contacts;
create policy "contacts_select" on contacts for select using (user_id = auth.uid());
create policy "contacts_insert" on contacts for insert with check (user_id = auth.uid());
create policy "contacts_update" on contacts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contacts_delete" on contacts for delete using (user_id = auth.uid());

-- contact_projects
drop policy if exists "contact_projects_select" on contact_projects;
drop policy if exists "contact_projects_insert" on contact_projects;
drop policy if exists "contact_projects_update" on contact_projects;
drop policy if exists "contact_projects_delete" on contact_projects;
create policy "contact_projects_select" on contact_projects for select using (user_id = auth.uid());
create policy "contact_projects_insert" on contact_projects for insert with check (user_id = auth.uid());
create policy "contact_projects_update" on contact_projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contact_projects_delete" on contact_projects for delete using (user_id = auth.uid());

-- contact_interactions
drop policy if exists "contact_interactions_select" on contact_interactions;
drop policy if exists "contact_interactions_insert" on contact_interactions;
drop policy if exists "contact_interactions_update" on contact_interactions;
drop policy if exists "contact_interactions_delete" on contact_interactions;
create policy "contact_interactions_select" on contact_interactions for select using (user_id = auth.uid());
create policy "contact_interactions_insert" on contact_interactions for insert with check (user_id = auth.uid());
create policy "contact_interactions_update" on contact_interactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contact_interactions_delete" on contact_interactions for delete using (user_id = auth.uid());

-- updated_at triggers
create or replace function set_contacts_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at before update on contacts
  for each row execute function set_contacts_updated_at();
