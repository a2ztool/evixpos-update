
-- 1. Column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_code text;

-- 2. Unique index per store
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_order_code_unique
  ON public.orders (store_id, order_code)
  WHERE order_code IS NOT NULL;

-- 3. Generator function
CREATE OR REPLACE FUNCTION public.generate_order_code(_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
  letters text;
  candidate text;
  attempt int := 0;
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
BEGIN
  IF _store_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Highest existing numeric prefix for this store
  SELECT COALESCE(
    MAX( NULLIF(regexp_replace(order_code, '[^0-9].*$', ''), '')::bigint ),
    10000
  ) + 1
  INTO next_num
  FROM public.orders
  WHERE store_id = _store_id
    AND order_code ~ '^[0-9]{5,}[A-Z]{3}$';

  IF next_num < 10001 THEN
    next_num := 10001;
  END IF;

  LOOP
    attempt := attempt + 1;
    letters :=
      substr(chars, 1 + floor(random()*26)::int, 1) ||
      substr(chars, 1 + floor(random()*26)::int, 1) ||
      substr(chars, 1 + floor(random()*26)::int, 1);
    candidate := lpad(next_num::text, 5, '0') || letters;

    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE store_id = _store_id AND order_code = candidate
    ) THEN
      RETURN candidate;
    END IF;

    IF attempt > 10 THEN
      next_num := next_num + 1;
      attempt := 0;
    END IF;
  END LOOP;
END;
$$;

-- 4. BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION public.assign_order_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_code IS NULL AND NEW.store_id IS NOT NULL THEN
    NEW.order_code := public.generate_order_code(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_code ON public.orders;
CREATE TRIGGER trg_assign_order_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_code();

-- 5. Backfill historical orders deterministically.
-- Use existing order_number where present (ensures stable codes for old data),
-- else assign a sequential one per store starting at 10001.
DO $$
DECLARE
  r record;
  next_num bigint;
  letters text;
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  seed_text text;
  candidate text;
BEGIN
  FOR r IN
    SELECT id, store_id, order_number, created_at
    FROM public.orders
    WHERE order_code IS NULL AND store_id IS NOT NULL
    ORDER BY store_id, COALESCE(order_number, 0), created_at
  LOOP
    -- Numeric portion
    IF r.order_number IS NOT NULL AND r.order_number >= 10001 THEN
      next_num := r.order_number;
    ELSIF r.order_number IS NOT NULL THEN
      next_num := 10000 + r.order_number;
    ELSE
      SELECT COALESCE(
        MAX( NULLIF(regexp_replace(order_code, '[^0-9].*$', ''), '')::bigint ),
        10000
      ) + 1
      INTO next_num
      FROM public.orders
      WHERE store_id = r.store_id
        AND order_code ~ '^[0-9]{5,}[A-Z]{3}$';
    END IF;

    -- Deterministic 3 letters from md5 of id, so backfill is stable across re-runs
    seed_text := md5(r.id::text);
    letters :=
      substr(chars, 1 + (get_byte(decode(substr(seed_text,1,2),'hex'),0) % 26), 1) ||
      substr(chars, 1 + (get_byte(decode(substr(seed_text,3,2),'hex'),0) % 26), 1) ||
      substr(chars, 1 + (get_byte(decode(substr(seed_text,5,2),'hex'),0) % 26), 1);

    candidate := lpad(next_num::text, 5, '0') || letters;

    -- Resolve any unlikely collision by bumping the number
    WHILE EXISTS (
      SELECT 1 FROM public.orders
      WHERE store_id = r.store_id AND order_code = candidate
    ) LOOP
      next_num := next_num + 1;
      candidate := lpad(next_num::text, 5, '0') || letters;
    END LOOP;

    UPDATE public.orders SET order_code = candidate WHERE id = r.id;
  END LOOP;
END $$;
