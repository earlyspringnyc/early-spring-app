-- Personal sticky notes — per-user, never shared. Each user sees only
-- their own notes regardless of org. content is plain text; color is a
-- token name from a small palette (yellow / sapphire / mint / pink).
-- sort_order lets the user reorder via drag, falls back to created_at.

create table if not exists user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  color text not null default 'yellow',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notes_user_idx on user_notes(user_id, sort_order);

alter table user_notes enable row level security;

drop policy if exists "user_notes_select" on user_notes;
drop policy if exists "user_notes_insert" on user_notes;
drop policy if exists "user_notes_update" on user_notes;
drop policy if exists "user_notes_delete" on user_notes;

create policy "user_notes_select" on user_notes for select
  using (user_id = auth.uid());

create policy "user_notes_insert" on user_notes for insert
  with check (user_id = auth.uid());

create policy "user_notes_update" on user_notes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_notes_delete" on user_notes for delete
  using (user_id = auth.uid());

-- Updated-at trigger so the client doesn't need to set it on every patch
create or replace function set_user_notes_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists user_notes_updated_at on user_notes;
create trigger user_notes_updated_at
  before update on user_notes
  for each row execute function set_user_notes_updated_at();
