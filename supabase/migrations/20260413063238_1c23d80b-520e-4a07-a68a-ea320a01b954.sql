
ALTER TABLE public.stores 
ADD COLUMN store_mode text NOT NULL DEFAULT 'online';
