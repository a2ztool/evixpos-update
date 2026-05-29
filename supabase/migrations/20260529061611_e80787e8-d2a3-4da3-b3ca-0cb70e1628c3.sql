
-- Add sequential per-store order_number to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number bigint;

CREATE UNIQUE INDEX IF NOT EXISTS orders_store_order_number_unique
  ON public.orders (store_id, order_number)
  WHERE order_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(order_number), 100000) + 1
    INTO next_num
    FROM public.orders
    WHERE store_id = NEW.store_id
      AND order_number IS NOT NULL;

  IF next_num < 100001 THEN
    next_num := 100001;
  END IF;

  NEW.order_number := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_order_number ON public.orders;
CREATE TRIGGER orders_assign_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_number();
