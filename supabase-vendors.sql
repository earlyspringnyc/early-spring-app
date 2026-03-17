-- Run this in Supabase SQL Editor
-- Adds organization-level vendor registry

create table if not exists vendors (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  vendor_type text default 'other',
  w9_status text default 'pending' check (w9_status in ('pending', 'received', 'approved')),
  created_at timestamptz default now()
);

alter table vendors enable row level security;

create policy "Users can view vendors in their org"
  on vendors for select
  using (org_id in (select org_id from profiles where user_id = auth.uid()));

create policy "Producers and admins can manage vendors"
  on vendors for all
  using (org_id in (select org_id from profiles where user_id = auth.uid() and role in ('admin', 'producer')));
