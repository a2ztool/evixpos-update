
-- =========================================================
-- 1) system_settings: no more public read; expose only maintenance_mode via RPC
-- =========================================================
DROP POLICY IF EXISTS "Anyone can read system settings" ON public.system_settings;

CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value, '{}'::jsonb)
  FROM public.system_settings
  WHERE key = 'maintenance_mode'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_maintenance_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_maintenance_mode() TO anon, authenticated;

-- =========================================================
-- 2) due_payments: restrict roles to authenticated
-- =========================================================
DROP POLICY IF EXISTS "Store members can view due payments"   ON public.due_payments;
DROP POLICY IF EXISTS "Store members can insert due payments" ON public.due_payments;
DROP POLICY IF EXISTS "Store members can update due payments" ON public.due_payments;
DROP POLICY IF EXISTS "Store members can delete due payments" ON public.due_payments;

CREATE POLICY "Store members can view due payments"
  ON public.due_payments FOR SELECT TO authenticated
  USING (is_store_owner(auth.uid(), store_id) OR is_store_member(store_id));
CREATE POLICY "Store members can insert due payments"
  ON public.due_payments FOR INSERT TO authenticated
  WITH CHECK (is_store_owner(auth.uid(), store_id) OR is_store_member(store_id));
CREATE POLICY "Store members can update due payments"
  ON public.due_payments FOR UPDATE TO authenticated
  USING (is_store_owner(auth.uid(), store_id) OR is_store_member(store_id));
CREATE POLICY "Store members can delete due payments"
  ON public.due_payments FOR DELETE TO authenticated
  USING (is_store_owner(auth.uid(), store_id) OR is_store_member(store_id));

-- =========================================================
-- 3) products: drop anon SELECT; expose safe RPC
-- =========================================================
DROP POLICY IF EXISTS "Anon can view active products" ON public.products;

CREATE OR REPLACE FUNCTION public.get_public_products(_ids uuid[])
RETURNS TABLE(id uuid, name text, price numeric, description text, image_url text, type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.price, p.description, p.image_url, p.type
  FROM public.products p
  WHERE p.is_active = true
    AND p.id = ANY(_ids);
$$;
REVOKE ALL ON FUNCTION public.get_public_products(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_products(uuid[]) TO anon, authenticated;

-- =========================================================
-- 4) order_forms: drop anon SELECT-all; expose safe RPC
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view active forms by slug" ON public.order_forms;

CREATE OR REPLACE FUNCTION public.get_public_order_form(_slug text)
RETURNS SETOF public.order_forms
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.order_forms
  WHERE status = 'active'
    AND (slug = _slug OR id::text = _slug)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_order_form(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_form(text) TO anon, authenticated;

-- =========================================================
-- 5) platform_coupons: drop authenticated SELECT-all; expose safe RPCs
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.platform_coupons;

CREATE OR REPLACE FUNCTION public.validate_platform_coupon(_code text)
RETURNS TABLE(id uuid, code text, discount_type text, discount_value numeric, expires_at timestamptz, max_uses integer, used_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.code, c.discount_type, c.discount_value, c.expires_at, c.max_uses, c.used_count
  FROM public.platform_coupons c
  WHERE c.is_active = true
    AND upper(c.code) = upper(_code)
    AND (c.expires_at IS NULL OR c.expires_at >= now())
    AND (c.max_uses = 0 OR c.used_count < c.max_uses)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.validate_platform_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_platform_coupon(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_active_coupon_banner()
RETURNS TABLE(id uuid, code text, discount_type text, discount_value numeric, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.code, c.discount_type, c.discount_value, c.expires_at
  FROM public.platform_coupons c
  WHERE c.is_active = true
    AND (c.expires_at IS NULL OR c.expires_at >= now())
    AND (c.max_uses = 0 OR c.used_count < c.max_uses)
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_active_coupon_banner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_coupon_banner() TO anon, authenticated;

-- =========================================================
-- 6) payment_gateways: drop public SELECT; expose safe RPC excluding api_config
-- =========================================================
DROP POLICY IF EXISTS "Anon can view active gateways"   ON public.payment_gateways;
DROP POLICY IF EXISTS "Anyone can view active gateways" ON public.payment_gateways;

CREATE OR REPLACE FUNCTION public.get_active_payment_gateways(_currency text)
RETURNS TABLE(
  id uuid, gateway_name text, gateway_type text, currency text,
  icon_url text, mode text, payment_details jsonb, qr_code_url text,
  required_fields jsonb, sort_order integer, is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.gateway_name, g.gateway_type, g.currency,
         g.icon_url, g.mode, g.payment_details, g.qr_code_url,
         g.required_fields, g.sort_order, g.is_active
  FROM public.payment_gateways g
  WHERE g.is_active = true
    AND (_currency IS NULL OR g.currency = _currency)
  ORDER BY g.sort_order;
$$;
REVOKE ALL ON FUNCTION public.get_active_payment_gateways(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_payment_gateways(text) TO anon, authenticated;

-- =========================================================
-- 7) Tighten anonymous order-form inserts: orders/customers/subscriptions/order_items
-- =========================================================
DROP POLICY IF EXISTS "Anyone can create orders from forms"        ON public.orders;
DROP POLICY IF EXISTS "Anyone can create customers from forms"     ON public.customers;
DROP POLICY IF EXISTS "Anyone can create subscriptions from forms" ON public.subscriptions;
DROP POLICY IF EXISTS "Anyone can create order items from forms"   ON public.order_items;

CREATE POLICY "Public order-form orders"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    source = 'order_form'
    AND EXISTS (
      SELECT 1 FROM public.order_forms f
      WHERE f.user_id = orders.user_id
        AND COALESCE(f.store_id::text, '') = COALESCE(orders.store_id::text, '')
        AND f.status = 'active'
    )
  );

CREATE POLICY "Public order-form customers"
  ON public.customers FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_forms f
      WHERE f.user_id = customers.user_id
        AND COALESCE(f.store_id::text, '') = COALESCE(customers.store_id::text, '')
        AND f.status = 'active'
    )
  );

CREATE POLICY "Public order-form subscriptions"
  ON public.subscriptions FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_forms f
      WHERE f.user_id = subscriptions.user_id
        AND COALESCE(f.store_id::text, '') = COALESCE(subscriptions.store_id::text, '')
        AND f.status = 'active'
    )
  );

CREATE POLICY "Public order-form order_items"
  ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.source = 'order_form'
    )
  );
