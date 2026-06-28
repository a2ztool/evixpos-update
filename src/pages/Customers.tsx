import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { customerSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import {
  Plus, Trash2, Pencil, Eye, Search, Upload, Users, Phone, CloudUpload, FileDown, Dna, Star,
  CreditCard, ShoppingBag, Sparkles, BookOpen, ChevronDown, TrendingUp, AlertTriangle, Crown,
  UserPlus, Heart, MessageCircle, Mail, Filter, X, Activity, Award,
} from "lucide-react";
import UsageWarningBanner from "@/components/UsageWarningBanner";
import CustomerDNAProfile from "@/components/CustomerDNAProfile";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tags: string;
  notes: string;
  created_at: string;
}

interface CustomerEnriched extends Customer {
  total_due: number;
  total_points: number;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

interface OrderHistory {
  id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

const emptyForm = { name: "", phone: "", email: "", address: "", tags: "", notes: "" };

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

type Segment = "all" | "vip" | "loyal" | "new" | "at-risk" | "due";

const Customers = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { limits } = useSubscription();
  const { format } = useCurrency();
  const [customers, setCustomers] = useState<CustomerEnriched[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const formValidation = useFormValidation(customerSchema);
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState("");
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [dnaCustomer, setDnaCustomer] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>("all");
  const [sortBy, setSortBy] = useState<"recent" | "spent" | "orders" | "due" | "name">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [topOpen, setTopOpen] = useState(true);

  const fetchCustomers = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("customers").select("*").eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (!data) return;

    const customerIds = data.map(c => c.id);

    const [loyaltyRes, ordersRes, duesRes] = await Promise.all([
      supabase.from("loyalty_points").select("customer_id, total_points, redeemed_points").eq("store_id", activeStore.id).in("customer_id", customerIds),
      supabase.from("orders").select("id, customer_id, total_amount, created_at").eq("store_id", activeStore.id).in("customer_id", customerIds),
      // Live dues: only count unpaid transactions whose order still exists for this store
      supabase.from("transactions")
        .select("order_id, amount, paid_amount, is_paid, type")
        .eq("store_id", activeStore.id)
        .eq("is_paid", false)
        .eq("type", "income"),
    ]);

    // Build order_id -> customer_id map (only for orders that still exist)
    const orderToCustomer = new Map<string, string>();
    (ordersRes.data || []).forEach((o: any) => {
      if (o.customer_id) orderToCustomer.set(o.id, o.customer_id);
    });

    const dueMap = new Map<string, number>();
    (duesRes.data || []).forEach((t: any) => {
      const cid = orderToCustomer.get(t.order_id);
      if (!cid) return; // order deleted → ignore
      const remaining = Math.max(0, Number(t.amount || 0) - Number(t.paid_amount || 0));
      if (remaining <= 0) return;
      dueMap.set(cid, (dueMap.get(cid) || 0) + remaining);
    });

    const pointsMap = new Map<string, number>();
    (loyaltyRes.data || []).forEach((l: any) => pointsMap.set(l.customer_id, Number(l.total_points) - Number(l.redeemed_points)));

    const orderCountMap = new Map<string, number>();
    const spentMap = new Map<string, number>();
    const lastOrderMap = new Map<string, string>();
    (ordersRes.data || []).forEach((o: any) => {
      orderCountMap.set(o.customer_id, (orderCountMap.get(o.customer_id) || 0) + 1);
      spentMap.set(o.customer_id, (spentMap.get(o.customer_id) || 0) + Number(o.total_amount || 0));
      const cur = lastOrderMap.get(o.customer_id);
      if (!cur || new Date(o.created_at) > new Date(cur)) lastOrderMap.set(o.customer_id, o.created_at);
    });

    const enriched: CustomerEnriched[] = (data as Customer[]).map(c => ({
      ...c,
      total_due: dueMap.get(c.id) || 0,
      total_points: pointsMap.get(c.id) || 0,
      order_count: orderCountMap.get(c.id) || 0,
      total_spent: spentMap.get(c.id) || 0,
      last_order_at: lastOrderMap.get(c.id) || null,
    }));
    setCustomers(enriched);
  };

  useEffect(() => {
    if (user && activeStore) fetchCustomers();
  }, [user, activeStore]);

