
-- Allow users to delete their own orders
CREATE POLICY "Users can delete own orders"
ON public.orders FOR DELETE
USING (
  auth.uid() = user_id
  OR is_store_member(store_id)
);

-- Allow users to delete order items for their own orders
CREATE POLICY "Users can delete own order items"
ON public.order_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND (orders.user_id = auth.uid() OR is_store_member(orders.store_id))
  )
);

-- Allow users to delete refunds for their own orders
CREATE POLICY "Users can delete own refunds"
ON public.refunds FOR DELETE
USING (
  auth.uid() = user_id
  OR is_store_member(store_id)
);
