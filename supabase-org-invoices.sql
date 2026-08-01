-- ============================================================
-- Org-level invoice ledger (AP + AR), independent of projects.
--
-- BooksView already aggregates per-project invoices from project.docs.
-- This table covers everything that ISN'T tied to a specific project
-- (rent, utilities, staffing across projects, generic vendor bills)
-- plus anything Jennifer wants to track in one place even if it does
-- relate to a project.
--
-- Workflow:
--   1. Jennifer creates rows (manually or via XLS bulk upload).
--   2. AP rows start as status='pending' and need EP approval.
--   3. EP flips to 'approved' to authorize payment.
--   4. Whoever pays flips to 'paid' with paid_at + payment_ref.
--   5. AR rows skip approval (status='sent' → 'paid').
-- ============================================================

create table if not exists org_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,

  -- Direction + categorization
  kind text not null check (kind in ('ap','ar')),           -- payable (we owe) or receivable (owed to us)
  category text not null default 'uncategorized',           -- 'project'|'rent'|'utilities'|'staffing'|'expenses'|'vehicle'|'professional_services'|'taxes'|'other'|'uncategorized'

  -- Project linkage. Nullable. staffing/project rows may also fan out
  -- to multiple projects via project_ids[].
  project_id uuid references projects(id) on delete set null,
  project_ids uuid[],                                       -- multi-project (e.g., staffing covering multiple shoots)

  -- The other party
  counterparty text not null,                               -- vendor name (AP) or client name (AR)
  counterparty_contact text,                                -- email / phone reference, optional

  -- Money + dates
  amount numeric(14,2) not null default 0,
  issued_date date,
  due_date date,

  -- Lifecycle
  status text not null default 'pending'                    -- AP: pending → approved → paid (or cancelled)
    check (status in ('pending','approved','paid','cancelled','sent','overdue')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_ref text,                                         -- check #, wire confirmation, etc.

  -- Attachment (optional — many APs are just records, no PDF)
  storage_path text,                                        -- in the 'org-invoices' bucket
  file_name text,
  file_size bigint,
  content_type text,

  -- Bookkeeping notes + AI categorization audit trail
  invoice_number text,
  notes text,
  ai_category_suggestion text,                              -- what Claude guessed if XLS-imported
  ai_confidence text,                                       -- 'high'|'medium'|'low'
  import_batch_id uuid,                                     -- groups rows imported together via XLS

  -- Authoring
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_invoices_org_kind_status_idx on org_invoices(org_id, kind, status);
create index if not exists org_invoices_due_idx on org_invoices(org_id, due_date) where status in ('pending','approved','sent','overdue');
create index if not exists org_invoices_project_idx on org_invoices(project_id) where project_id is not null;
create index if not exists org_invoices_batch_idx on org_invoices(import_batch_id) where import_batch_id is not null;

alter table org_invoices enable row level security;

drop policy if exists "org_invoices_select" on org_invoices;
drop policy if exists "org_invoices_insert" on org_invoices;
drop policy if exists "org_invoices_update" on org_invoices;
drop policy if exists "org_invoices_delete" on org_invoices;

-- Any org member can see + author rows. Approval / delete is also
-- org-scoped — we don't gate by role here; the UI hides the Approve
-- button for non-EP users.
create policy "org_invoices_select" on org_invoices for select
  using (org_id in (select org_id from profiles where user_id = auth.uid()));
create policy "org_invoices_insert" on org_invoices for insert
  with check (
    created_by = auth.uid()
    and org_id in (select org_id from profiles where user_id = auth.uid())
  );
create policy "org_invoices_update" on org_invoices for update
  using (org_id in (select org_id from profiles where user_id = auth.uid()));
create policy "org_invoices_delete" on org_invoices for delete
  using (org_id in (select org_id from profiles where user_id = auth.uid()));

-- Updated-at trigger
create or replace function set_org_invoices_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists org_invoices_updated_at on org_invoices;
create trigger org_invoices_updated_at
  before update on org_invoices
  for each row execute function set_org_invoices_updated_at();


-- ============================================================
-- Storage bucket for invoice attachments. Public-read for now
-- (paths are UUIDs so URLs are effectively unguessable; same
-- trade-off the other public buckets make). Auth-only writes.
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('org-invoices', 'org-invoices', true)
  on conflict (id) do nothing;

drop policy if exists "org_invoices_public_read" on storage.objects;
drop policy if exists "org_invoices_auth_write" on storage.objects;
drop policy if exists "org_invoices_auth_delete" on storage.objects;

create policy "org_invoices_public_read" on storage.objects for select
  using (bucket_id = 'org-invoices');
create policy "org_invoices_auth_write" on storage.objects for insert
  with check (bucket_id = 'org-invoices' and auth.role() = 'authenticated');
create policy "org_invoices_auth_delete" on storage.objects for delete
  using (bucket_id = 'org-invoices' and auth.role() = 'authenticated');
