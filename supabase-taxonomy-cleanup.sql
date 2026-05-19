-- Contact taxonomy cleanup. Earlier UI offered six types (brand,
-- agency, vendor, agent, press, internal) and six statuses
-- (prospect, pitching, active, past, vendor, press). Two
-- problems: redundancy (vendor in both axes) and one-off
-- categories that should be tags (agent, press).
--
-- New shape:
--   type   = brand | agency | vendor | internal
--   status = prospect | pitching | active | past
--   tags handle the rest (intro-source, press, etc.)
--
-- Migrations below preserve information by tagging the removed
-- categories so no signal is lost.

-- 1. Move `vendor` from status to type (status: prospect→active)
update contacts
   set contact_type = 'vendor',
       status       = case when status = 'vendor' then 'active' else status end
 where status = 'vendor'
   and (contact_type is null or contact_type = '');

-- 2. Convert agent typing to a tag, drop the type
update contacts
   set tags = (
     case
       when 'intro-source' = any(coalesce(tags, '{}'::text[])) then tags
       else array_append(coalesce(tags, '{}'::text[]), 'intro-source')
     end
   ),
       contact_type = null
 where contact_type = 'agent';

-- 3. Convert press typing to a tag, drop the type
update contacts
   set tags = (
     case
       when 'press' = any(coalesce(tags, '{}'::text[])) then tags
       else array_append(coalesce(tags, '{}'::text[]), 'press')
     end
   ),
       contact_type = null
 where contact_type = 'press';

-- 4. Convert press status to a tag + move them to past
update contacts
   set tags = (
     case
       when 'press' = any(coalesce(tags, '{}'::text[])) then tags
       else array_append(coalesce(tags, '{}'::text[]), 'press')
     end
   ),
       status = 'past'
 where status = 'press';
