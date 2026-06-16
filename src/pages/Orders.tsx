import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, ClipboardList, Eye, Upload, Download, CloudUpload, FileText, RotateCcw, History, Globe, Trash2, Settings, ShoppingBag, CheckCircle2, Clock, DollarSign, RefreshCw, TrendingUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import InvoiceModal from "@/components/InvoiceModal";
import RefundModal from "@/components/RefundModal";
import EditOrderDialog from "@/components/EditOrderDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useRef, useCallback } from "react";
import { addDays, format } from "date-fns";
import { normalizePaymentMethods, type NormalizedPaymentMethod } from "@/lib/paymentMethods";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  products: { name: string } | null;
}

interface Order {
  id: string;
  order_number?: number | null;
  order_code?: string | null;
  total_amount: number;
  cost_price: number;
  discount: number;
  discount_type: string;
  payment_method: string;
  source: string;
  payment_currency: string;
  notes: string;
  status: "pending" | "completed" | "cancelled";
  payment_status: string;
  created_at: string;
  customers: { name: string } | null;
  customer_id: string | null;
  meta?: Record<string, any> | null;
}

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  duration_days: number;
  is_subscription: boolean;
  sort_order: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

// Play a multi-tone notification sound for ~5 seconds
const playOrderNotificationSound = () => {
  try {
    const ctx = new AudioContext();
    const frequencies = [880, 1100, 880, 1100, 880, 1320, 880, 1100, 880, 1320];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const startTime = ctx.currentTime + i * 0.5;
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  } catch {}
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border border-warning/20",
  completed: "bg-success/10 text-success border border-success/20",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
};

const paymentColors: Record<string, string> = {
  paid: "bg-success/10 text-success border border-success/20",
  unpaid: "bg-destructive/10 text-destructive border border-destructive/20",
  partial: "bg-warning/10 text-warning border border-warning/20",
  refunded: "bg-muted text-muted-foreground border border-border",
  partial_refund: "bg-warning/10 text-warning border border-warning/20",
};

const Orders = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab");

  const isOfflineStore = activeStore?.store_mode === "offline";

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");

  // Pagination (persisted per-store so it survives edit/view/renew navigation)
  const ORDERS_PAGE_SIZE = 10;
  const pageStorageKey = activeStore ? `orders-page-${activeStore.id}` : "orders-page";
  const [currentPage, setCurrentPage] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const stored = sessionStorage.getItem(`orders-page-${activeStore?.id ?? "default"}`);
    return stored ? Math.max(1, parseInt(stored, 10) || 1) : 1;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(pageStorageKey, String(currentPage));
    }
  }, [currentPage, pageStorageKey]);

  // Create order sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formProductId, setFormProductId] = useState<string | null>(null);
  const [formProductPrice, setFormProductPrice] = useState("");
  const [formVariationId, setFormVariationId] = useState<string | null>(null);
  const [formDateTime, setFormDateTime] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [formPaidAmount, setFormPaidAmount] = useState("");
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formDiscount, setFormDiscount] = useState("0");
  const [formDiscountType, setFormDiscountType] = useState("fixed");
  const [formPaymentMethod, setFormPaymentMethod] = useState("cash");
  const [formSource, setFormSource] = useState("manual");
  const [formCurrency, setFormCurrency] = useState("BDT");
  const [formStatus, setFormStatus] = useState("completed");
  const [formNotes, setFormNotes] = useState("");
  const [formCreateSub, setFormCreateSub] = useState(false);
  const [formSubVariation, setFormSubVariation] = useState("1 Month");
  const [creating, setCreating] = useState(false);

  // New customer modal
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Invoice modal
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<OrderItem[]>([]);

  // Refund modal
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundOrderItems, setRefundOrderItems] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [showRefundHistory, setShowRefundHistory] = useState(false);

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit order
  const [editOpen, setEditOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);

  // Dynamic payment methods & currency from store settings
  const [storePaymentMethods, setStorePaymentMethods] = useState<NormalizedPaymentMethod[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("BDT");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const confirmDelete = (order: Order) => {
    setOrderToDelete(order);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    setDeleting(true);
    try {
      // Delete order_items first (FK constraint, no cascade)
      await supabase.from("order_items").delete().eq("order_id", orderToDelete.id);
      // Delete refunds linked to this order
      await supabase.from("refunds").delete().eq("order_id", orderToDelete.id);
      // Delete the order — DB CASCADE will auto-remove linked dues (transactions)
      // and subscriptions via order_id FK with ON DELETE CASCADE.
      const { error } = await supabase.from("orders").delete().eq("id", orderToDelete.id);
      if (error) throw error;
      setOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id));
      toast.success("Order deleted — related dues & subscriptions also removed");
    } catch (err: any) {
      toast.error("Failed to delete order: " + (err.message || "Unknown error"));
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setOrderToDelete(null);
    }
  };

  const fetchOrders = async () => {
    if (!activeStore) return;
    const { data } = await supabase
      .from("orders")
      .select("*, customers(name)")
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    if (data) setOrders(data as unknown as Order[]);
  };

  const fetchCustomers = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("customers").select("id, name, phone").eq("store_id", activeStore.id);
    if (data) setCustomers(data);
  };

