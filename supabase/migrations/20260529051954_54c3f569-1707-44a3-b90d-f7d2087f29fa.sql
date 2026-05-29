ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date timestamp with time zone;
UPDATE public.orders SET order_date = created_at WHERE order_date IS NULL;
ALTER TABLE public.orders ALTER COLUMN order_date SET DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders(order_date);