  useRealtimeSync(
    `customers-rt-${activeStore?.id}`,
    [
      { table: "customers", filter: `store_id=eq.${activeStore?.id}` },
      { table: "customer_credits", filter: `store_id=eq.${activeStore?.id}` },
      { table: "loyalty_points", filter: `store_id=eq.${activeStore?.id}` },
      { table: "transactions", filter: `store_id=eq.${activeStore?.id}` },
      { table: "orders", filter: `store_id=eq.${activeStore?.id}` },
      { table: "due_payments", filter: `store_id=eq.${activeStore?.id}` },
    ],
    fetchCustomers,
    !!activeStore?.id && !!user
  );

  // ===== Segmentation logic =====
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const segmentOf = useCallback((c: CustomerEnriched): Segment[] => {
    const segs: Segment[] = [];
    const ageDays = (now - new Date(c.created_at).getTime()) / DAY;
    const lastDays = c.last_order_at ? (now - new Date(c.last_order_at).getTime()) / DAY : Infinity;

    if (c.total_spent >= 5000 || c.order_count >= 10) segs.push("vip");
    if (c.order_count >= 3 && lastDays <= 60) segs.push("loyal");
    if (ageDays <= 30) segs.push("new");
    if (c.order_count > 0 && lastDays > 60) segs.push("at-risk");
    if (c.total_due > 0) segs.push("due");
    return segs;
  }, [now]);

  // ===== Stats / Health =====
  const stats = useMemo(() => {
    const total = customers.length;
    const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);
    const totalDue = customers.reduce((s, c) => s + c.total_due, 0);
    const totalOrders = customers.reduce((s, c) => s + c.order_count, 0);
    const totalPoints = customers.reduce((s, c) => s + c.total_points, 0);
    const buyers = customers.filter(c => c.order_count > 0).length;
    const repeatBuyers = customers.filter(c => c.order_count >= 2).length;
    const vip = customers.filter(c => segmentOf(c).includes("vip")).length;
    const atRisk = customers.filter(c => segmentOf(c).includes("at-risk")).length;
    const newCust = customers.filter(c => segmentOf(c).includes("new")).length;
    const loyal = customers.filter(c => segmentOf(c).includes("loyal")).length;
    const dueCount = customers.filter(c => c.total_due > 0).length;
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const ltv = total > 0 ? totalSpent / total : 0;
    const repeatRate = buyers > 0 ? (repeatBuyers / buyers) * 100 : 0;
    const conversionRate = total > 0 ? (buyers / total) * 100 : 0;
    return { total, totalSpent, totalDue, totalOrders, totalPoints, buyers, repeatBuyers, vip, atRisk, newCust, loyal, dueCount, aov, ltv, repeatRate, conversionRate };
  }, [customers, segmentOf]);

  const healthScore = useMemo(() => {
    if (stats.total === 0) return 0;
    let s = 0;
    if (stats.repeatRate >= 40) s += 30; else if (stats.repeatRate >= 20) s += 20; else if (stats.repeatRate >= 10) s += 10;
    if (stats.conversionRate >= 70) s += 25; else if (stats.conversionRate >= 40) s += 15; else if (stats.conversionRate >= 20) s += 8;
    if (stats.atRisk / stats.total <= 0.1) s += 20; else if (stats.atRisk / stats.total <= 0.25) s += 12;
    if (stats.vip / stats.total >= 0.1) s += 15; else if (stats.vip / stats.total >= 0.05) s += 8;
    if (stats.newCust > 0) s += 10;
    return Math.min(100, s);
  }, [stats]);

