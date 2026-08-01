-- Per-item price + tracking number on the wardrobe table. The old
-- order-level tracking_number column stays (kept for any existing
-- data) but the UI now reads/writes per-garment values so each item
-- can carry its own price and tracking, since they typically ship
-- separately from different vendors.

alter table project_wardrobe
  add column if not exists price_shorts numeric,
  add column if not exists price_shirt numeric,
  add column if not exists price_sunglasses numeric,
  add column if not exists price_scarf numeric,
  add column if not exists price_shoes numeric,
  add column if not exists tracking_shorts text,
  add column if not exists tracking_shirt text,
  add column if not exists tracking_sunglasses text,
  add column if not exists tracking_scarf text,
  add column if not exists tracking_shoes text;
