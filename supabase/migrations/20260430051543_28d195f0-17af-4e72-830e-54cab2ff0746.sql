INSERT INTO public.landing_content (key, value, section, content_type, sort_order) VALUES
('social_proof_avatar_1','/avatars/indian-1.jpg','hero','image',0),
('social_proof_avatar_2','/avatars/indian-2.jpg','hero','image',0),
('social_proof_avatar_3','/avatars/indian-3.jpg','hero','image',0)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, content_type = 'image';