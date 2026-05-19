-- Contracts — one per project, sent for signature via a signed
-- public URL. Fields the user fills in the editor live in
-- filled_fields (jsonb); audit fields (sent/viewed/signed
-- timestamps + IP + user-agent) live as their own columns for
-- easy querying. share_token is the path component of the
-- public URL; rotating it revokes any in-flight link.
--
-- Status lifecycle: draft → sent → viewed → signed.
-- Once `signed_at` is set the contract is immutable.

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Free-form variable values. Shape lives in
  -- src/data/contractTemplate.js (single source of truth on the
  -- template + variable list).
  filled_fields jsonb not null default '{}'::jsonb,
  -- Token in the public URL path. Generated server-side, rotated
  -- to revoke.
  share_token text unique,
  -- Lifecycle status. UI uses this for the pill.
  status text not null default 'draft', -- draft | sent | viewed | signed | revoked
  -- Lifecycle timestamps.
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  -- Audit trail on the client-side sign.
  signed_name text,
  signed_title text,
  signed_email text,
  signed_ip inet,
  signed_user_agent text,
  -- Path in Supabase Storage to the finalized PDF.
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contracts_project on contracts(project_id);
create index if not exists idx_contracts_user on contracts(user_id);
create index if not exists idx_contracts_share_token on contracts(share_token) where share_token is not null;

alter table contracts enable row level security;

-- Per-user RLS — same pattern as prep_briefs.
drop policy if exists contracts_select on contracts;
create policy contracts_select on contracts for select using (auth.uid() = user_id);
drop policy if exists contracts_insert on contracts;
create policy contracts_insert on contracts for insert with check (auth.uid() = user_id);
drop policy if exists contracts_update on contracts;
create policy contracts_update on contracts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists contracts_delete on contracts;
create policy contracts_delete on contracts for delete using (auth.uid() = user_id);

create or replace function contracts_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contracts_updated_at on contracts;
create trigger contracts_updated_at
  before update on contracts
  for each row execute function contracts_set_updated_at();
