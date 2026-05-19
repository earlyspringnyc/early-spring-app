-- Prep briefs anchored to a specific calendar event. Brief lives
-- per (user, event_id) so re-opening the same event re-uses the
-- same in-progress edits. Attendee-resolved contact stays linked
-- so the brief surface still surfaces bio, prior meetings, etc.
--
-- Replaces the contact.brief_data column we briefly used. Old
-- column is left in place (idempotent migration) and can be
-- dropped later once nothing depends on it.

create table if not exists prep_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Google Calendar event id (could be other providers later).
  external_event_id text not null,
  external_provider text not null default 'google_calendar',
  -- Primary attendee resolved to a CRM contact. Nullable so
  -- briefs can exist for events with no CRM contact match yet.
  contact_id uuid references contacts(id) on delete set null,
  -- Event metadata cached at brief creation time so the brief
  -- view doesn't need to re-fetch from Google on every load.
  event_title text,
  event_start timestamptz,
  event_end timestamptz,
  event_attendees jsonb default '[]'::jsonb,
  -- The user-editable brief content.
  picked_studies text[] default '{}',
  asks text default '',
  -- Cached Claude web-search summary for the company. Shape:
  -- { text, fetched_at }. Refresh button re-runs the lookup.
  news_cache jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_event_id)
);

create index if not exists idx_prep_briefs_user on prep_briefs(user_id);
create index if not exists idx_prep_briefs_contact on prep_briefs(contact_id);

alter table prep_briefs enable row level security;

drop policy if exists prep_briefs_select on prep_briefs;
create policy prep_briefs_select on prep_briefs for select
  using (auth.uid() = user_id);

drop policy if exists prep_briefs_insert on prep_briefs;
create policy prep_briefs_insert on prep_briefs for insert
  with check (auth.uid() = user_id);

drop policy if exists prep_briefs_update on prep_briefs;
create policy prep_briefs_update on prep_briefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists prep_briefs_delete on prep_briefs;
create policy prep_briefs_delete on prep_briefs for delete
  using (auth.uid() = user_id);

-- Bump updated_at on every change so the dashboard widget can
-- sort by recency.
create or replace function prep_briefs_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prep_briefs_updated_at on prep_briefs;
create trigger prep_briefs_updated_at
  before update on prep_briefs
  for each row execute function prep_briefs_set_updated_at();
