-- ============================================================
-- Meeting Library — Fireflies transcripts as first-class records,
-- not just a sub-feature of contacts. Internal team calls, vendor
-- chats, brainstorms etc. live here without polluting CRM contact
-- profiles. Client/prospect meetings auto-link to their contact
-- via meeting_contacts when the attendee email matches.
-- ============================================================

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Origin
  source text not null default 'fireflies',     -- 'fireflies' | 'manual'
  external_id text,                              -- fireflies transcript id
  external_url text,                             -- link to view in Fireflies
  pdf_url text,                                  -- transcript PDF (if available)

  title text,
  occurred_at timestamptz not null,
  duration_minutes int,

  -- Raw attendees from the source (Fireflies returns name/email/displayName).
  -- Kept as JSON so we don't lose any fields the source provides.
  attendees jsonb not null default '[]'::jsonb,

  -- Summary block from Fireflies
  summary text,
  action_items jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  transcript text,                               -- full transcript text, optional

  -- Auto-classification: 'client' | 'prospect' | 'vendor' | 'internal' | 'uncategorized'
  -- Set by the sync job based on attendee email analysis. Never
  -- overwritten on subsequent syncs.
  classification text not null default 'uncategorized',
  -- User override; takes precedence over auto-classification in UI.
  user_classification text,

  -- User-authored notes layered on top of the Fireflies summary
  notes text,

  -- Free-form tags for organization
  tags jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meetings_user_external_uniq
  on meetings(user_id, source, external_id)
  where external_id is not null;
create index if not exists meetings_user_occurred_idx
  on meetings(user_id, occurred_at desc);
create index if not exists meetings_user_classification_idx
  on meetings(user_id, classification);

-- ============================================================
-- meeting_contacts — junction. Auto-populated when an attendee
-- email matches a CRM contact (match_type='auto-email') or when
-- the user manually links a meeting to a contact ('manual').
-- ============================================================
create table if not exists meeting_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  match_type text not null default 'auto-email', -- 'auto-email' | 'manual'
  created_at timestamptz not null default now(),
  unique (meeting_id, contact_id)
);

create index if not exists meeting_contacts_meeting_idx on meeting_contacts(meeting_id);
create index if not exists meeting_contacts_contact_idx on meeting_contacts(contact_id);

-- ============================================================
-- RLS
-- ============================================================
alter table meetings enable row level security;
alter table meeting_contacts enable row level security;

drop policy if exists "meetings_select" on meetings;
drop policy if exists "meetings_insert" on meetings;
drop policy if exists "meetings_update" on meetings;
drop policy if exists "meetings_delete" on meetings;
create policy "meetings_select" on meetings for select using (user_id = auth.uid());
create policy "meetings_insert" on meetings for insert with check (user_id = auth.uid());
create policy "meetings_update" on meetings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meetings_delete" on meetings for delete using (user_id = auth.uid());

drop policy if exists "meeting_contacts_select" on meeting_contacts;
drop policy if exists "meeting_contacts_insert" on meeting_contacts;
drop policy if exists "meeting_contacts_update" on meeting_contacts;
drop policy if exists "meeting_contacts_delete" on meeting_contacts;
create policy "meeting_contacts_select" on meeting_contacts for select using (user_id = auth.uid());
create policy "meeting_contacts_insert" on meeting_contacts for insert with check (user_id = auth.uid());
create policy "meeting_contacts_update" on meeting_contacts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meeting_contacts_delete" on meeting_contacts for delete using (user_id = auth.uid());

-- updated_at trigger
create or replace function set_meetings_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists meetings_updated_at on meetings;
create trigger meetings_updated_at before update on meetings
  for each row execute function set_meetings_updated_at();
