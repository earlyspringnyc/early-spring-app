-- ============================================================
-- BUDGET SNAPSHOTS
-- ============================================================
-- One row per saved budget state. Replaces the in-row
-- project.data.budgetHistory array (which capped at 30 and bloated
-- the project row). Snapshots live in their own table so we can
-- keep every version from project creation onward without
-- making the project row huge.
--
-- Each row stores:
--   - data: jsonb of {cats, ag, feeP, clientBudget, budgets}
--   - actor name/email (denormalized so list-rendering doesn't need
--     a profiles join — fast pagination)
--   - auto vs manual (auto-saves are made on every save burst;
--     manual ones come from the "Save labeled version" button)

create table if not exists budget_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  user_name     text,
  user_email    text,
  at            timestamptz not null default now(),
  label         text,
  auto          boolean not null default true,
  data          jsonb not null,
  -- Per-budget grand totals at the moment of the snapshot.
  -- Shape: { "primary": 250000, "<alt-id>": 200000, ... }
  -- Denormalized so the list view doesn't need to recompute or
  -- fetch full data to display "$250K" against each row.
  budget_totals jsonb
);

-- Add column safely on existing tables (migration-compatible).
alter table budget_snapshots add column if not exists budget_totals jsonb;

create index if not exists budget_snapshots_project_idx on budget_snapshots(project_id, at desc);
create index if not exists budget_snapshots_user_idx    on budget_snapshots(user_id, at desc);

alter table budget_snapshots enable row level security;

-- Read: anyone in the project's org can see snapshots. So a producer
-- can see what a teammate edited.
drop policy if exists "budget_snapshots_select" on budget_snapshots;
create policy "budget_snapshots_select" on budget_snapshots
  for select using (
    project_id in (
      select p.id from projects p
      where p.org_id in (
        select org_id from profiles where user_id = auth.uid()
      )
    )
  );

-- Insert: same org-membership check. user_id defaults to auth.uid()
-- if the client omits it.
drop policy if exists "budget_snapshots_insert" on budget_snapshots;
create policy "budget_snapshots_insert" on budget_snapshots
  for insert with check (
    project_id in (
      select p.id from projects p
      where p.org_id in (
        select org_id from profiles where user_id = auth.uid()
      )
    )
  );

-- Delete: only admins / EPs / producers can prune. Auto-snapshots
-- accumulate forever otherwise.
drop policy if exists "budget_snapshots_delete" on budget_snapshots;
create policy "budget_snapshots_delete" on budget_snapshots
  for delete using (
    project_id in (
      select p.id from projects p
      where p.org_id in (
        select org_id from profiles
        where user_id = auth.uid() and role in ('admin','ep','producer')
      )
    )
  );

notify pgrst, 'reload schema';
