-- Adds support for "client-fillable fields" on a contract.
--
-- When the agency sends a contract for signature, they can mark
-- specific fields (typically the client's billing address /
-- billing email / legal address) as editable on the public signing
-- page. The client fills those in, then signs, and the values
-- merge back into filled_fields server-side.
--
-- client_fillable_fields holds the list of variable IDs that are
-- editable for this contract. Empty array = legacy behavior (no
-- client fill-in, just sign).

alter table contracts
  add column if not exists client_fillable_fields jsonb not null default '[]'::jsonb;

-- PostgREST schema cache reload so the new column is queryable
-- immediately without a server restart.
notify pgrst, 'reload schema';
