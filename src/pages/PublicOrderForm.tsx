import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ShoppingBag, CreditCard, CheckCircle2, Loader2, MessageSquare,
  ShieldCheck, Lock, Truck, Tag, User as UserIcon, Phone, Mail, MapPin,
  Minus, Plus, Sparkles,
} from "lucide-react";
import { getGatewayIcon } from "@/lib/gatewayBrands";
import { normalizePaymentMethods, getPublicPaymentDetails, isCustomerFacingPaymentMethod, type NormalizedPaymentMethod } from "@/lib/paymentMethods";

interface CustomField {
  id: string;
  type: "text" | "number" | "textarea" | "select" | "radio" | "checkbox";
  label: string;
  required: boolean;
  options?: string[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  type: string;
}

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_subscription: boolean;
  duration_days: number;
}

interface FormData {
  id: string;
  name: string;
  slug: string;
  description: string;
  selected_products: string[];
  take_payment: boolean;
  show_coupon: boolean;
  custom_fields: CustomField[];
  store_id: string;
  user_id: string;
}

const PublicOrderForm = () => {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<FormData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [gateways, setGateways] = useState<NormalizedPaymentMethod[]>([]);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [selections, setSelections] = useState<Record<string, { quantity: number; variationId?: string }>>({});
  const [selectedGateway, setSelectedGateway] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [couponCode, setCouponCode] = useState("");

  useEffect(() => { loadForm(); }, [slug]);

  const loadForm = async () => {
    if (!slug) return;

    let { data: formData } = await supabase
      .from("order_forms")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (!formData) {
      const { data: byId } = await supabase
        .from("order_forms")
        .select("*")
        .eq("id", slug)
        .eq("status", "active")
        .maybeSingle();
      formData = byId;
    }

    if (!formData) { setLoading(false); return; }

    const f: FormData = {
      ...formData,
      selected_products: (formData.selected_products as any) || [],
      custom_fields: (formData.custom_fields as any) || [],
    };
    setForm(f);

    const productIds = f.selected_products;
    const [prodRes, varRes, bsRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("id, name, price, description, image_url, type").in("id", productIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0
        ? supabase.from("product_variations").select("*").in("product_id", productIds).order("sort_order")
        : Promise.resolve({ data: [] }),
      supabase.from("business_settings").select("*").eq("store_id", f.store_id).maybeSingle(),
    ]);

    setProducts((prodRes.data as Product[]) || []);
    setVariations((varRes.data as ProductVariation[]) || []);
    setBusinessSettings(bsRes.data);

    if (bsRes.data?.payment_methods) {
      const allMethods = normalizePaymentMethods(bsRes.data.payment_methods);
      const customerFacing = allMethods.filter(isCustomerFacingPaymentMethod);
      setGateways(customerFacing);
    }

    if (productIds.length > 0) {
      const initial: Record<string, { quantity: number; variationId?: string }> = {};
      productIds.forEach((pid) => { initial[pid] = { quantity: 1 }; });
      setSelections(initial);
    }

    setLoading(false);
  };

  const totalAmount = useMemo(() => {
    let total = 0;
    Object.entries(selections).forEach(([pid, sel]) => {
      if (sel.variationId) {
        const v = variations.find((vr) => vr.id === sel.variationId);
        if (v) total += v.price * sel.quantity;
      } else {
        const p = products.find((pr) => pr.id === pid);
        if (p) total += p.price * sel.quantity;
      }
    });
    return total;
  }, [selections, products, variations]);

  const itemCount = useMemo(() =>
    Object.values(selections).reduce((sum, s) => sum + (s.quantity || 0), 0)
  , [selections]);

  const handleSubmit = async () => {
    if (!form) return;
    if (!customerName.trim()) { toast.error("Please enter your name"); return; }
    if (!customerPhone.trim()) { toast.error("Please enter your phone number"); return; }

    for (const cf of form.custom_fields) {
      if (cf.required && !customFieldValues[cf.id]) {
        toast.error(`${cf.label} is required`);
        return;
      }
    }

    if (form.take_payment && gateways.length > 0 && !selectedGateway) {
      toast.error("Please select a payment method"); return;
    }

    if (Object.keys(selections).length === 0 || itemCount === 0) {
      toast.error("Please select at least one product"); return;
    }

    setSubmitting(true);

    try {
      let customerId: string | null = null;
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", form.user_id)
        .eq("store_id", form.store_id)
        .eq("phone", customerPhone)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            user_id: form.user_id,
            store_id: form.store_id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            address: customerAddress,
          })
          .select("id")
          .single();
        customerId = newCustomer?.id || null;
      }

      let costPrice = 0;
      const orderItemsData: { product_id: string; quantity: number; price: number }[] = [];

      Object.entries(selections).forEach(([pid, sel]) => {
        if (sel.quantity <= 0) return;
        let price = 0;
        if (sel.variationId) {
          const v = variations.find((vr) => vr.id === sel.variationId);
          if (v) price = v.price;
        } else {
          const p = products.find((pr) => pr.id === pid);
          if (p) price = p.price;
        }
        orderItemsData.push({ product_id: pid, quantity: sel.quantity, price });
      });

      const gw = gateways.find((g) => g.id === selectedGateway);
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: form.user_id,
          store_id: form.store_id,
          customer_id: customerId,
          total_amount: totalAmount,
          cost_price: costPrice,
          payment_method: gw?.name || "pending",
          payment_status: "unpaid",
          status: "pending" as any,
          source: "order_form",
          notes: `Order Form: ${form.name}${transactionId ? ` | TxnID: ${transactionId}` : ""}${Object.keys(customFieldValues).length > 0 ? ` | Custom: ${JSON.stringify(customFieldValues)}` : ""}`,
          payment_currency: businessSettings?.default_currency || "BDT",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      if (order) {
        const items = orderItemsData.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }));
        await supabase.from("order_items").insert(items);

        for (const [pid, sel] of Object.entries(selections)) {
          if (sel.variationId) {
            const v = variations.find((vr) => vr.id === sel.variationId);
            if (v && v.is_subscription) {
              const p = products.find((pr) => pr.id === pid);
              const endDate = new Date();
              endDate.setDate(endDate.getDate() + v.duration_days);
              await supabase.from("subscriptions").insert({
                user_id: form.user_id,
                store_id: form.store_id,
                order_id: order.id,
                customer_id: customerId,
                product_name: p?.name || "",
                variation: v.name,
                price: v.price,
                plan: "customer" as any,
                status: "active",
                start_date: new Date().toISOString(),
                end_date: endDate.toISOString(),
              } as any);
            }
          }
        }
      }

      try {
        const { notifyOrderFormOrder } = await import("@/lib/notificationTriggers");
        const currency = businessSettings?.default_currency || "BDT";
        await notifyOrderFormOrder(form.user_id, customerName || "Customer", `${currency} ${totalAmount.toFixed(2)}`);
      } catch {}

      setSubmitted(true);
      toast.success("Order placed successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your order form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Form Not Found</h2>
            <p className="text-muted-foreground">This order form doesn't exist or is no longer active.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currencySymbol = businessSettings?.default_currency === "INR" ? "₹"
    : businessSettings?.default_currency === "USD" ? "$" : "৳";

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-background dark:from-emerald-950/20 p-4">
        <Card className="max-w-md w-full overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-600" />
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-20 w-20 mx-auto rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Order Placed!</h2>
            <p className="text-muted-foreground mb-1">
              Thank you, <span className="font-medium text-foreground">{customerName}</span>.
            </p>
            <p className="text-sm text-muted-foreground mb-4">We'll contact you on {customerPhone} shortly.</p>
            <div className="rounded-xl bg-muted/50 p-4 mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Order Total</p>
              <p className="text-2xl font-bold text-primary">{currencySymbol}{totalAmount.toFixed(2)}</p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-4">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Secure checkout · Powered by {businessSettings?.business_name || "EvixPOS"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* HERO */}
      <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.08),transparent_50%)]" />
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 py-8 sm:py-12">
          <div className="flex flex-col items-center text-center">
            {businessSettings?.logo_url ? (
              <img src={businessSettings.logo_url} alt="Logo" className="h-14 sm:h-16 mb-3 rounded-xl" />
            ) : (
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-3 shadow-lg shadow-primary/25">
                <ShoppingBag className="h-7 w-7 sm:h-8 sm:w-8 text-primary-foreground" />
              </div>
            )}
            {businessSettings?.business_name && (
              <Badge variant="secondary" className="mb-2 gap-1"><Sparkles className="h-3 w-3" />{businessSettings.business_name}</Badge>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{form.name}</h1>
            {form.description && (
              <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-xl">{form.description}</p>
            )}
            <div className="flex items-center gap-3 sm:gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Secure</div>
              <div className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-emerald-500" /> Encrypted</div>
              <div className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-emerald-500" /> Fast Delivery</div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4 sm:space-y-5 pb-32 lg:pb-10">
        {/* Products */}
        {products.length > 0 && (
          <Card className="overflow-hidden border-border/60">
            <CardHeader className="bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Choose your items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 sm:p-4">
              {products.map((product) => {
                const prodVariations = variations.filter((v) => v.product_id === product.id);
                const sel = selections[product.id];
                const lineTotal = (() => {
                  if (sel?.variationId) {
                    const v = variations.find((vr) => vr.id === sel.variationId);
                    return v ? v.price * (sel.quantity || 0) : 0;
                  }
                  return product.price * (sel?.quantity || 0);
                })();

                return (
                  <div key={product.id} className="rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-3 sm:p-4 space-y-3">
                    <div className="flex gap-3">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 ring-1 ring-border" />
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base truncate">{product.name}</h3>
                        {product.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                        )}
                        <div className="flex items-baseline gap-2 mt-1">
                          <p className="text-primary font-bold text-base sm:text-lg">
                            {currencySymbol}{product.price.toFixed(2)}
                          </p>
                          {sel?.quantity > 0 && (
                            <span className="text-xs text-muted-foreground">× {sel.quantity} = <span className="font-medium text-foreground">{currencySymbol}{lineTotal.toFixed(2)}</span></span>
                          )}
                        </div>
                      </div>
                    </div>

                    {prodVariations.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Variation</Label>
                        <Select
                          value={sel?.variationId || ""}
                          onValueChange={(v) =>
                            setSelections((prev) => ({ ...prev, [product.id]: { ...prev[product.id], variationId: v } }))
                          }
                        >
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select variation..." /></SelectTrigger>
                          <SelectContent>
                            {prodVariations.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} — {currencySymbol}{v.price.toFixed(2)}
                                {v.is_subscription && ` (${v.duration_days} days)`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background p-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setSelections((prev) => ({
                            ...prev,
                            [product.id]: { ...prev[product.id], quantity: Math.max(0, (prev[product.id]?.quantity || 1) - 1) },
                          }))}
                        ><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="w-8 text-center font-semibold text-sm">{sel?.quantity || 0}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setSelections((prev) => ({
                            ...prev,
                            [product.id]: { ...prev[product.id], quantity: (prev[product.id]?.quantity || 0) + 1 },
                          }))}
                        ><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Customer Information */}
        <Card className="overflow-hidden border-border/60">
          <CardHeader className="bg-muted/30 border-b border-border/60">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <UserIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Your details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><UserIcon className="h-3 w-3" /> Name *</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone *</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="optional" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</Label>
                <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="optional" className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Fields */}
        {form.custom_fields.length > 0 && (
          <Card className="overflow-hidden border-border/60">
            <CardHeader className="bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base sm:text-lg">Additional information</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-3">
              {form.custom_fields.map((cf) => (
                <div key={cf.id} className="space-y-1.5">
                  <Label className="text-xs">
                    {cf.label} {cf.required && <span className="text-destructive">*</span>}
                  </Label>
                  {cf.type === "text" && (
                    <Input value={customFieldValues[cf.id] || ""} onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))} className="h-10" />
                  )}
                  {cf.type === "number" && (
                    <Input type="number" value={customFieldValues[cf.id] || ""} onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))} className="h-10" />
                  )}
                  {cf.type === "textarea" && (
                    <Textarea value={customFieldValues[cf.id] || ""} onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))} />
                  )}
                  {cf.type === "select" && (
                    <Select value={customFieldValues[cf.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {(cf.options || []).map((opt, i) => (<SelectItem key={i} value={opt}>{opt}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  )}
                  {cf.type === "radio" && (
                    <RadioGroup value={customFieldValues[cf.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))}>
                      {(cf.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`${cf.id}-${i}`} />
                          <Label htmlFor={`${cf.id}-${i}`} className="cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                  {cf.type === "checkbox" && (
                    <div className="flex items-center gap-2">
                      <Checkbox checked={!!customFieldValues[cf.id]} onCheckedChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))} />
                      <span className="text-sm">{cf.label}</span>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Payment */}
        {form.take_payment && gateways.length > 0 && (
          <Card className="overflow-hidden border-border/60">
            <CardHeader className="bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Payment method
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {gateways.map((gw) => {
                  const iconUrl = getGatewayIcon(gw.id);
                  const isSelected = selectedGateway === gw.id;
                  const config = gw.config || {};
                  const detailEntries = getPublicPaymentDetails(config);

                  return (
                    <div
                      key={gw.id}
                      className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all ${
                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/60 hover:border-primary/40"
                      }`}
                      onClick={() => setSelectedGateway(gw.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <img src={iconUrl} alt={gw.name} className="h-8 w-8 rounded object-contain bg-white p-0.5 ring-1 ring-border/40" onError={(e) => { (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/6963/6963703.png"; }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{gw.name}</p>
                          {!isSelected && detailEntries.length > 0 && (
                            <p className="text-[11px] text-muted-foreground truncate">{detailEntries[0].label}: {detailEntries[0].value}</p>
                          )}
                          {!isSelected && detailEntries.length === 0 && !config.instructions && !config.qr_code_url && (
                            <p className="text-[11px] text-muted-foreground">Select to pay</p>
                          )}
                        </div>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />}
                      </div>

                      {isSelected && detailEntries.length > 0 && (
                        <div className="mt-3 p-2.5 rounded-lg bg-background border border-border/60 space-y-1.5">
                          {detailEntries.map((entry, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{entry.label}</span>
                              <span className="font-medium select-all">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isSelected && detailEntries.length === 0 && !config.qr_code_url && !config.instructions && (
                        <div className="mt-3 p-2.5 rounded-lg bg-muted/50 text-[11px] text-muted-foreground text-center">
                          No payment details configured. Contact the seller for payment info.
                        </div>
                      )}
                      {isSelected && config.qr_code_url && (
                        <div className="mt-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Scan QR to pay:</p>
                          <img src={config.qr_code_url} alt="QR Code" className="w-32 h-32 sm:w-40 sm:h-40 mx-auto rounded-lg border p-1" />
                        </div>
                      )}
                      {isSelected && config.instructions && (
                        <div className="mt-3 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-[11px] flex gap-2">
                          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
                          <span className="whitespace-pre-wrap">{config.instructions}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedGateway && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Transaction ID (optional)</Label>
                  <Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter transaction ID after payment" className="h-10" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Coupon */}
        {form.show_coupon && (
          <Card className="overflow-hidden border-border/60">
            <CardContent className="p-3 sm:p-4">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Coupon Code</Label>
                <div className="flex gap-2">
                  <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Enter coupon code" className="h-10" />
                  <Button variant="outline">Apply</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Summary — desktop inline card */}
        <Card className="overflow-hidden border-border/60 hidden lg:block">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
              <span>Subtotal</span>
            </div>
            <div className="flex items-center justify-between text-xl font-bold">
              <span>Total</span>
              <span className="text-primary">{currencySymbol}{totalAmount.toFixed(2)}</span>
            </div>
            <Separator />
            <Button className="w-full h-12 text-base font-semibold shadow-md shadow-primary/20" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Placing Order...</>
              ) : (
                <>Place Order — {currencySymbol}{totalAmount.toFixed(2)}</>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> Your information is encrypted & secure
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by <span className="font-medium">{businessSettings?.business_name || "EvixPOS"}</span>
        </p>
      </div>

      {/* STICKY MOBILE CHECKOUT BAR */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)] pb-safe">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{itemCount} item{itemCount !== 1 ? "s" : ""}</p>
            <p className="text-lg font-bold text-primary leading-tight">{currencySymbol}{totalAmount.toFixed(2)}</p>
          </div>
          <Button size="lg" className="flex-1 h-12 font-semibold shadow-md shadow-primary/20" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Placing...</>
            ) : (
              <>Place Order</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublicOrderForm;
