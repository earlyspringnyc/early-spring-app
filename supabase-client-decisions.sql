-- Per-asset approve / reject / feedback decisions made by clients
-- in the portal. One row per (asset, client user) so multiple clients
-- on a project can each have their own opinion.
--
-- asset_id is the client-generated uuid stored on each entry in
-- project.data.creativeAssets — we don't have a real FK target for it.
-- That's why this lives as a sibling table and references the project
-- + asset_id text instead of a foreign key.

create table if not exists client_asset_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text not null,
  decision text,                       -- 'approved' | 'rejected' | null (cleared)
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, user_id, asset_id)
);

create index if not exists client_asset_decisions_project_idx
  on client_asset_decisions(project_id, asset_id);

alter table client_asset_decisions enable row level security;

drop policy if exists "client_decisions_client_select" on client_asset_decisions;
drop policy if exists "client_decisions_client_upsert" on client_asset_decisions;
drop policy if exists "client_decisions_client_update" on client_asset_decisions;
drop policy if exists "client_decisions_client_delete" on client_asset_decisions;
drop policy if exists "client_decisions_staff_select" on client_asset_decisions;

-- Clients can read + write their own decisions for any project they're
-- linked to via project_clients.
create policy "client_decisions_client_select" on client_asset_decisions for select
  using (
    user_id = auth.uid()
    and project_id in (select project_id from project_clients where user_id = auth.uid())
  );
create policy "client_decisions_client_upsert" on client_asset_decisions for insert
  with check (
    user_id = auth.uid()
    and project_id in (select project_id from project_clients where user_id = auth.uid())
  );
create policy "client_decisions_client_update" on client_asset_decisions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "client_decisions_client_delete" on client_asset_decisions for delete
  using (user_id = auth.uid());

-- Staff (org members) can see every decision on projects in their org.
create policy "client_decisions_staff_select" on client_asset_decisions for select
  using (
    project_id in (
      select id from projects
      where org_id in (select org_id from profiles where user_id = auth.uid())
    )
  );

create or replace function set_client_asset_decisions_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists client_asset_decisions_updated_at on client_asset_decisions;
create trigger client_asset_decisions_updated_at
  before update on client_asset_decisions
  for each row execute function set_client_asset_decisions_updated_at();
