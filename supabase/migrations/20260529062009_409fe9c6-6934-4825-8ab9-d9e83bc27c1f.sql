
CREATE OR REPLACE FUNCTION public.get_public_invoice(_order_id uuid, _token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_token text;
  v_order record;
  v_items jsonb;
  v_store record;
  v_settings record;
  v_customer record;
BEGIN
  expected_token := substr(md5(_order_id::text || 'evixpos-invoice-v1'), 1, 16);
  IF _token IS NULL OR _token <> expected_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF v_order IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_order.store_id;
  SELECT business_name, business_phone, business_email, logo_url
    INTO v_settings
    FROM public.business_settings
    WHERE user_id = v_order.user_id
      AND (store_id = v_order.store_id OR store_id IS NULL)
    ORDER BY (store_id = v_order.store_id) DESC NULLS LAST
    LIMIT 1;
  SELECT name, phone, email INTO v_customer FROM public.customers WHERE id = v_order.customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'quantity', oi.quantity,
    'price', oi.price,
    'product_name', COALESCE(p.name, NULLIF((item.value ->> 'name'), ''))
  ) ORDER BY oi.id), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(v_order.meta -> 'line_items', '[]'::jsonb)) WITH ORDINALITY AS item(value, ord)
    ON p.id IS NULL
   AND (item.value ->> 'quantity')::numeric = oi.quantity
   AND COALESCE((item.value ->> 'price')::numeric, (item.value ->> 'total')::numeric / NULLIF((item.value ->> 'quantity')::numeric, 0)) = oi.price
  WHERE oi.order_id = _order_id;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'total_amount', v_order.total_amount,
      'discount', v_order.discount,
      'discount_type', v_order.discount_type,
      'payment_method', v_order.payment_method,
      'payment_currency', v_order.payment_currency,
      'payment_status', v_order.payment_status,
      'source', v_order.source,
      'notes', v_order.notes,
      'created_at', v_order.created_at,
      'meta', v_order.meta
    ),
    'items', v_items,
    'store', jsonb_build_object(
      'name', COALESCE(v_settings.business_name, v_store.name, 'Store'),
      'phone', COALESCE(v_settings.business_phone, ''),
      'email', COALESCE(v_settings.business_email, ''),
      'logo_url', COALESCE(v_settings.logo_url, '')
    ),
    'customer', CASE WHEN v_customer IS NULL THEN NULL
      ELSE jsonb_build_object('name', v_customer.name, 'phone', v_customer.phone, 'email', v_customer.email) END
  );
END;
$$;
