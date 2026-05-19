-- ============================================================
-- BACKFILL: project.vendors  →  CRM contacts + companies
-- ============================================================
-- One-shot backfill. Safe to re-run — idempotent.
--
-- For every vendor saved on a project (project.vendors jsonb
-- array), this:
--   1) Inserts a contacts row with contact_type='vendor' and
--      status='vendor', UNLESS a vendor contact for the same
--      company already exists for that user (case-insensitive
--      match on company name).
--   2) Upserts a companies row keyed by (user_id, normalized name).
--
-- Run in the Supabase SQL editor. The final SELECT reports how
-- many contacts/companies were created.

begin;

-- ── Helper: same normalization as src/utils/companyDedup.js ─
-- Lowercases, strips punctuation and common legal suffixes, and
-- collapses whitespace. Used so "Acme, Inc." and "acme" hit the
-- same companies row.
create or replace function pg_temp.normalize_company(name text)
returns text language sql immutable as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(name, '')),
          '[.,&''’]', ' ', 'g'
        ),
        '\m(inc|llc|ltd|co|corp|corporation|company|companies|group|holdings|partners|partnership|usa|uk|us|na|cars?|limited|gmbh|sa|ag|plc|pty)\M',
        ' ', 'gi'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ── Pull every (user, vendor) pair out of project.vendors ─
with raw as (
  select
    p.user_id,
    p.id as project_id,
    v as vendor
  from projects p
  cross join lateral jsonb_array_elements(coalesce(p.vendors, '[]'::jsonb)) v
  where v->>'name' is not null
    and trim(v->>'name') <> ''
),
-- One row per (user, normalized_company). Pick the first non-null
-- contact name / email / phone / notes across all projects so we
-- don't drop info if one project filled fields others didn't.
deduped as (
  select
    user_id,
    pg_temp.normalize_company(vendor->>'name') as norm_name,
    -- Display name: first canonical spelling we saw
    (array_agg(trim(vendor->>'name') order by project_id))[1] as vendor_name,
    (array_agg(nullif(trim(vendor->>'contactName'), '') order by project_id)
      filter (where nullif(trim(vendor->>'contactName'), '') is not null))[1] as contact_name,
    (array_agg(nullif(lower(trim(vendor->>'email')), '') order by project_id)
      filter (where nullif(lower(trim(vendor->>'email')), '') is not null))[1] as email,
    (array_agg(nullif(trim(vendor->>'phone'), '') order by project_id)
      filter (where nullif(trim(vendor->>'phone'), '') is not null))[1] as phone,
    (array_agg(nullif(trim(vendor->>'notes'), '') order by project_id)
      filter (where nullif(trim(vendor->>'notes'), '') is not null))[1] as notes
  from raw
  group by user_id, pg_temp.normalize_company(vendor->>'name')
),
-- ── 1) Insert contacts that don't already exist ─
contacts_inserted as (
  insert into contacts (
    user_id, first_name, last_name, email, phone, company,
    contact_type, status, sources, notes
  )
  select
    d.user_id,
    -- first word as first_name (null if empty)
    nullif(split_part(coalesce(d.contact_name, ''), ' ', 1), ''),
    -- remainder as last_name (null if no space found)
    case when position(' ' in coalesce(d.contact_name, '')) > 0
         then trim(substring(d.contact_name from position(' ' in d.contact_name)))
         else null
    end,
    d.email,
    d.phone,
    d.vendor_name,
    'vendor',
    'vendor',
    '["project_vendor_backfill"]'::jsonb,
    d.notes
  from deduped d
  -- Skip if the same user already has a vendor contact for this company.
  -- Match on normalized name so "Acme, Inc." and "Acme" don't double up.
  where not exists (
    select 1 from contacts c
    where c.user_id = d.user_id
      and pg_temp.normalize_company(c.company) = d.norm_name
      and (c.contact_type = 'vendor' or c.status = 'vendor')
  )
  -- Defense in depth: if a contact with the same email already
  -- exists (regardless of company), skip rather than 409.
  on conflict do nothing
  returning 1
),
-- ── 2) Upsert a companies row for each ─
companies_upserted as (
  insert into companies (user_id, name_canonical, name_normalized)
  select user_id, vendor_name, norm_name
  from deduped
  where length(norm_name) > 0
  on conflict (user_id, name_normalized) do nothing
  returning 1
)
select
  (select count(*) from contacts_inserted) as contacts_inserted,
  (select count(*) from companies_upserted) as companies_inserted;

commit;
