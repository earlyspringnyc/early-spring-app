-- Companies — first-class metadata for a CRM company cluster.
-- Until now company existed only as a string on contacts; this
-- adds a place to store company-level data (legal address,
-- website, etc.) that the contract editor and other surfaces
-- can read from.
--
-- Keyed by name_normalized (matches the same normalization the
-- companyDedup util uses) so the lookup-by-project.client flow
-- is O(1) without any extra plumbing.

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Display-friendly canonical name ("Lonely Planet")
  name_canonical text not null,
  -- Normalized key for lookups ("lonely planet", suffixes stripped)
  name_normalized text not null,
  legal_name text,        -- e.g. "Lonely Planet (USA), Inc."
  address text,           -- multi-line legal address
  website text,           -- e.g. "lonelyplanet.com"
  billing_email text,     -- AP contact email
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name_normalized)
);

create index if not exists idx_companies_user_norm on companies(user_id, name_normalized);

alter table companies enable row level security;
drop policy if exists companies_select on companies;
create policy companies_select on companies for select using (auth.uid() = user_id);
drop policy if exists companies_insert on companies;
create policy companies_insert on companies for insert with check (auth.uid() = user_id);
drop policy if exists companies_update on companies;
create policy companies_update on companies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists companies_delete on companies;
create policy companies_delete on companies for delete using (auth.uid() = user_id);

create or replace function companies_set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists companies_updated_at on companies;
create trigger companies_updated_at
  before update on companies
  for each row execute function companies_set_updated_at();
