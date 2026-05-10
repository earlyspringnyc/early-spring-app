-- Profile photo URL on contacts. Populated by the RocketReach sync
-- (which surfaces a profile_image_url from LinkedIn / their image
-- pipeline) and falls back to initials when missing or the image
-- errors loading.

alter table contacts add column if not exists avatar_url text;
