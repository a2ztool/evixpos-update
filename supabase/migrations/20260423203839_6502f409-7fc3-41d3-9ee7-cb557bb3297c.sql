CREATE POLICY "Authenticated can view active product variations"
ON public.product_variations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variations.product_id
      AND p.is_active = true
  )
);