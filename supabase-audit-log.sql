-- ============================================================
-- AUDIT LOG
-- ============================================================
-- One row per insert / update / delete on the rows we care about.
-- Captures the acting user (via auth.uid() at trigger time), the
-- table + record id, the action, and a before/after diff so we
-- can answer "who changed what when" later.
--
-- Tables instrumented: projects, vendors, contracts, contacts,
-- companies. Add more by appending an extra trigger below.
--
-- Read pattern: filter by table_name + record_id for "history of
-- this record", or by user_id for "what did this user touch".

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert','update','delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index if not exists audit_log_record_idx on audit_log(table_name, record_id, at desc);
create index if not exists audit_log_user_idx   on audit_log(user_id, at desc);
create index if not exists audit_log_at_idx     on audit_log(at desc);

-- RLS: the actor can always see their own actions. Org admins can
-- see actions on any record in their org's namespace. Simplest
-- v1: every signed-in user reads their own writes. Tighten later
-- if needed.
alter table audit_log enable row level security;

drop policy if exists "audit_log_select_own" on audit_log;
create policy "audit_log_select_own" on audit_log
  for select using (user_id = auth.uid());

-- No client writes — only triggers (running as table owner) insert.
drop policy if exists "audit_log_no_client_write" on audit_log;
create policy "audit_log_no_client_write" on audit_log
  for insert with check (false);

-- ── Trigger function ─────────────────────────────────────────
-- Captures the row diff. Avoids storing whole jsonb when nothing
-- changed (returns NULL effectively for no-op updates).
create or replace function pg_audit_log() returns trigger
language plpgsql security definer as $$
declare
  rid uuid;
  before_jsonb jsonb;
  after_jsonb jsonb;
begin
  if TG_OP = 'INSERT' then
    rid := (row_to_json(NEW)::jsonb ->> 'id')::uuid;
    after_jsonb := row_to_json(NEW)::jsonb;
    insert into audit_log(user_id, table_name, record_id, action, before, after)
      values (auth.uid(), TG_TABLE_NAME, rid, 'insert', null, after_jsonb);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    rid := (row_to_json(NEW)::jsonb ->> 'id')::uuid;
    before_jsonb := row_to_json(OLD)::jsonb;
    after_jsonb := row_to_json(NEW)::jsonb;
    -- Skip no-op updates (jsonb compare)
    if before_jsonb = after_jsonb then return NEW; end if;
    insert into audit_log(user_id, table_name, record_id, action, before, after)
      values (auth.uid(), TG_TABLE_NAME, rid, 'update', before_jsonb, after_jsonb);
    return NEW;
  elsif TG_OP = 'DELETE' then
    rid := (row_to_json(OLD)::jsonb ->> 'id')::uuid;
    before_jsonb := row_to_json(OLD)::jsonb;
    insert into audit_log(user_id, table_name, record_id, action, before, after)
      values (auth.uid(), TG_TABLE_NAME, rid, 'delete', before_jsonb, null);
    return OLD;
  end if;
  return null;
end;
$$;

-- ── Attach triggers (idempotent) ─────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['projects','vendors','contracts','contacts','companies']
  loop
    execute format('drop trigger if exists trg_audit_%s on %I', t, t);
    execute format(
      'create trigger trg_audit_%s
       after insert or update or delete on %I
       for each row execute function pg_audit_log()',
      t, t
    );
  end loop;
end$$;

-- Refresh PostgREST schema so the new table is queryable
-- immediately.
notify pgrst, 'reload schema';
