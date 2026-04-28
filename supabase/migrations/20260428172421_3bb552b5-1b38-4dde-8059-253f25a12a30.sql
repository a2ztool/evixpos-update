-- Prevent deleting the user's last remaining store (safety enforcement at DB level)
CREATE OR REPLACE FUNCTION public.prevent_last_store_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_count integer;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM public.stores
  WHERE user_id = OLD.user_id
    AND id <> OLD.id;

  IF remaining_count < 1 THEN
    RAISE EXCEPTION 'At least 1 store is required. You cannot delete your only store.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_store_delete_trg ON public.stores;
CREATE TRIGGER prevent_last_store_delete_trg
BEFORE DELETE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_store_delete();