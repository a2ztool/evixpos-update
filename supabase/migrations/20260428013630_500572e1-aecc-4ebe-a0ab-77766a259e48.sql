INSERT INTO public.payment_gateways (gateway_name, gateway_type, currency, mode, is_active, sort_order, payment_details, api_config)
SELECT 'Razorpay', 'card', 'INR', 'automatic', true, 0, '{}'::jsonb, '{"provider":"razorpay"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateways
  WHERE lower(gateway_name) = 'razorpay' AND currency = 'INR'
);