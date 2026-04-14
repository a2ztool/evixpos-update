import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStoreMode } from "@/hooks/useStoreMode";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus, Minus, Trash2, ShoppingCart, Search, Monitor,
  ChevronDown, RefreshCw, Clock, Percent, TrendingUp, UserPlus, AlertTriangle, X,
  Check, ArrowRight, ArrowLeft, CreditCard, FileText, Package, User,
  Printer, Zap, Layers, Pause, Play, Receipt, Split, Keyboard,
} from "lucide-react";
import InvoiceModal from "@/components/InvoiceModal";
import BarcodeScanner from "@/components/BarcodeScanner";
import ThermalReceipt, { printThermalReceipt } from "@/components/ThermalReceipt";
import { getGatewayIcon } from "@/lib/gatewayBrands";
import { normalizePaymentMethods, getPublicPaymentDetails, type NormalizedPaymentMethod } from "@/lib/paymentMethods";
import POSKeyboardShortcuts from "@/components/pos/POSKeyboardShortcuts";
import POSHeldOrders, { saveHeldOrder, getHeldOrders } from "@/components/pos/POSHeldOrders";
import POSRecentTransactions from "@/components/pos/POSRecentTransactions";
import POSSplitPayment, { type SplitPaymentEntry } from "@/components/pos/POSSplitPayment";

interface Product {
  id: string;
  name: string;
  price: number;
  type: "digital" | "physical";
  stock: number;
  image_url?: string;
  category?: string;
  sku?: string;
}

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  duration_days: number;
  stock: number;
  is_subscription: boolean;
  sort_order: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  variation?: ProductVariation;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
}

interface ReceiptData {
  orderId: string;
  customer: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  notes: string;
  date: string;
  storeName: string;
}

type PaymentMode = "none" | "discount" | "extra" | "due";

