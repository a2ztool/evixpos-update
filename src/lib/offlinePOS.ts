// Offline-first POS persistence layer
// - Caches products/variations/customers per store in IndexedDB (idb-keyval)
// - Queues completed sales when offline (orders + items + transactions + stock deltas)
// - Drains queue on reconnect (last-write-wins)
import { get, set, del, createStore, keys } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const cacheStore = createStore("evixpos-offline", "cache");
const outboxStore = createStore("evixpos-offline", "outbox");

export type CachedProduct = {
  id: string;
  name: string;
  price: number;
  type: string;
  stock: number;
  image_url: string | null;
  category: string | null;
  sku: string | null;
};
export type CachedVariation = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock?: number;
  sort_order?: number;
  is_subscription?: boolean;
  duration_days?: number;
};
export type CachedCustomer = { id: string; name: string; phone: string | null };

export type OfflineSale = {
  tempId: string;            // local UUID for the order
  storeId: string;
  userId: string;            // effective owner user_id
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  totalAmount: number;
  subtotal: number;
  discount: number;
  discountType: string;
  discountAmount: number;
  paymentMethod: string;     // restricted to cash/card-style only
  paymentMethodId: string;
  paymentCurrency: string;
  notes: string;
  items: Array<{
    product_id: string;
    quantity: number;
    price: number;
    productType: string;       // for stock decrement decision
    name: string;
  }>;
  createdAt: string;
};

const productsKey = (storeId: string) => `products:${storeId}`;
const variationsKey = (storeId: string) => `variations:${storeId}`;
const customersKey = (storeId: string) => `customers:${storeId}`;

export async function cacheProducts(storeId: string, products: CachedProduct[]) {
  await set(productsKey(storeId), products, cacheStore);
}
export async function cacheVariations(storeId: string, vars: CachedVariation[]) {
  await set(variationsKey(storeId), vars, cacheStore);
}
export async function cacheCustomers(storeId: string, customers: CachedCustomer[]) {
  await set(customersKey(storeId), customers, cacheStore);
}
export async function getCachedProducts(storeId: string): Promise<CachedProduct[]> {
  return (await get(productsKey(storeId), cacheStore)) || [];
}
export async function getCachedVariations(storeId: string): Promise<CachedVariation[]> {
  return (await get(variationsKey(storeId), cacheStore)) || [];
}
export async function getCachedCustomers(storeId: string): Promise<CachedCustomer[]> {
  return (await get(customersKey(storeId), cacheStore)) || [];
}

// Local stock decrement after an offline sale (best-effort, may oversell)
export async function applyLocalStockDelta(storeId: string, items: OfflineSale["items"]) {
  const list = await getCachedProducts(storeId);
  if (!list.length) return;
  const next = list.map((p) => {
    const sold = items.filter((i) => i.product_id === p.id && i.productType === "physical")
      .reduce((s, i) => s + i.quantity, 0);
    return sold > 0 ? { ...p, stock: Math.max(0, p.stock - sold) } : p;
  });
  await cacheProducts(storeId, next);
}

// ─── Outbox ───
export async function enqueueSale(sale: OfflineSale) {
  await set(sale.tempId, sale, outboxStore);
  notifyChange();
}
export async function listPendingSales(): Promise<OfflineSale[]> {
  const ks = await keys(outboxStore);
  const out: OfflineSale[] = [];
  for (const k of ks) {
    const v = await get(k as string, outboxStore);
    if (v) out.push(v as OfflineSale);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function removeSale(tempId: string) {
  await del(tempId, outboxStore);
  notifyChange();
}

// Push a single queued sale to Supabase. Last-write-wins (no conflict check).
export async function pushSale(sale: OfflineSale): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  try {
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        user_id: sale.userId,
        store_id: sale.storeId,
        customer_id: sale.customerId,
        total_amount: sale.totalAmount,
        cost_price: 0,
        discount: sale.discount,
        discount_type: sale.discountType,
        payment_method: sale.paymentMethod,
        source: "pos",
        payment_currency: sale.paymentCurrency,
        status: "completed" as const,
        payment_status: "paid",
        meta: {
          paid_amount: sale.totalAmount,
          due_amount: 0,
          subtotal: sale.subtotal,
          discount_amount: sale.discountAmount,
          final_total: sale.totalAmount,
          offline_temp_id: sale.tempId,
          offline_created_at: sale.createdAt,
        } as any,
        notes: sale.notes ? `${sale.notes} (offline)` : "Offline POS sale",
        created_at: sale.createdAt,
      } as any)
      .select("id")
      .single();
    if (oErr || !order) throw oErr ?? new Error("order insert failed");

    if (sale.items.length) {
      const { error: iErr } = await supabase.from("order_items").insert(
        sale.items.map((i) => ({
          order_id: order.id,
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.price,
        })),
      );
      if (iErr) throw iErr;
    }

    await supabase.from("transactions").insert({
      user_id: sale.userId,
      store_id: sale.storeId,
      order_id: order.id,
      type: "income" as const,
      amount: sale.totalAmount,
      category: "sale",
      note: `POS Order #${(order as any).order_code ?? order.id.slice(0, 8)} (offline sync)`,
      is_paid: true,
      customer_name: sale.customerName,
      phone_number: sale.customerPhone,
    } as any);

    // Stock decrement (last-write-wins: read current then subtract sold qty)
    const physical = sale.items.filter((i) => i.productType === "physical");
    if (physical.length) {
      const ids = Array.from(new Set(physical.map((i) => i.product_id)));
      const { data: rows } = await supabase
        .from("products")
        .select("id, stock")
        .in("id", ids);
      if (rows) {
        await Promise.all(
          rows.map((r: any) => {
            const sold = physical.filter((i) => i.product_id === r.id).reduce((s, i) => s + i.quantity, 0);
            return supabase.from("products").update({ stock: Math.max(0, (r.stock ?? 0) - sold) }).eq("id", r.id);
          }),
        );
      }
    }

    return { ok: true, orderId: order.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Drain outbox sequentially. Stops on first hard failure (keeps order).
export async function drainOutbox(): Promise<{ synced: number; failed: number }> {
  const sales = await listPendingSales();
  let synced = 0;
  let failed = 0;
  for (const s of sales) {
    const res = await pushSale(s);
    if (res.ok) {
      await removeSale(s.tempId);
      synced++;
    } else {
      failed++;
      // stop on failure to preserve order; reconnect/retry will resume
      break;
    }
  }
  return { synced, failed };
}

// ─── Tiny event bus so the UI badge updates ───
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeOutboxChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function genTempId() {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
