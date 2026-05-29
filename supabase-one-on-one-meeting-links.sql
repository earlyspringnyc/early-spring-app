-- ============================================================
-- 1:1 ↔ Meetings junction
-- ============================================================
-- Links Fireflies-synced (or manually-added) meetings to a 1:1
-- folder. Two flavors of link:
--   - 'auto-email'  : created by a trigger when an attendee email
--                     matches a 1:1 member's email. Fires on
--                     meeting insert/update AND on member insert
--                     (retroactive backfill).
--   - 'manual'      : user explicitly clicks "Assign to 1:1" in
--                     the meetings detail panel. Survives even if
--                     the auto match later breaks.

create table if not exists one_on_one_meeting_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null references one_on_one_members(id) on delete cascade,
  meeting_id  uuid not null references meetings(id) on delete cascade,
  source      text not null default 'manual'
              check (source in ('manual','auto-email')),
  created_at  timestamptz not null default now(),
  unique (member_id, meeting_id)
);

create index if not exists ooo_meeting_links_member_idx
  on one_on_one_meeting_links(member_id);
create index if not exists ooo_meeting_links_meeting_idx
  on one_on_one_meeting_links(meeting_id);

alter table one_on_one_meeting_links enable row level security;

drop policy if exists "ooo_links_select_own" on one_on_one_meeting_links;
create policy "ooo_links_select_own" on one_on_one_meeting_links
  for select using (user_id = auth.uid());

drop policy if exists "ooo_links_insert_own" on one_on_one_meeting_links;
create policy "ooo_links_insert_own" on one_on_one_meeting_links
  for insert with check (user_id = auth.uid());

drop policy if exists "ooo_links_delete_own" on one_on_one_meeting_links;
create policy "ooo_links_delete_own" on one_on_one_meeting_links
  for delete using (user_id = auth.uid());


-- ── Auto-link triggers ───────────────────────────────────────
-- 1. When a meeting is inserted (or its attendees change), find
--    every 1:1 member owned by the same user whose email is in
--    the attendees list and create a link.
create or replace function autolink_meeting_to_ooo()
returns trigger language plpgsql as $$
declare
  v_emails text[];
begin
  if new.attendees is null or jsonb_array_length(new.attendees) = 0 then
    return new;
  end if;
  select array_agg(distinct lower(a->>'email'))
    into v_emails
    from jsonb_array_elements(new.attendees) as a
    where a->>'email' is not null and a->>'email' <> '';
  if v_emails is null then return new; end if;

  insert into one_on_one_meeting_links (user_id, member_id, meeting_id, source)
  select new.user_id, m.id, new.id, 'auto-email'
  from one_on_one_members m
  where m.user_id = new.user_id
    and lower(m.email) = any(v_emails)
  on conflict (member_id, meeting_id) do nothing;
  return new;
end $$;

drop trigger if exists meetings_autolink_ooo on meetings;
create trigger meetings_autolink_ooo
  after insert or update of attendees on meetings
  for each row execute function autolink_meeting_to_ooo();

-- 2. When a new 1:1 member is added, retroactively link any
--    existing meetings where their email appears as an attendee.
create or replace function autolink_ooo_member_to_meetings()
returns trigger language plpgsql as $$
begin
  insert into one_on_one_meeting_links (user_id, member_id, meeting_id, source)
  select new.user_id, new.id, m.id, 'auto-email'
  from meetings m
  where m.user_id = new.user_id
    and exists (
      select 1
      from jsonb_array_elements(m.attendees) as a
      where lower(a->>'email') = lower(new.email)
    )
  on conflict (member_id, meeting_id) do nothing;
  return new;
end $$;

drop trigger if exists ooo_members_autolink_meetings on one_on_one_members;
create trigger ooo_members_autolink_meetings
  after insert on one_on_one_members
  for each row execute function autolink_ooo_member_to_meetings();
