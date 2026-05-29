-- Per-person, per-garment product URLs. One column per garment so
-- each row can carry its own source link (different size, different
-- color, different vendor). Nullable — link is optional.

alter table project_wardrobe
  add column if not exists link_shorts text,
  add column if not exists link_shirt text,
  add column if not exists link_sunglasses text,
  add column if not exists link_scarf text,
  add column if not exists link_shoes text;
