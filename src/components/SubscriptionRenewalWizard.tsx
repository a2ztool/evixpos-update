import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  User, Package, Wallet, Receipt, Check, ChevronRight, ChevronLeft,
  Calendar, Tag, CreditCard, RotateCcw, Loader2,
} from "lucide-react";
import { addDays, format as fnsFormat } from "date-fns";
import { normalizePaymentMethods, type NormalizedPaymentMethod } from "@/lib/paymentMethods";

type PayType = "full" | "partial" | "due";

interface ProductRow { id: string; name: string; price: number; stock?: number }
interface VariationRow {
  id: string;
  product_id: string;
  name: string;
  price: number;
  duration_days: number;
  is_subscription: boolean;
  sort_order: number;
}

export interface SubscriptionRenewalSubject {
  id: string;
  customer_id: string | null;
  product_name: string;
  variation: string;
  start_date: string;
  end_date: string | null;
  price: number;
  cost_price: number;
  renewals: number;
  customers?: { name: string; phone: string; email?: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subscription: SubscriptionRenewalSubject | null;
  onRenewed?: () => void;
}

const FALLBACK_VARIATIONS = [
  { label: "7 Days", days: 7 },
  { label: "15 Days", days: 15 },
  { label: "1 Month", days: 30 },
  { label: "2 Month", days: 60 },
  { label: "3 Month", days: 90 },
  { label: "6 Month", days: 180 },
  { label: "12 Month", days: 365 },
];

const STEPS = [
  { id: 1, label: "Customer", icon: User },
  { id: 2, label: "Product", icon: Package },
  { id: 3, label: "Payment", icon: Wallet },
  { id: 4, label: "Review", icon: Receipt },
];

export default function SubscriptionRenewalWizard({ open, onOpenChange, subscription, onRenewed }: Props) {
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { format: fmt, symbol } = useCurrency();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [variations, setVariations] = useState<VariationRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<NormalizedPaymentMethod[]>([]);

  // Selections
  const [productId, setProductId] = useState<string | null>(null);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [fallbackVariation, setFallbackVariation] = useState<string>("1 Month");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [discount, setDiscount] = useState<string>("0");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [payType, setPayType] = useState<PayType>("full");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState<string>("");

  // Load reference data & preselect when opening
  useEffect(() => {
    if (!open || !subscription || !activeStore) return;
    let cancelled = false;
    (async () => {
      const [{ data: prods }, { data: bs }] = await Promise.all([
        supabase.from("products").select("id, name, price, stock").eq("store_id", activeStore.id),
        supabase
          .from("business_settings")
          .select("payment_methods")
          .eq("user_id", effectiveUserId!)
          .eq("store_id", activeStore.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const pRows = (prods ?? []) as ProductRow[];
      setProducts(pRows);

      const methods = bs?.payment_methods
        ? normalizePaymentMethods(bs.payment_methods).filter(m => m.enabled)
        : [];
      const finalMethods = methods.length > 0
        ? methods
        : [{ id: "cash", name: "Cash", enabled: true, config: {} } as NormalizedPaymentMethod];
      setPaymentMethods(finalMethods);
      setPaymentMethod(finalMethods[0].id);

      // Preselect product matching subscription product_name
      const matched = pRows.find(p => p.name.toLowerCase() === subscription.product_name.toLowerCase());
      const matchedId = matched?.id ?? null;
      setProductId(matchedId);

      let vars: VariationRow[] = [];
      if (matchedId) {
        const { data: v } = await (supabase
          .from("product_variations" as any)
          .select("*")
          .eq("product_id", matchedId)
          .order("sort_order") as any);
        vars = (v ?? []) as VariationRow[];
      }
      setVariations(vars);

      // Preselect variation matching subscription.variation
      const matchedVar = vars.find(v => v.name.toLowerCase() === subscription.variation.toLowerCase());
      setVariationId(matchedVar?.id ?? null);
      setFallbackVariation(
        FALLBACK_VARIATIONS.find(x => x.label.toLowerCase() === subscription.variation.toLowerCase())?.label
        ?? "1 Month"
      );

      const initialPrice = matchedVar?.price ?? subscription.price ?? matched?.price ?? 0;
      setUnitPrice(String(initialPrice));
      setCostPrice(String(subscription.cost_price || 0));
      setDiscount("0");
      setDiscountType("fixed");
      setPayType("full");
      setPaidAmount(String(initialPrice));
      setNotes("");
      setStep(1);
    })();
    return () => { cancelled = true; };
  }, [open, subscription, activeStore, effectiveUserId]);

  // When product changes inside the wizard, refetch its variations
  useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    (async () => {
      const { data: v } = await (supabase
        .from("product_variations" as any)
        .select("*")
        .eq("product_id", productId)
        .order("sort_order") as any);
      if (cancelled) return;
      const vars = (v ?? []) as VariationRow[];
      setVariations(vars);
      // If current variationId doesn't belong, reset
      if (vars.length > 0) {
        if (!vars.some(x => x.id === variationId)) {
          setVariationId(vars[0].id);
          setUnitPrice(String(vars[0].price));
        }
      } else {
        setVariationId(null);
        const prod = products.find(p => p.id === productId);
        if (prod) setUnitPrice(String(prod.price));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) || null,
    [products, productId]
  );
  const selectedVariation = useMemo(
    () => variations.find(v => v.id === variationId) || null,
    [variations, variationId]
  );

  const durationDays = useMemo(() => {
    if (selectedVariation) return Number(selectedVariation.duration_days) || 30;
    const fb = FALLBACK_VARIATIONS.find(v => v.label === fallbackVariation);
    return fb?.days ?? 30;
  }, [selectedVariation, fallbackVariation]);

  const variationLabel = selectedVariation?.name || fallbackVariation;

  const price = parseFloat(unitPrice) || 0;
  const disc = parseFloat(discount) || 0;
  const discountVal = discountType === "percentage" ? (price * disc) / 100 : disc;
  const finalTotal = Math.max(price - discountVal, 0);

  // Sync paid amount with pay type changes
  useEffect(() => {
    if (payType === "full") setPaidAmount(String(finalTotal));
    else if (payType === "due") setPaidAmount("0");
    // partial: leave user entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payType, finalTotal]);

  const paid = Math.min(parseFloat(paidAmount) || 0, finalTotal);
  const due = Math.max(finalTotal - paid, 0);
  const paymentStatus: "paid" | "partial" | "unpaid" =
    paid <= 0 ? "unpaid" : paid >= finalTotal ? "paid" : "partial";

  const newStartStr = useMemo(() => {
    if (!subscription) return fnsFormat(new Date(), "yyyy-MM-dd");
    const baseStr = subscription.end_date || fnsFormat(new Date(), "yyyy-MM-dd");
    const base = new Date(baseStr);
    // If end_date already passed, start from today
    if (base.getTime() < Date.now() - 24 * 60 * 60 * 1000) return fnsFormat(new Date(), "yyyy-MM-dd");
    return baseStr;
  }, [subscription]);

  const newEndStr = useMemo(
    () => fnsFormat(addDays(new Date(newStartStr), durationDays), "yyyy-MM-dd"),
    [newStartStr, durationDays]
  );

  const canNext = useMemo(() => {
    if (!subscription) return false;
    if (step === 2) {
      if (variations.length > 0 && !variationId) return false;
      if (finalTotal <= 0) return false;
    }
    if (step === 3) {
      if (payType === "partial" && (paid <= 0 || paid >= finalTotal)) return false;
      if (!paymentMethod) return false;
    }
    return true;
  }, [step, subscription, variations.length, variationId, finalTotal, payType, paid, paymentMethod]);

  const handleSubmit = async () => {
    if (!subscription || !activeStore || !effectiveUserId) return;
    setSubmitting(true);
    try {
      const customerId = subscription.customer_id;
      const customerName = subscription.customers?.name || "Walk-in";
      const customerPhone = subscription.customers?.phone || null;

      // 1) Create order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: effectiveUserId,
          store_id: activeStore.id,
          customer_id: customerId,
          total_amount: finalTotal,
          cost_price: parseFloat(costPrice) || 0,
          discount: disc,
          discount_type: discountType,
          payment_method: paymentMethod,
          source: "renewal",
          payment_currency: "BDT",
          status: "completed" as const,
          payment_status: paymentStatus,
          notes: notes || `Subscription renewal: ${subscription.product_name} (${variationLabel})`,
          meta: {
            renewal_of: subscription.id,
            product_id: selectedProduct?.id ?? null,
            product_name: selectedProduct?.name ?? subscription.product_name,
            product_price: price,
            variation_id: selectedVariation?.id ?? null,
            variation_name: variationLabel,
            variation_price: selectedVariation ? Number(selectedVariation.price) : null,
            duration_days: durationDays,
            paid_amount: paid,
            due_amount: due,
          } as any,
        } as any)
        .select("id, order_code")
        .single();

      if (orderErr || !order) throw orderErr ?? new Error("Failed to create renewal order");
      const orderRef = (order as any).order_code ?? order.id.slice(0, 8).toUpperCase();

      // 2) order_items (if matched product)
      if (selectedProduct) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: selectedProduct.id,
          quantity: 1,
          price,
        });
      }

      // 3) transactions (income paid + due) — same shape as POS so Income/Expense, Account Book, Due Book, Reports update
      if (paid > 0) {
        await supabase.from("transactions").insert({
          user_id: effectiveUserId,
          store_id: activeStore.id,
          order_id: order.id,
          type: "income" as const,
          amount: paid,
          category: "sale",
          note: `Subscription Renewal #${orderRef}${due > 0 ? " (Paid)" : ""}`,
          is_paid: true,
          customer_name: customerName,
          phone_number: customerPhone,
        } as any);
      }
      if (due > 0) {
        await supabase.from("transactions").insert({
          user_id: effectiveUserId,
          store_id: activeStore.id,
          order_id: order.id,
          type: "income" as const,
          amount: due,
          category: "sale",
          note: `Subscription Renewal #${orderRef} (Due)`,
          is_paid: false,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          customer_name: customerName,
          phone_number: customerPhone,
        } as any);
      }

      // 4) customer_credits update (for due portion)
      if (due > 0 && customerId) {
        const { data: existingCredit } = await supabase
          .from("customer_credits")
          .select("id, total_due")
          .eq("customer_id", customerId)
          .eq("store_id", activeStore.id)
          .maybeSingle();
        if (existingCredit) {
          await supabase.from("customer_credits").update({
            total_due: Number(existingCredit.total_due) + due,
            updated_at: new Date().toISOString(),
          }).eq("id", existingCredit.id);
        } else {
          await supabase.from("customer_credits").insert({
            customer_id: customerId,
            store_id: activeStore.id,
            user_id: effectiveUserId,
            total_due: due,
            credit_limit: 0,
          });
        }
      }

      // 5) Update the subscription record (extend dates + bump renewals + sync product/variation/price)
      const { error: subErr } = await supabase.from("subscriptions").update({
        start_date: newStartStr,
        end_date: newEndStr,
        renewals: (subscription.renewals || 0) + 1,
        status: "active",
        product_name: selectedProduct?.name ?? subscription.product_name,
        variation: variationLabel,
        price: finalTotal,
        cost_price: parseFloat(costPrice) || subscription.cost_price || 0,
        order_id: order.id,
      } as any).eq("id", subscription.id);
      if (subErr) throw subErr;

      toast.success(`Renewed! New expiry: ${fnsFormat(new Date(newEndStr), "dd MMM yyyy")} 🔄`);
      onOpenChange(false);
      onRenewed?.();
    } catch (e: any) {
      console.error("[Renewal] failed", e);
      toast.error(e?.message || "Renewal failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!subscription) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" /> Renew Subscription
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between gap-1 px-1 py-2 overflow-x-auto">
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = step > s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors
                  ${active ? "bg-primary text-primary-foreground border-primary"
                    : done ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-transparent"}`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="space-y-4 py-2">
          {/* STEP 1 — Customer & current sub */}
          {step === 1 && (
            <div className="space-y-3">
              <Card className="p-3 space-y-2 bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{subscription.customers?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{subscription.customers?.phone || "No phone"}</p>
                    {subscription.customers?.email && (
                      <p className="text-xs text-muted-foreground">{subscription.customers.email}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <RotateCcw className="h-3 w-3" /> {subscription.renewals} renewals
                  </Badge>
                </div>
              </Card>
              <Card className="p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Subscription</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Product</div>
                    <div className="font-medium">{subscription.product_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Variation</div>
                    <div className="font-medium">{subscription.variation}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Price</div>
                    <div className="font-medium">{fmt(subscription.price)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expires</div>
                    <div className="font-medium">
                      {subscription.end_date ? fnsFormat(new Date(subscription.end_date), "dd MMM yyyy") : "—"}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* STEP 2 — Product & Variation */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Product</Label>
                {products.length > 0 ? (
                  <Select value={productId || "__none"} onValueChange={(v) => setProductId(v === "__none" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No catalog product (manual)</SelectItem>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={subscription.product_name} disabled />
                )}
              </div>

              {variations.length > 0 ? (
                <div>
                  <Label className="text-xs">Variation</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {variations.map(v => {
                      const active = variationId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => { setVariationId(v.id); setUnitPrice(String(v.price)); }}
                          className={`text-left rounded-lg border p-2.5 transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                        >
                          <div className="text-sm font-medium truncate">{v.name}</div>
                          <div className="text-xs text-muted-foreground">{v.duration_days} days</div>
                          <div className="text-sm font-semibold text-primary mt-0.5">{fmt(v.price)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Duration</Label>
                  <Select value={fallbackVariation} onValueChange={setFallbackVariation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FALLBACK_VARIATIONS.map(v => (
                        <SelectItem key={v.label} value={v.label}>{v.label} ({v.days} days)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Price ({symbol})</Label>
                  <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Cost ({symbol})</Label>
                  <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                </div>
              </div>

              <Card className="p-2.5 bg-primary/5 border-primary/20 text-xs flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                New expiry: <span className="font-semibold ml-1">{fnsFormat(new Date(newEndStr), "dd MMM yyyy")}</span>
                <span className="text-muted-foreground ml-auto">({durationDays} days)</span>
              </Card>
            </div>
          )}

          {/* STEP 3 — Payment (type, discount, method, paid) */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Payment Type</Label>
                <RadioGroup value={payType} onValueChange={(v) => setPayType(v as PayType)} className="grid grid-cols-3 gap-2 mt-1">
                  {([
                    { v: "full", label: "Full", desc: "Pay total now" },
                    { v: "partial", label: "Partial", desc: "Pay some now" },
                    { v: "due", label: "Due", desc: "Pay later" },
                  ] as const).map(opt => (
                    <label
                      key={opt.v}
                      className={`cursor-pointer rounded-lg border p-2.5 ${payType === opt.v ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={opt.v} id={`pt-${opt.v}`} />
                        <span className="text-sm font-medium">{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground ml-6 mt-0.5">{opt.desc}</p>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <Label className="text-xs">Discount</Label>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as any)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="percentage">Percent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs">Payment Account / Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Choose method" /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paid Amount ({symbol})</Label>
                <Input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  disabled={payType === "full" || payType === "due"}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-2.5 text-center"><div className="text-[11px] text-muted-foreground">Total</div><div className="font-semibold text-sm">{fmt(finalTotal)}</div></Card>
                <Card className="p-2.5 text-center bg-green-50/40 dark:bg-green-950/10"><div className="text-[11px] text-muted-foreground">Paid</div><div className="font-semibold text-sm text-green-600">{fmt(paid)}</div></Card>
                <Card className="p-2.5 text-center bg-amber-50/40 dark:bg-amber-950/10"><div className="text-[11px] text-muted-foreground">Due</div><div className="font-semibold text-sm text-amber-600">{fmt(due)}</div></Card>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note for this renewal" />
              </div>
            </div>
          )}

          {/* STEP 4 — Review */}
          {step === 4 && (
            <div className="space-y-3">
              <Card className="p-3 space-y-2 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Customer</div>
                    <div className="font-semibold">{subscription.customers?.name || "—"}</div>
                  </div>
                  <Badge className="gap-1"><Tag className="h-3 w-3" />{variationLabel}</Badge>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">
                  <div className="text-muted-foreground">Product</div>
                  <div className="text-right font-medium">{selectedProduct?.name || subscription.product_name}</div>

                  <div className="text-muted-foreground">Price</div>
                  <div className="text-right">{fmt(price)}</div>

                  <div className="text-muted-foreground">Discount</div>
                  <div className="text-right text-destructive">- {fmt(discountVal)}</div>

                  <div className="text-muted-foreground">Total</div>
                  <div className="text-right font-semibold text-primary">{fmt(finalTotal)}</div>

                  <div className="text-muted-foreground">Paid</div>
                  <div className="text-right text-green-600">{fmt(paid)}</div>

                  <div className="text-muted-foreground">Due</div>
                  <div className="text-right text-amber-600">{fmt(due)}</div>

                  <div className="text-muted-foreground">Duration</div>
                  <div className="text-right">{durationDays} days</div>

                  <div className="text-muted-foreground">New Expiry</div>
                  <div className="text-right font-semibold">{fnsFormat(new Date(newEndStr), "dd MMM yyyy")}</div>

                  <div className="text-muted-foreground">Payment</div>
                  <div className="text-right capitalize">{paymentMethods.find(m => m.id === paymentMethod)?.name || paymentMethod} · {paymentStatus}</div>
                </div>
              </Card>
              <p className="text-[11px] text-muted-foreground text-center">
                A new order will be created and the subscription will be extended.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setStep(s => Math.min(STEPS.length, s + 1))}
              disabled={!canNext}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Submit Renewal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
