-- ============================================================
-- ADD-ON DEVICES — device-flow OAuth for external clients
-- ============================================================
-- The Gmail Add-on (Apps Script) can't easily do redirect-based
-- OAuth into Supabase. Instead it uses device flow:
--
--   1. Add-on POSTs /api/addon-auth/start
--      → server creates a row here with user_code (short, human),
--        device_code (random uuid for polling), status='pending',
--        and expires_at = now() + 10 min
--      → server returns device_code + user_code + verification_url
--
--   2. Add-on shows the user the short code and opens the
--      verification_url in a new tab (Morgan settings page)
--
--   3. User is already signed in; clicks Approve in Morgan
--      → server flips status='approved', records user_id, mints
--        a long-lived refresh_token, stores its sha256 hash in
--        refresh_token_hash, returns the plaintext to the
--        approval page (which sends it back to the add-on via
--        the same poll endpoint).
--
--   4. Add-on polls /api/addon-auth/poll with the device_code
--      until it sees status='approved' + a returned refresh_token
--      (plaintext, returned exactly once)
--
--   5. From then on, the add-on calls /api/addon-auth/refresh
--      with the refresh_token to mint short-lived Supabase JWTs
--      for API calls.
--
-- Revocation: a user can revoke a device from Morgan settings,
-- setting revoked_at + status='revoked'. The refresh endpoint
-- checks both before issuing JWTs.

create table if not exists addon_devices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade,

  -- Identity / handles
  device_label        text,                              -- 'Gmail Add-on' etc; user-visible in settings
  device_code         text not null unique,              -- random uuid, used as the polling key
  user_code           text not null,                     -- 8-char human-friendly, e.g. 'ABCD-1234'

  -- Auth material
  refresh_token_hash  text,                              -- sha256 of the plaintext refresh token; never store plaintext
  refresh_token_once  text,                              -- one-time plaintext returned to the poller exactly once, then nulled

  -- Lifecycle
  status              text not null default 'pending'    -- 'pending' | 'approved' | 'expired' | 'revoked'
                      check (status in ('pending','approved','expired','revoked')),
  approved_at         timestamptz,
  revoked_at          timestamptz,
  last_used_at        timestamptz,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null               -- pending row expires after 10 min if not approved
);

create index if not exists addon_devices_user_idx    on addon_devices(user_id, created_at desc);
create index if not exists addon_devices_code_idx    on addon_devices(device_code) where status in ('pending','approved');
create index if not exists addon_devices_hash_idx    on addon_devices(refresh_token_hash) where refresh_token_hash is not null;

-- ── RLS ──────────────────────────────────────────────────────
alter table addon_devices enable row level security;

-- Users see only their own approved/revoked devices in the
-- settings list. Pending rows have no user_id yet (the user only
-- attaches themselves at approval time) and are read server-side
-- via service role.
drop policy if exists "addon_devices_select_own" on addon_devices;
create policy "addon_devices_select_own" on addon_devices
  for select using (user_id = auth.uid());

-- Users can revoke their own devices (sets revoked_at + status).
drop policy if exists "addon_devices_update_own" on addon_devices;
create policy "addon_devices_update_own" on addon_devices
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No client inserts/deletes — auth endpoints run server-side
-- with the service role.
drop policy if exists "addon_devices_no_client_insert" on addon_devices;
create policy "addon_devices_no_client_insert" on addon_devices
  for insert with check (false);

drop policy if exists "addon_devices_no_client_delete" on addon_devices;
create policy "addon_devices_no_client_delete" on addon_devices
  for delete using (false);
