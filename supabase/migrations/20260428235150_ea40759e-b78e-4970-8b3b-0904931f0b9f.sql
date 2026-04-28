
-- Function: recalculate total_due for one customer in one store from live transactions
CREATE OR REPLACE FUNCTION public.recalc_customer_due(_customer_id uuid, _store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due numeric := 0;
  v_user_id uuid;
BEGIN
  IF _customer_id IS NULL OR _store_id IS NULL THEN RETURN; END IF;

  -- Sum remaining due across all unpaid transactions tied to existing orders for this customer in this store
  SELECT COALESCE(SUM(GREATEST(t.amount - COALESCE(t.paid_amount, 0), 0)), 0)
    INTO v_due
  FROM public.transactions t
  JOIN public.orders o ON o.id = t.order_id
  WHERE o.customer_id = _customer_id
    AND t.store_id = _store_id
    AND t.is_paid = false
    AND t.type = 'income';

  -- Find owner (user_id) for this store
  SELECT user_id INTO v_user_id FROM public.stores WHERE id = _store_id;

  IF v_due > 0 THEN
    INSERT INTO public.customer_credits (customer_id, store_id, user_id, total_due, credit_limit)
    VALUES (_customer_id, _store_id, v_user_id, v_due, 0)
    ON CONFLICT (customer_id, store_id)
    DO UPDATE SET total_due = EXCLUDED.total_due, updated_at = now();
  ELSE
    UPDATE public.customer_credits
       SET total_due = 0, updated_at = now()
     WHERE customer_id = _customer_id AND store_id = _store_id;
  END IF;
END;
$$;

-- Ensure unique constraint exists for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_credits_customer_store_uniq'
  ) THEN
    BEGIN
      ALTER TABLE public.customer_credits
        ADD CONSTRAINT customer_credits_customer_store_uniq UNIQUE (customer_id, store_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- Trigger fn for transactions changes
CREATE OR REPLACE FUNCTION public.trg_recalc_due_from_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust uuid;
  v_store uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT customer_id, store_id INTO v_cust, v_store FROM public.orders WHERE id = OLD.order_id;
    IF v_cust IS NOT NULL THEN PERFORM public.recalc_customer_due(v_cust, v_store); END IF;
    RETURN OLD;
  ELSE
    SELECT customer_id, store_id INTO v_cust, v_store FROM public.orders WHERE id = NEW.order_id;
    IF v_cust IS NOT NULL THEN PERFORM public.recalc_customer_due(v_cust, v_store); END IF;
    -- If UPDATE moved order_id, also recalc the old one
    IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
      SELECT customer_id, store_id INTO v_cust, v_store FROM public.orders WHERE id = OLD.order_id;
      IF v_cust IS NOT NULL THEN PERFORM public.recalc_customer_due(v_cust, v_store); END IF;
    END IF;
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS transactions_recalc_due ON public.transactions;
CREATE TRIGGER transactions_recalc_due
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_due_from_transactions();

-- Trigger fn for due_payments (payments toward dues)
CREATE OR REPLACE FUNCTION public.trg_recalc_due_from_due_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust uuid;
  v_store uuid;
  v_tx record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT t.order_id, t.store_id INTO v_tx FROM public.transactions t WHERE t.id = OLD.transaction_id;
  ELSE
    SELECT t.order_id, t.store_id INTO v_tx FROM public.transactions t WHERE t.id = NEW.transaction_id;
  END IF;

  IF v_tx.order_id IS NOT NULL THEN
    SELECT customer_id, store_id INTO v_cust, v_store FROM public.orders WHERE id = v_tx.order_id;
    IF v_cust IS NOT NULL THEN PERFORM public.recalc_customer_due(v_cust, v_store); END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS due_payments_recalc_due ON public.due_payments;
CREATE TRIGGER due_payments_recalc_due
AFTER INSERT OR UPDATE OR DELETE ON public.due_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_due_from_due_payments();

-- Trigger fn for orders deletion (transactions cascade fires per-row, but if cascade order is unclear, recompute from order itself)
CREATE OR REPLACE FUNCTION public.trg_recalc_due_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.customer_id IS NOT NULL THEN
    PERFORM public.recalc_customer_due(OLD.customer_id, OLD.store_id);
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_recalc_due ON public.orders;
CREATE TRIGGER orders_recalc_due
AFTER DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_due_from_orders();

-- One-time backfill: recompute every customer_credits row from current transactions
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT customer_id, store_id FROM public.customer_credits WHERE customer_id IS NOT NULL AND store_id IS NOT NULL LOOP
    PERFORM public.recalc_customer_due(r.customer_id, r.store_id);
  END LOOP;
  -- Also create rows for any customer with active dues but no credit row
  FOR r IN
    SELECT DISTINCT o.customer_id, o.store_id
    FROM public.transactions t
    JOIN public.orders o ON o.id = t.order_id
    WHERE t.is_paid = false AND o.customer_id IS NOT NULL
  LOOP
    PERFORM public.recalc_customer_due(r.customer_id, r.store_id);
  END LOOP;
END $$;

-- Enable realtime on relevant tables
ALTER TABLE public.customer_credits REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.due_payments REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_credits; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.due_payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