  const insights = useMemo(() => {
    const items: { tone: "success" | "warning" | "danger" | "info"; icon: any; text: string }[] = [];
    if (stats.atRisk > 0) items.push({ tone: "warning", icon: AlertTriangle, text: `${stats.atRisk} customer(s) haven't ordered in 60+ days — send a re-engagement message.` });
    if (stats.dueCount > 0) items.push({ tone: "danger", icon: CreditCard, text: `${stats.dueCount} customer(s) owe ${format(stats.totalDue)} in total dues.` });
    if (stats.vip > 0) items.push({ tone: "success", icon: Crown, text: `${stats.vip} VIP customer(s) — consider exclusive rewards to retain them.` });
    if (stats.newCust > 0) items.push({ tone: "info", icon: UserPlus, text: `${stats.newCust} new customer(s) this month — send welcome offers.` });
    if (stats.repeatRate < 20 && stats.buyers > 5) items.push({ tone: "warning", icon: TrendingUp, text: `Repeat-purchase rate is only ${stats.repeatRate.toFixed(0)}% — improve loyalty programs.` });
    if (stats.conversionRate < 30 && stats.total > 5) items.push({ tone: "info", icon: Activity, text: `Only ${stats.conversionRate.toFixed(0)}% of customers have placed an order — try outreach campaigns.` });
    if (items.length === 0 && stats.total > 0) items.push({ tone: "success", icon: Sparkles, text: "All metrics look healthy. Keep delighting your customers!" });
    return items;
  }, [stats, format]);

