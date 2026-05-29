-- Per-meeting "share with client" override. When set true on a
-- meeting, the client(s) linked to any project the meeting touches
-- can see it regardless of auto-classification.
--
-- Useful when:
--   - the auto-classifier guessed wrong (tagged an internal/prospect
--     meeting that was actually with the client)
--   - the meeting was internal but you want to share notes with the
--     client anyway (e.g., a post-shoot review)

alter table meetings
  add column if not exists share_with_clients boolean not null default false;

-- Replace the client-read policy to honor the override. Same shape
-- as before, plus the OR.
drop policy if exists "meetings_client_select" on meetings;
create policy "meetings_client_select" on meetings for select
  using (
    (classification = 'client' or share_with_clients = true)
    and id in (
      select meeting_id from meeting_projects
      where project_id in (
        select project_id from project_clients where user_id = auth.uid()
      )
    )
  );
