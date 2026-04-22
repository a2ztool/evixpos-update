UPDATE public.landing_content
SET section = 'why_us'
WHERE key IN (
  'why_title', 'why_subtitle',
  'why_1_title', 'why_1_desc',
  'why_2_title', 'why_2_desc',
  'why_3_title', 'why_3_desc',
  'why_4_title', 'why_4_desc'
)
AND section <> 'why_us';

DELETE FROM public.landing_content
WHERE key LIKE 'http%://%';