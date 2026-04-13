
-- 1. Suppliers table
CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  balance_due numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages suppliers" ON public.suppliers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view store suppliers" ON public.suppliers FOR SELECT
  USING (is_store_member(store_id));

CREATE POLICY "Staff can manage store suppliers" ON public.suppliers FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 2. Purchases table
CREATE TABLE public.purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid',
  payment_method text NOT NULL DEFAULT 'cash',
  notes text DEFAULT '',
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages purchases" ON public.purchases FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view store purchases" ON public.purchases FOR SELECT
  USING (is_store_member(store_id));

CREATE POLICY "Staff can manage store purchases" ON public.purchases FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 3. Purchase items
CREATE TABLE public.purchase_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages purchase items" ON public.purchase_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.user_id = auth.uid()));

CREATE POLICY "Staff can manage store purchase items" ON public.purchase_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.store_id IS NOT NULL AND is_store_member(purchases.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.store_id IS NOT NULL AND is_store_member(purchases.store_id)));

-- 4. Cash register shifts
CREATE TABLE public.cash_register_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opened_by text DEFAULT '',
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric DEFAULT NULL,
  expected_balance numeric DEFAULT NULL,
  cash_in numeric NOT NULL DEFAULT 0,
  cash_out numeric NOT NULL DEFAULT 0,
  mismatch numeric DEFAULT NULL,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz DEFAULT NULL
);

ALTER TABLE public.cash_register_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages shifts" ON public.cash_register_shifts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view store shifts" ON public.cash_register_shifts FOR SELECT
  USING (is_store_member(store_id));

CREATE POLICY "Staff can manage store shifts" ON public.cash_register_shifts FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 5. Customer credits
CREATE TABLE public.customer_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_limit numeric NOT NULL DEFAULT 0,
  total_due numeric NOT NULL DEFAULT 0,
  last_payment_date timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages credits" ON public.customer_credits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view store credits" ON public.customer_credits FOR SELECT
  USING (is_store_member(store_id));

CREATE POLICY "Staff can manage store credits" ON public.customer_credits FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 6. Credit payments (history)
CREATE TABLE public.credit_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages credit payments" ON public.credit_payments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can manage store credit payments" ON public.credit_payments FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 7. Loyalty points
CREATE TABLE public.loyalty_points (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  total_points integer NOT NULL DEFAULT 0,
  redeemed_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages loyalty" ON public.loyalty_points FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can manage store loyalty" ON public.loyalty_points FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 8. Loyalty transactions
CREATE TABLE public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'earned',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages loyalty txns" ON public.loyalty_transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can manage store loyalty txns" ON public.loyalty_transactions FOR ALL
  USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 9. Stock alerts
CREATE TABLE public.stock_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alert_type text NOT NULL DEFAULT 'low_stock',
  threshold integer NOT NULL DEFAULT 5,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages stock alerts" ON public.stock_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view store stock alerts" ON public.stock_alerts FOR SELECT
  USING (is_store_member(store_id));

-- Indexes for performance
CREATE INDEX idx_suppliers_store ON public.suppliers(store_id);
CREATE INDEX idx_purchases_store ON public.purchases(store_id);
CREATE INDEX idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX idx_cash_shifts_store ON public.cash_register_shifts(store_id);
CREATE INDEX idx_customer_credits_store ON public.customer_credits(store_id);
CREATE INDEX idx_customer_credits_customer ON public.customer_credits(customer_id);
CREATE INDEX idx_credit_payments_store ON public.credit_payments(store_id);
CREATE INDEX idx_loyalty_points_store ON public.loyalty_points(store_id);
CREATE INDEX idx_loyalty_txns_store ON public.loyalty_transactions(store_id);
CREATE INDEX idx_stock_alerts_store ON public.stock_alerts(store_id);
CREATE INDEX idx_stock_alerts_product ON public.stock_alerts(product_id);
