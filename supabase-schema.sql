-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Organizations (each company/user that signs up)
create table organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique,
  logo_url text,
  created_at timestamptz default now()
);

-- Profiles (linked to Supabase auth.users)
create table profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  org_id uuid references organizations(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  role text default 'admin' check (role in ('admin', 'producer', 'viewer')),
  permissions jsonb default '{"budget":true,"timeline":true,"vendors":true,"pnl":true,"docs":true,"ros":true,"client":true,"ai":true,"settings":true}',
  created_at timestamptz default now()
);

-- Projects (belong to an organization)
create table projects (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  client text,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Invitations (for adding team members)
create table invitations (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  role text default 'producer',
  invited_by uuid references profiles(id),
  accepted boolean default false,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table invitations enable row level security;

-- RLS Policies: Organizations
create policy "Users can view their own org"
  on organizations for select
  using (id in (select org_id from profiles where user_id = auth.uid()));

create policy "Users can update their own org"
  on organizations for update
  using (id in (select org_id from profiles where user_id = auth.uid() and role = 'admin'));

create policy "Anyone can create an org"
  on organizations for insert
  with check (true);

-- RLS Policies: Profiles
create policy "Users can view profiles in their org"
  on profiles for select
  using (org_id in (select org_id from profiles where user_id = auth.uid()));

create policy "Users can update their own profile"
  on profiles for update
  using (user_id = auth.uid());

create policy "Admins can manage profiles in their org"
  on profiles for all
  using (org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin'));

create policy "New users can create their own profile"
  on profiles for insert
  with check (user_id = auth.uid());

-- RLS Policies: Projects
create policy "Users can view projects in their org"
  on projects for select
  using (org_id in (select org_id from profiles where user_id = auth.uid()));

create policy "Producers and admins can create projects"
  on projects for insert
  with check (org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer')));

create policy "Producers and admins can update projects"
  on projects for update
  using (org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer')));

create policy "Admins can delete projects"
  on projects for delete
  using (org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin'));

-- RLS Policies: Invitations
create policy "Admins can manage invitations"
  on invitations for all
  using (org_id in (select org_id from profiles where user_id = auth.uid() and role = 'admin'));

create policy "Anyone can view their own invitation"
  on invitations for select
  using (email = (select email from auth.users where id = auth.uid()));

-- Function to auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- Storage bucket for file uploads
insert into storage.buckets (id, name, public) values ('files', 'files', true);

-- Storage policy: org members can upload/read files
create policy "Org members can upload files"
  on storage.objects for insert
  with check (bucket_id = 'files');

create policy "Anyone can view files"
  on storage.objects for select
  using (bucket_id = 'files');

create policy "Org members can delete their files"
  on storage.objects for delete
  using (bucket_id = 'files');
