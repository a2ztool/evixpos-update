import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Truck, Phone, Mail, Edit2, Trash2, FileDown, MessageCircle,
  Receipt, Eye, DollarSign, Users, ShoppingBag, TrendingUp, Package, HelpCircle,
  ChevronRight, BarChart3, AlertTriangle, Sparkles, Boxes, Upload, ArrowDownUp,
  RotateCcw, Zap, ChevronDown,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

const Inventory = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const qc = useQueryClient();

  // --- State ---
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const [guideOpen, setGuideOpen] = useState(false);

  // Supplier form
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [sForm, setSForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  // Purchase form
  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [pForm, setPForm] = useState({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
  const [purchaseItems, setPurchaseItems] = useState<{ product_name: string; quantity: string; unit_cost: string }[]>([
    { product_name: "", quantity: "1", unit_cost: "" }
  ]);

  // Pay dialog
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<"supplier" | "purchase">("supplier");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  // Detail dialog
  const [detailDialog, setDetailDialog] = useState<any>(null);

  // Advanced feature state
  const [mainTab, setMainTab] = useState<"purchases" | "movements" | "reorder" | "returns">("purchases");
  const [importDialog, setImportDialog] = useState<null | "suppliers" | "purchases">(null);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [returnDialog, setReturnDialog] = useState<any>(null);
  const [returnForm, setReturnForm] = useState({ refund_amount: "", payment_method: "cash", notes: "" });
  const [returnItems, setReturnItems] = useState<{ product_name: string; quantity: string; unit_cost: string }[]>([]);
  const [movementFilter, setMovementFilter] = useState<"all" | "in" | "out" | "adjust" | "return">("all");

  // --- Queries ---
  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*")
        .eq("store_id", storeId!).eq("is_active", true).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["purchases", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("*, suppliers(name)")
        .eq("store_id", storeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, stock")
        .eq("store_id", storeId!).order("name");
      return data || [];
    },
  });

  const { data: stockMovements = [] } = useQuery({
    queryKey: ["stock-movements", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("*").eq("store_id", storeId!).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: purchaseReturns = [] } = useQuery({
    queryKey: ["purchase-returns", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_returns")
        .select("*, suppliers(name)").eq("store_id", storeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // 30-day sales velocity (per product_id)
  const { data: salesVelocity = {} } = useQuery({
    queryKey: ["sales-velocity", storeId],
    enabled: ready,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: ordersData } = await supabase.from("orders")
        .select("id").eq("store_id", storeId!).gte("created_at", since);
      const ids = (ordersData || []).map((o: any) => o.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data: items } = await supabase.from("order_items")
        .select("product_id, quantity").in("order_id", ids);
      const map: Record<string, number> = {};
      (items || []).forEach((it: any) => {
        if (it.product_id) map[it.product_id] = (map[it.product_id] || 0) + Number(it.quantity || 0);
      });
      return map;
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`inventory-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["suppliers", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["purchases", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["stock-movements", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_returns", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["purchase-returns", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, qc]);

  // --- Mutations ---
  const saveSupplier = useMutation({
    mutationFn: async () => {
      if (editSupplierId) {
        const { error } = await supabase.from("suppliers").update({
          name: sForm.name, phone: sForm.phone, email: sForm.email,
          address: sForm.address, notes: sForm.notes,
        }).eq("id", editSupplierId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          store_id: storeId!, user_id: userId!, name: sForm.name,
          phone: sForm.phone, email: sForm.email, address: sForm.address, notes: sForm.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplierDialog(false);
      resetSupplierForm();
      toast.success(editSupplierId ? "Supplier updated" : "Supplier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (selectedSupplier) setSelectedSupplier(null);
      toast.success("Supplier removed");
    },
  });

  const createPurchase = useMutation({
    mutationFn: async () => {
      const itemsWithCalc = purchaseItems.filter(i => i.product_name && Number(i.unit_cost) > 0);
      const calcTotal = itemsWithCalc.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
      const total = Number(pForm.total_amount) || calcTotal;
      const paid = Number(pForm.paid_amount) || 0;
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";

      const { data: insertedPurchase, error } = await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: pForm.supplier_id || null,
        total_amount: total, paid_amount: paid,
        payment_status: status, payment_method: pForm.payment_method,
        notes: pForm.notes || itemsWithCalc.map(i => `${i.product_name} x${i.quantity}`).join(", "),
      }).select().single();
      if (error) throw error;

      if (pForm.supplier_id && total > paid) {
        const due = total - paid;
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", pForm.supplier_id).single();
        if (sup) {
          await supabase.from("suppliers").update({ balance_due: Number(sup.balance_due) + due }).eq("id", pForm.supplier_id);
        }
      }

      for (const item of itemsWithCalc) {
        const matchedProduct = products.find((p: any) => p.name.toLowerCase() === item.product_name.toLowerCase());
        if (matchedProduct) {
          const newQty = Number(matchedProduct.stock || 0) + Number(item.quantity);
          await supabase.from("products").update({ stock: newQty }).eq("id", matchedProduct.id);
        }
        // Log stock movement (always — even when product isn't matched, for audit trail)
        await supabase.from("stock_movements").insert({
          store_id: storeId!, user_id: userId!,
          product_id: matchedProduct?.id || null,
          product_name: item.product_name,
          type: "in",
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          reference_type: "purchase",
          reference_id: insertedPurchase?.id || null,
          notes: pForm.notes || null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products-list"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      setPurchaseDialog(false);
      resetPurchaseForm();
      toast.success("Purchase recorded & stock updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");

      if (payTarget === "supplier") {
        const newDue = Math.max(0, Number(payDialog.balance_due) - amount);
        await supabase.from("suppliers").update({ balance_due: newDue }).eq("id", payDialog.id);
        await supabase.from("purchases").insert({
          store_id: storeId!, user_id: userId!,
          supplier_id: payDialog.id, total_amount: 0, paid_amount: amount,
          payment_status: "paid", payment_method: payMethod,
          notes: `Due payment to ${payDialog.name}`,
        });
      } else {
        const due = Number(payDialog.total_amount) - Number(payDialog.paid_amount);
        const newPaid = Number(payDialog.paid_amount) + Math.min(amount, due);
        const newStatus = newPaid >= Number(payDialog.total_amount) ? "paid" : "partial";
        await supabase.from("purchases").update({ paid_amount: newPaid, payment_status: newStatus, payment_method: payMethod }).eq("id", payDialog.id);
        if (payDialog.supplier_id) {
          const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", payDialog.supplier_id).single();
          if (sup) {
            await supabase.from("suppliers").update({ balance_due: Math.max(0, Number(sup.balance_due) - Math.min(amount, due)) }).eq("id", payDialog.supplier_id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createReturn = useMutation({
    mutationFn: async () => {
      if (!returnDialog) throw new Error("No purchase selected");
      const items = returnItems.filter(i => i.product_name && Number(i.quantity) > 0);
      if (items.length === 0) throw new Error("Add at least one item to return");
      const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost || 0), 0);
      const refund = Number(returnForm.refund_amount) || 0;

      const { data: ins, error } = await supabase.from("purchase_returns").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: returnDialog.supplier_id || null,
        purchase_id: returnDialog.id,
        total_amount: total,
        refund_amount: refund,
        payment_method: returnForm.payment_method,
        notes: returnForm.notes || null,
        items: items.map(i => ({ product_name: i.product_name, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost || 0) })),
      }).select().single();
      if (error) throw error;

      // Reduce stock and log movements
      for (const it of items) {
        const matched = products.find((p: any) => p.name.toLowerCase() === it.product_name.toLowerCase());
        if (matched) {
          const newQty = Math.max(0, Number(matched.stock || 0) - Number(it.quantity));
          await supabase.from("products").update({ stock: newQty }).eq("id", matched.id);
        }
        await supabase.from("stock_movements").insert({
          store_id: storeId!, user_id: userId!,
          product_id: matched?.id || null,
          product_name: it.product_name,
          type: "return",
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost || 0),
          reference_type: "return",
          reference_id: ins?.id || null,
          notes: returnForm.notes || null,
        });
      }

      // Reduce supplier balance by refund (money coming back)
      if (returnDialog.supplier_id && refund > 0) {
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", returnDialog.supplier_id).single();
        if (sup) {
          await supabase.from("suppliers").update({ balance_due: Math.max(0, Number(sup.balance_due) - refund) }).eq("id", returnDialog.supplier_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["products-list"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setReturnDialog(null);
      setReturnItems([]);
      setReturnForm({ refund_amount: "", payment_method: "cash", notes: "" });
      toast.success("Return recorded & stock adjusted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkImport = useMutation({
    mutationFn: async () => {
      if (!importDialog || importRows.length === 0) throw new Error("Nothing to import");
      setImportBusy(true);
      if (importDialog === "suppliers") {
        const rows = importRows
          .filter(r => r.name)
          .map(r => ({
            store_id: storeId!, user_id: userId!,
            name: String(r.name), phone: r.phone || null, email: r.email || null,
            address: r.address || null, notes: r.notes || null,
          }));
        const { error } = await supabase.from("suppliers").insert(rows);
        if (error) throw error;
        return rows.length;
      } else {
        // group purchase rows by supplier_name + date to one purchase
        const groups: Record<string, any[]> = {};
        importRows.forEach(r => {
          const key = `${r.supplier_name || "__"}|${r.date || ""}|${r.total_amount || ""}`;
          (groups[key] ||= []).push(r);
        });
        let count = 0;
        for (const group of Object.values(groups)) {
          const first = group[0];
          const supplier = suppliers.find((s: any) => s.name.toLowerCase() === String(first.supplier_name || "").toLowerCase());
          const itemsTotalC = group.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_cost || 0), 0);
          const total = Number(first.total_amount) || itemsTotalC;
          const paid = Number(first.paid_amount) || 0;
          const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
          const { data: pIns } = await supabase.from("purchases").insert({
            store_id: storeId!, user_id: userId!,
            supplier_id: supplier?.id || null,
            total_amount: total, paid_amount: paid,
            payment_status: status,
            payment_method: first.payment_method || "cash",
            notes: first.notes || group.map(r => `${r.product_name} x${r.quantity}`).join(", "),
          }).select().single();
          for (const r of group) {
            if (!r.product_name) continue;
            const matched = products.find((p: any) => p.name.toLowerCase() === String(r.product_name).toLowerCase());
            if (matched) {
              const newQty = Number(matched.stock || 0) + Number(r.quantity || 0);
              await supabase.from("products").update({ stock: newQty }).eq("id", matched.id);
            }
            await supabase.from("stock_movements").insert({
              store_id: storeId!, user_id: userId!,
              product_id: matched?.id || null,
              product_name: String(r.product_name),
              type: "in",
              quantity: Number(r.quantity || 0),
              unit_cost: Number(r.unit_cost || 0),
              reference_type: "purchase",
              reference_id: pIns?.id || null,
              notes: "Bulk import",
            });
          }
          count++;
        }
        return count;
      }
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products-list"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      setImportDialog(null);
      setImportRows([]);
      toast.success(`Imported ${n} record(s)`);
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setImportBusy(false),
  });

  // --- Helpers ---
  const resetSupplierForm = () => { setSForm({ name: "", phone: "", email: "", address: "", notes: "" }); setEditSupplierId(null); };
  const resetPurchaseForm = () => {
    setPForm({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
    setPurchaseItems([{ product_name: "", quantity: "1", unit_cost: "" }]);
  };

  const openEditSupplier = (s: any) => {
    setSForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setEditSupplierId(s.id);
    setSupplierDialog(true);
  };

  const addPurchaseItem = () => setPurchaseItems(prev => [...prev, { product_name: "", quantity: "1", unit_cost: "" }]);
  const removePurchaseItem = (idx: number) => setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  const updatePurchaseItem = (idx: number, field: string, value: string) => {
    setPurchaseItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const itemsTotal = useMemo(() =>
    purchaseItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0),
    [purchaseItems]
  );

  useEffect(() => {
    if (itemsTotal > 0) setPForm(p => ({ ...p, total_amount: String(itemsTotal) }));
  }, [itemsTotal]);

  // --- Filtered data ---
  const filteredSuppliers = suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || s.phone?.includes(supplierSearch)
  );

  const filteredPurchases = useMemo(() => {
    const now = Date.now();
    const ranges: Record<string, number> = { today: 1, "7d": 7, "30d": 30 };
    const days = ranges[dateRange];
    return purchases.filter((p: any) => {
      const matchSearch = p.suppliers?.name?.toLowerCase().includes(purchaseSearch.toLowerCase()) || p.notes?.toLowerCase().includes(purchaseSearch.toLowerCase());
      const matchStatus = statusFilter === "all" || p.payment_status === statusFilter;
      const matchSupplier = !selectedSupplier || p.supplier_id === selectedSupplier.id;
      const matchDate = !days || (now - new Date(p.purchase_date).getTime()) <= days * 86400000;
      return matchSearch && matchStatus && matchSupplier && matchDate;
    });
  }, [purchases, purchaseSearch, statusFilter, selectedSupplier, dateRange]);

  const purchasesPagination = usePagination(filteredPurchases.length, {
    storageKey: `pg:inventory-purchases:${storeId ?? "none"}`,
    filterSignature: JSON.stringify({ purchaseSearch, statusFilter, dateRange, sup: selectedSupplier?.id ?? null }),
  });
  const pagedPurchases = useMemo(
    () => paginate(filteredPurchases, purchasesPagination.page, purchasesPagination.pageSize),
    [filteredPurchases, purchasesPagination.page, purchasesPagination.pageSize],
  );

  // --- Analytics ---
  const totalDue = suppliers.reduce((s: number, sup: any) => s + Number(sup.balance_due || 0), 0);
  const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
  const totalPaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount), 0);
  const lowStockCount = products.filter((p: any) => Number(p.stock) > 0 && Number(p.stock) <= 5).length;
  const outOfStockCount = products.filter((p: any) => Number(p.stock) <= 0).length;
  const dueSuppliers = useMemo(() => suppliers.filter((s: any) => Number(s.balance_due) > 0).sort((a: any, b: any) => Number(b.balance_due) - Number(a.balance_due)).slice(0, 5), [suppliers]);
  const topSuppliers = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    purchases.forEach((p: any) => {
      if (p.supplier_id && p.suppliers?.name) {
        if (!map[p.supplier_id]) map[p.supplier_id] = { name: p.suppliers.name, total: 0 };
        map[p.supplier_id].total += Number(p.total_amount);
      }
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [purchases]);

  const exportCSV = () => {
    const header = "Date,Supplier,Total,Paid,Due,Status,Method,Notes\n";
    const rows = filteredPurchases.map((p: any) =>
      `"${formatDate(new Date(p.purchase_date), "dd MMM yyyy")}","${p.suppliers?.name || ""}",${p.total_amount},${p.paid_amount},${Math.max(0, p.total_amount - p.paid_amount)},"${p.payment_status}","${p.payment_method}","${p.notes || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "inventory-purchases.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- CSV import helpers ----
  const parseCSV = (text: string): any[] => {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const split = (line: string) => {
      const out: string[] = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { q = !q; continue; }
        if (c === "," && !q) { out.push(cur); cur = ""; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const headers = split(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map(line => {
      const cells = split(line);
      const obj: any = {};
      headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
      return obj;
    });
  };

  const downloadTemplate = (kind: "suppliers" | "purchases") => {
    const content = kind === "suppliers"
      ? "name,phone,email,address,notes\nABC Trading,01700000000,info@abc.com,Dhaka,Trusted vendor\n"
      : "supplier_name,date,total_amount,paid_amount,payment_method,product_name,quantity,unit_cost,notes\nABC Trading,2026-06-17,1000,500,cash,Rice 5kg,10,100,Monthly stock\n";
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (f: File) => {
    const text = await f.text();
    setImportRows(parseCSV(text));
  };

  // ---- Reorder suggestions ----
  type ReorderSuggestion = { product: any; velocity30d: number; suggestedQty: number; lastSupplier?: any; lastUnitCost?: number };
  const reorderSuggestions: ReorderSuggestion[] = useMemo(() => {
    const lowOrOut = (products as any[]).filter(p => Number(p.stock || 0) <= 5);
    return lowOrOut.map(p => {
      const v = Number((salesVelocity as any)[p.id] || 0);
      const dailyVelocity = v / 30;
      const target = Math.max(10, Math.ceil(dailyVelocity * 14));
      const suggestedQty = Math.max(1, target - Number(p.stock || 0));
      // find last supplier from purchases via stock_movements
      const lastMv = (stockMovements as any[]).find(m => m.product_id === p.id && m.type === "in");
      const lastSupplier = lastMv
        ? suppliers.find((s: any) => purchases.some((pu: any) => pu.id === lastMv.reference_id && pu.supplier_id === s.id))
        : null;
      return { product: p, velocity30d: v, suggestedQty, lastSupplier, lastUnitCost: lastMv ? Number(lastMv.unit_cost) : undefined };
    }).sort((a, b) => b.velocity30d - a.velocity30d);
  }, [products, salesVelocity, stockMovements, suppliers, purchases]);

  const startReorderPurchase = (s: ReorderSuggestion) => {
    resetPurchaseForm();
    setPForm(p => ({
      ...p,
      supplier_id: s.lastSupplier?.id || "",
    }));
    setPurchaseItems([{
      product_name: s.product.name,
      quantity: String(s.suggestedQty),
      unit_cost: s.lastUnitCost ? String(s.lastUnitCost) : "",
    }]);
    setPurchaseDialog(true);
  };

  const openReturnDialog = (p: any) => {
    setReturnDialog(p);
    setReturnItems([{ product_name: "", quantity: "1", unit_cost: "" }]);
    setReturnForm({ refund_amount: "", payment_method: p.payment_method || "cash", notes: "" });
  };

  // movement filter
  const filteredMovements = useMemo(() => {
    if (movementFilter === "all") return stockMovements as any[];
    return (stockMovements as any[]).filter(m => m.type === movementFilter);
  }, [stockMovements, movementFilter]);

  const exportMovementsCSV = () => {
    const header = "Date,Product,Type,Quantity,Unit Cost,Value,Reference,Notes\n";
    const rows = filteredMovements.map(m =>
      `"${formatDate(new Date(m.created_at), "dd MMM yyyy HH:mm")}","${m.product_name}","${m.type}",${m.quantity},${m.unit_cost},${Number(m.quantity) * Number(m.unit_cost)},"${m.reference_type || ""}","${m.notes || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stock-movements.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Stat card — Precision Aviator glass style
  const StatCard = ({ icon: Icon, label, value, tint = "primary", subtle }: any) => (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-2.5 sm:p-3.5 shadow-sm hover:shadow-md transition-all">
      <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full bg-${tint}/10 blur-2xl`} />
      <div className="relative flex items-center gap-2 sm:gap-2.5">
        <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-${tint}/10 ring-1 ring-${tint}/20 flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 text-${tint}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-base sm:text-lg font-bold truncate ${subtle ? `text-${tint}` : ""}`}>{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4">
        {/* Premium Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 sm:pb-5 mb-1 sm:mb-2 border-b border-border/60">
          <div className="hidden sm:block">
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                <Boxes className="h-4 w-4 text-primary" />
              </span>
              Inventory Management
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Suppliers, purchases & stock sync</p>
          </div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Guide">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Inventory Guide
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-5 space-y-4 text-sm">
                  {[
                    { t: "1. Add Suppliers", d: "ক্লিক 'Supplier' বাটন → name/phone/email দিন → Save। এরা আপনার পণ্য সরবরাহকারী।" },
                    { t: "2. Record a Purchase", d: "'Purchase' বাটন থেকে supplier select করুন, item add করুন (qty + unit cost)। Total auto-calculate হবে।" },
                    { t: "3. Auto Stock Sync", d: "Purchase item-এর product name যদি Products-এর সাথে match করে, তাহলে stock automatically বেড়ে যাবে।" },
                    { t: "4. Track Due Payments", d: "Partial/unpaid purchases supplier-এর balance due তে যোগ হবে। সরাসরি 'Pay' বাটন থেকে settle করুন।" },
                    { t: "5. WhatsApp Reminders", d: "Supplier card hover করে WhatsApp icon চাপলে due reminder message তৈরি হবে।" },
                    { t: "6. Filter & Export", d: "Date range / status / supplier filter ব্যবহার করুন। CSV-তে export করে accountant-কে পাঠান।" },
                  ].map((s, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-card/50 p-3">
                      <p className="font-semibold text-sm">{s.t}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.d}</p>
                    </div>
                  ))}
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <p className="text-xs font-medium text-primary">💡 Pro Tip</p>
                    <p className="text-xs text-muted-foreground mt-1">Low stock items সরাসরি right panel থেকে দেখা যায় — quick reorder action নিতে পারেন।</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="outline" size="sm" onClick={exportCSV} className="flex-1 sm:flex-initial h-9">
              <FileDown className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 sm:flex-initial h-9">
                  <Upload className="h-3.5 w-3.5 mr-1" /> Import <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => { setImportDialog("suppliers"); setImportRows([]); }}>
                  <Users className="h-3.5 w-3.5 mr-2" /> Suppliers (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setImportDialog("purchases"); setImportRows([]); }}>
                  <ShoppingBag className="h-3.5 w-3.5 mr-2" /> Purchases (CSV)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => downloadTemplate("suppliers")}>
                  <FileDown className="h-3.5 w-3.5 mr-2" /> Suppliers template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadTemplate("purchases")}>
                  <FileDown className="h-3.5 w-3.5 mr-2" /> Purchases template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => { resetSupplierForm(); setSupplierDialog(true); }} className="flex-1 sm:flex-initial h-9">
              <Plus className="h-3.5 w-3.5 mr-1" /> Supplier
            </Button>
            <Button size="sm" onClick={() => { resetPurchaseForm(); setPurchaseDialog(true); }} className="flex-1 sm:flex-initial h-9 bg-gradient-to-br from-primary to-primary/85 shadow-md">
              <Plus className="h-3.5 w-3.5 mr-1" /> Purchase
            </Button>
          </div>
        </div>

        {/* Glass Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard icon={Users} label="Suppliers" value={suppliers.length} tint="primary" />
          <StatCard icon={ShoppingBag} label="Purchases" value={format(totalPurchases)} tint="blue-500" />
          <StatCard icon={TrendingUp} label="Paid" value={format(totalPaid)} tint="green-500" subtle />
          <StatCard icon={DollarSign} label="Due" value={format(totalDue)} tint="destructive" subtle />
          <StatCard icon={AlertTriangle} label="Low Stock" value={lowStockCount} tint="amber-500" />
          <StatCard icon={Package} label="Out" value={outOfStockCount} tint="destructive" />
        </div>

        {/* Main Split Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
          {/* Left: Suppliers */}
          <Card className="lg:col-span-4 border-border/60 bg-gradient-to-br from-card to-card/60 self-start">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-primary" /> Suppliers
                  <Badge variant="secondary" className="text-[10px] ml-1">{suppliers.length}</Badge>
                </CardTitle>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="Search supplier..." className="pl-8 h-8 text-xs" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-1 p-2 pr-2.5">
                  <button
                    onClick={() => setSelectedSupplier(null)}
                    className={`w-full text-left rounded-lg p-2.5 transition-all text-xs ${!selectedSupplier ? "bg-primary/10 border border-primary/20" : "hover:bg-accent border border-transparent"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">All Suppliers</span>
                      <Badge variant="outline" className="text-[10px]">{purchases.length} orders</Badge>
                    </div>
                  </button>

                  {loadingSuppliers ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">Loading...</p>
                  ) : filteredSuppliers.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">No suppliers</p>
                  ) : filteredSuppliers.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSupplier(s)}
                      className={`w-full text-left rounded-lg p-2.5 transition-all group border ${
                        selectedSupplier?.id === s.id
                          ? "bg-primary/10 border-primary/30 shadow-sm"
                          : "border-transparent hover:bg-accent hover:border-border/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0">
                          <Truck className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium truncate">{s.name}</p>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            {s.phone && <p className="text-[10px] text-muted-foreground truncate">{s.phone}</p>}
                            <Badge variant={Number(s.balance_due) > 0 ? "destructive" : "secondary"} className="text-[10px] h-4">
                              {format(Number(s.balance_due || 0))}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); openEditSupplier(s); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        {Number(s.balance_due) > 0 && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); setPayTarget("supplier"); setPayDialog(s); setPayAmount(""); }}>
                            <Receipt className="h-3 w-3" /> Pay
                          </Button>
                        )}
                        {s.phone && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => {
                            e.stopPropagation();
                            const phone = s.phone?.replace(/[^0-9]/g, "") || "";
                            const text = `Hello ${s.name}, your outstanding balance is ${format(Number(s.balance_due))}. Please confirm the payment schedule.`;
                            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
                          }}>
                            <MessageCircle className="h-3 w-3 text-green-600" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); deleteSupplier.mutate(s.id); }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right: Purchases */}
          <div className="lg:col-span-8 space-y-3">
            {/* Selected supplier banner */}
            {selectedSupplier && (
              <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                      <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{selectedSupplier.name}</p>
                      <div className="flex items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground">
                        {selectedSupplier.phone && <span className="flex items-center gap-0.5 truncate"><Phone className="h-3 w-3" />{selectedSupplier.phone}</span>}
                        {selectedSupplier.email && <span className="hidden sm:flex items-center gap-0.5 truncate"><Mail className="h-3 w-3" />{selectedSupplier.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={Number(selectedSupplier.balance_due) > 0 ? "destructive" : "default"} className="text-xs">
                      Due: {format(Number(selectedSupplier.balance_due || 0))}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedSupplier(null)}>✕</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main feature tabs */}
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
              {[
                { id: "purchases", label: "Purchases", icon: ShoppingBag, count: purchases.length },
                { id: "movements", label: "Stock Movements", icon: ArrowDownUp, count: stockMovements.length },
                { id: "reorder", label: "Reorder", icon: Zap, count: reorderSuggestions.length, accent: reorderSuggestions.length > 0 },
                { id: "returns", label: "Returns", icon: RotateCcw, count: purchaseReturns.length },
              ].map((t: any) => {
                const Icon = t.icon;
                const active = mainTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setMainTab(t.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : t.accent
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                          : "border-border/60 bg-card hover:border-primary/40 hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                    <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{t.count}</span>
                  </button>
                );
              })}
            </div>

            {mainTab === "purchases" && (<>
            {/* Filters — horizontal scroll on mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={purchaseSearch} onChange={e => setPurchaseSearch(e.target.value)} placeholder="Search purchases..." className="pl-8 h-9 text-xs" />
              </div>
              <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                <SelectTrigger className="h-9 text-xs w-auto min-w-[100px] shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="shrink-0">
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs h-7 px-2">All</TabsTrigger>
                  <TabsTrigger value="paid" className="text-xs h-7 px-2">Paid</TabsTrigger>
                  <TabsTrigger value="partial" className="text-xs h-7 px-2">Partial</TabsTrigger>
                  <TabsTrigger value="unpaid" className="text-xs h-7 px-2">Unpaid</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Due reminders strip */}
            {dueSuppliers.length > 0 && !selectedSupplier && (
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <p className="text-xs font-semibold">Pending Dues</p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {dueSuppliers.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => { setPayTarget("supplier"); setPayDialog(s); setPayAmount(""); }}
                      className="shrink-0 rounded-lg bg-card border border-border/60 px-2.5 py-1.5 text-left hover:border-primary/40 transition-all"
                    >
                      <p className="text-[10px] font-medium truncate max-w-[100px]">{s.name}</p>
                      <p className="text-xs font-bold text-destructive">{format(Number(s.balance_due))}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Purchases Table */}
            <Card className="border-border/60">
              <CardContent className="p-0">
                {/* Mobile */}
                <div className="md:hidden space-y-2 p-3">
                  {loadingPurchases ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">Loading...</p>
                  ) : filteredPurchases.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">No purchases found</p>
                  ) : pagedPurchases.map((p: any) => {
                    const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                    return (
                      <div key={p.id} className="border border-border/60 rounded-lg p-2.5 space-y-1.5 bg-card">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <p className="font-medium text-xs truncate">{p.suppliers?.name || "Unknown"}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</p>
                          </div>
                          <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                            {p.payment_status}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Total: <strong>{format(Number(p.total_amount))}</strong></span>
                          <span>Paid: <strong className="text-green-600">{format(Number(p.paid_amount))}</strong></span>
                          {due > 0 && <span>Due: <strong className="text-destructive">{format(due)}</strong></span>}
                        </div>
                        <div className="flex gap-1.5">
                          {due > 0 && (
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => { setPayTarget("purchase"); setPayDialog(p); setPayAmount(""); }}>
                              <Receipt className="h-3 w-3 mr-1" /> Pay {format(due)}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailDialog(p)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Paid</TableHead>
                        <TableHead className="text-xs">Due</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPurchases ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">Loading...</TableCell></TableRow>
                      ) : filteredPurchases.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">No purchases found</TableCell></TableRow>
                      ) : pagedPurchases.map((p: any) => {
                        const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs font-medium">{p.suppliers?.name || "—"}</TableCell>
                            <TableCell className="text-xs">{format(Number(p.total_amount))}</TableCell>
                            <TableCell className="text-xs text-green-600">{format(Number(p.paid_amount))}</TableCell>
                            <TableCell className="text-xs">{due > 0 ? <span className="text-destructive font-medium">{format(due)}</span> : "—"}</TableCell>
                            <TableCell>
                              <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                                {p.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {due > 0 && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPayTarget("purchase"); setPayDialog(p); setPayAmount(""); }}>
                                  <Receipt className="h-3 w-3 mr-1" /> Pay
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => openReturnDialog(p)} title="Return items">
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailDialog(p)}><Eye className="h-3 w-3" /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            {filteredPurchases.length > 0 && (
              <DataPagination
                page={purchasesPagination.page}
                pageSize={purchasesPagination.pageSize}
                total={filteredPurchases.length}
                onPageChange={purchasesPagination.setPage}
                onPageSizeChange={purchasesPagination.setPageSize}
                itemLabel="purchases"
                className="px-3"
              />
            )}

            {/* Top suppliers leaderboard */}
            {topSuppliers.length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" /> Top Suppliers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-1.5">
                  {topSuppliers.map((t: any, i: number) => {
                    const max = topSuppliers[0].total || 1;
                    const pct = (t.total / max) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium truncate">{i + 1}. {t.name}</span>
                          <span className="text-muted-foreground">{format(t.total)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
            </>)}

            {/* ─── Stock Movements tab ─── */}
            {mainTab === "movements" && (
              <Card className="border-border/60">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <ArrowDownUp className="h-4 w-4 text-primary" /> Stock Movements
                    <Badge variant="secondary" className="text-[10px] ml-1">{filteredMovements.length}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Select value={movementFilter} onValueChange={(v: any) => setMovementFilter(v)}>
                      <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="in">Stock In</SelectItem>
                        <SelectItem value="out">Stock Out</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                        <SelectItem value="adjust">Adjust</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportMovementsCSV}>
                      <FileDown className="h-3 w-3 mr-1" /> Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredMovements.length === 0 ? (
                    <p className="text-center py-8 text-xs text-muted-foreground">No stock movements yet. Create a purchase to log entries.</p>
                  ) : (
                    <>
                      <div className="md:hidden space-y-2 p-3">
                        {filteredMovements.slice(0, 50).map((m: any) => (
                          <div key={m.id} className="border border-border/60 rounded-lg p-2.5 bg-card">
                            <div className="flex justify-between items-start mb-1">
                              <div>
                                <p className="text-xs font-medium truncate">{m.product_name}</p>
                                <p className="text-[10px] text-muted-foreground">{formatDate(new Date(m.created_at), "dd MMM yyyy HH:mm")}</p>
                              </div>
                              <Badge variant={m.type === "in" ? "default" : m.type === "return" || m.type === "out" ? "destructive" : "secondary"} className="text-[10px] uppercase">{m.type}</Badge>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span>Qty: <strong>{m.quantity}</strong></span>
                              <span>Unit: {format(Number(m.unit_cost))}</span>
                              <span>Value: <strong>{format(Number(m.quantity) * Number(m.unit_cost))}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden md:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">Type</TableHead>
                              <TableHead className="text-xs text-right">Qty</TableHead>
                              <TableHead className="text-xs text-right">Unit Cost</TableHead>
                              <TableHead className="text-xs text-right">Value</TableHead>
                              <TableHead className="text-xs">Reference</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredMovements.slice(0, 100).map((m: any) => (
                              <TableRow key={m.id}>
                                <TableCell className="text-xs">{formatDate(new Date(m.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                                <TableCell className="text-xs font-medium">{m.product_name}</TableCell>
                                <TableCell>
                                  <Badge variant={m.type === "in" ? "default" : m.type === "return" || m.type === "out" ? "destructive" : "secondary"} className="text-[10px] uppercase">{m.type}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right">{m.quantity}</TableCell>
                                <TableCell className="text-xs text-right">{format(Number(m.unit_cost))}</TableCell>
                                <TableCell className="text-xs text-right font-medium">{format(Number(m.quantity) * Number(m.unit_cost))}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground capitalize">{m.reference_type || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── Reorder tab ─── */}
            {mainTab === "reorder" && (
              <Card className="border-border/60">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" /> Smart Reorder Suggestions
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Based on 30-day sales velocity & current stock. Low/out-of-stock products only.</p>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {reorderSuggestions.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">All products are well-stocked. Nothing to reorder. 🎉</p>
                  ) : (
                    <div className="space-y-2">
                      {reorderSuggestions.map((s) => {
                        const out = Number(s.product.stock || 0) <= 0;
                        return (
                          <div key={s.product.id} className={`rounded-lg border p-2.5 flex items-center gap-2 ${out ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${out ? "bg-destructive/10" : "bg-amber-500/15"}`}>
                              <Package className={`h-4 w-4 ${out ? "text-destructive" : "text-amber-600"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{s.product.name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span>Stock: <strong className={out ? "text-destructive" : ""}>{s.product.stock || 0}</strong></span>
                                <span>•</span>
                                <span>30d sold: <strong>{s.velocity30d}</strong></span>
                                {s.lastSupplier && <><span>•</span><span className="truncate">Last: {s.lastSupplier.name}</span></>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-foreground">Suggested</p>
                              <p className="text-sm font-bold">{s.suggestedQty}</p>
                            </div>
                            <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => startReorderPurchase(s)}>
                              <Plus className="h-3 w-3 mr-1" /> Order
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── Returns tab ─── */}
            {mainTab === "returns" && (
              <Card className="border-border/60">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4 text-primary" /> Purchase Returns
                    <Badge variant="secondary" className="text-[10px] ml-1">{purchaseReturns.length}</Badge>
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Return items back to supplier. Use "Return" on any purchase row to record.</p>
                </CardHeader>
                <CardContent className="p-0">
                  {purchaseReturns.length === 0 ? (
                    <p className="text-center py-8 text-xs text-muted-foreground">No returns recorded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Items</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs text-right">Refund</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseReturns.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{formatDate(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs font-medium">{r.suppliers?.name || "—"}</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">
                              {Array.isArray(r.items) ? r.items.map((it: any) => `${it.product_name} ×${it.quantity}`).join(", ") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right">{format(Number(r.total_amount))}</TableCell>
                            <TableCell className="text-xs text-right text-green-600">{format(Number(r.refund_amount))}</TableCell>
                            <TableCell className="text-xs capitalize">{r.payment_method}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* ─── Supplier Dialog ─── */}
      <Dialog open={supplierDialog} onOpenChange={(v) => { setSupplierDialog(v); if (!v) resetSupplierForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editSupplierId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={sForm.name} onChange={e => setSForm(p => ({ ...p, name: e.target.value }))} placeholder="Supplier name" className="h-9 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Phone</Label><Input value={sForm.phone} onChange={e => setSForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="h-9 text-sm" /></div>
              <div><Label className="text-xs">Email</Label><Input value={sForm.email} onChange={e => setSForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="h-9 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Address</Label><Input value={sForm.address} onChange={e => setSForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea value={sForm.notes} onChange={e => setSForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className="text-sm" /></div>
            <Button onClick={() => saveSupplier.mutate()} disabled={!sForm.name || saveSupplier.isPending} className="w-full h-9 text-sm">
              {saveSupplier.isPending ? "Saving..." : editSupplierId ? "Update" : "Add Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Purchase Dialog ─── */}
      <Dialog open={purchaseDialog} onOpenChange={(v) => { setPurchaseDialog(v); if (!v) resetPurchaseForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto overflow-x-hidden px-1 py-1">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={pForm.supplier_id} onValueChange={v => setPForm(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Items</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={addPurchaseItem}><Plus className="h-3 w-3 mr-0.5" /> Add Item</Button>
              </div>
              {purchaseItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-5">
                    {idx === 0 && <Label className="text-[10px]">Product</Label>}
                    <Input value={item.product_name} onChange={e => updatePurchaseItem(idx, "product_name", e.target.value)}
                      placeholder="Product name" className="h-8 text-xs" list="product-suggestions" />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-[10px]">Qty</Label>}
                    <Input type="number" value={item.quantity} onChange={e => updatePurchaseItem(idx, "quantity", e.target.value)}
                      className="h-8 text-xs" />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-[10px]">Unit Cost</Label>}
                    <Input type="number" value={item.unit_cost} onChange={e => updatePurchaseItem(idx, "unit_cost", e.target.value)}
                      placeholder="Cost" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-[10px] font-medium truncate">{format(Number(item.quantity || 0) * Number(item.unit_cost || 0))}</span>
                    {purchaseItems.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removePurchaseItem(idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <datalist id="product-suggestions">
                {products.map((p: any) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Total Amount *</Label><Input type="number" value={pForm.total_amount} onChange={e => setPForm(p => ({ ...p, total_amount: e.target.value }))} className="h-9 text-sm" /></div>
              <div><Label className="text-xs">Paid Amount</Label><Input type="number" value={pForm.paid_amount} onChange={e => setPForm(p => ({ ...p, paid_amount: e.target.value }))} className="h-9 text-sm" /></div>
            </div>
            {pForm.total_amount && (
              <div className="rounded-lg bg-muted/50 p-2 text-xs">
                Due: <span className="font-bold text-destructive">{format(Math.max(0, Number(pForm.total_amount) - Number(pForm.paid_amount)))}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={pForm.payment_method} onValueChange={v => setPForm(p => ({ ...p, payment_method: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Notes</Label><Input value={pForm.notes} onChange={e => setPForm(p => ({ ...p, notes: e.target.value }))} placeholder="Purchase description" className="h-9 text-sm" /></div>
            <Button onClick={() => createPurchase.mutate()} disabled={!pForm.total_amount || createPurchase.isPending} className="w-full h-9 text-sm">
              {createPurchase.isPending ? "Saving..." : "Record Purchase"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Pay Dialog ─── */}
      <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment — {payTarget === "supplier" ? payDialog?.name : payDialog?.suppliers?.name || "Unknown"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
              {payTarget === "supplier" ? (
                <div className="flex justify-between text-xs"><span>Outstanding Due</span><span className="font-bold text-destructive">{format(Number(payDialog?.balance_due || 0))}</span></div>
              ) : (
                <>
                  <div className="flex justify-between text-xs"><span>Total</span><span className="font-bold">{format(Number(payDialog?.total_amount || 0))}</span></div>
                  <div className="flex justify-between text-xs"><span>Already Paid</span><span className="text-green-600">{format(Number(payDialog?.paid_amount || 0))}</span></div>
                  <div className="flex justify-between text-xs"><span>Remaining</span><span className="font-bold text-destructive">{format(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)))}</span></div>
                </>
              )}
            </div>
            <div><Label className="text-xs">Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="h-9 text-sm" /></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                const max = payTarget === "supplier" ? Number(payDialog?.balance_due || 0) : Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0));
                setPayAmount(String(max));
              }}>Full Amount</Button>
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => payMutation.mutate()} disabled={!payAmount || payMutation.isPending} className="w-full h-9 text-sm">
              {payMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={!!detailDialog} onOpenChange={v => { if (!v) setDetailDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {detailDialog && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{detailDialog.suppliers?.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(new Date(detailDialog.purchase_date), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{format(Number(detailDialog.total_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-600">{format(Number(detailDialog.paid_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="text-destructive">{format(Math.max(0, Number(detailDialog.total_amount) - Number(detailDialog.paid_amount)))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={detailDialog.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{detailDialog.payment_status}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{detailDialog.payment_method}</span></div>
              {detailDialog.notes && <div><span className="text-muted-foreground">Notes: </span>{detailDialog.notes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Return Dialog ─── */}
      <Dialog open={!!returnDialog} onOpenChange={v => { if (!v) { setReturnDialog(null); setReturnItems([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Return to Supplier — {returnDialog?.suppliers?.name || "Unknown"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto overflow-x-hidden px-1 py-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Items being returned</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setReturnItems(prev => [...prev, { product_name: "", quantity: "1", unit_cost: "" }])}>
                  <Plus className="h-3 w-3 mr-0.5" /> Add Item
                </Button>
              </div>
              {returnItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-6">
                    {idx === 0 && <Label className="text-[10px]">Product</Label>}
                    <Input value={item.product_name} list="product-suggestions" placeholder="Product name" className="h-8 text-xs"
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: e.target.value } : it))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-[10px]">Qty</Label>}
                    <Input type="number" value={item.quantity} className="h-8 text-xs"
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-[10px]">Unit Cost</Label>}
                    <Input type="number" value={item.unit_cost} placeholder="Cost" className="h-8 text-xs"
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_cost: e.target.value } : it))} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {returnItems.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReturnItems(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 p-2 text-xs flex justify-between">
              <span>Return total</span>
              <span className="font-bold">{format(returnItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0))}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Refund Amount</Label>
                <Input type="number" value={returnForm.refund_amount} placeholder="Cash back from supplier" className="h-9 text-sm"
                  onChange={e => setReturnForm(f => ({ ...f, refund_amount: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Method</Label>
                <Select value={returnForm.payment_method} onValueChange={v => setReturnForm(f => ({ ...f, payment_method: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="adjust">Adjust against due</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={returnForm.notes} placeholder="Reason for return" className="h-9 text-sm"
                onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button onClick={() => createReturn.mutate()} disabled={createReturn.isPending} className="w-full h-9 text-sm">
              {createReturn.isPending ? "Recording..." : "Record Return"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Import Dialog ─── */}
      <Dialog open={!!importDialog} onOpenChange={v => { if (!v) { setImportDialog(null); setImportRows([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Bulk Import — {importDialog === "suppliers" ? "Suppliers" : "Purchases"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-xs">
              <p className="font-medium mb-1">CSV Format</p>
              {importDialog === "suppliers" ? (
                <code className="text-[10px] block">name, phone, email, address, notes</code>
              ) : (
                <code className="text-[10px] block">supplier_name, date, total_amount, paid_amount, payment_method, product_name, quantity, unit_cost, notes</code>
              )}
              <Button size="sm" variant="link" className="h-6 px-0 text-xs" onClick={() => downloadTemplate(importDialog!)}>
                <FileDown className="h-3 w-3 mr-1" /> Download template
              </Button>
            </div>
            <div>
              <Label className="text-xs">Choose CSV file</Label>
              <Input type="file" accept=".csv,text/csv" className="h-9 text-xs"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImportFile(f); }} />
            </div>
            {importRows.length > 0 && (
              <div className="border border-border/60 rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-3 py-1.5 text-xs font-medium flex justify-between">
                  <span>Preview — {importRows.length} row(s)</span>
                </div>
                <div className="max-h-[260px] overflow-auto">
                  <table className="w-full text-[10px]">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>{Object.keys(importRows[0]).map(k => <th key={k} className="px-2 py-1.5 text-left font-medium">{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-border/40">
                          {Object.keys(importRows[0]).map(k => <td key={k} className="px-2 py-1 truncate max-w-[120px]">{String(r[k] || "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Button onClick={() => bulkImport.mutate()} disabled={importRows.length === 0 || importBusy} className="w-full h-9 text-sm">
              {importBusy ? "Importing..." : `Import ${importRows.length} record(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Inventory;
