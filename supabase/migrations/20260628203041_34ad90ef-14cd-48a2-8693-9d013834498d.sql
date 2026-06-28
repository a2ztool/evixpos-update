
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS store_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill: copy existing single store_id into the array if not yet populated
UPDATE public.staff_members
   SET store_ids = ARRAY[store_id]
 WHERE store_id IS NOT NULL
   AND (store_ids IS NULL OR array_length(store_ids, 1) IS NULL);

-- Update store-member check to recognize multi-store assignments
CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND (
        store_id = _store_id
        OR _store_id = ANY(COALESCE(store_ids, ARRAY[]::uuid[]))
      )
  )
$function$;
