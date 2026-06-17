
-- ============ stock_movements ============
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('in','out','adjust','return')),
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements owner all"
  ON public.stock_movements FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_store_member(store_id))
  WITH CHECK (auth.uid() = user_id OR public.is_store_member(store_id));

CREATE INDEX idx_stock_movements_store_created ON public.stock_movements(store_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);

CREATE TRIGGER stock_movements_touch
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ purchase_returns ============
CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_returns owner all"
  ON public.purchase_returns FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_store_member(store_id))
  WITH CHECK (auth.uid() = user_id OR public.is_store_member(store_id));

CREATE INDEX idx_purchase_returns_store ON public.purchase_returns(store_id, created_at DESC);
CREATE INDEX idx_purchase_returns_supplier ON public.purchase_returns(supplier_id);

CREATE TRIGGER purchase_returns_touch
  BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
