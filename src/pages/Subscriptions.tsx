import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Search, RefreshCw, MessageCircle,
  RotateCcw, ChevronDown, ChevronUp, TrendingUp, Users, Calculator,
  Bell, Clock, CheckCircle2, XCircle, AlertTriangle, Download,
  BarChart3, PieChart, Calendar, DollarSign, ArrowUpRight,
  ArrowDownRight, Eye, Zap, ShieldCheck, Timer
} from "lucide-react";
import { differenceInDays, addDays, format as fnsFormat, subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

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
  customers?: { name: string; phone: string; email?: string } | null;
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

const Subscriptions = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { format: formatCurrency, symbol } = useCurrency();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("subscriptions");
  const [calcOpen, setCalcOpen] = useState(false);
  const [calc, setCalc] = useState({ planPrice: 0, costPrice: 0, customers: 0, duration: "1 Month" });

  const fetchAll = useCallback(async () => {
    if (!activeStore || !user) return;
    setLoading(true);
    const [{ data: subData }, { data: custData }] = await Promise.all([
      supabase.from("subscriptions").select("*, customers(name, phone)").eq("store_id", activeStore.id).order("end_date", { ascending: true }),
      supabase.from("customers").select("id, name, phone").eq("store_id", activeStore.id),
    ]);
    if (subData) setSubs(subData as Subscription[]);
    if (custData) setCustomers(custData as Customer[]);
    setLoading(false);
  }, [activeStore, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
      const matchSearch = [s.product_name, s.customers?.name, s.customers?.phone]
        .some((f) => (f || "").toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;
      if (statusFilter === "active") return s.status === "active" && getDaysLeft(s.end_date) >= 0;
      if (statusFilter === "expiring") return s.status === "active" && getDaysLeft(s.end_date) >= 0 && getDaysLeft(s.end_date) <= 7;
      if (statusFilter === "expired") return s.status === "expired" || getDaysLeft(s.end_date) < 0;
      if (statusFilter === "cancelled") return s.status === "cancelled";
      return true;
    });
  }, [subs, search, statusFilter]);

  // Handlers
  const openAdd = () => { setEditId(null); setForm(emptyForm); setSheetOpen(true); };
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
    if (!form.product_name.trim()) { toast.error("Product name is required"); return; }
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
      plan: "free" as const,
    };
    if (editId) {
      const { error } = await supabase.from("subscriptions").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Subscription updated ✓");
    } else {
      const { error } = await supabase.from("subscriptions").insert({ ...payload, user_id: user!.id, store_id: activeStore?.id });
      if (error) toast.error(error.message); else toast.success("Subscription created! 🎉");
    }
    setSheetOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Deleted");
  };

  const handleRenew = async (s: Subscription) => {
    const newStart = s.end_date || fnsFormat(new Date(), "yyyy-MM-dd");
    const newEnd = getEndDate(newStart, s.variation);
    const { error } = await supabase.from("subscriptions").update({
      start_date: newStart, end_date: newEnd,
      renewals: (s.renewals || 0) + 1, status: "active",
    }).eq("id", s.id);
    if (error) toast.error(error.message); else toast.success("Renewed successfully! 🔄");
  };

  const sendWhatsAppReminder = (s: Subscription) => {
    const customer = customers.find((c) => c.id === s.customer_id);
    if (!customer?.phone) { toast.error("Customer has no phone number"); return; }
    const daysLeft = getDaysLeft(s.end_date);
    const message = `Hi ${customer.name}, your subscription for "${s.product_name}" (${s.variation}) ${daysLeft <= 0 ? "has expired" : `will expire in ${daysLeft} days (${fnsFormat(new Date(s.end_date!), "dd MMM yyyy")})`}. Please renew to continue the service. Thank you!`;
    window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
    toast.success("WhatsApp opened");
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <RefreshCw className="h-6 w-6 text-primary" />
              </div>
              Subscriptions
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage subscriptions, renewals & revenue tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Subscription
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-green-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Active</p>
                <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.activeCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                MRR: {formatCurrency(stats.mrr, 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Expiring Soon</p>
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.expiringWeek}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                {stats.expiringToday} expire today
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-red-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Expired</p>
                <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-destructive">{stats.expiredCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Churn: {stats.churnRate.toFixed(0)}%
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-primary">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Total Revenue</p>
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(stats.totalRevenue, 0)}</p>
              <p className={`text-[10px] sm:text-xs mt-1 ${stats.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                Profit: {formatCurrency(stats.profit, 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <RotateCcw className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Renewals</p>
                <p className="text-lg font-bold">{stats.totalRenewals}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Renewal Rate</p>
                <p className="text-lg font-bold">{stats.renewalRate.toFixed(0)}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Timer className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">30-Day Expiry</p>
                <p className="text-lg font-bold">{stats.expiring30}</p>
              </div>
            </CardContent>
          </Card>
        </div>

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
                <Input placeholder="Search by name, phone or product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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

            <p className="text-sm text-muted-foreground">{filtered.length} subscriptions found</p>

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
                      <Card key={s.id} className={`overflow-hidden transition-all hover:shadow-md ${isExpired ? "border-destructive/30" : daysLeft <= 3 ? "border-amber-300/50" : ""}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
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
                            <TableRow key={s.id} className={`group transition-colors ${isExpired ? "bg-destructive/5 hover:bg-destructive/10" : daysLeft <= 3 ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/50"}`}>
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
                <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required placeholder="e.g., Netflix Premium" />
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
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Cost ({symbol})</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="0" />
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
      </div>
    </DashboardLayout>
  );
};

export default Subscriptions;
