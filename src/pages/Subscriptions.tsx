import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Search, RefreshCw, MessageCircle,
  RotateCcw, ChevronDown, ChevronUp, TrendingUp, Users, Calculator,
  Bell, Clock, CheckCircle2, XCircle, AlertTriangle, Download,
  BarChart3, PieChart, Calendar, DollarSign, ArrowUpRight,
  ArrowDownRight, Eye, Zap, ShieldCheck, Timer, HelpCircle, Sparkles,
  Activity, Target, Lightbulb, TrendingDown, Repeat, Crown, Filter,
  MessageSquareText, Save, RotateCw
} from "lucide-react";
import { differenceInDays, addDays, format as fnsFormat, subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { subscriptionSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { usePersistedState, useScrollRestoration } from "@/hooks/usePersistedState";
import SubscriptionRenewalWizard, { type SubscriptionRenewalSubject } from "@/components/SubscriptionRenewalWizard";

interface Subscription {
  id: string;
  customer_id: string | null;
  product_name: string;
  variation: string;
  start_date: string;
  end_date: string | null;
  price: number;
  cost_price: number;
  notes: string;
  renewals: number;
  status: string;
  user_id: string;
  plan: string;
  store_id: string | null;
  order_id?: string | null;
  customers?: { name: string; phone: string; email?: string } | null;
  orders?: { order_code: string | null; order_number: number | null } | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

const VARIATIONS = [
  { label: "7 Days", days: 7 },
  { label: "15 Days", days: 15 },
  { label: "1 Month", days: 30 },
  { label: "2 Month", days: 60 },
  { label: "3 Month", days: 90 },
  { label: "6 Month", days: 180 },
  { label: "12 Month", days: 365 },
];

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "#8b5cf6", "#ec4899", "#06b6d4",
];

const emptyForm = {
  customer_id: "",
  product_name: "",
  variation: "1 Month",
  start_date: fnsFormat(new Date(), "yyyy-MM-dd"),
  price: "",
  cost_price: "",
  notes: "",
};

const DEFAULT_WA_TEMPLATE = `Hi {customer_name}, your subscription for "{product_name}" ({variation}) {status_text}. Please renew to continue the service. Thank you!`;
const TEMPLATE_STORAGE_KEY = "subscription_wa_template";

const renderTemplate = (
  tpl: string,
  data: { customer_name: string; product_name: string; variation: string; days_left: number; end_date: string; price: string; store_name: string }
) => {
  const statusText = data.days_left <= 0
    ? "has expired"
    : `will expire in ${data.days_left} day${data.days_left === 1 ? "" : "s"} (${data.end_date})`;
  return tpl
    .replace(/\{customer_name\}/g, data.customer_name)
    .replace(/\{product_name\}/g, data.product_name)
    .replace(/\{variation\}/g, data.variation)
    .replace(/\{days_left\}/g, String(data.days_left))
    .replace(/\{end_date\}/g, data.end_date)
    .replace(/\{price\}/g, data.price)
    .replace(/\{store_name\}/g, data.store_name)
    .replace(/\{status_text\}/g, statusText);
};

const Subscriptions = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { format: formatCurrency, symbol } = useCurrency();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = usePersistedState<string>("subs:search", "");
  const [statusFilter, setStatusFilter] = usePersistedState<string>("subs:statusFilter", "all");
  const [activeTab, setActiveTab] = usePersistedState<string>("subs:activeTab", "subscriptions");
  const [calcOpen, setCalcOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [calc, setCalc] = useState({ planPrice: 0, costPrice: 0, customers: 0, duration: "1 Month" });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [waTemplate, setWaTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_WA_TEMPLATE;
    return localStorage.getItem(TEMPLATE_STORAGE_KEY) || DEFAULT_WA_TEMPLATE;
  });
  const [templateDraft, setTemplateDraft] = useState(waTemplate);
  const formValidation = useFormValidation(subscriptionSchema);

  // Renewal wizard state
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewSubject, setRenewSubject] = useState<SubscriptionRenewalSubject | null>(null);

  const fetchAll = useCallback(async () => {
    if (!activeStore || !user) return;
    setLoading(true);
    const [{ data: subData }, { data: custData }] = await Promise.all([
      supabase.from("subscriptions").select("*, customers(name, phone), orders(order_code, order_number)").eq("store_id", activeStore.id).order("end_date", { ascending: true }),
      supabase.from("customers").select("id, name, phone").eq("store_id", activeStore.id),
    ]);
    if (subData) setSubs(subData as Subscription[]);
    if (custData) setCustomers(custData as Customer[]);
    setLoading(false);
  }, [activeStore, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Preserve scroll position across tab-switches / SW reloads
  useScrollRestoration("subs:scrollY", !loading);

  // Realtime
  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`subs-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `store_id=eq.${activeStore.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, fetchAll]);

  const getEndDate = (startDate: string, variation: string) => {
    const v = VARIATIONS.find((x) => x.label === variation);
    return fnsFormat(addDays(new Date(startDate), v?.days ?? 30), "yyyy-MM-dd");
  };

  const getDaysLeft = (endDate: string | null) => {
    if (!endDate) return 0;
    return differenceInDays(new Date(endDate), new Date());
  };

  // Stats
  const stats = useMemo(() => {
    const active = subs.filter((s) => s.status === "active");
    const expired = subs.filter((s) => s.status === "expired" || (s.status === "active" && getDaysLeft(s.end_date) < 0));
    const expiringToday = active.filter((s) => getDaysLeft(s.end_date) === 0).length;
    const expiringWeek = active.filter((s) => { const d = getDaysLeft(s.end_date); return d >= 0 && d <= 7; }).length;
    const expiring30 = active.filter((s) => { const d = getDaysLeft(s.end_date); return d >= 0 && d <= 30; }).length;
    const totalRevenue = subs.reduce((sum, s) => sum + Number(s.price), 0);
    const totalCost = subs.reduce((sum, s) => sum + Number(s.cost_price), 0);
    const activeRevenue = active.reduce((sum, s) => sum + Number(s.price), 0);
    const totalRenewals = subs.reduce((sum, s) => sum + (s.renewals || 0), 0);
    const mrr = active.reduce((sum, s) => {
      const v = VARIATIONS.find((x) => x.label === s.variation);
      const months = (v?.days ?? 30) / 30;
      return sum + (Number(s.price) / months);
    }, 0);
    const avgLifetime = totalRenewals > 0 ? totalRenewals / active.length : 0;
    const renewalRate = subs.length > 0 ? (subs.filter(s => s.renewals > 0).length / subs.length) * 100 : 0;
    const churnRate = subs.length > 0 ? (expired.length / subs.length) * 100 : 0;

    return {
      activeCount: active.length, expiredCount: expired.length,
      expiringToday, expiringWeek, expiring30,
      totalRevenue, totalCost, activeRevenue, mrr,
      totalRenewals, avgLifetime, renewalRate, churnRate,
      profit: totalRevenue - totalCost,
    };
  }, [subs]);

  // Subscription Health Score (0-100)
  const healthScore = useMemo(() => {
    let score = 0;
    if (stats.activeCount > 0) score += 25;
    if (stats.renewalRate >= 50) score += 25;
    else if (stats.renewalRate >= 25) score += 15;
    else if (stats.renewalRate > 0) score += 8;
    if (stats.churnRate <= 10) score += 25;
    else if (stats.churnRate <= 25) score += 15;
    else if (stats.churnRate <= 40) score += 8;
    if (stats.profit > 0) score += 15;
    if (stats.expiringWeek === 0) score += 10;
    else if (stats.expiringWeek <= 3) score += 5;
    return Math.min(100, score);
  }, [stats]);

  const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Healthy" : healthScore >= 40 ? "Fair" : "Needs Attention";
  const healthColor = healthScore >= 80 ? "text-green-600" : healthScore >= 60 ? "text-primary" : healthScore >= 40 ? "text-amber-600" : "text-destructive";

  // Smart insights
  const insights = useMemo(() => {
    const arr: { type: "success" | "warning" | "danger" | "info"; icon: any; text: string }[] = [];
    if (stats.expiringToday > 0) arr.push({ type: "danger", icon: AlertTriangle, text: `${stats.expiringToday} subscription${stats.expiringToday > 1 ? "s" : ""} expire today — send reminders now!` });
    if (stats.expiringWeek >= 3) arr.push({ type: "warning", icon: Clock, text: `${stats.expiringWeek} subscriptions expiring this week. Forecasted at-risk revenue: ${formatCurrency(subs.filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 7).reduce((a, s) => a + Number(s.price), 0), 0)}` });
    if (stats.churnRate > 30) arr.push({ type: "danger", icon: TrendingDown, text: `High churn rate (${stats.churnRate.toFixed(0)}%) — consider win-back campaigns.` });
    if (stats.renewalRate >= 60) arr.push({ type: "success", icon: Sparkles, text: `Strong renewal rate of ${stats.renewalRate.toFixed(0)}% — your customers love your service!` });
    if (stats.mrr > 0 && stats.activeCount > 0) arr.push({ type: "info", icon: TrendingUp, text: `Avg revenue per user: ${formatCurrency(stats.mrr / stats.activeCount, 0)}/mo across ${stats.activeCount} active subs.` });
    if (arr.length === 0) arr.push({ type: "info", icon: Lightbulb, text: "Add your first subscription to unlock recurring revenue insights." });
    return arr.slice(0, 4);
  }, [stats, subs]);

  // Top customers by revenue
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; revenue: number; count: number }>();
    subs.forEach(s => {
      if (!s.customers?.name) return;
      const key = s.customer_id || s.customers.name;
      const e = map.get(key) || { name: s.customers.name, phone: s.customers.phone, revenue: 0, count: 0 };
      e.revenue += Number(s.price);
      e.count++;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [subs]);

  // At-risk subs (expiring in next 14 days)
  const atRiskSubs = useMemo(() => {
    return subs
      .filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 14)
      .sort((a, b) => getDaysLeft(a.end_date) - getDaysLeft(b.end_date))
      .slice(0, 6);
  }, [subs]);

  // Charts
  const statusDistribution = useMemo(() => {
    const active = subs.filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0).length;
    const expiring = subs.filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 7).length;
    const expired = subs.filter(s => s.status === "expired" || getDaysLeft(s.end_date) < 0).length;
    const cancelled = subs.filter(s => s.status === "cancelled").length;
    return [
      { name: "Active", value: active - expiring, color: "hsl(var(--success))" },
      { name: "Expiring Soon", value: expiring, color: "hsl(var(--warning))" },
      { name: "Expired", value: expired, color: "hsl(var(--destructive))" },
      { name: "Cancelled", value: cancelled, color: "hsl(var(--muted-foreground))" },
    ].filter(d => d.value > 0);
  }, [subs]);

  const variationBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    subs.filter(s => s.status === "active").forEach(s => {
      const entry = map.get(s.variation) || { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += Number(s.price);
      map.set(s.variation, entry);
    });
    return Array.from(map.entries()).map(([name, val]) => ({ name, ...val })).sort((a, b) => b.count - a.count);
  }, [subs]);

  const expiryTimeline = useMemo(() => {
    const days: { date: string; expiring: number; value: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(new Date(), i);
      const dateStr = fnsFormat(d, "yyyy-MM-dd");
      const expiring = subs.filter(s => s.end_date?.startsWith(dateStr) && s.status === "active");
      if (expiring.length > 0) {
        days.push({
          date: fnsFormat(d, "dd MMM"),
          expiring: expiring.length,
          value: expiring.reduce((sum, s) => sum + Number(s.price), 0),
        });
      }
    }
    return days;
  }, [subs]);

  // Filtered
  const filtered = useMemo(() => {
    return subs.filter((s) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || [
        s.product_name,
        s.customers?.name,
        s.customers?.phone,
        s.orders?.order_code,
        s.orders?.order_number != null ? String(s.orders?.order_number) : null,
        s.order_id,
      ].some((f) => (f || "").toString().toLowerCase().includes(q));
      if (!matchSearch) return false;
      if (statusFilter === "active") return s.status === "active" && getDaysLeft(s.end_date) >= 0;
      if (statusFilter === "expiring") return s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 7;
      if (statusFilter === "expired") return s.status === "expired" || getDaysLeft(s.end_date) < 0;
      if (statusFilter === "cancelled") return s.status === "cancelled";
      return true;
    });
  }, [subs, search, statusFilter]);

  // Handlers
  const openAdd = () => { setEditId(null); setForm(emptyForm); formValidation.clearErrors(); setSheetOpen(true); };
  const openEdit = (s: Subscription) => {
    setEditId(s.id);
    setForm({
      customer_id: s.customer_id || "",
      product_name: s.product_name,
      variation: s.variation,
      start_date: s.start_date ? fnsFormat(new Date(s.start_date), "yyyy-MM-dd") : "",
      price: String(s.price),
      cost_price: String(s.cost_price),
      notes: s.notes || "",
    });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValidation.validateAll(form)) {
      toast.error("Please fix the errors below");
      return;
    }
    const endDate = getEndDate(form.start_date, form.variation);
    const payload = {
      customer_id: form.customer_id || null,
      product_name: form.product_name.trim(),
      variation: form.variation,
      start_date: form.start_date,
      end_date: endDate,
      price: Number(form.price) || 0,
      cost_price: Number(form.cost_price) || 0,
      notes: form.notes,
      status: "active",
      plan: "customer" as any,
    };
    if (editId) {
      const { error } = await supabase.from("subscriptions").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Subscription updated ✓");
    } else {
      const { error } = await supabase.from("subscriptions").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore?.id });
      if (error) toast.error(error.message); else toast.success("Subscription created! 🎉");
    }
    setSheetOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subscription? This cannot be undone.")) return;
    // Optimistic remove so UI updates instantly even if realtime is slow
    const prev = subs;
    setSubs((curr) => curr.filter((x) => x.id !== id));
    setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    const { error, count } = await supabase
      .from("subscriptions")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) {
      setSubs(prev);
      toast.error(error.message);
      return;
    }
    if (!count) {
      setSubs(prev);
      toast.error("Delete blocked — you may not have permission to delete this subscription.");
      return;
    }
    toast.success("Deleted");
    fetchAll();
  };

  const handleRenew = (s: Subscription) => {
    setRenewSubject({
      id: s.id,
      customer_id: s.customer_id,
      product_name: s.product_name,
      variation: s.variation,
      start_date: s.start_date,
      end_date: s.end_date,
      price: s.price,
      cost_price: s.cost_price,
      renewals: s.renewals,
      customers: s.customers ?? null,
    });
    setRenewOpen(true);
  };

  const buildReminderMessage = (s: Subscription, customerName: string) => {
    const daysLeft = getDaysLeft(s.end_date);
    return renderTemplate(waTemplate, {
      customer_name: customerName,
      product_name: s.product_name,
      variation: s.variation,
      days_left: daysLeft,
      end_date: s.end_date ? fnsFormat(new Date(s.end_date), "dd MMM yyyy") : "—",
      price: `${symbol}${Number(s.price).toFixed(0)}`,
      store_name: activeStore?.name || "",
    });
  };

  const sendWhatsAppReminder = (s: Subscription) => {
    const customer = customers.find((c) => c.id === s.customer_id);
    if (!customer?.phone) { toast.error("Customer has no phone number"); return; }
    const message = buildReminderMessage(s, customer.name);
    window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
    toast.success("WhatsApp opened");
  };

  // ===== Bulk actions =====
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkRenew = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const targets = subs.filter(s => selectedIds.has(s.id));
    let ok = 0, fail = 0;
    for (const s of targets) {
      const newStart = s.end_date || fnsFormat(new Date(), "yyyy-MM-dd");
      const newEnd = getEndDate(newStart, s.variation);
      const { error } = await supabase.from("subscriptions").update({
        start_date: newStart, end_date: newEnd,
        renewals: (s.renewals || 0) + 1, status: "active",
      }).eq("id", s.id);
      if (error) fail++; else ok++;
    }
    setBulkBusy(false);
    clearSelection();
    if (ok) toast.success(`🔄 Renewed ${ok} subscription${ok > 1 ? "s" : ""}`);
    if (fail) toast.error(`Failed to renew ${fail}`);
  };

  const bulkRemind = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const targets = subs.filter(s => selectedIds.has(s.id));
    let opened = 0, skipped = 0;
    for (const s of targets) {
      const customer = customers.find((c) => c.id === s.customer_id);
      if (!customer?.phone) { skipped++; continue; }
      const message = buildReminderMessage(s, customer.name);
      window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
      opened++;
      // small delay so the browser doesn't block multi-window opens
      await new Promise(r => setTimeout(r, 250));
    }
    setBulkBusy(false);
    clearSelection();
    if (opened) toast.success(`📲 Opened WhatsApp for ${opened}`);
    if (skipped) toast.warning(`Skipped ${skipped} (no phone)`);
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} subscription(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    const prev = subs;
    setSubs((curr) => curr.filter((x) => !selectedIds.has(x.id)));
    const { error, count } = await supabase
      .from("subscriptions")
      .delete({ count: "exact" })
      .in("id", ids);
    setBulkBusy(false);
    clearSelection();
    if (error) {
      setSubs(prev);
      toast.error(error.message);
      return;
    }
    if (!count) {
      setSubs(prev);
      toast.error("Delete blocked — you may not have permission to delete these subscriptions.");
      return;
    }
    toast.success(`Deleted ${count} subscription(s)`);
    fetchAll();
  };

  const exportCSV = () => {
    const headers = ["Customer", "Phone", "Product", "Variation", "Start", "End", "Price", "Cost", "Status", "Renewals"];
    const rows = filtered.map(s => [
      s.customers?.name || "", s.customers?.phone || "", s.product_name, s.variation,
      s.start_date, s.end_date || "", s.price, s.cost_price, s.status, s.renewals,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `subscriptions-${fnsFormat(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Exported!");
  };

  const getStatusBadge = (s: Subscription) => {
    const daysLeft = getDaysLeft(s.end_date);
    if (s.status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
    if (daysLeft < 0) return <Badge variant="destructive">Expired</Badge>;
    if (daysLeft === 0) return <Badge variant="destructive" className="animate-pulse">Expires Today</Badge>;
    if (daysLeft <= 3) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{daysLeft}d left</Badge>;
    if (daysLeft <= 7) return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{daysLeft}d left</Badge>;
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{daysLeft}d left</Badge>;
  };

  // Calculator
  const calcRevenue = calc.planPrice * calc.customers;
  const calcCost = calc.costPrice * calc.customers;
  const calcProfit = calcRevenue - calcCost;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-9 w-28" /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* Compact premium header */}
        <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-primary/8 via-background to-background p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-sm shrink-0">
                <Repeat className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight">Subscriptions</h1>
                  <Badge variant="outline" className="gap-1 h-5 px-1.5 text-[10px]">
                    <Sparkles className="h-2.5 w-2.5" /> Premium
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                  Recurring revenue, renewals & churn at a glance
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Health pill */}
              <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                <Activity className={`h-3.5 w-3.5 ${healthColor}`} />
                <div className="flex items-baseline gap-1">
                  <span className={`text-sm font-bold leading-none ${healthColor}`}>{healthScore}</span>
                  <span className="text-[10px] text-muted-foreground">/100</span>
                </div>
                <span className={`text-[10px] font-semibold ${healthColor}`}>{healthLabel}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setTemplateDraft(waTemplate); setTemplateOpen(true); }} className="h-9 gap-1.5">
                <MessageSquareText className="h-3.5 w-3.5" /> <span className="hidden md:inline">Template</span>
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 gap-1.5">
                <Download className="h-3.5 w-3.5" /> <span className="hidden md:inline">Export</span>
              </Button>
              <Button size="sm" onClick={openAdd} className="h-9 gap-1.5 shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>
          {/* Insights inline as compact chips */}
          {insights.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {insights.map((ins, i) => {
                const styles = {
                  success: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
                  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
                  danger: "bg-destructive/10 text-destructive border-destructive/20",
                  info: "bg-primary/10 text-primary border-primary/20",
                }[ins.type];
                const Icon = ins.icon;
                return (
                  <div key={i} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles}`}>
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[28rem]">{ins.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Guide — compact collapsible */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-3 py-2.5 min-h-[40px] hover:bg-muted/30 transition-colors rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-xs font-semibold">Quick Guide & Best Practices</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 hidden sm:block">— Grow MRR, reduce churn & automate renewals</p>
                </div>
                {guideOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: Plus, title: "1. Add Subscription", text: "Click Add to create. Pick customer, product, duration & price. End date auto-calculates." },
                  { icon: Bell, title: "2. Send Reminders", text: "Use the WhatsApp button on each row to send a renewal reminder before expiry." },
                  { icon: RotateCcw, title: "3. Renew with One Click", text: "When customer pays, hit Renew. Dates roll forward and renewal counter increments." },
                  { icon: Target, title: "4. Watch Health Score", text: "Aim for 80+. High renewal rate, low churn & active follow-up boost your score." },
                ].map((g, i) => {
                  const GIcon = g.icon;
                  return (
                    <div key={i} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="p-1.5 rounded bg-primary/10"><GIcon className="h-3.5 w-3.5 text-primary" /></div>
                        <p className="text-xs font-semibold">{g.title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{g.text}</p>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Unified KPI grid — 8 metrics, compact fintech tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: "Active", value: stats.activeCount, sub: `MRR ${formatCurrency(stats.mrr, 0)}`, icon: CheckCircle2, tone: "green", valueColor: "text-green-600", primary: true },
            { label: "Expiring", value: stats.expiringWeek, sub: `${stats.expiringToday} today`, icon: AlertTriangle, tone: "amber", valueColor: "text-amber-600", primary: true },
            { label: "Expired", value: stats.expiredCount, sub: `Churn ${stats.churnRate.toFixed(0)}%`, icon: XCircle, tone: "red", valueColor: "text-destructive", primary: true },
            { label: "Revenue", value: formatCurrency(stats.totalRevenue, 0), sub: `Profit ${formatCurrency(stats.profit, 0)}`, icon: DollarSign, tone: "primary", valueColor: "", primary: true },
            { label: "Renewals", value: stats.totalRenewals, sub: "Total", icon: RotateCcw, tone: "primary", valueColor: "" },
            { label: "Renewal %", value: `${stats.renewalRate.toFixed(0)}%`, sub: "Rate", icon: TrendingUp, tone: "green", valueColor: "" },
            { label: "30-Day", value: stats.expiring30, sub: "Expiring", icon: Timer, tone: "amber", valueColor: "" },
            { label: "Lifetime", value: stats.avgLifetime.toFixed(1), sub: "Avg yrs", icon: Crown, tone: "purple", valueColor: "" },
          ].map((k, i) => {
            const KIcon = k.icon;
            const toneMap: Record<string, { bg: string; text: string; ring: string }> = {
              green:   { bg: "bg-green-500/10", text: "text-green-600", ring: "ring-green-500/20" },
              amber:   { bg: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20" },
              red:     { bg: "bg-red-500/10",   text: "text-red-600",   ring: "ring-red-500/20" },
              primary: { bg: "bg-primary/10",   text: "text-primary",   ring: "ring-primary/20" },
              purple:  { bg: "bg-purple-500/10",text: "text-purple-600",ring: "ring-purple-500/20" },
            };
            const t = toneMap[k.tone];
            return (
              <Card key={i} className={`hover:shadow-sm transition-all ${k.primary ? "ring-1 " + t.ring : ""}`}>
                <CardContent className="p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide truncate">{k.label}</p>
                    <div className={`p-1 rounded ${t.bg} shrink-0`}>
                      <KIcon className={`h-3 w-3 ${t.text}`} />
                    </div>
                  </div>
                  <p className={`text-lg sm:text-xl font-bold leading-tight truncate ${k.valueColor}`}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* At-Risk + Top Customers — side by side */}
        {(atRiskSubs.length > 0 || topCustomers.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {atRiskSubs.length > 0 && (
              <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
                <CardHeader className="py-2.5 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> At-Risk (next 14 days)
                    <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">{atRiskSubs.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                    {atRiskSubs.map(s => {
                      const d = getDaysLeft(s.end_date);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate leading-tight">{s.customers?.name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate leading-tight">{s.product_name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge className={`h-5 px-1.5 text-[10px] ${d <= 3 ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"}`}>{d}d</Badge>
                            <Button size="icon" variant="ghost" className="h-9 w-9 text-green-600 hover:bg-green-500/10" aria-label="Send WhatsApp reminder" onClick={() => sendWhatsAppReminder(s)}>
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {topCustomers.length > 0 && (
              <Card>
                <CardHeader className="py-2.5 px-3">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Crown className="h-3.5 w-3.5 text-amber-500" /> Top Customers by Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 pb-3">
                  <div className="space-y-2">
                    {topCustomers.map((c, i) => {
                      const medal = ["🥇", "🥈", "🥉"][i] || `#${i + 1}`;
                      const max = topCustomers[0].revenue || 1;
                      return (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className="text-sm w-6 text-center shrink-0">{medal}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="text-xs font-medium truncate">{c.name}</p>
                              <p className="text-xs font-bold shrink-0">{formatCurrency(c.revenue, 0)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={(c.revenue / max) * 100} className="h-1 flex-1" />
                              <span className="text-[10px] text-muted-foreground shrink-0">{c.count} sub{c.count > 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="subscriptions" className="gap-1.5 text-xs sm:text-sm">
              <RefreshCw className="h-3.5 w-3.5" /> Subscriptions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="calculator" className="gap-1.5 text-xs sm:text-sm">
              <Calculator className="h-3.5 w-3.5" /> Calculator
            </TabsTrigger>
          </TabsList>

          {/* Subscriptions Tab */}
          <TabsContent value="subscriptions" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by order ID, name, phone or product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">{filtered.length} subscriptions found</p>
              {filtered.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    className="!h-4 !w-4 shrink-0 aspect-square"
                    checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
                    onCheckedChange={(c) => {
                      if (c) setSelectedIds(new Set(filtered.map(s => s.id)));
                      else clearSelection();
                    }}
                  />
                  <Label htmlFor="select-all" className="text-xs cursor-pointer">Select all</Label>
                </div>
              )}
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 backdrop-blur-sm shadow-md p-3">
                <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> {selectedIds.size} selected</Badge>
                <div className="flex-1" />
                <Button size="sm" variant="outline" className="gap-1.5 text-green-600" disabled={bulkBusy} onClick={bulkRemind}>
                  <MessageCircle className="h-4 w-4" /> Remind All
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-primary" disabled={bulkBusy} onClick={bulkRenew}>
                  <RotateCcw className="h-4 w-4" /> Renew All
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={bulkBusy} onClick={bulkDelete}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
              </div>
            )}

            {filtered.length === 0 ? (
              <Card className="flex flex-col items-center justify-center py-16">
                <RefreshCw className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <h3 className="font-semibold mb-1">No subscriptions found</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first subscription to get started</p>
                <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Subscription</Button>
              </Card>
            ) : (
              <>
                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 pb-safe">
                  {filtered.map((s) => {
                    const daysLeft = getDaysLeft(s.end_date);
                    const isExpired = daysLeft < 0;
                    return (
                      <Card key={s.id} className={`overflow-hidden transition-all hover:shadow-md ${selectedIds.has(s.id) ? "ring-2 ring-primary border-primary" : isExpired ? "border-destructive/30" : daysLeft <= 3 ? "border-amber-300/50" : ""}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              className="mt-0.5 !h-4 !w-4 shrink-0 aspect-square"
                              checked={selectedIds.has(s.id)}
                              onCheckedChange={() => toggleSelect(s.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm">{s.customers?.name || "No customer"}</p>
                              <p className="text-xs text-muted-foreground">{s.product_name} · {s.variation}</p>
                            </div>
                            {getStatusBadge(s)}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {s.end_date ? fnsFormat(new Date(s.end_date), "dd MMM yyyy") : "—"}
                            </span>
                            <span className="font-medium text-foreground">{formatCurrency(s.price, 0)}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t">
                            <Button variant="outline" size="sm" className="flex-1 gap-1 text-green-600" onClick={() => sendWhatsAppReminder(s)}>
                              <MessageCircle className="h-3.5 w-3.5" /> Remind
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 gap-1 text-primary" onClick={() => handleRenew(s)}>
                              <RotateCcw className="h-3.5 w-3.5" /> Renew
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
                              onCheckedChange={(c) => {
                                if (c) setSelectedIds(new Set(filtered.map(s => s.id)));
                                else clearSelection();
                              }}
                            />
                          </TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Subscription</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Renewals</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((s) => {
                          const daysLeft = getDaysLeft(s.end_date);
                          const isExpired = daysLeft < 0;
                          return (
                            <TableRow key={s.id} className={`group transition-colors ${selectedIds.has(s.id) ? "bg-primary/5 hover:bg-primary/10" : isExpired ? "bg-destructive/5 hover:bg-destructive/10" : daysLeft <= 3 ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/50"}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.has(s.id)}
                                  onCheckedChange={() => toggleSelect(s.id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{s.customers?.name || "—"}</p>
                                  {s.customers?.phone && <p className="text-xs text-muted-foreground">{s.customers.phone}</p>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium">{s.product_name}</p>
                                  <p className="text-xs text-muted-foreground">{s.variation}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-bold text-sm">{formatCurrency(s.price)}</TableCell>
                              <TableCell className="text-sm">
                                {s.end_date ? fnsFormat(new Date(s.end_date), "dd MMM yyyy") : "—"}
                              </TableCell>
                              <TableCell>{getStatusBadge(s)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">⟳ {s.renewals}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => sendWhatsAppReminder(s)} title="WhatsApp">
                                    <MessageCircle className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleRenew(s)} title="Renew">
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Expiry Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Upcoming Expiries (30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {expiryTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={expiryTimeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value: number, name: string) => [name === "value" ? formatCurrency(value, 0) : value, name === "value" ? "Revenue" : "Count"]}
                        />
                        <Bar dataKey="expiring" name="Expiring" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                      No upcoming expiries
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-primary" /> Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statusDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <RePieChart>
                        <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </RePieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </CardContent>
              </Card>

              {/* Plan/Variation Breakdown */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Plan Breakdown (Active)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {variationBreakdown.length > 0 ? (
                    <div className="space-y-3">
                      {variationBreakdown.map((v, i) => (
                        <div key={v.name} className="flex items-center gap-4">
                          <div className="w-24 text-sm font-medium">{v.name}</div>
                          <div className="flex-1">
                            <Progress value={stats.activeCount > 0 ? (v.count / stats.activeCount) * 100 : 0} className="h-3" />
                          </div>
                          <div className="text-sm text-right w-24">
                            <span className="font-bold">{v.count}</span>
                            <span className="text-muted-foreground ml-1">({formatCurrency(v.revenue, 0)})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-sm">No active subscriptions</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Calculator Tab */}
          <TabsContent value="calculator" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Revenue & Profit Calculator
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Plan Price ({symbol})</Label>
                      <Input type="number" value={calc.planPrice || ""} onChange={(e) => setCalc({ ...calc, planPrice: Number(e.target.value) })} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cost Price ({symbol})</Label>
                      <Input type="number" value={calc.costPrice || ""} onChange={(e) => setCalc({ ...calc, costPrice: Number(e.target.value) })} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Customers</Label>
                      <Input type="number" value={calc.customers || ""} onChange={(e) => setCalc({ ...calc, customers: Number(e.target.value) })} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Duration</Label>
                      <Select value={calc.duration} onValueChange={(v) => setCalc({ ...calc, duration: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VARIATIONS.map((v) => <SelectItem key={v.label} value={v.label}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Revenue</span>
                        <span className="font-semibold">{formatCurrency(calcRevenue)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="font-semibold">{formatCurrency(calcCost)}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="font-medium">Profit</span>
                        <span className={`font-bold ${calcProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                          {formatCurrency(calcProfit)}
                        </span>
                      </div>
                      {calcRevenue > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Margin</span>
                          <span>{((calcProfit / calcRevenue) * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              {/* Renewal Estimator */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Renewal Forecast
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="bg-amber-50/50 dark:bg-amber-950/10">
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-amber-600">{stats.expiringWeek}</p>
                        <p className="text-xs text-muted-foreground">Expiring 7 days</p>
                        <p className="text-sm font-semibold text-amber-700 mt-1">
                          {formatCurrency(subs.filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 7).reduce((sum, s) => sum + Number(s.price), 0), 0)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50/50 dark:bg-blue-950/10">
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-blue-600">{stats.expiring30}</p>
                        <p className="text-xs text-muted-foreground">Expiring 30 days</p>
                        <p className="text-sm font-semibold text-blue-700 mt-1">
                          {formatCurrency(subs.filter(s => s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 30).reduce((sum, s) => sum + Number(s.price), 0), 0)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card className="mt-3">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Active Portfolio</p>
                        <Badge variant="outline">{stats.activeCount} subs</Badge>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(stats.activeRevenue, 0)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Monthly recurring: {formatCurrency(stats.mrr, 0)}</p>
                      <Progress value={stats.renewalRate} className="h-1.5 mt-3" />
                      <p className="text-[10px] text-muted-foreground mt-1">{stats.renewalRate.toFixed(0)}% renewal rate</p>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {editId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editId ? "Edit Subscription" : "Add Subscription"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-6">
              {/* Live Preview */}
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Preview</p>
                      <p className="text-sm font-medium">{form.product_name || "Product name"}</p>
                      <p className="text-xs text-muted-foreground">{form.variation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{form.price ? formatCurrency(Number(form.price), 0) : `${symbol}0`}</p>
                      {form.start_date && (
                        <p className="text-[10px] text-muted-foreground">
                          Ends: {getEndDate(form.start_date, form.variation)}
                        </p>
                      )}
                    </div>
                  </div>
                  {form.price && form.cost_price && (
                    <div className="text-xs text-right">
                      <span className={Number(form.price) - Number(form.cost_price) >= 0 ? "text-green-600" : "text-destructive"}>
                        Profit: {formatCurrency(Number(form.price) - Number(form.cost_price), 0)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input value={form.product_name} onChange={(e) => { setForm({ ...form, product_name: e.target.value }); formValidation.clearField("product_name"); }} required placeholder="e.g., Netflix Premium" error={!!formValidation.getError("product_name")} />
                {formValidation.getError("product_name") && <p className="text-xs text-destructive mt-1 animate-fade-in">{formValidation.getError("product_name")}</p>}
              </div>

              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={form.variation} onValueChange={(v) => setForm({ ...form, variation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VARIATIONS.map((v) => <SelectItem key={v.label} value={v.label}>{v.label} ({v.days}d)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Date (auto)</Label>
                  <Input type="date" value={form.start_date ? getEndDate(form.start_date, form.variation) : ""} disabled className="bg-muted" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Price ({symbol})</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => { setForm({ ...form, price: e.target.value }); formValidation.clearField("price"); }} placeholder="0" error={!!formValidation.getError("price")} />
                  {formValidation.getError("price") && <p className="text-xs text-destructive mt-1 animate-fade-in">{formValidation.getError("price")}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Cost ({symbol})</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => { setForm({ ...form, cost_price: e.target.value }); formValidation.clearField("cost_price"); }} placeholder="0" error={!!formValidation.getError("cost_price")} />
                  {formValidation.getError("cost_price") && <p className="text-xs text-destructive mt-1 animate-fade-in">{formValidation.getError("cost_price")}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Additional details..." />
              </div>

              <Button type="submit" className="w-full gap-2">
                {editId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editId ? "Update Subscription" : "Create Subscription"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>

        {/* WhatsApp Message Template Editor */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-green-600" />
                WhatsApp Reminder Template
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Customize the message sent when you click <span className="font-medium">Remind</span>. Use the placeholders below — they get replaced automatically per customer.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  "{customer_name}", "{product_name}", "{variation}", "{days_left}",
                  "{end_date}", "{price}", "{store_name}", "{status_text}",
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTemplateDraft((p) => p + " " + tag)}
                    className="text-[11px] font-mono px-2 py-1.5 rounded-md border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 transition-colors text-left truncate"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Message template</Label>
                <Textarea
                  value={templateDraft}
                  onChange={(e) => setTemplateDraft(e.target.value)}
                  rows={6}
                  className="text-sm font-mono"
                  placeholder={DEFAULT_WA_TEMPLATE}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Live Preview</p>
                <p className="text-sm whitespace-pre-wrap">
                  {renderTemplate(templateDraft || DEFAULT_WA_TEMPLATE, {
                    customer_name: "Rishi Mali",
                    product_name: "Canva Premium",
                    variation: "1 Month",
                    days_left: 3,
                    end_date: fnsFormat(addDays(new Date(), 3), "dd MMM yyyy"),
                    price: `${symbol}100`,
                    store_name: activeStore?.name || "Your Store",
                  })}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => setTemplateDraft(DEFAULT_WA_TEMPLATE)}
                className="gap-1.5"
              >
                <RotateCw className="h-4 w-4" /> Reset
              </Button>
              <Button
                onClick={() => {
                  const next = (templateDraft || "").trim() || DEFAULT_WA_TEMPLATE;
                  setWaTemplate(next);
                  localStorage.setItem(TEMPLATE_STORAGE_KEY, next);
                  setTemplateOpen(false);
                  toast.success("Template saved");
                }}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" /> Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <SubscriptionRenewalWizard
        open={renewOpen}
        onOpenChange={setRenewOpen}
        subscription={renewSubject}
        onRenewed={() => { fetchAll(); }}
      />
    </DashboardLayout>
  );
};

export default Subscriptions;
