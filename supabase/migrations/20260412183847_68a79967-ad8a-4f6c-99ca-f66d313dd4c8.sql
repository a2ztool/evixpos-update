
-- Helper function: check if current auth user is active staff of a given store
CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE auth_user_id = auth.uid()
      AND store_id = _store_id
      AND is_active = true
  )
$$;

-- Helper: get the owner user_id for a store where current user is staff
CREATE OR REPLACE FUNCTION public.get_staff_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.staff_members
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- ═══ STORES: staff can view their assigned store ═══
CREATE POLICY "Staff can view assigned store"
ON public.stores FOR SELECT
TO authenticated
USING (public.is_store_member(id));

-- ═══ PRODUCTS ═══
CREATE POLICY "Staff can view store products"
ON public.products FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can insert store products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id) AND user_id = (SELECT user_id FROM public.staff_members WHERE auth_user_id = auth.uid() AND store_id = products.store_id AND is_active = true LIMIT 1));

CREATE POLICY "Staff can update store products"
ON public.products FOR UPDATE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can delete store products"
ON public.products FOR DELETE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ CUSTOMERS ═══
CREATE POLICY "Staff can view store customers"
ON public.customers FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can insert store customers"
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id) AND user_id = (SELECT user_id FROM public.staff_members WHERE auth_user_id = auth.uid() AND store_id = customers.store_id AND is_active = true LIMIT 1));

CREATE POLICY "Staff can update store customers"
ON public.customers FOR UPDATE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can delete store customers"
ON public.customers FOR DELETE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ ORDERS ═══
CREATE POLICY "Staff can view store orders"
ON public.orders FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can insert store orders"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id) AND user_id = (SELECT user_id FROM public.staff_members WHERE auth_user_id = auth.uid() AND store_id = orders.store_id AND is_active = true LIMIT 1));

CREATE POLICY "Staff can update store orders"
ON public.orders FOR UPDATE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can delete store orders"
ON public.orders FOR DELETE
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ ORDER_ITEMS (via order's store) ═══
CREATE POLICY "Staff can manage store order items"
ON public.order_items FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders
  WHERE orders.id = order_items.order_id
    AND orders.store_id IS NOT NULL
    AND public.is_store_member(orders.store_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders
  WHERE orders.id = order_items.order_id
    AND orders.store_id IS NOT NULL
    AND public.is_store_member(orders.store_id)
));

-- ═══ COUPONS ═══
CREATE POLICY "Staff can view store coupons"
ON public.coupons FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can manage store coupons"
ON public.coupons FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ SUBSCRIPTIONS ═══
CREATE POLICY "Staff can view store subscriptions"
ON public.subscriptions FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can manage store subscriptions"
ON public.subscriptions FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ TRANSACTIONS ═══
CREATE POLICY "Staff can view store transactions"
ON public.transactions FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can manage store transactions"
ON public.transactions FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ TASKS ═══
CREATE POLICY "Staff can view store tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can manage store tasks"
ON public.tasks FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ AD_COSTS ═══
CREATE POLICY "Staff can view store ad_costs"
ON public.ad_costs FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ BOT_AUTOMATIONS ═══
CREATE POLICY "Staff can view store bot_automations"
ON public.bot_automations FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ BUSINESS_SETTINGS ═══
CREATE POLICY "Staff can view store business_settings"
ON public.business_settings FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ INTEGRATIONS ═══
CREATE POLICY "Staff can view store integrations"
ON public.integrations FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ GOOGLE_SHEETS_CONFIG ═══
CREATE POLICY "Staff can view store google_sheets_config"
ON public.google_sheets_config FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ REFUNDS ═══
CREATE POLICY "Staff can view store refunds"
ON public.refunds FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can manage store refunds"
ON public.refunds FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ ORDER_FORMS ═══
CREATE POLICY "Staff can view store order_forms"
ON public.order_forms FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ STAFF_MEMBERS: staff can see other staff in same store ═══
CREATE POLICY "Staff can view same-store staff"
ON public.staff_members FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

-- ═══ RENEWAL TABLES ═══
CREATE POLICY "Staff can view store renewal_automation_config"
ON public.renewal_automation_config FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

CREATE POLICY "Staff can view store renewal_email_templates"
ON public.renewal_email_templates FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

CREATE POLICY "Staff can view store renewal_reminders"
ON public.renewal_reminders FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

-- ═══ EMAIL_STORE_CONFIG ═══
CREATE POLICY "Staff can view store email_store_config"
ON public.email_store_config FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

-- ═══ EMAIL_CAMPAIGN_TRACKING ═══
CREATE POLICY "Staff can view store email_campaign_tracking"
ON public.email_campaign_tracking FOR SELECT
TO authenticated
USING (public.is_store_member(store_id));

-- ═══ SUPPORT_TICKETS ═══
CREATE POLICY "Staff can view store support_tickets"
ON public.support_tickets FOR SELECT
TO authenticated
USING (store_id IS NOT NULL AND public.is_store_member(store_id));

CREATE POLICY "Staff can create store support_tickets"
ON public.support_tickets FOR INSERT
TO authenticated
WITH CHECK (store_id IS NOT NULL AND public.is_store_member(store_id));