  const topCustomers = useMemo(
    () => [...customers].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5),
    [customers]
  );

  // ===== Filtering & Sorting =====
  const filtered = useMemo(() => {
    let list = customers.filter((c) =>
      [c.name, c.phone, c.email, c.tags].some((f) => (f || "").toLowerCase().includes(search.toLowerCase()))
    );
    if (segment !== "all") list = list.filter(c => segmentOf(c).includes(segment));
    list.sort((a, b) => {
      switch (sortBy) {
        case "spent": return b.total_spent - a.total_spent;
        case "orders": return b.order_count - a.order_count;
        case "due": return b.total_due - a.total_due;
        case "name": return a.name.localeCompare(b.name);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [customers, search, segment, sortBy, segmentOf]);

  const pagination = usePagination(filtered.length, {
    storageKey: `pg:customers:${activeStore?.id ?? "_"}`,
    filterSignature: JSON.stringify({ search, segment, sortBy }),
  });
  const pagedCustomers = paginate(filtered, pagination.page, pagination.pageSize);

  // ===== Selection =====
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const openAdd = async () => {
    const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
    if ((count ?? 0) >= limits.maxCustomers) {
      toast.error(`Your plan allows up to ${limits.maxCustomers} customers across all stores. Please upgrade.`);
      return;
    }
    setEditId(null);
    setForm(emptyForm);
    setSheetOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", tags: c.tags || "", notes: c.notes || "" });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValidation.validateAll(form)) { toast.error("Please fix the errors below"); return; }
    if (editId) {
      const { error } = await supabase.from("customers").update(form).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Customer updated");
    } else {
      const { error } = await supabase.from("customers").insert({ ...form, user_id: effectiveUserId!, store_id: activeStore?.id });
      if (error) toast.error(error.message);
      else toast.success("Customer added");
    }
    setSheetOpen(false);
    fetchCustomers();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const prev = customers;
    setCustomers(curr => curr.filter(c => c.id !== id));
    const { error, count } = await supabase.from("customers").delete({ count: "exact" }).eq("id", id);
    if (error) {
      setCustomers(prev);
      toast.error(error.message);
      return;
    }
    if (!count) {
      setCustomers(prev);
      toast.error("Delete blocked — you may not have permission.");
      return;
    }
    toast.success("Customer deleted");
    fetchCustomers();
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    const prev = customers;
    setCustomers(curr => curr.filter(c => !selectedIds.has(c.id)));
    const { error, count } = await supabase.from("customers").delete({ count: "exact" }).in("id", ids);
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    clearSelection();
    if (error) {
      setCustomers(prev);
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${count ?? ids.length} customer(s)`);
    fetchCustomers();
  };

  const bulkEmail = () => {
    const targets = customers.filter(c => selectedIds.has(c.id) && c.email);
    if (targets.length === 0) { toast.error("No selected customers have an email"); return; }
    const emails = targets.map(c => c.email).join(",");
    window.location.href = `mailto:?bcc=${emails}`;
    toast.success(`Composing email to ${targets.length} customer(s)`);
  };

  const bulkWhatsApp = () => {
    const targets = customers.filter(c => selectedIds.has(c.id) && c.phone);
    if (targets.length === 0) { toast.error("No selected customers have a phone number"); return; }
    targets.forEach((c, i) => {
      setTimeout(() => {
        const phone = (c.phone || "").replace(/[^\d]/g, "");
        const msg = encodeURIComponent(`Hi ${c.name}, `);
        window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
      }, i * 250);
    });
    toast.success(`Opening WhatsApp for ${targets.length} customer(s)`);
  };

  const viewHistory = async (customer: Customer) => {
    setHistoryCustomer(customer.name);
    const { data } = await supabase.from("orders").select("id, total_amount, status, payment_status, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setOrders((data ?? []) as OrderHistory[]);
    setHistoryOpen(true);
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter(Boolean);
    if (lines.length < 2) { toast.error("CSV must have a header and at least one row"); return; }
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    });
    setImportRows(rows);
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) handleFileSelect(file);
    else toast.error("Only CSV files are supported");
  }, []);

  const handleImportSubmit = async () => {
    if (importRows.length === 0) return;
    const rows = importRows.map((row) => ({
      name: row["name"] || row["full name"] || "Unknown",
      email: row["email"] || "",
      phone: row["phone"] || "",
      address: row["address"] || "",
      tags: row["tags"] || "",
      notes: row["notes"] || "",
      user_id: effectiveUserId!,
      store_id: activeStore?.id,
    }));
    const { error } = await supabase.from("customers").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`${rows.length} customers imported`); fetchCustomers(); }
    setImportRows([]);
    setImportOpen(false);
  };

  const downloadTemplate = () => {
    const csv = "name,email,phone,address,tags,notes\nJohn Doe,john@example.com,+8801700000000,Dhaka,vip,Important customer";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "customers_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const header = "Name,Email,Phone,Tags,Total Spent,Total Due,Total Points,Order Count,Last Order\n";
    const rows = customers.map(c => `"${c.name}","${c.email}","${c.phone}","${c.tags}",${c.total_spent},${c.total_due},${c.total_points},${c.order_count},"${c.last_order_at || ""}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers_${activeStore?.name || "store"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const segmentBadges = (c: CustomerEnriched) => {
    const segs = segmentOf(c);
    return (
      <div className="flex gap-1 flex-wrap">
        {segs.includes("vip") && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-0.5"><Crown className="h-2.5 w-2.5" />VIP</Badge>}
        {segs.includes("loyal") && <Badge className="bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30 gap-0.5"><Heart className="h-2.5 w-2.5" />Loyal</Badge>}
        {segs.includes("new") && <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-0.5"><UserPlus className="h-2.5 w-2.5" />New</Badge>}
        {segs.includes("at-risk") && <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30 gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />At-Risk</Badge>}
      </div>
    );
  };

  const healthColor = healthScore >= 70 ? "text-emerald-500" : healthScore >= 40 ? "text-amber-500" : "text-rose-500";
  const healthLabel = healthScore >= 70 ? "Excellent" : healthScore >= 40 ? "Needs attention" : "Critical";

  return (
    <DashboardLayout>
      <UsageWarningBanner type="customers" />

      {/* ===== Compact Hero Header ===== */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-background px-3 py-3 sm:px-5 sm:py-4 mb-3">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Title + Health row */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight leading-none">Customers</h1>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-0.5 font-medium">
                  <Sparkles className="h-2.5 w-2.5" /> CRM
                </Badge>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-0.5 text-emerald-600 border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">Segment, engage and retain — SaaS-scale growth.</p>
            </div>

            {/* Inline Health Score (compact on mobile) */}
            <div className="flex items-center gap-2 rounded-lg border bg-card/70 backdrop-blur px-2 py-1 shrink-0">
              <div className="relative h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
                    stroke="currentColor"
                    className={healthColor}
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - healthScore / 100)}
                  />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${healthColor}`}>{healthScore}</div>
              </div>
              <div className="leading-tight hidden sm:block">
                <p className={`text-xs font-semibold ${healthColor}`}>{healthLabel}</p>
                <p className="text-[10px] text-muted-foreground">R {stats.repeatRate.toFixed(0)}% · C {stats.conversionRate.toFixed(0)}%</p>
              </div>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-1.5 w-full lg:w-auto lg:ml-auto">
            <Button variant="ghost" size="icon" onClick={() => setGuideOpen(o => !o)} className="h-8 w-8 shrink-0" title="Guide">
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-8 px-2.5 flex-1 lg:flex-none">
              <FileDown className="h-3.5 w-3.5" /> <span>Export</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setImportRows([]); setImportOpen(true); }} className="gap-1.5 h-8 px-2.5 flex-1 lg:flex-none">
              <Upload className="h-3.5 w-3.5" /> <span>Import</span>
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-1.5 h-8 px-3 flex-1 lg:flex-none">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Quick Guide */}
        {guideOpen && (
          <div className="relative mt-3 rounded-lg border bg-card/80 backdrop-blur p-3 animate-in fade-in slide-in-from-top-2">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><Crown className="h-3.5 w-3.5 text-amber-500" /> VIP</p>
                <p className="text-muted-foreground">Spent ≥ 5,000 OR placed 10+ orders. Reward them with exclusives.</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><Heart className="h-3.5 w-3.5 text-pink-500" /> Loyal</p>
                <p className="text-muted-foreground">3+ orders with activity in the last 60 days.</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><UserPlus className="h-3.5 w-3.5 text-blue-500" /> New</p>
                <p className="text-muted-foreground">Joined within the last 30 days — send welcome offers.</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> At-Risk</p>
                <p className="text-muted-foreground">Has ordered before but inactive for 60+ days. Re-engage now.</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><CreditCard className="h-3.5 w-3.5 text-rose-500" /> Due</p>
                <p className="text-muted-foreground">Has outstanding balance. Send payment reminders.</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-semibold flex items-center gap-1.5 mb-1"><Award className="h-3.5 w-3.5 text-primary" /> Health Score</p>
                <p className="text-muted-foreground">Repeat rate, conversion, retention & VIP ratio combined.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Compact KPI Strip ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {[
          { label: "Customers", value: stats.total, sub: `${stats.buyers} buyers`, Icon: Users, accent: "text-primary", bg: "bg-primary/10" },
          { label: "Total Spent", value: format(stats.totalSpent), sub: `AOV ${format(stats.aov)}`, Icon: ShoppingBag, accent: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Total Due", value: format(stats.totalDue), sub: `${stats.dueCount} customers`, Icon: CreditCard, accent: "text-rose-500", bg: "bg-rose-500/10", valueClass: "text-rose-500" },
          { label: "Avg LTV", value: format(stats.ltv), sub: `${stats.totalPoints} pts`, Icon: Star, accent: "text-amber-500", bg: "bg-amber-500/10" },
        ].map((k, i) => (
          <div key={i} className="group relative rounded-lg border bg-card px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden">
            <div className="flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-md ${k.bg} ${k.accent} flex items-center justify-center shrink-0`}>
                <k.Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                <p className={`text-base sm:text-lg font-bold leading-tight truncate ${k.valueClass || ""}`}>{k.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{k.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== Insights + Top Customers ===== */}
      <div className="grid lg:grid-cols-5 gap-3 mb-3">
        {/* Smart Insights */}
        <div className="lg:col-span-3 rounded-lg border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setInsightsOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h2 className="font-semibold text-xs">Smart Insights</h2>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{insights.length}</Badge>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${insightsOpen ? "rotate-180" : ""}`} />
          </button>
          {insightsOpen && (
            <div className="px-3 pb-3 space-y-1.5 animate-in fade-in slide-in-from-top-1">
              {insights.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">All clear — no insights right now.</p>
              ) : insights.map((ins, i) => {
                const Icon = ins.icon;
                const tone = {
                  success: "bg-emerald-500/8 border-l-emerald-500 text-emerald-700 dark:text-emerald-300",
                  warning: "bg-amber-500/8 border-l-amber-500 text-amber-700 dark:text-amber-300",
                  danger: "bg-rose-500/8 border-l-rose-500 text-rose-700 dark:text-rose-300",
                  info: "bg-blue-500/8 border-l-blue-500 text-blue-700 dark:text-blue-300",
                }[ins.tone];
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-md border border-l-2 px-2.5 py-1.5 text-[11px] ${tone}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="leading-snug">{ins.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Customers */}
        <div className="lg:col-span-2 rounded-lg border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setTopOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <h2 className="font-semibold text-xs">Top Customers</h2>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${topOpen ? "rotate-180" : ""}`} />
          </button>
          {topOpen && (
            <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-1">
              {topCustomers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">No data yet</p>
              ) : (
                <div className="space-y-1.5">
                  {topCustomers.map((c, i) => {
                    const max = topCustomers[0].total_spent || 1;
                    const pct = (c.total_spent / max) * 100;
                    const initials = c.name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
                    const rankClr = i === 0 ? "bg-amber-500/15 text-amber-600" : i === 1 ? "bg-slate-400/20 text-slate-600 dark:text-slate-300" : i === 2 ? "bg-orange-500/15 text-orange-600" : "bg-muted text-muted-foreground";
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/40 transition-colors">
                        <span className={`h-6 w-6 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 ${rankClr}`}>{i + 1}</span>
                        <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">{initials || "?"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-medium truncate">{c.name}</span>
                            <span className="text-muted-foreground shrink-0">{format(c.total_spent)}</span>
                          </div>
                          <Progress value={pct} className="h-1 mt-0.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Segment Chips ===== */}
      <div className="mb-3 -mx-1 px-1 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {[
            { v: "all", label: "All", count: stats.total, Icon: Users, color: "text-foreground", active: "bg-foreground text-background" },
            { v: "vip", label: "VIP", count: stats.vip, Icon: Crown, color: "text-amber-500", active: "bg-amber-500/15 text-amber-600 border-amber-500/40" },
            { v: "loyal", label: "Loyal", count: stats.loyal, Icon: Heart, color: "text-pink-500", active: "bg-pink-500/15 text-pink-600 border-pink-500/40" },
            { v: "new", label: "New", count: stats.newCust, Icon: UserPlus, color: "text-blue-500", active: "bg-blue-500/15 text-blue-600 border-blue-500/40" },
            { v: "at-risk", label: "At-Risk", count: stats.atRisk, Icon: AlertTriangle, color: "text-orange-500", active: "bg-orange-500/15 text-orange-600 border-orange-500/40" },
            { v: "due", label: "Due", count: stats.dueCount, Icon: CreditCard, color: "text-rose-500", active: "bg-rose-500/15 text-rose-600 border-rose-500/40" },
          ].map(s => {
            const isActive = segment === s.v;
            return (
              <button
                key={s.v}
                type="button"
                onClick={() => setSegment(s.v as Segment)}
                className={`group inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? `${s.active} shadow-sm`
                    : "bg-card hover:bg-muted/60 border-border text-muted-foreground"
                }`}
              >
                <s.Icon className={`h-3.5 w-3.5 ${isActive ? "" : s.color}`} />
                {s.label}
                <span className={`ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold ${
                  isActive ? "bg-background/30" : "bg-muted text-foreground"
                }`}>{s.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Search + Sort ===== */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, phone or tag..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="spent">Highest spent</SelectItem>
            <SelectItem value="orders">Most orders</SelectItem>
            <SelectItem value="due">Highest due</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ===== Bulk Action Bar ===== */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-20 mb-4 rounded-xl border bg-card/95 backdrop-blur shadow-lg p-3 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Badge className="gap-1"><Users className="h-3 w-3" />{selectedIds.size} selected</Badge>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={bulkWhatsApp}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={bulkEmail}>
              <Mail className="h-4 w-4" /> Email
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* ===== List ===== */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border rounded-xl bg-card">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No customers found</h3>
          <p className="text-muted-foreground text-sm mb-4">Try a different segment or add a new customer.</p>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add Customer</Button>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {pagedCustomers.map((c) => (
              <div key={c.id} className="rounded-xl border bg-card p-3 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedIds.has(c.id)}
                    onCheckedChange={() => toggleSelect(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0" onClick={() => openEdit(c)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || "No contact"}</p>
                      </div>
                    </div>
                    <div className="mt-2">{segmentBadges(c)}</div>
                    <div className="flex gap-2 flex-wrap mt-2 text-[10px]">
                      {c.order_count > 0 && <Badge variant="secondary">{c.order_count} orders</Badge>}
                      {c.total_spent > 0 && <Badge variant="outline">{format(c.total_spent)} spent</Badge>}
                      {c.total_due > 0 && <Badge variant="destructive">{format(c.total_due)} due</Badge>}
                      {c.total_points > 0 && <Badge variant="outline" className="gap-0.5"><Star className="h-2.5 w-2.5" />{c.total_points} pts</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); viewHistory(c); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDnaCustomer(c); setDnaOpen(true); }}>
                      <Dna className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="rounded-xl border hidden md:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Segments</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-center">Points</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCustomers.map((c) => (
                  <TableRow key={c.id} className={selectedIds.has(c.id) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {(c.tags || "").split(",").filter(Boolean).length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {(c.tags || "").split(",").filter(Boolean).slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{t.trim()}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="truncate max-w-[180px]">{c.email}</div>
                      <div className="text-muted-foreground">{c.phone}</div>
                    </TableCell>
                    <TableCell>{segmentBadges(c)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{c.order_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {c.total_spent > 0 ? format(c.total_spent) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.total_due > 0 ? <Badge variant="destructive">{format(c.total_due)}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.total_points > 0 ? (
                        <Badge variant="outline" className="gap-0.5"><Star className="h-3 w-3 text-amber-500" />{c.total_points}</Badge>
                      ) : <span className="text-muted-foreground text-xs">0</span>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewHistory(c)} title="Order History">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDnaCustomer(c); setDnaOpen(true); }} title="DNA Profile">
                        <Dna className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {filtered.length > 0 && (
        <DataPagination
          className="mt-4"
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={filtered.length}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="customers"
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Order history references will remain but the customer record will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} customer(s)?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Customer Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Customer" : "Add Customer"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); formValidation.clearField("name"); }}
                error={!!formValidation.getError("name")}
                placeholder="Customer name"
              />
              {formValidation.getError("name") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("name")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); formValidation.clearField("email"); }}
                error={!!formValidation.getError("email")}
                placeholder="email@example.com"
              />
              {formValidation.getError("email") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("email")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); formValidation.clearField("phone"); }}
                  error={!!formValidation.getError("phone")}
                  placeholder="Phone number..."
                  className="pl-9"
                />
              </div>
              {formValidation.getError("phone") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("phone")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => { setForm({ ...form, address: e.target.value }); formValidation.clearField("address"); }}
                aria-invalid={!!formValidation.getError("address")}
                className={formValidation.getError("address") ? "border-destructive focus-visible:ring-destructive" : ""}
                placeholder="Full address"
                rows={3}
              />
              {formValidation.getError("address") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("address")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => { setForm({ ...form, tags: e.target.value }); formValidation.clearField("tags"); }}
                error={!!formValidation.getError("tags")}
                placeholder="vip, reseller"
              />
              {formValidation.getError("tags") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("tags")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => { setForm({ ...form, notes: e.target.value }); formValidation.clearField("notes"); }}
                aria-invalid={!!formValidation.getError("notes")}
                className={formValidation.getError("notes") ? "border-destructive focus-visible:ring-destructive" : ""}
                placeholder="Additional notes..."
                rows={3}
              />
              {formValidation.getError("notes") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("notes")}</p>}
            </div>
            <Button type="submit" className="w-full">{editId ? "Update Customer" : "Save Customer"}</Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Purchase History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Purchase History — {historyCustomer}</DialogTitle>
          </DialogHeader>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No orders found for this customer.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{format(Number(o.total_amount))}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[o.status] ?? ""}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{o.payment_status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Customers Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Customers</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with customer data. Download the template to see the required format.
          </p>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleImportFile} />
            <CloudUpload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm">Click or drag file to this area to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Only CSV files are supported</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}>
              <FileDown className="mr-2 h-4 w-4" />Download Template
            </Button>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImportSubmit} disabled={importRows.length === 0}>
              Import {importRows.length} Records
            </Button>
          </div>
          {importRows.length > 0 && (
            <p className="text-sm text-emerald-600 font-medium">{importRows.length} records ready to import</p>
          )}
        </DialogContent>
      </Dialog>

      {/* DNA Profile */}
      {dnaCustomer && (
        <CustomerDNAProfile open={dnaOpen} onOpenChange={setDnaOpen} customerId={dnaCustomer.id} customerName={dnaCustomer.name} storeId={activeStore?.id || ""} />
      )}
    </DashboardLayout>
  );
};

export default Customers;
