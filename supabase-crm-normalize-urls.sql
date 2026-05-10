-- One-shot: normalize linkedin_url to lowercase across existing rows so
-- the JS-side dedup lookup (which now lowercases) actually matches.
-- Emails are already stored lowercased by the importer; included here
-- just to be safe against any rows that snuck in via direct insert.

update contacts
set linkedin_url = lower(linkedin_url)
where linkedin_url is not null and linkedin_url <> lower(linkedin_url);

update contacts
set email = lower(email)
where email is not null and email <> lower(email);
