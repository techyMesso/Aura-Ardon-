-- =========================================================
-- Round 2 — Phase 4 (4.10): Fix known catalog data typos
-- Fixes "Stainless with leather staps" -> "straps" (case-preserving whole word)
-- across product text fields without touching unaffected rows.
-- =========================================================

update public.products
set
  title       = case when title       ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(title,       '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else title end,
  material    = case when material    ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(material,    '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else material end,
  description = case when description ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(description, '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else description end,
  finish      = case when finish      ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(finish,      '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else finish end,
  in_the_box  = case when in_the_box  ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(in_the_box,  '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else in_the_box end,
  care        = case when care        ~* '\mstaps\M' then regexp_replace(regexp_replace(regexp_replace(care,        '\mSTAPS\M', 'STRAPS', 'g'), '\mStaps\M', 'Straps', 'g'), '\mstaps\M', 'straps', 'gi') else care end
where
  coalesce(title, '') ~* '\mstaps\M'
  or coalesce(material, '') ~* '\mstaps\M'
  or coalesce(description, '') ~* '\mstaps\M'
  or coalesce(finish, '') ~* '\mstaps\M'
  or coalesce(in_the_box, '') ~* '\mstaps\M'
  or coalesce(care, '') ~* '\mstaps\M';

