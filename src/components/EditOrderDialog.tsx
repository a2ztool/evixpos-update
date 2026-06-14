import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import type { NormalizedPaymentMethod } from "@/lib/paymentMethods";

interface ProductLite { id: string; name: string; price: number; stock: number; }
interface VariationLite {
  id: string; product_id: string; name: string; price: number;
  duration_days: number; is_subscription: boolean; sort_order: number;
}
interface CustomerLite { id: string; name: string; phone?: string | null; }

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: any | null;
  products: ProductLite[];
  variations: VariationLite[];
  customers: CustomerLite[];
  paymentMethods: NormalizedPaymentMethod[];
  storeId: string | null;
  onSaved: () => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

export default function EditOrderDialog({
  open, onOpenChange, order, products, variations, customers,
  paymentMethods, storeId, onSaved,
}: EditOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [variationId, setVariationId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [price, setPrice] = useState<string>("0");
  const [paid, setPaid] = useState<string>("0");
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");
  const [orderStatus, setOrderStatus] = useState<string>("completed");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [orderDate, setOrderDate] = useState<string>("");
  const [subStart, setSubStart] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [existingSub, setExistingSub] = useState<any | null>(null);
  const [origItemId, setOrigItemId] = useState<string | null>(null);

  const currency = order?.payment_currency || "BDT";
  const symbol = CURRENCY_SYMBOLS[currency] || currency;

  // Load order data
  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    (async () => {
      const [{ data: items }, { data: subs }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", order.id),
        supabase.from("subscriptions").select("*").eq("order_id", order.id).maybeSingle(),
      ]);
      const meta = (order.meta || {}) as any;
      const firstItem = items?.[0];
      const resolvedPid = meta.product_id || firstItem?.product_id || "";
      const resolvedVid = meta.variation_id || "";
      const unitPrice = Number(meta.product_price ?? firstItem?.price ?? order.total_amount ?? 0);
      const qty = Number(firstItem?.quantity ?? 1);
      const total = Number(order.total_amount || 0);
      const paidAmt = Number(
        meta.paid_amount ?? (order.payment_status === "paid" ? total : 0)
      );

      setOrigItemId(firstItem?.id ?? null);
      setCustomerId(order.customer_id || "");
      setProductId(resolvedPid || "");
      setVariationId(resolvedVid || "");
      setQuantity(String(qty));
      setPrice(String(unitPrice));
      setPaid(String(paidAmt));
      setPaymentStatus(order.payment_status || "paid");
      setOrderStatus(order.status || "completed");
      setPaymentMethod(order.payment_method || "cash");
      setOrderDate(new Date(order.created_at).toISOString().slice(0, 16));
      setNotes(order.notes || "");
      setExistingSub(subs || null);
      setSubStart(subs?.start_date ? subs.start_date : new Date(order.created_at).toISOString().slice(0, 10));
      setLoading(false);
    })();
  }, [open, order]);

  const productVariations = useMemo(
    () => variations.filter((v) => v.product_id === productId),
    [variations, productId]
  );

  const selectedVariation = useMemo(
    () => productVariations.find((v) => v.id === variationId) || null,
    [productVariations, variationId]
  );

  // When variation changes, sync price
  const handleVariationChange = (val: string) => {
    setVariationId(val);
    const v = productVariations.find((x) => x.id === val);
    if (v) setPrice(String(v.price));
  };

  const handleProductChange = (val: string) => {
    setProductId(val);
    const vars = variations.filter((v) => v.product_id === val);
    if (vars.length > 0) {
      const first = vars[0];
      setVariationId(first.id);
      setPrice(String(first.price));
    } else {
      setVariationId("");
      const p = products.find((p) => p.id === val);
      if (p) setPrice(String(p.price));
    }
  };

  const numQty = Math.max(parseFloat(quantity) || 0, 0);
  const numPrice = Math.max(parseFloat(price) || 0, 0);
  const total = numPrice * numQty;
  const numPaid = Math.max(parseFloat(paid) || 0, 0);
  const due = Math.max(total - numPaid, 0);

  // Auto-derive payment_status from paid amount
  useEffect(() => {
    if (!open) return;
    if (total <= 0) return;
    const next = numPaid <= 0 ? "unpaid" : numPaid >= total - 0.001 ? "paid" : "partial";
    setPaymentStatus((cur) => (cur === "refunded" || cur === "partial_refund" ? cur : next));
  }, [numPaid, total, open]);

  const handleSave = async () => {
    if (!order || !storeId) return;
    if (numPrice <= 0) { toast.error("Price must be greater than 0"); return; }
    if (numQty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    if (productVariations.length > 0 && !selectedVariation) {
      toast.error("Please select a variation"); return;
    }
    setSaving(true);
    try {
      const meta = { ...(order.meta || {}) } as any;
      meta.product_id = productId || null;
      meta.product_price = numPrice;
      meta.variation_id = selectedVariation?.id ?? null;
      meta.variation_name = selectedVariation?.name ?? null;
      meta.variation_price = selectedVariation ? Number(selectedVariation.price) : null;
      meta.paid_amount = numPaid;
      meta.due_amount = due;
      meta.quantity = numQty;

      // Update order (scoped by store_id for isolation)
      const { error: upErr } = await supabase
        .from("orders")
        .update({
          customer_id: customerId || null,
          total_amount: total,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          status: orderStatus as any,
          notes,
          created_at: new Date(orderDate).toISOString(),
          meta,
        })
        .eq("id", order.id)
        .eq("store_id", storeId);
      if (upErr) throw upErr;

      // Update / replace primary order_item
      if (origItemId) {
        await supabase
          .from("order_items")
          .update({ product_id: productId || null, quantity: numQty, price: numPrice })
          .eq("id", origItemId);
      } else if (productId) {
        await supabase.from("order_items").insert({
          order_id: order.id, product_id: productId, quantity: numQty, price: numPrice,
        });
      }

      // Subscription sync
      if (existingSub) {
        const duration = selectedVariation?.duration_days || 30;
        const start = subStart || format(new Date(orderDate), "yyyy-MM-dd");
        const end = format(addDays(new Date(start), duration), "yyyy-MM-dd");
        await supabase
          .from("subscriptions")
          .update({
            customer_id: customerId || null,
            product_name: products.find((p) => p.id === productId)?.name || existingSub.product_name,
            variation: selectedVariation?.name || existingSub.variation,
            start_date: start,
            end_date: end,
            price: total,
          })
          .eq("id", existingSub.id);
      }

      toast.success("Order updated");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order</DialogTitle>
          <DialogDescription>
            Order ID: <span className="font-mono">{order?.order_code ?? order?.order_number ?? order?.id}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId || "__none"} onValueChange={(v) => setCustomerId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Walk-in —</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.phone ? ` · ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Product</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {productVariations.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Variation</Label>
                  <Select value={variationId} onValueChange={handleVariationChange}>
                    <SelectTrigger><SelectValue placeholder="Select variation" /></SelectTrigger>
                    <SelectContent>
                      {productVariations.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} — {symbol}{Number(v.price).toFixed(2)}
                          {v.is_subscription ? ` · ${v.duration_days}d` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit Price ({symbol})</Label>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Paid Amount ({symbol})</Label>
                <Input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Amount ({symbol})</Label>
                <Input type="number" value={due.toFixed(2)} readOnly className="bg-muted" />
              </div>

              <div className="space-y-1.5">
                <Label>Total ({symbol})</Label>
                <Input value={total.toFixed(2)} readOnly className="bg-muted font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Order Status</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.length === 0 && <SelectItem value="cash">Cash</SelectItem>}
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Order Date</Label>
                <Input type="datetime-local" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              {existingSub && (
                <div className="space-y-1.5">
                  <Label>Subscription Start</Label>
                  <Input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} />
                  {selectedVariation?.duration_days ? (
                    <p className="text-xs text-muted-foreground">
                      Expires: {format(addDays(new Date(subStart || orderDate), selectedVariation.duration_days), "dd MMM yyyy")}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}