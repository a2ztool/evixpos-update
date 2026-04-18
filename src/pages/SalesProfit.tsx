import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3,
  Download, FileText, Calendar, Percent, Package, ArrowUpRight,
  ArrowDownRight, Target, Zap, PiggyBank, Sparkles, BookOpen,
  ChevronDown, ChevronUp, Lightbulb, Activity, Award, AlertTriangle,
  CheckCircle2, Info, Wallet, LineChart as LineChartIcon
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from "recharts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, differenceInDays } from "date-fns";

interface Order {
  total_amount: number;
  cost_price: number;
  discount: number;
  status: string;
  created_at: string;
  payment_method: string;
  source: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  base_cost: number;
}

interface OrderItem {
  product_id: string | null;
  quantity: number;
  price: number;
  order_id: string;
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7"];

type DatePreset = "today" | "week" | "month" | "last7" | "last30" | "last90" | "year" | "all" | "custom";

const SalesProfit = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>("last30");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [showGuide, setShowGuide] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    const [ordersRes, productsRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("total_amount, cost_price, discount, status, created_at, payment_method, source").eq("store_id", activeStore.id),
      supabase.from("products").select("id, name, price, stock, base_cost").eq("store_id", activeStore.id),
      supabase.from("order_items").select("product_id, quantity, price, order_id")
    ]);
    if (ordersRes.data) setOrders(ordersRes.data as Order[]);
    if (productsRes.data) setProducts(productsRes.data as Product[]);
    if (itemsRes.data) setOrderItems(itemsRes.data as OrderItem[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => {
    if (user && activeStore) fetchData();
  }, [user, activeStore, fetchData]);

  useEffect(() => {
    if (!user || !activeStore) return;
    const channel = supabase
      .channel(`sales-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${activeStore.id}` }, () => fetchData());
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeStore, fetchData]);

  const getDateRange = useCallback((): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
      case "week": return { from: startOfWeek(now), to: endOfWeek(now) };
      case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last7": return { from: subDays(now, 7), to: now };
      case "last30": return { from: subDays(now, 30), to: now };
      case "last90": return { from: subDays(now, 90), to: now };
      case "year": return { from: new Date(now.getFullYear(), 0, 1), to: now };
      case "custom":
        if (customDateFrom && customDateTo) return { from: customDateFrom, to: customDateTo };
        return null;
      case "all": return null;
      default: return null;
    }
  }, [datePreset, customDateFrom, customDateTo]);

  const completedOrders = useMemo(() => {
    const range = getDateRange();
    return orders.filter((o) => {
      if (o.status !== "completed") return false;
      if (range) {
        const d = new Date(o.created_at);
        if (!isWithinInterval(d, { start: range.from, end: range.to })) return false;
      }
      return true;
    });
  }, [orders, getDateRange]);

  const allFilteredOrders = useMemo(() => {
    const range = getDateRange();
    return orders.filter((o) => {
      if (range) {
        const d = new Date(o.created_at);
        if (!isWithinInterval(d, { start: range.from, end: range.to })) return false;
      }
      return true;
    });
  }, [orders, getDateRange]);

  // Previous period comparison
  const prevPeriodStats = useMemo(() => {
    const range = getDateRange();
    if (!range) return null;
    const days = Math.max(1, differenceInDays(range.to, range.from));
    const prevTo = subDays(range.from, 1);
    const prevFrom = subDays(prevTo, days);
    const prev = orders.filter((o) => {
      if (o.status !== "completed") return false;
      const d = new Date(o.created_at);
      return isWithinInterval(d, { start: prevFrom, end: prevTo });
    });
    const revenue = prev.reduce((s, o) => s + Number(o.total_amount), 0);
    const cost = prev.reduce((s, o) => s + Number(o.cost_price), 0);
    return { revenue, cost, profit: revenue - cost, count: prev.length };
  }, [orders, getDateRange]);

  const stats = useMemo(() => {
    const revenue = completedOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const cost = completedOrders.reduce((s, o) => s + Number(o.cost_price), 0);
    const discount = completedOrders.reduce((s, o) => s + Number(o.discount), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgOrderValue = completedOrders.length > 0 ? revenue / completedOrders.length : 0;
    const pendingOrders = allFilteredOrders.filter((o) => o.status === "pending").length;
    const cancelledOrders = allFilteredOrders.filter((o) => o.status === "cancelled").length;
    const conversionRate = allFilteredOrders.length > 0 ? (completedOrders.length / allFilteredOrders.length) * 100 : 0;
    return {
      revenue, cost, profit, margin, discount, avgOrderValue, conversionRate,
      completedCount: completedOrders.length,
      pendingCount: pendingOrders,
      cancelledCount: cancelledOrders,
      totalOrders: allFilteredOrders.length
    };
  }, [completedOrders, allFilteredOrders]);

  const deltas = useMemo(() => {
    if (!prevPeriodStats) return null;
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      revenue: pct(stats.revenue, prevPeriodStats.revenue),
      profit: pct(stats.profit, prevPeriodStats.profit),
      cost: pct(stats.cost, prevPeriodStats.cost),
      orders: pct(stats.completedCount, prevPeriodStats.count),
    };
  }, [stats, prevPeriodStats]);

  const dailyTrend = useMemo(() => {
    const map: Record<string, { day: string; revenue: number; cost: number; profit: number; orders: number }> = {};
    completedOrders.forEach((o) => {
      const d = format(new Date(o.created_at), "dd MMM");
      if (!map[d]) map[d] = { day: d, revenue: 0, cost: 0, profit: 0, orders: 0 };
      map[d].revenue += Number(o.total_amount);
      map[d].cost += Number(o.cost_price);
      map[d].profit += Number(o.total_amount) - Number(o.cost_price);
      map[d].orders++;
    });
    return Object.values(map).reverse().slice(-14);
  }, [completedOrders]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, { month: string; revenue: number; cost: number; profit: number; orders: number }> = {};
    completedOrders.forEach((o) => {
      const m = format(new Date(o.created_at), "MMM yy");
      if (!map[m]) map[m] = { month: m, revenue: 0, cost: 0, profit: 0, orders: 0 };
      map[m].revenue += Number(o.total_amount);
      map[m].cost += Number(o.cost_price);
      map[m].profit += Number(o.total_amount) - Number(o.cost_price);
      map[m].orders++;
    });
    return Object.values(map).reverse();
  }, [completedOrders]);

  const paymentMethodData = useMemo(() => {
    const map: Record<string, number> = {};
    completedOrders.forEach((o) => {
      const m = o.payment_method || "cash";
      map[m] = (map[m] || 0) + Number(o.total_amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    completedOrders.forEach((o) => {
      const s = o.source || "manual";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
    orderItems.forEach((item) => {
      if (!item.product_id) return;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return;
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { name: product.name, qty: 0, revenue: 0, profit: 0 };
      }
      productSales[item.product_id].qty += item.quantity;
      productSales[item.product_id].revenue += Number(item.price) * item.quantity;
      productSales[item.product_id].profit += (Number(item.price) - product.base_cost) * item.quantity;
    });
    return Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orderItems, products]);

  // Best/worst day
  const bestWorstDay = useMemo(() => {
    if (dailyTrend.length === 0) return null;
    const sorted = [...dailyTrend].sort((a, b) => b.revenue - a.revenue);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [dailyTrend]);

  // Insights
  const insights = useMemo(() => {
    const list: { type: "good" | "warn" | "info"; text: string }[] = [];
    if (stats.margin >= 30) list.push({ type: "good", text: `Excellent profit margin of ${stats.margin.toFixed(1)}% — well above industry avg.` });
    else if (stats.margin >= 15) list.push({ type: "info", text: `Healthy ${stats.margin.toFixed(1)}% margin. Try upselling to push past 30%.` });
    else if (stats.revenue > 0) list.push({ type: "warn", text: `Low margin (${stats.margin.toFixed(1)}%). Review pricing or supplier costs.` });

    if (deltas && deltas.revenue > 10) list.push({ type: "good", text: `Revenue up ${deltas.revenue.toFixed(0)}% vs previous period 🎉` });
    else if (deltas && deltas.revenue < -10) list.push({ type: "warn", text: `Revenue dropped ${Math.abs(deltas.revenue).toFixed(0)}%. Check campaigns or stock.` });

    if (stats.cancelledCount > stats.completedCount * 0.1 && stats.totalOrders > 5) {
      list.push({ type: "warn", text: `${stats.cancelledCount} cancellations — investigate fulfilment or stock issues.` });
    }
    if (stats.discount > stats.revenue * 0.15 && stats.revenue > 0) {
      list.push({ type: "info", text: `Discounts are ${((stats.discount / stats.revenue) * 100).toFixed(0)}% of revenue. Consider tightening promo rules.` });
    }
    if (bestWorstDay && bestWorstDay.best.revenue > 0) {
      list.push({ type: "info", text: `Best day: ${bestWorstDay.best.day} (৳${bestWorstDay.best.revenue.toLocaleString()}). Replicate the strategy!` });
    }
    if (list.length === 0) list.push({ type: "info", text: "Start logging orders to unlock smart insights." });
    return list.slice(0, 4);
  }, [stats, deltas, bestWorstDay]);

  const exportCSV = () => {
    const headers = ["Date", "Revenue", "Cost", "Profit", "Discount", "Payment Method", "Source", "Status"];
    const rows = completedOrders.map((o) => [
      format(new Date(o.created_at), "yyyy-MM-dd"),
      Number(o.total_amount).toFixed(2),
      Number(o.cost_price).toFixed(2),
      (Number(o.total_amount) - Number(o.cost_price)).toFixed(2),
      Number(o.discount).toFixed(2),
      o.payment_method,
      o.source,
      o.status
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-profit-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const renderDelta = (val: number | undefined | null) => {
    if (val === null || val === undefined) return null;
    const pos = val >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${pos ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
        {pos ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
        {Math.abs(val).toFixed(1)}%
      </span>
    );
  };

  return (
    <DashboardLayout>
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 p-5 sm:p-6 mb-5">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-lg shrink-0">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sales & Profit</h1>
                <Badge className="bg-gradient-to-r from-primary to-violet-500 text-white border-0 text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> PRO
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Real-time revenue, margins & smart insights to grow profit
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowGuide(!showGuide)} className="gap-1.5 rounded-xl">
              <BookOpen className="h-4 w-4" /> Guide {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  <Download className="h-4 w-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportCSV}>
                  <FileText className="h-4 w-4 mr-2" /> Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="last90">Last 90 Days</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Quick Guide Panel */}
      {showGuide && (
        <Card className="mb-5 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Quick Guide — Master your Sales & Profit</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Understand what each metric means and how to act on it.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: DollarSign, color: "text-blue-500 bg-blue-500/10", title: "Revenue", desc: "Total sales from completed orders. Use date filters to compare periods." },
                { icon: TrendingDown, color: "text-red-500 bg-red-500/10", title: "Cost (COGS)", desc: "Sum of product base costs. Lower this via better suppliers." },
                { icon: Percent, color: "text-violet-500 bg-violet-500/10", title: "Profit Margin", desc: "Healthy: >20%. Below 10%? Review pricing or discounts." },
                { icon: Activity, color: "text-emerald-500 bg-emerald-500/10", title: "Period Comparison", desc: "Green ▲ means growth vs previous equal period. Red ▼ = decline." },
                { icon: Award, color: "text-amber-500 bg-amber-500/10", title: "Top Products", desc: "Focus marketing on these. Bundle slow movers with bestsellers." },
                { icon: Download, color: "text-cyan-500 bg-cyan-500/10", title: "Export CSV", desc: "Download for accounting, tax filing or external analysis." },
              ].map((g) => (
                <div key={g.title} className="flex gap-3 p-3 rounded-xl bg-card border border-border/40">
                  <div className={`h-8 w-8 rounded-lg ${g.color} flex items-center justify-center shrink-0`}>
                    <g.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{g.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom date range */}
      {datePreset === "custom" && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl">
                <Calendar className="h-3.5 w-3.5" />
                {customDateFrom ? format(customDateFrom, "dd MMM yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl">
                <Calendar className="h-3.5 w-3.5" />
                {customDateTo ? format(customDateTo, "dd MMM yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={customDateTo} onSelect={setCustomDateTo} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Primary KPI Cards — compact horizontal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Revenue", value: `৳${stats.revenue.toLocaleString()}`, icon: DollarSign, bg: "bg-blue-500/10 text-blue-500", delta: deltas?.revenue, valueClass: "" },
          { label: "Total Cost", value: `৳${stats.cost.toLocaleString()}`, icon: TrendingDown, bg: "bg-red-500/10 text-red-500", delta: deltas?.cost, valueClass: "text-destructive" },
          { label: "Net Profit", value: `${stats.profit >= 0 ? "+" : ""}৳${stats.profit.toLocaleString()}`, icon: stats.profit >= 0 ? ArrowUpRight : ArrowDownRight, bg: stats.profit >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500", delta: deltas?.profit, valueClass: stats.profit >= 0 ? "text-emerald-600" : "text-destructive" },
          { label: "Profit Margin", value: `${stats.margin.toFixed(1)}%`, icon: Percent, bg: "bg-violet-500/10 text-violet-500", delta: null, valueClass: stats.margin >= 20 ? "text-emerald-600" : stats.margin >= 0 ? "text-amber-500" : "text-destructive" },
        ].map((k) => (
          <Card key={k.label} className="rounded-2xl">
            <CardContent className="!p-3.5 sm:!p-4 flex items-center gap-3">
              <div className={`h-9 w-9 shrink-0 rounded-xl ${k.bg} flex items-center justify-center`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{k.label}</p>
                  {renderDelta(k.delta)}
                </div>
                {loading ? <Skeleton className="h-6 w-20 mt-1" /> : (
                  <p className={`text-lg sm:text-xl font-bold tabular-nums mt-0.5 truncate ${k.valueClass}`}>{k.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-5">
        {[
          { label: "Completed", value: stats.completedCount.toString(), icon: ShoppingCart, color: "text-emerald-600 bg-emerald-500/10" },
          { label: "Pending", value: stats.pendingCount.toString(), icon: Target, color: "text-amber-500 bg-amber-500/10" },
          { label: "Cancelled", value: stats.cancelledCount.toString(), icon: TrendingDown, color: "text-red-500 bg-red-500/10" },
          { label: "Avg Order", value: `৳${stats.avgOrderValue.toFixed(0)}`, icon: Zap, color: "text-primary bg-primary/10" },
          { label: "Discounts", value: `৳${stats.discount.toFixed(0)}`, icon: PiggyBank, color: "text-violet-500 bg-violet-500/10" },
          { label: "Conv. Rate", value: `${stats.conversionRate.toFixed(0)}%`, icon: Activity, color: "text-cyan-500 bg-cyan-500/10" },
        ].map((m) => (
          <Card key={m.label} className="rounded-2xl">
            <CardContent className="!p-3 text-center">
              <div className={`h-7 w-7 rounded-lg ${m.color} flex items-center justify-center mx-auto mb-1.5`}>
                <m.icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">{m.label}</p>
              {loading ? <Skeleton className="h-4 w-12 mx-auto mt-1" /> : (
                <p className="text-sm font-bold tabular-nums">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Smart Insights */}
      {!loading && (
        <Card className="mb-5 rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 via-card to-violet-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold">Smart Insights</h3>
              <Badge variant="outline" className="text-[10px] ml-auto">AI Powered</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {insights.map((ins, i) => {
                const cfg = ins.type === "good"
                  ? { Icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10" }
                  : ins.type === "warn"
                  ? { Icon: AlertTriangle, cls: "text-amber-500 bg-amber-500/10" }
                  : { Icon: Info, cls: "text-blue-500 bg-blue-500/10" };
                return (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-card border border-border/40">
                    <div className={`h-7 w-7 rounded-lg ${cfg.cls} flex items-center justify-center shrink-0`}>
                      <cfg.Icon className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-xs leading-relaxed">{ins.text}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex rounded-xl">
          <TabsTrigger value="overview" className="gap-1.5 rounded-lg"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span></TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5 rounded-lg"><LineChartIcon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Trends</span></TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5 rounded-lg"><Package className="h-3.5 w-3.5" /><span className="hidden sm:inline">Products</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5 mt-0">
          {/* Main Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Revenue, Cost & Profit Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="!pt-0">
                {loading ? <Skeleton className="h-[240px] w-full" /> : dailyTrend.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No sales data for this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="day" fontSize={10} tickLine={false} />
                      <YAxis fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                      <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profitGrad)" strokeWidth={2} name="Profit" />
                      <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Cost" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" /> Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent className="!pt-0">
                {loading ? <Skeleton className="h-[240px] w-full" /> : paymentMethodData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                    <DollarSign className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No payment data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={paymentMethodData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                        {paymentMethodData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: number) => [`৳${v.toLocaleString()}`, "Amount"]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Profit Breakdown */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" /> Profit Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-20 w-full" /> : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="text-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Gross Revenue</p>
                      <p className="text-base font-bold tabular-nums">৳{stats.revenue.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Total Cost</p>
                      <p className="text-base font-bold text-destructive tabular-nums">-৳{stats.cost.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Discounts</p>
                      <p className="text-base font-bold text-amber-500 tabular-nums">-৳{stats.discount.toLocaleString()}</p>
                    </div>
                    <div className={`text-center p-3 rounded-xl border ${stats.profit >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Net Profit</p>
                      <p className={`text-base font-bold tabular-nums ${stats.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {stats.profit >= 0 ? "+" : ""}৳{stats.profit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Profit Margin Health</span>
                      <span className="font-semibold">{stats.margin.toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.max(0, Math.min(100, stats.margin))} className="h-2" />
                    <p className="text-[10px] text-muted-foreground">
                      {stats.margin >= 30 ? "🚀 Excellent — keep it up!" : stats.margin >= 15 ? "👍 Healthy margin." : stats.margin >= 5 ? "⚠️ Below average — review costs." : "🔴 Critical — urgent action needed."}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-5 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Monthly Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="!pt-0">
                {loading ? <Skeleton className="h-[220px] w-full" /> : monthlyTrend.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                    <Calendar className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No monthly data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="month" fontSize={10} tickLine={false} />
                      <YAxis fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                      <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Cost" />
                      <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Order Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[220px] w-full" /> : sourceData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                    <Target className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No source data</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-2">
                    {sourceData.map((s, i) => {
                      const total = sourceData.reduce((sum, x) => sum + x.value, 0);
                      const pct = total > 0 ? (s.value / total) * 100 : 0;
                      return (
                        <div key={s.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium capitalize">{s.name}</span>
                            <span className="text-muted-foreground">{s.value} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Best & Worst Day */}
          {bestWorstDay && bestWorstDay.best.revenue > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Best Day</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">৳{bestWorstDay.best.revenue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{bestWorstDay.best.day} • {bestWorstDay.best.orders} orders</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Slowest Day</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">৳{bestWorstDay.worst.revenue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{bestWorstDay.worst.day} • {bestWorstDay.worst.orders} orders</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-5 mt-0">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Top Selling Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">No product sales data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((p, i) => {
                    const maxRev = topProducts[0].revenue || 1;
                    const pct = (p.revenue / maxRev) * 100;
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <div key={i} className="p-3.5 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-muted/30 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${i === 0 ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white" : i === 1 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white" : i === 2 ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white" : "bg-primary/10 text-primary"}`}>
                            #{i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">{p.qty} units • {margin.toFixed(0)}% margin</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold tabular-nums">৳{p.revenue.toLocaleString()}</p>
                            <p className={`text-[10px] tabular-nums ${p.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                              +৳{p.profit.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default SalesProfit;
