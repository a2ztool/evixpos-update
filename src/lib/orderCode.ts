/**
 * Returns a human-friendly Order Code for display & search.
 * Order of preference: order_code (new, e.g. "10001ABC") → order_number → UUID id.
 * Always returns a string. Never truncates.
 */
export function getOrderCode(order: any): string {
  if (!order) return "";
  return String(
    order.order_code ??
      order.order_number ??
      order.id ??
      ""
  );
}

/** Lowercase plain text version for case-insensitive search matching. */
export function orderCodeMatches(order: any, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return getOrderCode(order).toLowerCase().includes(q);
}