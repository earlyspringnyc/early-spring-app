-- Concept menu — a pre-budget deliverable a contact gets after the
-- cap call but before formal scoping. Three tiers (lean / mid /
-- ambitious) with title, concept, fee band, and an optional past
-- case study as reference.
--
-- Lives on the contact (not its own table) because v1 is one menu
-- per contact. If we later want multiple menus per contact (one per
-- initiative), bump to a sibling table.

alter table contacts
  add column if not exists concept_menu jsonb default '{}'::jsonb;
