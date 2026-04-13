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
import { ShoppingBag, CreditCard, CheckCircle2, Loader2, QrCode, MessageSquare } from "lucide-react";
import { getGatewayIcon } from "@/lib/gatewayBrands";

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

interface ConfiguredPaymentMethod {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
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
  const [gateways, setGateways] = useState<ConfiguredPaymentMethod[]>([]);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Customer info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Product selections: { productId: { quantity, variationId? } }
  const [selections, setSelections] = useState<Record<string, { quantity: number; variationId?: string }>>({});
  const [selectedGateway, setSelectedGateway] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [couponCode, setCouponCode] = useState("");

  useEffect(() => {
    loadForm();
  }, [slug]);

  const loadForm = async () => {
    if (!slug) return;

    // Try to find by slug first, then by id
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

    if (!formData) {
      setLoading(false);
      return;
    }

    const f: FormData = {
      ...formData,
      selected_products: (formData.selected_products as any) || [],
      custom_fields: (formData.custom_fields as any) || [],
    };
    setForm(f);

    // Load products, variations, gateways, business settings in parallel
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

    // Load payment methods from business_settings (user's configured gateways)
    if (bsRes.data?.payment_methods && Array.isArray(bsRes.data.payment_methods)) {
      const methods = (bsRes.data.payment_methods as unknown as ConfiguredPaymentMethod[]).filter(m => m.enabled);
      setGateways(methods);
    }

    // Pre-select first product with quantity 1
    if (productIds.length > 0) {
      const initial: Record<string, { quantity: number; variationId?: string }> = {};
      productIds.forEach((pid) => {
        initial[pid] = { quantity: 1 };
      });
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

  const handleSubmit = async () => {
    if (!form) return;
    if (!customerName.trim()) { toast.error("Please enter your name"); return; }
    if (!customerPhone.trim()) { toast.error("Please enter your phone number"); return; }

    // Validate required custom fields
    for (const cf of form.custom_fields) {
      if (cf.required && !customFieldValues[cf.id]) {
        toast.error(`${cf.label} is required`);
        return;
      }
    }

    if (form.take_payment && gateways.length > 0 && !selectedGateway) {
      toast.error("Please select a payment method");
      return;
    }

    if (Object.keys(selections).length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create or find customer
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

      // 2. Calculate cost price
      let costPrice = 0;
      const orderItemsData: { product_id: string; quantity: number; price: number }[] = [];

      Object.entries(selections).forEach(([pid, sel]) => {
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

      // 3. Create order
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
          payment_status: form.take_payment ? "unpaid" : "unpaid",
          status: "pending" as any,
          source: "order_form",
          notes: `Order Form: ${form.name}${transactionId ? ` | TxnID: ${transactionId}` : ""}${Object.keys(customFieldValues).length > 0 ? ` | Custom: ${JSON.stringify(customFieldValues)}` : ""}`,
          payment_currency: businessSettings?.default_currency || "BDT",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // 4. Create order items
      if (order) {
        const items = orderItemsData.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }));
        await supabase.from("order_items").insert(items);

        // 5. If any subscription products, create subscriptions
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
                customer_id: customerId,
                product_name: p?.name || "",
                variation: v.name,
                price: v.price,
                plan: "free" as any,
                status: "active",
                start_date: new Date().toISOString(),
                end_date: endDate.toISOString(),
              });
            }
          }
        }
      }

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Form Not Found</h2>
            <p className="text-muted-foreground">This order form doesn't exist or is no longer active.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Order Placed Successfully!</h2>
            <p className="text-muted-foreground mb-1">
              Thank you, {customerName}. Your order is being processed.
            </p>
            <p className="text-sm text-muted-foreground">
              Total: {businessSettings?.default_currency === "BDT" ? "৳" : "$"}{totalAmount.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currencySymbol = businessSettings?.default_currency === "INR" ? "₹" : businessSettings?.default_currency === "USD" ? "$" : "৳";

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          {businessSettings?.logo_url && (
            <img src={businessSettings.logo_url} alt="Logo" className="h-12 mx-auto mb-3" />
          )}
          <h1 className="text-2xl font-bold">{form.name}</h1>
          {form.description && <p className="text-muted-foreground mt-1">{form.description}</p>}
          {businessSettings?.business_name && (
            <p className="text-sm text-muted-foreground mt-1">by {businessSettings.business_name}</p>
          )}
        </div>

        {/* Products */}
        {products.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" /> Products / Services
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {products.map((product) => {
                const prodVariations = variations.filter((v) => v.product_id === product.id);
                const sel = selections[product.id];

                return (
                  <div key={product.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex gap-3">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                        )}
                        <p className="text-primary font-semibold mt-1">
                          {currencySymbol}{product.price.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Variations */}
                    {prodVariations.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Select Variation</Label>
                        <Select
                          value={sel?.variationId || ""}
                          onValueChange={(v) =>
                            setSelections((prev) => ({
                              ...prev,
                              [product.id]: { ...prev[product.id], variationId: v },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select variation..." />
                          </SelectTrigger>
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

                    {/* Quantity */}
                    <div className="flex items-center gap-3">
                      <Label className="text-sm">Qty:</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setSelections((prev) => ({
                              ...prev,
                              [product.id]: {
                                ...prev[product.id],
                                quantity: Math.max(0, (prev[product.id]?.quantity || 1) - 1),
                              },
                            }))
                          }
                        >
                          -
                        </Button>
                        <span className="w-8 text-center font-medium">{sel?.quantity || 0}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setSelections((prev) => ({
                              ...prev,
                              [product.id]: {
                                ...prev[product.id],
                                quantity: (prev[product.id]?.quantity || 0) + 1,
                              },
                            }))
                          }
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email (optional)" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Address (optional)" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Fields */}
        {form.custom_fields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.custom_fields.map((cf) => (
                <div key={cf.id} className="space-y-2">
                  <Label>
                    {cf.label} {cf.required && <span className="text-destructive">*</span>}
                  </Label>
                  {cf.type === "text" && (
                    <Input
                      value={customFieldValues[cf.id] || ""}
                      onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                    />
                  )}
                  {cf.type === "number" && (
                    <Input
                      type="number"
                      value={customFieldValues[cf.id] || ""}
                      onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                    />
                  )}
                  {cf.type === "textarea" && (
                    <Textarea
                      value={customFieldValues[cf.id] || ""}
                      onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: e.target.value }))}
                    />
                  )}
                  {cf.type === "select" && (
                    <Select
                      value={customFieldValues[cf.id] || ""}
                      onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {(cf.options || []).map((opt, i) => (
                          <SelectItem key={i} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {cf.type === "radio" && (
                    <RadioGroup
                      value={customFieldValues[cf.id] || ""}
                      onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))}
                    >
                      {(cf.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`${cf.id}-${i}`} />
                          <Label htmlFor={`${cf.id}-${i}`}>{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                  {cf.type === "checkbox" && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!customFieldValues[cf.id]}
                        onCheckedChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [cf.id]: v }))}
                      />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gateways.map((gw) => {
                  const iconUrl = getGatewayIcon(gw.id);
                  const isSelected = selectedGateway === gw.id;
                  return (
                    <div
                      key={gw.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedGateway(gw.id)}
                    >
                      <div className="flex items-center gap-3">
                        <img src={iconUrl} alt={gw.name} className="h-8 w-8 rounded object-contain bg-white p-0.5" onError={(e) => { (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/6963/6963703.png"; }} />
                        <div>
                          <p className="font-semibold text-sm">{gw.name}</p>
                          {gw.config?.personal_number && (
                            <p className="text-xs text-muted-foreground">📱 {gw.config.personal_number}</p>
                          )}
                          {gw.config?.account_type && gw.config.account_type !== "personal" && (
                            <p className="text-[10px] text-muted-foreground capitalize">{gw.config.account_type} account</p>
                          )}
                        </div>
                      </div>
                      {isSelected && gw.config?.qr_code_url && (
                        <img src={gw.config.qr_code_url} alt="QR Code" className="w-36 h-36 mx-auto mt-3 rounded border" />
                      )}
                      {isSelected && gw.config?.instructions && (
                        <div className="mt-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground flex gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>{gw.config.instructions}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedGateway && (
                <div className="space-y-2">
                  <Label>Transaction ID (optional)</Label>
                  <Input
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter transaction ID after payment"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Coupon */}
        {form.show_coupon && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label>Coupon Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Enter coupon code"
                  />
                  <Button variant="outline">Apply</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Summary + Submit */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{currencySymbol}{totalAmount.toFixed(2)}</span>
            </div>
            <Separator />
            <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Placing Order...
                </>
              ) : (
                <>Place Order — {currencySymbol}{totalAmount.toFixed(2)}</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-6">
          Powered by {businessSettings?.business_name || "EviPOS"}
        </p>
      </div>
    </div>
  );
};

export default PublicOrderForm;