const fetchProducts = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("products").select("id, name, price, stock").eq("store_id", activeStore.id);
    if (data) {
      setProducts(data);
      const ids = data.map((p) => p.id);
      if (ids.length > 0) {
        const { data: vars } = await (supabase
          .from("product_variations" as any)
          .select("*")
          .in("product_id", ids)
          .order("sort_order") as any);
        setVariations((vars ?? []) as ProductVariation[]);
      } else {
        setVariations([]);
      }
    }
  };

  const fetchRefunds = async () => {
    if (!activeStore) return;
    const { data } = await supabase
      .from("refunds")
      .select("*")
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    if (data) setRefunds(data);
  };

  const openRefund = async (order: Order) => {
    setRefundOrder(order);
    const { data } = await supabase
      .from("order_items")
      .select("id, quantity, price, product_id, products(name, type)")
      .eq("order_id", order.id);
    setRefundOrderItems((data ?? []) as any[]);
    setRefundOpen(true);
  };

  // Fetch dynamic store settings (payment methods + currency)
  useEffect(() => {
    if (!user || !activeStore) { setSettingsLoading(false); return; }
    const ownerId = effectiveUserId || user.id;
    setSettingsLoading(true);
    supabase
      .from("business_settings")
      .select("payment_methods, default_currency")
      .eq("user_id", ownerId)
      .eq("store_id", activeStore.id)
      .maybeSingle()
      .then(({ data }) => {
        // Payment methods
        if (data?.payment_methods) {
          const methods = normalizePaymentMethods(data.payment_methods).filter(m => m.enabled);
          setStorePaymentMethods(methods.length > 0 ? methods : [{ id: "cash", name: "Cash", enabled: true, config: {} }]);
          // Set default payment method to first enabled
          if (methods.length > 0) setFormPaymentMethod(methods[0].id);
        } else {
          setStorePaymentMethods([{ id: "cash", name: "Cash", enabled: true, config: {} }]);
          setFormPaymentMethod("cash");
        }
        // Currency
        const cur = (data?.default_currency as string) || "BDT";
        setDefaultCurrency(cur);
        setFormCurrency(cur);
        setSettingsLoading(false);
      });
  }, [user, activeStore, effectiveUserId]);

  useEffect(() => {
    if (user && activeStore) {
      fetchOrders();
      fetchCustomers();
      fetchProducts();
      fetchRefunds();
    }
  }, [user, activeStore]);

  // Real-time subscription for new orders with notification sound
  useEffect(() => {
    if (!activeStore) return;

    const channelName = `orders-realtime-${activeStore.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `store_id=eq.${activeStore.id}`,
        },
        (payload) => {
          const newOrder = payload.new as any;
          // Add to state
          setOrders((prev) => [{ ...newOrder, customers: null } as Order, ...prev]);

          // Show toast with sound for website orders
          if (newOrder.source === "woocommerce" || newOrder.source === "order_form") {
            const sourceLabel = newOrder.source === "woocommerce" ? "Website" : "Order Form";
            toast.success(`🛒 New ${sourceLabel} order received! ${newOrder.payment_currency} ${Number(newOrder.total_amount).toFixed(2)}`, {
              duration: 8000,
            });
            // Play 5-second notification sound
            playOrderNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeStore]);

  useEffect(() => {
    if (tabParam === "create") setCreateOpen(true);
    if (tabParam === "pending") setStatusFilter("pending");
  }, [tabParam]);

  // CSV parsing
  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });
      return row;
    });
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Only CSV files are supported");
      return;
    }
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setImportData(parsed);
      if (parsed.length > 0) toast.success(`${parsed.length} records found`);
      else toast.error("No valid records found in file");
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const downloadTemplate = () => {
    const headers = "customer_email,product_name,amount,cost_price,discount,discount_type,payment_method,payment_currency,status,payment_status,notes";
    const example = "customer@example.com,Product Name,1000,500,0,fixed,cash,BDT,completed,paid,Sample order";
    const csv = headers + "\n" + example;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkImport = async () => {
    if (!user || importData.length === 0) return;
    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of importData) {
      try {
        // Match customer by email
        let customerIdMatch: string | null = null;
        if (row.customer_email) {
          const found = customers.find(
            (c) => c.name?.toLowerCase() === row.customer_email?.toLowerCase()
          );
          // Also try actual email lookup
          if (!found) {
            const { data: custData } = await supabase
              .from("customers")
              .select("id")
              .eq("email", row.customer_email)
              .maybeSingle();
            if (custData) customerIdMatch = custData.id;
          } else {
            customerIdMatch = found.id;
          }
        }

        const amount = parseFloat(row.amount) || 0;
        const costPrice = parseFloat(row.cost_price) || 0;
        const discount = parseFloat(row.discount) || 0;

        const { error } = await supabase.from("orders").insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          customer_id: customerIdMatch,
          total_amount: amount,
          cost_price: costPrice,
          discount: discount,
          discount_type: row.discount_type || "fixed",
          payment_method: row.payment_method || "cash",
          source: "import",
          payment_currency: row.payment_currency || "BDT",
          status: (row.status as "pending" | "completed" | "cancelled") || "completed",
          payment_status: row.payment_status || "paid",
          notes: row.notes || "",
        });

        if (error) throw error;
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) toast.success(`${successCount} orders imported successfully!`);
    if (errorCount > 0) toast.error(`${errorCount} orders failed to import`);

    setImportOpen(false);
    setImportFile(null);
    setImportData([]);
    setImporting(false);
    fetchOrders();
  };

  const profit = useMemo(() => {
    const price = parseFloat(formProductPrice) || 0;
    const cost = parseFloat(formCostPrice) || 0;
    const disc = parseFloat(formDiscount) || 0;
    const discountVal = formDiscountType === "percentage" ? (price * disc) / 100 : disc;
    return price - cost - discountVal;
  }, [formProductPrice, formCostPrice, formDiscount, formDiscountType]);

  const dueAmount = useMemo(() => {
    const price = parseFloat(formProductPrice) || 0;
    const paid = parseFloat(formPaidAmount) || 0;
    return Math.max(price - paid, 0);
  }, [formProductPrice, formPaidAmount]);

  const resetForm = () => {
    setFormCustomerId("");
    setCustomerSearch("");
    setFormProductName("");
    setFormProductId(null);
    setFormProductPrice("");
    setFormVariationId(null);
    setFormDateTime(new Date().toISOString().slice(0, 16));
    setFormPaidAmount("");
    setFormCostPrice("");
    setFormDiscount("0");
    setFormDiscountType("fixed");
    setFormPaymentMethod(storePaymentMethods.length > 0 ? storePaymentMethods[0].id : "cash");
    setFormSource("manual");
    setFormCurrency(defaultCurrency);
    setFormStatus("completed");
    setFormNotes("");
    setFormCreateSub(false);
    setFormSubVariation("1 Month");
  };

  const handleCreateOrder = async () => {
    if (!user) return;
    const price = parseFloat(formProductPrice) || 0;
    const paid = parseFloat(formPaidAmount) || 0;
    if (price <= 0) {
      toast.error("Product price must be greater than 0");
      return;
    }

    setCreating(true);
    const disc = parseFloat(formDiscount) || 0;
    const discountVal = formDiscountType === "percentage" ? (price * disc) / 100 : disc;
    const finalTotal = price - discountVal;
    const due = Math.max(finalTotal - paid, 0);
    const paymentStatus =
      paid <= 0 ? "unpaid" : paid >= finalTotal ? "paid" : "partial";
    const matched = products.find(
      (p) =>
        (formProductId && p.id === formProductId) ||
        p.name.toLowerCase() === formProductName.toLowerCase()
    );
    const productVariations = matched ? variations.filter((v) => v.product_id === matched.id) : [];
    const selectedVariation = formVariationId ? productVariations.find((v) => v.id === formVariationId) : null;
    if (matched && productVariations.length > 0 && !selectedVariation) {
      toast.error("Please select a variation for this product");
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: effectiveUserId!,
        store_id: activeStore?.id,
        customer_id: formCustomerId || null,
        total_amount: finalTotal,
        cost_price: parseFloat(formCostPrice) || 0,
        discount: disc,
        discount_type: formDiscountType,
        payment_method: formPaymentMethod,
        source: formSource,
        payment_currency: formCurrency,
        notes: formNotes,
        status: formStatus as "pending" | "completed" | "cancelled",
        payment_status:
          formStatus === "completed" ? paymentStatus : "unpaid",
        created_at: new Date(formDateTime).toISOString(),
        meta: {
          product_id: matched?.id ?? null,
          product_price: price,
          variation_id: selectedVariation?.id ?? null,
          variation_name: selectedVariation?.name ?? null,
          variation_price: selectedVariation ? Number(selectedVariation.price) : null,
          paid_amount: paid,
          due_amount: due,
        } as any,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      if (matched) {
        await supabase.from("order_items").insert({
          order_id: data.id,
          product_id: matched.id,
          quantity: 1,
          price: price,
        });
        // Decrement stock
        await supabase.rpc("has_role", { _user_id: effectiveUserId!, _role: "user" }); // no-op, just to keep TS happy
        await supabase
          .from("products")
          .update({ stock: matched.stock !== undefined ? matched.stock : 0 })
          .eq("id", matched.id);
      }

      // Create subscription if checkbox is checked
      if (formCreateSub && formCustomerId) {
        const VARIATIONS: Record<string, number> = {
          "7 Days": 7, "15 Days": 15, "1 Month": 30, "2 Month": 60,
          "3 Month": 90, "6 Month": 180, "12 Month": 365,
        };
        const durationDays = selectedVariation
          ? Number(selectedVariation.duration_days) || 30
          : (VARIATIONS[formSubVariation] || 30);
        const variationLabel = selectedVariation?.name || formSubVariation;
        const startDate = format(new Date(), "yyyy-MM-dd");
        const endDate = format(addDays(new Date(), durationDays), "yyyy-MM-dd");
        await supabase.from("subscriptions").insert({
          user_id: effectiveUserId!,
          store_id: activeStore?.id,
          order_id: data.id,
          customer_id: formCustomerId,
          product_name: formProductName || "Order Subscription",
          variation: variationLabel,
          start_date: startDate,
          end_date: endDate,
          price: finalTotal,
          cost_price: parseFloat(formCostPrice) || 0,
          notes: `Created from order ${data.id}`,
          status: "active",
          plan: "customer" as any,
        } as any);
      }

      toast.success("Order created successfully!");
      resetForm();
      setCreateOpen(false);
      fetchOrders();
    }
    setCreating(false);
  };

  const updateStatus = async (id: string, status: "pending" | "completed" | "cancelled") => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Order marked as ${status}`);
      fetchOrders();
    }
  };

  const viewDetails = async (order: Order) => {
    setSelectedOrder(order);
    const { data } = await supabase
      .from("order_items")
      .select("id, quantity, price, products(name)")
      .eq("order_id", order.id);
    setOrderItems((data ?? []) as unknown as OrderItem[]);
    setDetailOpen(true);
  };

  const openInvoice = async (order: Order) => {
    setInvoiceOrder(order);
    const { data } = await supabase
      .from("order_items")
      .select("id, quantity, price, products(name)")
      .eq("order_id", order.id);
    setInvoiceItems((data ?? []) as unknown as OrderItem[]);
    setInvoiceOpen(true);
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.id.toLowerCase().includes(q) &&
          !String(o.order_number ?? "").toLowerCase().includes(q) &&
          !String(o.order_code ?? "").toLowerCase().includes(q) &&
          !(o.customers?.name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (timeFilter !== "all") {
        const now = new Date();
        const created = new Date(o.created_at);
        if (timeFilter === "today" && created.toDateString() !== now.toDateString()) return false;
        if (timeFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (created < weekAgo) return false;
        }
        if (timeFilter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (created < monthAgo) return false;
        }
      }
      return true;
    });
  }, [orders, statusFilter, paymentFilter, search, timeFilter]);

  // Quick stats for premium header
  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter((o) => o.status === "completed").length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const revenue = orders
      .filter((o) => o.status === "completed" && o.payment_status === "paid")
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const currency = orders[0]?.payment_currency ?? "";
    return { total, completed, pending, revenue, currency };
  }, [orders]);

  return (
    <DashboardLayout>
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-3 sm:p-6 mb-3 sm:mb-6">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 flex-shrink-0">
              <ShoppingBag className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-2xl font-bold tracking-tight truncate">{t.orders}</h1>
              <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 truncate">
                {stats.total} order{stats.total !== 1 ? "s" : ""} · {stats.currency} {stats.revenue.toFixed(0)} revenue
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3 hidden sm:inline-flex" onClick={() => setShowRefundHistory(!showRefundHistory)}>
              <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden md:inline">Refunds</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3 hidden sm:inline-flex" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden md:inline">Import</span>
            </Button>
            <Button size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Create Order</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-4 mb-3 sm:mb-6">
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 text-primary border-primary/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Total</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.total}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-success/10 to-success/5 text-success border-success/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Done</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.completed}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-warning/10 to-warning/5 text-warning border-warning/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <Clock className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Pending</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.pending}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 text-primary border-primary/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Revenue</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.currency}{stats.revenue.toFixed(0)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl sm:rounded-2xl border bg-card p-2 sm:p-4 mb-3 sm:mb-4 flex flex-col lg:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder={t.searchOrders}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 sm:pl-9 h-9 sm:h-10 text-xs sm:text-sm bg-background"
          />
        </div>
        <div className="grid grid-cols-3 lg:flex gap-1.5 sm:gap-2">
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="w-full lg:w-[140px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
            <SelectValue placeholder={t.allTime} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-[140px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
            <SelectValue placeholder={t.allStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-full lg:w-[160px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
            <SelectValue placeholder={t.allPayments} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Orders Table or Empty State */}
      {filtered.length === 0 ? (
        <div className="premium-card flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">{t.noOrdersYet}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a <button className="text-primary underline" onClick={() => setCreateOpen(true)}>manual order</button> or{" "}
            <span className="text-primary underline cursor-pointer">sync from WooCommerce</span>.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filtered.map((o) => (
              <div key={o.id} className="mobile-card" onClick={() => viewDetails(o)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{o.customers?.name ?? "Walk-in"}</span>
                  <span className="font-bold text-sm">{o.payment_currency} {Number(o.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${statusColors[o.status]} text-[10px]`}>{o.status}</Badge>
                  <Badge className={`${paymentColors[o.payment_status] ?? "bg-muted text-muted-foreground"} text-[10px]`}>{o.payment_status}</Badge>
                  {o.source === "woocommerce" && (
                    <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] gap-0.5">
                      <Globe className="h-2.5 w-2.5" /> Website
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">{o.payment_method}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(o.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={(e) => { e.stopPropagation(); openInvoice(o); }}>
                    <FileText className="h-3.5 w-3.5" /> Invoice
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setEditOrder(o); setEditOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {o.status === "completed" && !["refunded"].includes(o.payment_status) && (
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openRefund(o); }}>
                      <RotateCcw className="h-3.5 w-3.5" /> Refund
                    </Button>
                   )}
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); confirmDelete(o); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="premium-card overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.orderId}</TableHead>
                  <TableHead>{t.customer}</TableHead>
                  <TableHead>{t.amount}</TableHead>
                  <TableHead>{t.status}</TableHead>
                  <TableHead>{t.payment}</TableHead>
                  <TableHead>{t.method}</TableHead>
                  <TableHead>{t.source}</TableHead>
                  <TableHead>{t.date}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-mono text-xs break-all max-w-[280px]" title={o.order_code ?? (o.order_number ? String(o.order_number) : o.id)}>{o.order_code ?? o.order_number ?? o.id}</TableCell>
                    <TableCell className="font-medium">{o.customers?.name ?? "—"}</TableCell>
                    <TableCell className="font-semibold">
                      {o.payment_currency} {Number(o.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={o.status}
                        onValueChange={(v) => updateStatus(o.id, v as "pending" | "completed" | "cancelled")}
                      >
                        <SelectTrigger className="h-7 w-[120px] border-0 p-0">
                          <Badge className={statusColors[o.status]}>{o.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge className={paymentColors[o.payment_status] ?? "bg-muted text-muted-foreground"}>
                        {o.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{o.payment_method}</TableCell>
                    <TableCell className="capitalize text-sm">
                      {o.source === "woocommerce" ? (
                        <Badge className="bg-primary/10 text-primary border border-primary/20 gap-1">
                          <Globe className="h-3 w-3" /> Website
                        </Badge>
                      ) : o.source === "order_form" ? (
                        <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 gap-1">
                          <FileText className="h-3 w-3" /> Form
                        </Badge>
                      ) : (
                        o.source
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openInvoice(o)} title="Invoice">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditOrder(o); setEditOpen(true); }} title="Edit Order">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {o.status === "completed" && !["refunded"].includes(o.payment_status) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openRefund(o)} title="Refund">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewDetails(o)} title="Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => confirmDelete(o)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Create Order Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Manual Order</SheetTitle>
            <p className="text-sm text-muted-foreground">Fill in the details to create a new order</p>
          </SheetHeader>
          <div className="space-y-5 mt-6">
            {/* Customer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Customer *</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setNewCustomerOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> New Customer
                </Button>
              </div>
              <Input
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); if (formCustomerId) setFormCustomerId(""); }}
              />
              {customerSearch && !formCustomerId && (
                <div className="border border-border rounded-md max-h-48 overflow-y-auto bg-popover">
                  {customers
                    .filter((c) => {
                      const q = customerSearch.toLowerCase();
                      return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
                    })
                    .slice(0, 20)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
                        onClick={() => { setFormCustomerId(c.id); setCustomerSearch(`${c.name}${c.phone ? ` · ${c.phone}` : ""}`); }}
                      >
                        <span>{c.name}</span>
                        {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
                      </button>
                    ))}
                  {customers.filter((c) => {
                    const q = customerSearch.toLowerCase();
                    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
                  }).length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No matches. Use "New Customer".</p>
                  )}
                </div>
              )}
            </div>

            {/* Product */}
            <div className="space-y-2">
              <Label>{t.product} *</Label>
              <Input
                placeholder={t.enterProductName}
                value={formProductName}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormProductName(v);
                  const m = products.find((p) => p.name.toLowerCase() === v.toLowerCase());
                  if (m) {
                    setFormProductId(m.id);
                    const vars = variations.filter((x) => x.product_id === m.id);
                    if (vars.length > 0) {
                      const first = vars[0];
                      setFormVariationId(first.id);
                      setFormProductPrice(String(first.price ?? m.price ?? ""));
                    } else {
                      setFormVariationId(null);
                      setFormProductPrice(String(m.price ?? ""));
                    }
                  } else {
                    setFormProductId(null);
                    setFormVariationId(null);
                  }
                }}
                list="product-list"
              />
              <datalist id="product-list">
                {products.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>

            {/* Variation selector — only when product has variations */}
            {formProductId && variations.some((v) => v.product_id === formProductId) && (
              <div className="space-y-2">
                <Label>Variation *</Label>
                <Select
                  value={formVariationId ?? ""}
                  onValueChange={(val) => {
                    setFormVariationId(val);
                    const v = variations.find((x) => x.id === val);
                    if (v) setFormProductPrice(String(v.price ?? ""));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select variation" />
                  </SelectTrigger>
                  <SelectContent>
                    {variations
                      .filter((v) => v.product_id === formProductId)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} — {CURRENCY_SYMBOLS[formCurrency] || formCurrency}{Number(v.price).toFixed(2)}
                          {v.is_subscription ? ` · ${v.duration_days}d` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date & Time */}
            <div className="space-y-2">
              <Label>{t.dateTime}</Label>
              <Input
                type="datetime-local"
                value={formDateTime}
                onChange={(e) => setFormDateTime(e.target.value)}
              />
            </div>

            {/* Product Price & Cost */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Product Price ({CURRENCY_SYMBOLS[formCurrency] || formCurrency})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formProductPrice}
                  onChange={(e) => setFormProductPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.costPrice} ({CURRENCY_SYMBOLS[formCurrency] || formCurrency})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formCostPrice}
                  onChange={(e) => setFormCostPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Paid & Due */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Paid Amount ({CURRENCY_SYMBOLS[formCurrency] || formCurrency})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formPaidAmount}
                  onChange={(e) => setFormPaidAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Amount ({CURRENCY_SYMBOLS[formCurrency] || formCurrency})</Label>
                <Input type="number" value={dueAmount.toFixed(2)} readOnly className="bg-muted" />
              </div>
            </div>

            {/* Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t.discount}</Label>
                <Input
                  type="number"
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.type}</Label>
                <Select value={formDiscountType} onValueChange={setFormDiscountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed ({CURRENCY_SYMBOLS[formCurrency] || formCurrency})</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Profit */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted">
              <span className="text-sm font-medium">Profit:</span>
              <span className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                {CURRENCY_SYMBOLS[formCurrency] || formCurrency}{profit.toFixed(2)}
              </span>
            </div>

            {/* Payment Method & Source */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t.paymentMethod}</Label>
                  <button
                    type="button"
                    onClick={() => navigate("/settings?tab=payment")}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Manage Payment Methods"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder={settingsLoading ? "Loading..." : "Select method"} />
                  </SelectTrigger>
                  <SelectContent>
                    {storePaymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.source}</Label>
                <Select value={formSource} onValueChange={setFormSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="woocommerce">WooCommerce</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label>Payment Currency</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">৳ BDT</SelectItem>
                  <SelectItem value="INR">₹ INR</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add notes..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Create Subscription Checkbox - only for online stores */}
            {!isOfflineStore && (
              <div className="flex items-center space-x-2 py-2">
                <Checkbox
                  id="createSub"
                  checked={formCreateSub}
                  onCheckedChange={(checked) => setFormCreateSub(checked === true)}
                />
                <label htmlFor="createSub" className="text-sm cursor-pointer">
                  Create subscription from this order
                </label>
              </div>
            )}

            {!isOfflineStore && formCreateSub && (
              <div className="space-y-2 pl-6 border-l-2 border-primary/20">
                <Label>Subscription Variation</Label>
                <Select value={formSubVariation} onValueChange={setFormSubVariation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7 Days">7 Days</SelectItem>
                    <SelectItem value="15 Days">15 Days</SelectItem>
                    <SelectItem value="1 Month">1 Month</SelectItem>
                    <SelectItem value="2 Month">2 Month</SelectItem>
                    <SelectItem value="3 Month">3 Month</SelectItem>
                    <SelectItem value="6 Month">6 Month</SelectItem>
                    <SelectItem value="12 Month">12 Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreateOrder}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Order Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Order Details
              {selectedOrder?.source === "woocommerce" && (
                <Badge className="bg-primary/10 text-primary border border-primary/20 gap-1">
                  <Globe className="h-3 w-3" /> From Website
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Order ID</span>
                  <p className="font-mono text-xs">{selectedOrder.order_code ?? selectedOrder.order_number ?? selectedOrder.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <p className="font-medium">{selectedOrder.customers?.name ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p><Badge className={statusColors[selectedOrder.status]}>{selectedOrder.status}</Badge></p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment</span>
                  <p className="capitalize font-medium">{selectedOrder.payment_status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Method</span>
                  <p className="capitalize">{selectedOrder.payment_method}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Source</span>
                  <p className="capitalize">
                    {selectedOrder.source === "woocommerce" ? "Website (WooCommerce)" : selectedOrder.source}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Currency</span>
                  <p>{selectedOrder.payment_currency}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p>{new Date(selectedOrder.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total</span>
                  <p className="text-lg font-bold">{selectedOrder.payment_currency} {Number(selectedOrder.total_amount).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Profit</span>
                  <p className="text-lg font-bold text-success">
                    {selectedOrder.payment_currency} {(Number(selectedOrder.total_amount) - Number(selectedOrder.cost_price)).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* WooCommerce Meta: Billing Info */}
              {selectedOrder.meta && (selectedOrder.meta as any)?.billing?.email && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-primary" /> Website Order Details
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm bg-muted/30 rounded-lg p-3">
                      {(selectedOrder.meta as any)?.wc_order_number && (
                        <div>
                          <span className="text-muted-foreground text-xs">WC Order #</span>
                          <p className="font-medium">{(selectedOrder.meta as any).wc_order_number}</p>
                        </div>
                      )}
                      {(selectedOrder.meta as any)?.billing?.email && (
                        <div>
                          <span className="text-muted-foreground text-xs">Email</span>
                          <p className="font-medium text-xs break-all">{(selectedOrder.meta as any).billing.email}</p>
                        </div>
                      )}
                      {(selectedOrder.meta as any)?.billing?.phone && (
                        <div>
                          <span className="text-muted-foreground text-xs">Phone</span>
                          <p className="font-medium">{(selectedOrder.meta as any).billing.phone}</p>
                        </div>
                      )}
                      {(selectedOrder.meta as any)?.payment_method_title && (
                        <div>
                          <span className="text-muted-foreground text-xs">Payment Gateway</span>
                          <p className="font-medium">{(selectedOrder.meta as any).payment_method_title}</p>
                        </div>
                      )}
                      {(selectedOrder.meta as any)?.transaction_id && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Transaction ID</span>
                          <p className="font-mono text-xs">{(selectedOrder.meta as any).transaction_id}</p>
                        </div>
                      )}
                      {(selectedOrder.meta as any)?.customer_note && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Customer Note</span>
                          <p className="text-sm">{(selectedOrder.meta as any).customer_note}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Billing Address */}
                  {(selectedOrder.meta as any)?.billing?.address_1 && (
                    <div>
                      <h4 className="font-semibold mb-1 text-xs text-muted-foreground">Billing Address</h4>
                      <p className="text-sm">
                        {[(selectedOrder.meta as any).billing.address_1, (selectedOrder.meta as any).billing.address_2, (selectedOrder.meta as any).billing.city, (selectedOrder.meta as any).billing.state, (selectedOrder.meta as any).billing.postcode, (selectedOrder.meta as any).billing.country].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Shipping Address */}
                  {(selectedOrder.meta as any)?.shipping?.address_1 && (
                    <div>
                      <h4 className="font-semibold mb-1 text-xs text-muted-foreground">Shipping Address</h4>
                      <p className="text-sm">
                        {[(selectedOrder.meta as any).shipping.address_1, (selectedOrder.meta as any).shipping.address_2, (selectedOrder.meta as any).shipping.city, (selectedOrder.meta as any).shipping.state, (selectedOrder.meta as any).shipping.postcode, (selectedOrder.meta as any).shipping.country].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}

                  {/* WC Line Items */}
                  {(selectedOrder.meta as any)?.line_items?.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1 text-xs text-muted-foreground">Website Products</h4>
                      <div className="space-y-1.5">
                        {((selectedOrder.meta as any).line_items as any[]).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm bg-muted/20 rounded px-2 py-1.5">
                            <div>
                              <span className="font-medium">{item.name}</span>
                              {item.sku && <span className="text-xs text-muted-foreground ml-1">(SKU: {item.sku})</span>}
                              {item.meta_data?.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {item.meta_data.filter((m: any) => !m.key?.startsWith("_")).map((m: any, mi: number) => (
                                    <span key={mi} className="mr-2">{m.display_key || m.key}: {m.display_value || m.value}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-xs whitespace-nowrap">×{item.quantity} = {item.total}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedOrder.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-1 text-sm">{t.notes}</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{selectedOrder.notes}</p>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">{t.items}</h3>
                {orderItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No items</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.products?.name ?? "—"}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{Number(item.price).toFixed(2)}</TableCell>
                          <TableCell>{(Number(item.price) * item.quantity).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Action Buttons in Detail Dialog */}
              <div className="pt-2 flex gap-2">
                <Button className="flex-1 gap-2" variant="outline" onClick={() => { setDetailOpen(false); if (selectedOrder) openInvoice(selectedOrder); }}>
                  <FileText className="h-4 w-4" /> Invoice
                </Button>
                {selectedOrder?.status === "completed" && !["refunded"].includes(selectedOrder?.payment_status) && (
                  <Button className="flex-1 gap-2 text-destructive hover:text-destructive" variant="outline" onClick={() => { setDetailOpen(false); if (selectedOrder) openRefund(selectedOrder); }}>
                    <RotateCcw className="h-4 w-4" /> Refund
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Modal */}
      <InvoiceModal
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        order={invoiceOrder}
        orderItems={invoiceItems}
      />

      {/* Edit Order Dialog */}
      <EditOrderDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        order={editOrder}
        products={products}
        variations={variations}
        customers={customers}
        paymentMethods={storePaymentMethods}
        storeId={activeStore?.id ?? null}
        onSaved={() => { fetchOrders(); }}
      />

      {/* Import Orders Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => {
        setImportOpen(open);
        if (!open) { setImportFile(null); setImportData([]); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Orders</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Upload a CSV file to bulk import past orders. customer_email must match an existing customer. Download the template to see the required format.
            </p>
          </DialogHeader>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFileSelect(file);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <CloudUpload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-sm">Click or drag file to this area to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Only CSV files are supported</p>
            {importFile && (
              <p className="text-xs text-primary mt-2 font-medium">{importFile.name} ({importData.length} records)</p>
            )}
          </div>

          <Button variant="outline" className="gap-2 w-fit mx-auto" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Download Template
          </Button>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportData([]); }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={importData.length === 0 || importing}
            >
              {importing ? "Importing..." : `Import ${importData.length} Records`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Modal */}
      <RefundModal
        open={refundOpen}
        onOpenChange={setRefundOpen}
        order={refundOrder}
        orderItems={refundOrderItems}
        onRefundComplete={() => { fetchOrders(); fetchRefunds(); fetchProducts(); }}
      />

      {/* Refund History Dialog */}
      <Dialog open={showRefundHistory} onOpenChange={setShowRefundHistory}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Refund History
            </DialogTitle>
          </DialogHeader>
          {refunds.length === 0 ? (
            <div className="text-center py-8">
              <RotateCcw className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No refunds yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {refunds.map((r) => {
                const refundStatusColor: Record<string, string> = {
                  pending: "bg-warning/10 text-warning",
                  approved: "bg-success/10 text-success",
                  rejected: "bg-destructive/10 text-destructive",
                };
                return (
                  <div key={r.id} className="rounded-xl border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground break-all" title={r.order_id}>{r.order_id}</span>
                      <Badge className={refundStatusColor[r.status] || "bg-muted text-muted-foreground"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm capitalize">{r.refund_type} refund</span>
                      <span className="font-bold text-primary">
                        {CURRENCY_SYMBOLS[orders.find(o => o.id === r.order_id)?.payment_currency || "BDT"] || "৳"}
                        {Number(r.refund_amount).toFixed(2)}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-muted-foreground">Reason: {r.reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    {Array.isArray(r.refund_items) && r.refund_items.length > 0 && (
                      <div className="pt-1 space-y-1">
                        {(r.refund_items as any[]).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                            <span>{item.product_name} ×{item.quantity}</span>
                            <span>{CURRENCY_SYMBOLS[orders.find(o => o.id === r.order_id)?.payment_currency || "BDT"] || "৳"}{(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete order <span className="font-mono font-semibold break-all">{orderToDelete?.order_code ?? orderToDelete?.order_number ?? orderToDelete?.id}</span>? 
              This will permanently remove the order, its items, and any associated refunds. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrder}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Customer Dialog */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Customer</DialogTitle>
            <DialogDescription>Add a customer to this store and assign them to the current order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Textarea value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} placeholder="Optional" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)} disabled={creatingCustomer}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!newCustName.trim() || !newCustPhone.trim()) {
                  toast.error("Name and phone are required");
                  return;
                }
                if (!activeStore?.id || !effectiveUserId) return;
                setCreatingCustomer(true);
                const { data, error } = await supabase
                  .from("customers")
                  .insert({
                    user_id: effectiveUserId,
                    store_id: activeStore.id,
                    name: newCustName.trim(),
                    phone: newCustPhone.trim(),
                    email: newCustEmail.trim() || null,
                    address: newCustAddress.trim() || null,
                  })
                  .select("id, name, phone")
                  .single();
                setCreatingCustomer(false);
                if (error || !data) { toast.error(error?.message || "Failed to create customer"); return; }
                setCustomers((prev) => [{ id: data.id, name: data.name, phone: data.phone }, ...prev]);
                setFormCustomerId(data.id);
                setCustomerSearch(`${data.name}${data.phone ? ` · ${data.phone}` : ""}`);
                setNewCustomerOpen(false);
                setNewCustName(""); setNewCustPhone(""); setNewCustEmail(""); setNewCustAddress("");
                toast.success("Customer created and selected");
              }}
              disabled={creatingCustomer}
            >
              {creatingCustomer ? "Saving..." : "Create & Select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Orders;