const POS = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { isOffline, isOnline } = useStoreMode();
  const { activeCurrency, setActiveCurrency, currencies, symbol, format } = useCurrency();
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [customerId, setCustomerId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("none");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [extraChargeValue, setExtraChargeValue] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Variations
  const [allVariations, setAllVariations] = useState<ProductVariation[]>([]);
  const [variationModalOpen, setVariationModalOpen] = useState(false);
  const [variationProduct, setVariationProduct] = useState<Product | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<NormalizedPaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [orderNotes, setOrderNotes] = useState("");

  // Split payment
  const [splitMode, setSplitMode] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitPaymentEntry[]>([]);

  // Checkout stepper
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);

  // Receipt
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Invoice
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);

  // New customer
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [creatingCust, setCreatingCust] = useState(false);

  // Hold / Resume / Recent panels
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const heldCount = activeStore ? getHeldOrders(activeStore.id).length : 0;

  // ─── Data Fetching ───
  const fetchProductsAndVariations = useCallback(async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase.from("products").select("id, name, price, type, stock, image_url, category, sku").eq("store_id", activeStore.id).eq("is_active", true).order("name");
    if (data) setProducts(data as Product[]);
    if (data && data.length > 0) {
      const prodIds = data.map(p => p.id);
      const { data: vars } = await (supabase.from("product_variations" as any).select("*").in("product_id", prodIds).order("sort_order") as any);
      if (vars) setAllVariations(vars as ProductVariation[]);
    }
  }, [user, activeStore]);

  useEffect(() => {
    if (!user || !activeStore) return;
    const ownerId = effectiveUserId || user.id;
    fetchProductsAndVariations();
    supabase.from("customers").select("id, name, phone").eq("store_id", activeStore.id).order("name").then(({ data }) => {
      if (data) setCustomers(data as Customer[]);
    });
    supabase.from("business_settings").select("payment_methods").eq("user_id", ownerId).eq("store_id", activeStore.id).maybeSingle().then(({ data }) => {
      if (data?.payment_methods) {
        const methods = normalizePaymentMethods(data.payment_methods).filter(m => m.enabled);
        setPaymentMethods(methods.length > 0 ? methods : [{ id: "cash", name: "Cash", enabled: true, config: {} }]);
      }
    });

    const channel = supabase
      .channel(`pos-products-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${activeStore.id}` }, () => fetchProductsAndVariations())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variations" }, () => fetchProductsAndVariations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeStore, effectiveUserId, fetchProductsAndVariations]);

  // ─── Helpers ───
  const getVariations = useCallback((productId: string) => allVariations.filter(v => v.product_id === productId), [allVariations]);
  const cleanVarName = useCallback((name: string) => name.replace(/\s*\[wc:\d+\]\s*$/, ""), []);

  // ─── Categories: WooCommerce (online) vs Manual (offline) ───
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) cats.add(p.category.trim());
    });
    const result: Array<{ id: string; label: string }> = [{ id: "all", label: "All" }];

    if (isOffline) {
      // Offline: show "Physical" filter + manual categories
      const hasPhysical = products.some(p => p.type === "physical");
      if (hasPhysical) result.push({ id: "__physical", label: "Physical" });
    } else {
      // Online: show product type filters + WooCommerce categories
      const hasDigital = products.some(p => p.type === "digital");
      const hasPhysical = products.some(p => p.type === "physical");
      if (hasDigital) result.push({ id: "__digital", label: "Digital" });
      if (hasPhysical) result.push({ id: "__physical", label: "Physical" });
    }
    // Add all product categories (WC categories for online, manual categories for offline)
    cats.forEach(c => result.push({ id: c, label: c }));
    return result;
  }, [products, isOffline]);

  // ─── Cart Operations ───
  const addToCart = useCallback((product: Product, variation?: ProductVariation) => {
    setCart((prev) => {
      const cartKey = variation ? `${product.id}_${variation.id}` : product.id;
      const existing = prev.find((i) => {
        const key = i.variation ? `${i.product.id}_${i.variation.id}` : i.product.id;
        return key === cartKey;
      });
      if (existing) {
        const stockLimit = variation ? variation.stock : product.stock;
        if (product.type === "physical" && existing.quantity >= stockLimit) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map((i) => {
          const key = i.variation ? `${i.product.id}_${i.variation.id}` : i.product.id;
          return key === cartKey ? { ...i, quantity: i.quantity + 1 } : i;
        });
      }
      const stockLimit = variation ? variation.stock : product.stock;
      if (product.type === "physical" && stockLimit <= 0) {
        toast.error("Out of stock");
        return prev;
      }
      return [...prev, { product, quantity: 1, variation }];
    });
  }, []);

  const handleProductClick = useCallback((product: Product) => {
    const variations = getVariations(product.id);
    if (variations.length > 0) {
      setVariationProduct(product);
      setSelectedVariation(null);
      setVariationModalOpen(true);
    } else {
      addToCart(product);
    }
  }, [getVariations, addToCart]);

  const handleVariationConfirm = () => {
    if (!variationProduct || !selectedVariation) return;
    addToCart(variationProduct, selectedVariation);
    setVariationModalOpen(false);
    setVariationProduct(null);
    setSelectedVariation(null);
  };

  const getCartItemKey = (item: CartItem) => item.variation ? `${item.product.id}_${item.variation.id}` : item.product.id;

  const updateQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (getCartItemKey(i) !== cartKey) return i;
        const newQty = i.quantity + delta;
        const stockLimit = i.variation ? i.variation.stock : i.product.stock;
        if (i.product.type === "physical" && newQty > stockLimit) { toast.error("Not enough stock"); return i; }
        return { ...i, quantity: newQty };
      }).filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (cartKey: string) => setCart((prev) => prev.filter((i) => getCartItemKey(i) !== cartKey));

  const getItemPrice = (item: CartItem) => item.variation ? Number(item.variation.price) : Number(item.product.price);

  const subtotal = cart.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);

  const { total, dueAmount } = useMemo(() => {
    let t = subtotal;
    const disc = parseFloat(discountValue) || 0;
    const extra = parseFloat(extraChargeValue) || 0;
    if (paymentMode === "discount") t -= discountType === "percentage" ? (subtotal * disc) / 100 : disc;
    else if (paymentMode === "extra") t += extra;
    if (t < 0) t = 0;
    return { total: t, dueAmount: paymentMode === "due" ? t : 0 };
  }, [subtotal, paymentMode, discountValue, discountType, extraChargeValue]);

  // ─── Hold Order ───
  const handleHoldOrder = useCallback(() => {
    if (cart.length === 0 || !activeStore) return;
    const selectedCustomer = customers.find(c => c.id === customerId);
    saveHeldOrder(activeStore.id, {
      id: crypto.randomUUID(),
      items: [...cart],
      customerId,
      customerName: selectedCustomer?.name,
      heldAt: new Date().toISOString(),
    });
    setCart([]);
    setCustomerId("");
    toast.success("Order held! Press F3 to resume.");
  }, [cart, activeStore, customerId, customers]);

  const handleResumeOrder = useCallback((order: any) => {
    setCart(order.items);
    if (order.customerId) setCustomerId(order.customerId);
    toast.success("Order resumed!");
  }, []);

  // ─── Customer ───
  const handleCreateCustomer = async () => {
    if (!user || !newCustName.trim()) return;
    setCreatingCust(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({ user_id: effectiveUserId!, store_id: activeStore?.id, name: newCustName.trim(), email: newCustEmail, phone: newCustPhone })
      .select("id, name, phone")
      .single();
    if (error) { toast.error(error.message); }
    else if (data) {
      setCustomers((prev) => [...prev, data as Customer]);
      setCustomerId(data.id);
      setNewCustOpen(false);
      setNewCustName(""); setNewCustEmail(""); setNewCustPhone("");
      toast.success("Customer created!");
    }
    setCreatingCust(false);
  };

  // ─── Checkout ───
  const openCheckout = () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    setCheckoutStep(0);
    setCheckoutOpen(true);
  };

  const handlePrintReceipt = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:300px;margin:0 auto}.center{text-align:center}.bold{font-weight:bold}.sep{border-top:1px dashed #333;margin:8px 0}.row{display:flex;justify-content:space-between;padding:2px 0}h2{font-size:16px;margin-bottom:4px}.total-row{font-size:14px;font-weight:bold}</style></head><body>${receiptRef.current.innerHTML}<script>window.print();window.close();</script></body></html>`);
    printWindow.document.close();
  };

  const handleOrder = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!customerId) { toast.error("Please select a customer"); return; }

    // Split payment validation
    if (splitMode) {
      const allocated = splitEntries.reduce((s, e) => s + e.amount, 0);
      if (Math.abs(allocated - total) > 0.01) {
        toast.error("Split payment amounts must equal the total");
        return;
      }
    }

    setSubmitting(true);
    try {
      const isDue = paymentMode === "due";
      const discAmount = paymentMode === "discount" ? (parseFloat(discountValue) || 0) : 0;
      const payMethod = splitMode
        ? splitEntries.map(e => `${e.methodName}: ${format(e.amount)}`).join(" + ")
        : selectedPaymentMethod;

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          customer_id: customerId || null,
          total_amount: total,
          cost_price: 0,
          discount: discAmount,
          discount_type: discountType,
          payment_method: payMethod,
          source: "pos",
          payment_currency: activeCurrency,
          status: "completed" as const,
          payment_status: isDue ? "unpaid" : "paid",
          notes: orderNotes || (isDue ? "Due order from POS" : ""),
        })
        .select("id")
        .single();

      if (orderErr || !order) throw orderErr ?? new Error("Failed to create order");

      const items = cart.map((i) => ({
        order_id: order.id,
        product_id: i.product.id,
        quantity: i.quantity,
        price: getItemPrice(i),
      }));
      await supabase.from("order_items").insert(items);

      const stockUpdates = cart
        .filter((i) => i.product.type === "physical")
        .map((i) => supabase.from("products").update({ stock: i.product.stock - i.quantity }).eq("id", i.product.id));
      await Promise.all(stockUpdates);

      if (!isDue) {
        await supabase.from("transactions").insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          type: "income" as const,
          amount: total,
          category: "sale",
          note: `POS Order #${order.id.slice(0, 8)}`,
          is_paid: true,
        });
      } else {
        await supabase.from("transactions").insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          type: "income" as const,
          amount: total,
          category: "sale",
          note: `POS Due Order #${order.id.slice(0, 8)}`,
          is_paid: false,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // ─── Sync Customer Credits (due orders) ───
      if (isDue && customerId && activeStore?.id) {
        // Upsert customer_credits record
        const { data: existingCredit } = await supabase
          .from("customer_credits")
          .select("id, total_due")
          .eq("customer_id", customerId)
          .eq("store_id", activeStore.id)
          .maybeSingle();

        if (existingCredit) {
          await supabase.from("customer_credits").update({
            total_due: Number(existingCredit.total_due) + total,
            updated_at: new Date().toISOString(),
          }).eq("id", existingCredit.id);
        } else {
          await supabase.from("customer_credits").insert({
            customer_id: customerId,
            store_id: activeStore.id,
            user_id: effectiveUserId!,
            total_due: total,
            credit_limit: 0,
          });
        }
      }

      // ─── Sync Loyalty Points (earned on completed paid orders) ───
      if (!isDue && customerId && activeStore?.id) {
        const pointsEarned = Math.floor(total / 100); // 1 point per 100 currency
        if (pointsEarned > 0) {
          // Upsert loyalty_points summary
          const { data: existingLoyalty } = await supabase
            .from("loyalty_points")
            .select("id, total_points")
            .eq("customer_id", customerId)
            .eq("store_id", activeStore.id)
            .maybeSingle();

          if (existingLoyalty) {
            await supabase.from("loyalty_points").update({
              total_points: Number(existingLoyalty.total_points) + pointsEarned,
              updated_at: new Date().toISOString(),
            }).eq("id", existingLoyalty.id);
          } else {
            await supabase.from("loyalty_points").insert({
              customer_id: customerId,
              store_id: activeStore.id,
              user_id: effectiveUserId!,
              total_points: pointsEarned,
              redeemed_points: 0,
            });
          }

          // Record loyalty transaction
          await supabase.from("loyalty_transactions").insert({
            customer_id: customerId,
            store_id: activeStore.id,
            user_id: effectiveUserId!,
            points: pointsEarned,
            type: "earned",
            order_id: order.id,
            notes: `Earned from POS Order #${order.id.slice(0, 8)}`,
          });
        }
      }

      // Auto-create subscriptions
      const subscriptionItems = cart.filter(i => i.variation?.is_subscription);
      for (const item of subscriptionItems) {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (item.variation!.duration_days));
        await supabase.from("subscriptions").insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          customer_id: customerId,
          product_name: item.product.name,
          variation: item.variation!.name,
          price: getItemPrice(item),
          cost_price: 0,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: "active",
          plan: "free" as const,
          renewals: 0,
          notes: `Auto-created from POS Order #${order.id.slice(0, 8)}`,
        });
      }

      const selectedCustomer = customers.find(c => c.id === customerId);
      const receiptInfo: ReceiptData = {
        orderId: order.id,
        customer: selectedCustomer?.name || "Walk-in",
        items: [...cart],
        subtotal,
        discount: subtotal - total > 0 ? subtotal - total : 0,
        total,
        paymentMethod: payMethod,
        paymentStatus: isDue ? "Unpaid (Due)" : "Paid",
        currency: activeCurrency,
        notes: orderNotes,
        date: new Date().toLocaleString(),
        storeName: activeStore?.name || "Store",
      };

      toast.success(isDue ? "Order added to due book!" : "Order completed!");
      if (subscriptionItems.length > 0) toast.success(`${subscriptionItems.length} subscription(s) auto-created!`);

      setCart([]);
      setCustomerId("");
      setPaymentMode("none");
      setDiscountValue("");
      setExtraChargeValue("");
      setOrderNotes("");
      setSelectedPaymentMethod("cash");
      setSplitMode(false);
      setMobileCartOpen(false);
      setCheckoutOpen(false);
      setReceiptData(receiptInfo);
      setReceiptOpen(true);

      fetchProductsAndVariations();

      // Auto-sync Google Sheets
      if (activeStore?.id) {
        const { data: gsConfig } = await supabase
          .from("google_sheets_config")
          .select("is_auto_sync, status")
          .eq("store_id", activeStore.id)
          .maybeSingle();
        if (gsConfig?.is_auto_sync && gsConfig?.status === "connected") {
          const orderItems = cart.map(i => i.product.name).join(", ");
          const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
          supabase.functions.invoke("google-sheets-sync", {
            body: {
              store_id: activeStore.id,
              action: "sync_single",
              order_data: {
                order_id: order.id.slice(0, 8).toUpperCase(),
                customer_name: selectedCustomer?.name || "Walk-in",
                phone: "",
                product_name: orderItems,
                variation: cart.find(i => i.variation)?.variation?.name || "",
                quantity: totalQty,
                total_amount: total,
                currency: "BDT",
                payment_status: isDue ? "unpaid" : "paid",
                payment_method: payMethod,
                order_date: new Date().toLocaleDateString(),
                status: "completed",
                notes: orderNotes,
                discount: parseFloat(discountValue) || 0,
                store_name: activeStore.name,
              },
            },
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create order");
    }
    setSubmitting(false);
  };

  // ─── Barcode scan ───
  const handleBarcodeScan = useCallback((code: string) => {
    const found = products.find(p =>
      p.sku?.toLowerCase() === code.toLowerCase() ||
      p.name.toLowerCase() === code.toLowerCase()
    );
    if (found) { handleProductClick(found); toast.success(`Added: ${found.name}`); }
    else toast.error(`Product not found: ${code}`);
  }, [products, handleProductClick]);

  // ─── Filter ───
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
      if (activeCategory === "all") return matchSearch;
      if (activeCategory === "__digital") return matchSearch && p.type === "digital";
      if (activeCategory === "__physical") return matchSearch && p.type === "physical";
      return matchSearch && p.category?.trim() === activeCategory;
    });
  }, [products, search, activeCategory]);

  const selectedCustomer = customers.find(c => c.id === customerId);
  const buttonLabel = paymentMode === "due" ? "Place Order (Add to Due)" : "Place Order";
  const receiptSymbol = receiptData ? (receiptData.currency === "BDT" ? "৳" : receiptData.currency === "INR" ? "₹" : "$") : symbol;

  const CHECKOUT_STEPS = [
    { label: "Customer", icon: User },
    { label: "Review", icon: Package },
    { label: "Payment", icon: CreditCard },
    { label: "Notes", icon: FileText },
    { label: "Confirm", icon: Check },
  ];
  const canProceed = () => {
    if (checkoutStep === 0) return !!customerId;
    if (checkoutStep === 1) return cart.length > 0;
    return true;
  };

  // ─── Keyboard Shortcuts ───
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  // ─── Cart Content Renderer ───
  const renderCartContent = () => (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Customer</span>
        <Button variant="ghost" size="sm" className="gap-1 text-primary h-7 px-2" onClick={() => setNewCustOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" /> New
        </Button>
      </div>
      <Select value={customerId} onValueChange={setCustomerId}>
        <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
        <SelectContent>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator />

      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <ShoppingCart className="h-10 w-10 mb-2" />
          <p className="text-sm">Tap a product to add</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cart.map((item) => {
            const key = getCartItemKey(item);
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product.name}</p>
                  {item.variation && <p className="text-[10px] text-primary font-medium">{cleanVarName(item.variation.name)}</p>}
                  <p className="text-xs text-muted-foreground">{format(getItemPrice(item), 2)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(key, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(key, 1)}><Plus className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(key)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Separator />

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-sm transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/50">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-amber-800 dark:text-amber-400">Advanced Payment</span>
              {paymentMode === "due" && <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">DUE</Badge>}
              {paymentMode === "discount" && <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">DISCOUNT</Badge>}
              {paymentMode === "extra" && <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">EXTRA</Badge>}
            </div>
            <ChevronDown className={`h-4 w-4 text-amber-600 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPaymentMode("none")} className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all ${paymentMode === "none" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}><Minus className="h-4 w-4" />None</button>
              <button onClick={() => setPaymentMode("discount")} className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all ${paymentMode === "discount" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}><Percent className="h-4 w-4" />Discount</button>
              <button onClick={() => setPaymentMode("extra")} className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all ${paymentMode === "extra" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}><TrendingUp className="h-4 w-4" />Extra Charge</button>
              <button onClick={() => setPaymentMode("due")} className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all ${paymentMode === "due" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground hover:border-amber-400"}`}><Clock className="h-4 w-4" />Due / No Pay</button>
            </div>
            {paymentMode === "discount" && (
              <div className="flex gap-2">
                <Input type="number" placeholder="Discount" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="flex-1" />
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as "fixed" | "percentage")}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed ({symbol})</SelectItem>
                    <SelectItem value="percentage">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {paymentMode === "extra" && <Input type="number" placeholder="Extra charge amount" value={extraChargeValue} onChange={(e) => setExtraChargeValue(e.target.value)} />}
            {paymentMode === "due" && (
              <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-400">Customer pays <strong>nothing now</strong>. Full total recorded in <strong>Due Book</strong>.</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );

  const renderCartTotals = () => (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
        <span>{format(subtotal)}</span>
      </div>
      {paymentMode === "discount" && parseFloat(discountValue) > 0 && (
        <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-{format(subtotal - total)}</span></div>
      )}
      {paymentMode === "extra" && parseFloat(extraChargeValue) > 0 && (
        <div className="flex justify-between text-sm text-blue-600"><span>Extra Charge</span><span>+{format(parseFloat(extraChargeValue) || 0)}</span></div>
      )}
      <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{format(total)}</span></div>
      {paymentMode === "due" && (
        <div className="flex justify-between text-sm font-medium text-amber-600">
          <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Due Amount</span>
          <span>{format(dueAmount)}</span>
        </div>
      )}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Currency</span>
        <Select value={activeCurrency} onValueChange={setActiveCurrency}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button
        className={`w-full h-12 text-base font-semibold ${paymentMode === "due" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
        disabled={cart.length === 0 || submitting}
        onClick={openCheckout}
      >
        {submitting ? "Processing..." : buttonLabel}
      </Button>
    </div>
  );

  // ─── Checkout Steps ───
  const renderCheckoutStep = () => {
    switch (checkoutStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Select Customer</h3>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setNewCustOpen(true)}><UserPlus className="h-3.5 w-3.5" /> New</Button>
            </div>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Choose a customer..." /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            {!customerId && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Customer is required</p>}
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-semibold">Review Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {cart.map(item => {
                const key = getCartItemKey(item);
                return (
                  <div key={key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    {item.product.image_url ? <img src={item.product.image_url} alt={item.product.name} className="h-10 w-10 rounded-md object-cover" /> : <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      {item.variation && <p className="text-[10px] text-primary font-medium">{cleanVarName(item.variation.name)}</p>}
                      <p className="text-xs text-muted-foreground">{format(getItemPrice(item))} × {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">{format(getItemPrice(item) * item.quantity)}</p>
                  </div>
                );
              })}
            </div>
            <Separator />
            <div className="flex justify-between font-bold"><span>Total</span><span>{format(total)}</span></div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Payment Method</h3>
              {isOffline && (
                <Button variant={splitMode ? "default" : "outline"} size="sm" className="gap-1 h-7 text-xs" onClick={() => setSplitMode(!splitMode)}>
                  <Split className="h-3 w-3" /> Split
                </Button>
              )}
            </div>
            {splitMode ? (
              <POSSplitPayment total={total} paymentMethods={paymentMethods} onChange={setSplitEntries} format={format} symbol={symbol} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(paymentMethods.length > 0 ? paymentMethods : [{ id: "cash", name: "Cash", enabled: true, config: {} }]).map(m => (
                    <button key={m.id} onClick={() => setSelectedPaymentMethod(m.id)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-all ${selectedPaymentMethod === m.id ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                      <img src={getGatewayIcon(m.id)} alt={m.name} className="h-5 w-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="font-medium">{m.name}</span>
                    </button>
                  ))}
                </div>
                {(() => {
                  const selected = paymentMethods.find(m => m.id === selectedPaymentMethod);
                  if (!selected?.config) return null;
                  const details = getPublicPaymentDetails(selected.config);
                  if (details.length === 0 && !selected.config.qr_code_url && !selected.config.instructions) return null;
                  return (
                    <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                      {details.map((d, i) => <div key={i} className="flex justify-between text-xs"><span className="text-muted-foreground">{d.label}</span><span className="font-medium select-all">{d.value}</span></div>)}
                      {selected.config.qr_code_url && <div className="text-center pt-1"><img src={selected.config.qr_code_url} alt="QR" className="w-28 h-28 mx-auto rounded border p-0.5" /></div>}
                      {selected.config.instructions && <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2 mt-1">{selected.config.instructions}</p>}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Order Notes (Optional)</h3>
            <Textarea placeholder="Add any notes..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="min-h-[100px]" />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Order Summary</h3>
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Customer</span><span className="font-medium">{selectedCustomer?.name || "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Items</span><span className="font-medium">{cart.reduce((s, i) => s + i.quantity, 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment</span><span className="font-medium capitalize">{splitMode ? "Split Payment" : selectedPaymentMethod}</span></div>
              {splitMode && splitEntries.map((e, i) => (
                <div key={i} className="flex justify-between text-xs text-muted-foreground ml-2"><span>{e.methodName}</span><span>{format(e.amount)}</span></div>
              ))}
              {orderNotes && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Notes</span><span className="font-medium truncate max-w-[200px]">{orderNotes}</span></div>}
              {paymentMode === "discount" && parseFloat(discountValue) > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-{format(subtotal - total)}</span></div>}
              {paymentMode === "due" && <div className="flex justify-between text-sm text-amber-600"><span>Payment Status</span><span className="font-medium">Due (Unpaid)</span></div>}
              <Separator />
              <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{format(total)}</span></div>
            </div>
          </div>
        );
    }
  };

  return (
    <DashboardLayout>
      {/* Keyboard Shortcuts */}
      <POSKeyboardShortcuts
        onSearch={focusSearch}
        onCheckout={openCheckout}
        onHoldOrder={handleHoldOrder}
        onResumePanel={() => setHeldOrdersOpen(true)}
        onRecentPanel={() => setRecentOpen(true)}
        onClearCart={() => { setCart([]); toast("Cart cleared"); }}
        cartEmpty={cart.length === 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:h-[calc(100vh-4rem)] -mx-3 sm:-mx-4 lg:-m-6">
        {/* Left: Products */}
        <div className="lg:col-span-2 p-3 sm:p-6 overflow-y-auto pb-24 lg:pb-6">
          {/* Action bar: Hold, Resume, Recent, Shortcuts */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <TooltipProvider>
              {isOffline && (
                <Tooltip><TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleHoldOrder} disabled={cart.length === 0}>
                    <Pause className="h-3.5 w-3.5" /> Hold <kbd className="text-[9px] bg-muted px-1 rounded ml-1">F2</kbd>
                  </Button>
                </TooltipTrigger><TooltipContent>Hold current order (F2)</TooltipContent></Tooltip>
              )}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 relative" onClick={() => setHeldOrdersOpen(true)}>
                  <Play className="h-3.5 w-3.5" /> Resume
                  {heldCount > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 p-0 flex items-center justify-center text-[9px]">{heldCount}</Badge>}
                  <kbd className="text-[9px] bg-muted px-1 rounded ml-1">F3</kbd>
                </Button>
              </TooltipTrigger><TooltipContent>Resume held orders (F3)</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setRecentOpen(true)}>
                  <Receipt className="h-3.5 w-3.5" /> Recent <kbd className="text-[9px] bg-muted px-1 rounded ml-1">F4</kbd>
                </Button>
              </TooltipTrigger><TooltipContent>Recent transactions (F4)</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger><TooltipContent>Keyboard shortcuts</TooltipContent></Tooltip>
            </TooltipProvider>
          </div>

          {/* Category tabs */}
          <ScrollArea className="w-full">
            <div className="flex items-center gap-2 mb-3 sm:mb-4 pb-1">
              {categories.map(cat => (
                <Button key={cat.id} size="sm" variant={activeCategory === cat.id ? "default" : "outline"} className="rounded-full h-8 whitespace-nowrap" onClick={() => setActiveCategory(cat.id)}>
                  {cat.label}
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Barcode Scanner - Only for offline stores */}
          {isOffline && <BarcodeScanner onScan={handleBarcodeScan} placeholder="Scan barcode / SKU..." className="mb-3" autoFocus={false} />}

          {/* Search */}
          <div className="relative mb-4 sm:mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Product Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center text-sm">No products found. Add products in the Product Catalog.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
              {filtered.map((p) => {
                const hasVariations = getVariations(p.id).length > 0;
                return (
                  <div key={p.id} className="premium-card cursor-pointer overflow-hidden active:scale-95 transition-transform relative" onClick={() => handleProductClick(p)}>
                    {hasVariations && (
                      <div className="absolute top-1.5 right-1.5 z-10">
                        <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0 gap-0.5"><Layers className="h-2.5 w-2.5" /> Variants</Badge>
                      </div>
                    )}
                    {p.image_url ? (
                      <div className="w-full aspect-square bg-muted"><img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" /></div>
                    ) : (
                      <div className="w-full aspect-square bg-muted/50 flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/40" /></div>
                    )}
                    <div className="p-2.5 sm:p-3 text-center space-y-0.5">
                      <p className="font-medium text-xs sm:text-sm truncate">{p.name}</p>
                      <p className="text-sm sm:text-lg font-bold">{format(Number(p.price), 0)}</p>
                      <Badge variant={p.type === "physical" && p.stock <= 0 ? "destructive" : "secondary"} className="text-[10px]">
                        {p.type === "digital" ? "Digital" : `${p.stock}`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mobile cart bar */}
          {cart.length > 0 && (
            <button onClick={() => setMobileCartOpen(true)} className="lg:hidden fixed bottom-[calc(5rem+max(env(safe-area-inset-bottom),4px))] left-2 right-2 z-40 bg-primary text-primary-foreground px-4 py-3.5 flex items-center justify-between shadow-lg active:opacity-90 transition-opacity rounded-2xl">
              <div className="flex items-center gap-2.5"><ShoppingCart className="h-5 w-5" /><span className="font-semibold text-sm">{cart.reduce((s, i) => s + i.quantity, 0)} items</span></div>
              <div className="flex items-center gap-2"><span className="font-bold">{format(total)}</span><ChevronDown className="h-4 w-4 rotate-180" /></div>
            </button>
          )}
        </div>

        {/* Right: Cart Panel - desktop */}
        <div className="hidden lg:flex border-l border-border/50 bg-card flex-col h-full">
          <ScrollArea className="flex-1"><div className="p-5 space-y-4">{renderCartContent()}</div></ScrollArea>
          <div className="border-t border-border/50 p-5 bg-card">{renderCartTotals()}</div>
        </div>
      </div>

      {/* Mobile cart drawer */}
      <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <DrawerContent className="h-[92vh] max-h-[92vh]">
          <div className="flex flex-col h-full">
            <DrawerHeader className="flex-shrink-0 flex items-center justify-between border-b border-border/50 px-4 py-3">
              <DrawerTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-5 w-5 text-primary" />Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)</DrawerTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileCartOpen(false)}><X className="h-4 w-4" /></Button>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">{renderCartContent()}</div>
            <div className="flex-shrink-0 border-t border-border/50 p-4 bg-card safe-area-bottom">{renderCartTotals()}</div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Variation Modal */}
      <Dialog open={variationModalOpen} onOpenChange={setVariationModalOpen}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border/50">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Select Variation</DialogTitle></DialogHeader>
            {variationProduct && (
              <div className="flex items-center gap-3 mt-3 p-2 rounded-lg bg-muted/50">
                {variationProduct.image_url ? <img src={variationProduct.image_url} alt={variationProduct.name} className="h-12 w-12 rounded-md object-cover" /> : <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                <div><p className="font-semibold text-sm">{variationProduct.name}</p><p className="text-xs text-muted-foreground">Base: {format(Number(variationProduct.price))}</p></div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 space-y-2 max-h-[300px] overflow-y-auto">
            {variationProduct && getVariations(variationProduct.id).map(v => (
              <button key={v.id} onClick={() => setSelectedVariation(v)} className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all ${selectedVariation?.id === v.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50"}`}>
                <div>
                  <p className="font-medium text-sm">{cleanVarName(v.name)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{v.duration_days} days</span>
                    {v.is_subscription && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Subscription</Badge>}
                    <span className="text-xs text-muted-foreground">Stock: {v.stock}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{format(Number(v.price))}</p>
                  {selectedVariation?.id === v.id && <Check className="h-4 w-4 text-primary ml-auto mt-0.5" />}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border/50 px-6 py-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setVariationModalOpen(false)}>Cancel</Button>
            <Button className="flex-1 gap-1" onClick={handleVariationConfirm} disabled={!selectedVariation}><Plus className="h-4 w-4" /> Add to Cart</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Stepper */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <div className="border-b border-border/50 px-6 pt-6 pb-4">
            <DialogHeader className="mb-4"><DialogTitle className="text-lg">Checkout</DialogTitle></DialogHeader>
            <div className="flex items-center gap-1">
              {CHECKOUT_STEPS.map((s, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors ${i < checkoutStep ? "bg-primary text-primary-foreground" : i === checkoutStep ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-muted text-muted-foreground"}`}>
                    {i < checkoutStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  {i < CHECKOUT_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded ${i < checkoutStep ? "bg-primary" : "bg-muted"}`} />}
                </div>
              ))}
            </div>
            <div className="flex mt-1.5">
              {CHECKOUT_STEPS.map((s, i) => <span key={i} className={`flex-1 text-[10px] text-center ${i === checkoutStep ? "text-primary font-medium" : "text-muted-foreground"}`}>{s.label}</span>)}
            </div>
          </div>
          <div className="px-6 py-5 min-h-[200px]">{renderCheckoutStep()}</div>
          <div className="border-t border-border/50 px-6 py-4 flex items-center justify-between bg-muted/30">
            <Button variant="outline" size="sm" onClick={() => checkoutStep === 0 ? setCheckoutOpen(false) : setCheckoutStep(checkoutStep - 1)} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />{checkoutStep === 0 ? "Cancel" : "Back"}
            </Button>
            {checkoutStep < 4 ? (
              <Button size="sm" onClick={() => setCheckoutStep(checkoutStep + 1)} disabled={!canProceed()} className="gap-1">Next <ArrowRight className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" onClick={handleOrder} disabled={submitting} className={`gap-1 ${paymentMode === "due" ? "bg-amber-500 hover:bg-amber-600" : ""}`}>
                {submitting ? "Processing..." : "Confirm Order"} <Check className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2"><DialogTitle className="flex items-center gap-2 text-lg"><Check className="h-5 w-5 text-green-500" /> Order Complete</DialogTitle></DialogHeader>
          {receiptData && (
            <>
              <div ref={receiptRef} className="px-6 py-4">
                <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 mb-1"><Zap className="h-4 w-4 text-primary" /><span className="font-bold text-sm">EvixPOS</span></div>
                    <p className="font-semibold text-sm">{receiptData.storeName}</p>
                    <p className="text-[10px] text-muted-foreground">{receiptData.date}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">#{receiptData.orderId.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="border-t border-dashed border-border" />
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Customer</span><span className="font-medium">{receiptData.customer}</span></div>
                  <div className="border-t border-dashed border-border" />
                  <div className="space-y-1.5">
                    {receiptData.items.map(item => {
                      const key = getCartItemKey(item);
                      return (
                        <div key={key} className="text-xs">
                          <div className="flex justify-between"><span className="flex-1 truncate">{item.product.name} ×{item.quantity}</span><span className="font-medium ml-2">{receiptSymbol}{(getItemPrice(item) * item.quantity).toFixed(2)}</span></div>
                          {item.variation && <span className="text-[10px] text-muted-foreground ml-2">↳ {cleanVarName(item.variation.name)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-dashed border-border" />
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span>{receiptSymbol}{receiptData.subtotal.toFixed(2)}</span></div>
                    {receiptData.discount > 0 && <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>-{receiptSymbol}{receiptData.discount.toFixed(2)}</span></div>}
                    <div className="flex justify-between text-sm font-bold pt-1"><span>Total</span><span>{receiptSymbol}{receiptData.total.toFixed(2)}</span></div>
                  </div>
                  <div className="border-t border-dashed border-border" />
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Payment</span><span className="font-medium capitalize">{receiptData.paymentMethod}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Status</span><span className={`font-medium ${receiptData.paymentStatus.includes("Due") ? "text-amber-600" : "text-green-600"}`}>{receiptData.paymentStatus}</span></div>
                  </div>
                  {receiptData.notes && (<><div className="border-t border-dashed border-border" /><div className="text-xs"><span className="text-muted-foreground">Notes: </span><span>{receiptData.notes}</span></div></>)}
                  <div className="border-t border-dashed border-border" />
                  <p className="text-center text-[10px] text-muted-foreground">Thank you for your purchase!</p>
                </div>
              </div>
              <div className="border-t border-border/50 px-6 py-4 flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={handlePrintReceipt}><Printer className="h-4 w-4" /> Print</Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={async () => {
                  if (!receiptData) return;
                  const { data } = await supabase.from("orders").select("*, customers(name)").eq("id", receiptData.orderId).single();
                  if (data) {
                    setInvoiceOrder(data);
                    const { data: items } = await supabase.from("order_items").select("id, quantity, price, products(name)").eq("order_id", receiptData.orderId);
                    setInvoiceItems((items ?? []) as any[]);
                    setInvoiceOpen(true);
                  }
                }}><FileText className="h-4 w-4" /> Invoice</Button>
                <Button className="flex-1 gap-1.5" onClick={() => setReceiptOpen(false)}>Done <Check className="h-4 w-4" /></Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New Customer */}
      <Dialog open={newCustOpen} onOpenChange={setNewCustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="Email (optional)" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone (optional)" /></div>
            <Button className="w-full" onClick={handleCreateCustomer} disabled={creatingCust || !newCustName.trim()}>{creatingCust ? "Creating..." : "Create Customer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Held Orders Panel */}
      <POSHeldOrders
        open={heldOrdersOpen}
        onOpenChange={setHeldOrdersOpen}
        storeId={activeStore?.id ?? ""}
        cart={cart}
        customerId={customerId}
        customerName={selectedCustomer?.name}
        onHold={handleHoldOrder}
        onResume={handleResumeOrder}
        format={format}
      />

      {/* Recent Transactions */}
      <POSRecentTransactions open={recentOpen} onOpenChange={setRecentOpen} storeId={activeStore?.id ?? ""} format={format} />

      {/* Keyboard Shortcuts Help */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Keyboard className="h-5 w-5 text-primary" /> Keyboard Shortcuts</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            {[
              ["F1 or /", "Focus search"],
              ["F2", "Hold current order"],
              ["F3", "Resume held orders"],
              ["F4", "Recent transactions"],
              ["F8", "Clear cart"],
              ["Enter", "Open checkout"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="text-xs bg-muted px-2 py-0.5 rounded border font-mono">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Modal */}
      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} order={invoiceOrder} orderItems={invoiceItems} />
    </DashboardLayout>
  );
};

export default POS;
