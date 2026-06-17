import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BarChart3, TrendingUp, Users, Package, DollarSign, ShoppingCart,
  Download, FileText, Calendar, ArrowUpRight, ArrowDownRight, Percent,
  RefreshCw, Target, PieChart as PieChartIcon, Sparkles, HelpCircle,
  ChevronDown, ChevronUp, Activity, Gauge, Lightbulb, Zap, AlertCircle,
  CheckCircle2, TrendingDown, Crown, Trophy
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, AreaChart, Area, Legend,
  RadialBarChart, RadialBar
} from "recharts";
import { useCurrency } from "@/hooks/useCurrency";

const CHART_COLORS = [
  "hsl(174, 98%, 21%)", "hsl(217, 91%, 60%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(330, 81%, 60%)",
  "hsl(173, 80%, 40%)", "hsl(24, 95%, 53%)"
];

const Reports = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { activeStore } = useStore();
  const { format: formatPrice } = useCurrency();
  const [orders, setOrders] = useState<any[]>([]);
  const [prevOrdersData, setPrevOrdersData] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [adCosts, setAdCosts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !activeStore) return;
    setLoading(true);
    const days = parseInt(period);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();
    const prevSince = new Date();
    prevSince.setDate(prevSince.getDate() - days * 2);
    const prevSinceISO = prevSince.toISOString();
    const sid = activeStore.id;

    const [o, prevO, p, c, a, t] = await Promise.all([
      supabase.from("orders").select("total_amount, cost_price, status, created_at, customer_id, payment_method, payment_status, source").eq("store_id", sid).gte("created_at", sinceISO),
      supabase.from("orders").select("total_amount, cost_price, status, created_at").eq("store_id", sid).gte("created_at", prevSinceISO).lt("created_at", sinceISO),
      supabase.from("products").select("id, name, price, stock, category, base_cost").eq("store_id", sid),
      supabase.from("customers").select("id, name, created_at").eq("store_id", sid),
      supabase.from("ad_costs").select("amount, revenue, ad_date, platform").eq("store_id", sid).gte("ad_date", since.toISOString().split("T")[0]),
      supabase.from("transactions").select("amount, type, category, created_at").eq("store_id", sid).gte("created_at", sinceISO),
    ]);

    if (o.data) setOrders(o.data);
    if (prevO.data) setPrevOrdersData(prevO.data);
    if (p.data) setProducts(p.data);
    if (c.data) setCustomers(c.data);
    if (a.data) setAdCosts(a.data);
    if (t.data) setTransactions(t.data);
    setLoading(false);
  }, [user, activeStore, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const completedOrders = useMemo(() => orders.filter(o => o.status === "completed"), [orders]);
  const prevCompleted = useMemo(() => prevOrdersData.filter(o => o.status === "completed"), [prevOrdersData]);

  // ── Summary Stats ──
  const stats = useMemo(() => {
    const totalRevenue = completedOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const totalCost = completedOrders.reduce((s, o) => s + Number(o.cost_price || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    const pendingOrders = orders.filter(o => o.status === "pending").length;
    const cancelledOrders = orders.filter(o => o.status === "cancelled").length;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const newCustomers = customers.filter(c => {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));
      return new Date(c.created_at) >= since;
    }).length;
    const totalAdSpend = adCosts.reduce((s, a) => s + Number(a.amount), 0);
    const totalAdRevenue = adCosts.reduce((s, a) => s + Number(a.revenue), 0);
    const roas = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;
    const completionRate = orders.length > 0 ? (completedOrders.length / orders.length) * 100 : 0;

    return {
      totalRevenue, totalCost, totalProfit, avgOrderValue,
      totalOrders: orders.length, completedOrders: completedOrders.length,
      pendingOrders, cancelledOrders, profitMargin, newCustomers,
      totalAdSpend, totalAdRevenue, roas, totalCustomers: customers.length,
      totalProducts: products.length, completionRate
    };
  }, [orders, completedOrders, customers, products, adCosts, period]);

  const prevStats = useMemo(() => {
    const revenue = prevCompleted.reduce((s, o) => s + Number(o.total_amount), 0);
    const cost = prevCompleted.reduce((s, o) => s + Number(o.cost_price || 0), 0);
    return {
      revenue, profit: revenue - cost,
      orders: prevOrdersData.length,
      avg: prevCompleted.length > 0 ? revenue / prevCompleted.length : 0,
    };
  }, [prevCompleted, prevOrdersData]);

  const deltas = useMemo(() => {
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      revenue: pct(stats.totalRevenue, prevStats.revenue),
      profit: pct(stats.totalProfit, prevStats.profit),
      orders: pct(stats.totalOrders, prevStats.orders),
      avg: pct(stats.avgOrderValue, prevStats.avg),
    };
  }, [stats, prevStats]);

  // ── Business Health Score (0-100) ──
  const healthScore = useMemo(() => {
    let score = 0;
    // Profit margin contributes 30
    if (stats.profitMargin >= 30) score += 30;
    else if (stats.profitMargin >= 15) score += 20;
    else if (stats.profitMargin >= 5) score += 10;
    // Completion rate 25
    if (stats.completionRate >= 90) score += 25;
    else if (stats.completionRate >= 70) score += 18;
    else if (stats.completionRate >= 50) score += 10;
    // ROAS 20
    if (stats.roas >= 3) score += 20;
    else if (stats.roas >= 2) score += 14;
    else if (stats.roas >= 1) score += 7;
    // Growth 25
    if (deltas.revenue >= 20) score += 25;
    else if (deltas.revenue >= 5) score += 17;
    else if (deltas.revenue >= 0) score += 10;
    return Math.min(100, score);
  }, [stats, deltas]);

  const healthLabel = healthScore >= 80 ? { text: "Excellent", color: "text-green-600", bg: "bg-green-500/10" }
    : healthScore >= 60 ? { text: "Healthy", color: "text-emerald-600", bg: "bg-emerald-500/10" }
    : healthScore >= 40 ? { text: "Average", color: "text-amber-600", bg: "bg-amber-500/10" }
    : { text: "Needs Attention", color: "text-destructive", bg: "bg-destructive/10" };

  // ── Smart Insights ──
  const insights = useMemo(() => {
    const list: { type: "good" | "warn" | "info"; text: string }[] = [];
    if (deltas.revenue >= 20) list.push({ type: "good", text: `Revenue up ${deltas.revenue.toFixed(0)}% vs previous period — strong growth!` });
    if (deltas.revenue <= -20 && prevStats.revenue > 0) list.push({ type: "warn", text: `Revenue down ${Math.abs(deltas.revenue).toFixed(0)}% — investigate causes.` });
    if (stats.profitMargin >= 30) list.push({ type: "good", text: `Outstanding ${stats.profitMargin.toFixed(0)}% profit margin — excellent pricing!` });
    if (stats.profitMargin < 10 && stats.totalRevenue > 0) list.push({ type: "warn", text: `Low ${stats.profitMargin.toFixed(0)}% margin — review costs and pricing.` });
    if (stats.roas >= 3) list.push({ type: "good", text: `ROAS of ${stats.roas.toFixed(1)}x — ad campaigns highly profitable.` });
    if (stats.roas > 0 && stats.roas < 1) list.push({ type: "warn", text: `ROAS of ${stats.roas.toFixed(1)}x means ads losing money — pause underperformers.` });
    if (stats.pendingOrders > 5) list.push({ type: "warn", text: `${stats.pendingOrders} pending orders — process them to unlock revenue.` });
    if (stats.cancelledOrders > stats.completedOrders * 0.2 && stats.totalOrders > 5) list.push({ type: "warn", text: `High cancellation rate — review fulfillment quality.` });
    if (products.filter(p => p.stock <= 0).length > 5) list.push({ type: "warn", text: `${products.filter(p => p.stock <= 0).length} products out of stock — restock to recover sales.` });
    if (stats.newCustomers >= 10) list.push({ type: "good", text: `${stats.newCustomers} new customers acquired — great reach!` });
    if (list.length === 0) list.push({ type: "info", text: "Add more sales data to unlock personalized insights." });
    return list.slice(0, 5);
  }, [stats, deltas, prevStats, products]);

  // ── Charts data ──
  const revenueTrend = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; profit: number; orders: number }> = {};
    completedOrders.forEach(o => {
      const d = new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      if (!map[d]) map[d] = { date: d, revenue: 0, profit: 0, orders: 0 };
      map[d].revenue += Number(o.total_amount);
      map[d].profit += Number(o.total_amount) - Number(o.cost_price || 0);
      map[d].orders++;
    });
    return Object.values(map);
  }, [completedOrders]);

  const orderStatusData = useMemo(() => [
    { name: "Completed", value: stats.completedOrders, color: "hsl(142, 76%, 36%)" },
    { name: "Pending", value: stats.pendingOrders, color: "hsl(38, 92%, 50%)" },
    { name: "Cancelled", value: stats.cancelledOrders, color: "hsl(0, 84%, 60%)" },
  ].filter(d => d.value > 0), [stats]);

  const paymentMethods = useMemo(() => {
    const map: Record<string, number> = {};
    completedOrders.forEach(o => {
      const m = o.payment_method || "cash";
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value, color: CHART_COLORS[i % CHART_COLORS.length]
    }));
  }, [completedOrders]);

  const topProducts = useMemo(() => {
    return products
      .map(p => ({ name: p.name, stock: p.stock, price: Number(p.price), category: p.category || "Uncategorized" }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 8);
  }, [products]);

  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; orders: number; total: number }> = {};
    completedOrders.filter(o => o.customer_id).forEach(o => {
      const cid = o.customer_id;
      if (!map[cid]) {
        const c = customers.find(c => c.id === cid);
        map[cid] = { name: c?.name || "Unknown", orders: 0, total: 0 };
      }
      map[cid].orders++;
      map[cid].total += Number(o.total_amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [completedOrders, customers]);

  const orderSources = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const s = o.source || "manual";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value, color: CHART_COLORS[i % CHART_COLORS.length]
    }));
  }, [orders]);

  const incomeExpense = useMemo(() => {
    const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return [
      { name: "Income", value: income, color: "hsl(142, 76%, 36%)" },
      { name: "Expense", value: expense, color: "hsl(0, 84%, 60%)" },
    ];
  }, [transactions]);

  const exportCSV = () => {
    const headers = ["Date", "Status", "Amount", "Cost", "Profit", "Payment Method", "Source"];
    const rows = orders.map(o => [
      new Date(o.created_at).toLocaleDateString(),
      o.status, o.total_amount, o.cost_price || 0,
      Number(o.total_amount) - Number(o.cost_price || 0),
      o.payment_method, o.source
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${activeStore?.name || "store"}-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const DeltaChip = ({ value }: { value: number }) => {
    if (!isFinite(value) || prevStats.revenue === 0 && value === 0) return null;
    const positive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${positive ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
        {positive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
        {Math.abs(value).toFixed(0)}%
      </span>
    );
  };

    const TINTS: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  const StatCard = ({ label, value, icon: Icon, sub, delta, tint }: any) => {
    const iconWrap = TINTS[tint || "primary"] || TINTS.primary;
    return (
      <Card className="group relative overflow-hidden rounded-2xl border-border/60 bg-card hover:shadow-md hover:border-border transition-all duration-200">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground font-medium truncate">{label}</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold leading-none tracking-tight truncate">{value}</p>
            </div>
            <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${iconWrap}`}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            {sub ? (
              <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
            ) : <span />}
            {delta !== undefined && <DeltaChip value={delta} />}
          </div>
        </CardContent>
      </Card>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>
            {p.name}: {typeof p.value === "number" ? formatPrice(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-2.5 sm:space-y-3">
        {/* Premium Hero Header */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-3 sm:p-4">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-primary/15 shrink-0">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight">{t.reportsAnalytics}</h1>
                  <Badge className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground border-0 text-[9px] px-1.5 py-0 h-4">
                    <Sparkles className="h-2 w-2 mr-0.5" /> PRO
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                Business insights for <span className="font-semibold text-foreground">{activeStore?.name || "your store"}</span> · Last {period} days
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[130px] sm:w-[140px] h-8 text-xs bg-background">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                  <SelectItem value="365">Last Year</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchData} className="h-8 bg-background">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs bg-background">
                <Download className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Guide */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent rounded-xl">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-2.5 hover:bg-primary/5 rounded-xl transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1 rounded-md bg-primary/15">
                    <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold leading-tight">Quick Guide</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">How to read your business reports</p>
                  </div>
                </div>
                {guideOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { icon: Gauge, title: "Health Score", desc: "0–100 score from margin, completion, ROAS & growth. Aim for 80+." },
                    { icon: TrendingUp, title: "Period Deltas", desc: "Each KPI compares to the previous equal period. Green = growing." },
                    { icon: Lightbulb, title: "Smart Insights", desc: "Auto-generated alerts on margins, ROAS, stock & cancellations." },
                    { icon: Download, title: "Export CSV", desc: "Download all orders for the selected period for accounting." },
                  ].map((g, i) => (
                    <div key={i} className="flex gap-2.5 p-3 rounded-xl bg-card border border-border/40">
                      <div className="p-1.5 rounded-lg bg-primary/10 h-fit shrink-0">
                        <g.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{g.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{g.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-3">
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-muted rounded w-20" />
                    <div className="h-6 bg-muted rounded w-16" />
                    <div className="h-2 bg-muted rounded w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Compact Business Health + Sub-metrics strip */}
            <Card className="border-border/40 overflow-hidden rounded-xl">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                  <div className="flex items-center gap-3 sm:flex-1 min-w-0">
                    <div className={`relative shrink-0 ${healthLabel.bg} p-2 rounded-xl`}>
                      <Gauge className={`h-5 w-5 ${healthLabel.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Health Score</p>
                        <Badge className={`${healthLabel.bg} ${healthLabel.color} border-0 text-[9px] px-1.5 py-0 h-4`}>{healthLabel.text}</Badge>
                      </div>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <p className="text-2xl font-bold tracking-tight leading-none">{healthScore}</p>
                        <span className="text-[11px] text-muted-foreground">/ 100</span>
                      </div>
                      <Progress value={healthScore} className="h-1.5 mt-2" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:flex-1 sm:border-l sm:border-border/40 sm:pl-5">
                    {[
                      { label: "Margin", value: `${stats.profitMargin.toFixed(0)}%`, cls: "" },
                      { label: "ROAS", value: `${stats.roas.toFixed(1)}x`, cls: "" },
                      { label: "Growth", value: `${deltas.revenue >= 0 ? "+" : ""}${deltas.revenue.toFixed(0)}%`, cls: deltas.revenue >= 0 ? "text-green-600" : "text-destructive" },
                    ].map((m) => (
                      <div key={m.label} className="text-center px-1 py-1.5 rounded-lg bg-muted/30">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">{m.label}</p>
                        <p className={`text-sm sm:text-base font-bold mt-0.5 ${m.cls}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compact KPI grid — Revenue / Profit / Orders / Customers / Products / Ads */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2.5">
              <StatCard label="Revenue" value={formatPrice(stats.totalRevenue)} icon={DollarSign} sub={`${stats.completedOrders} completed`} delta={deltas.revenue} tint="primary" />
              <StatCard label="Net Profit" value={formatPrice(stats.totalProfit)} icon={TrendingUp} sub={`${stats.profitMargin.toFixed(1)}% margin`} delta={deltas.profit} tint="emerald" />
              <StatCard label="Orders" value={stats.totalOrders} icon={ShoppingCart} sub={`${stats.pendingOrders} pending`} delta={deltas.orders} tint="blue" />
              <StatCard label="Avg Order" value={formatPrice(Math.round(stats.avgOrderValue))} icon={Target} sub={`${stats.totalCustomers} customers`} delta={deltas.avg} tint="purple" />
              <StatCard label="New Customers" value={stats.newCustomers} icon={Users} sub={`of ${stats.totalCustomers} total`} tint="pink" />
              <StatCard label="Products" value={stats.totalProducts} icon={Package} sub={`${products.filter(p => p.stock <= 0).length} out of stock`} tint="orange" />
              <StatCard label="Ad Spend" value={formatPrice(stats.totalAdSpend)} icon={Percent} sub={`ROAS: ${stats.roas.toFixed(1)}x`} tint="rose" />
              <StatCard label="Ad Revenue" value={formatPrice(stats.totalAdRevenue)} icon={ArrowUpRight} sub={`from ${adCosts.length} campaigns`} tint="teal" />
            </div>

            {/* Smart Insights */}
            {insights.length > 0 && (
              <Card className="border-border/40">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    Smart Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {insights.map((ins, i) => {
                      const Icon = ins.type === "good" ? CheckCircle2 : ins.type === "warn" ? AlertCircle : Activity;
                      const color = ins.type === "good" ? "text-green-600 bg-green-500/10" : ins.type === "warn" ? "text-amber-600 bg-amber-500/10" : "text-blue-600 bg-blue-500/10";
                      return (
                        <div key={i} className="flex gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                          <div className={`p-1 rounded-md h-fit shrink-0 ${color.split(" ")[1]}`}>
                            <Icon className={`h-3 w-3 ${color.split(" ")[0]}`} />
                          </div>
                          <p className="text-xs leading-snug">{ins.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-9">
                <TabsTrigger value="overview" className="text-xs gap-1.5"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t.overview}</span></TabsTrigger>
                <TabsTrigger value="orders" className="text-xs gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t.orders}</span></TabsTrigger>
                <TabsTrigger value="products" className="text-xs gap-1.5"><Package className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t.products}</span></TabsTrigger>
                <TabsTrigger value="finance" className="text-xs gap-1.5"><DollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t.finance}</span></TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-2.5 mt-2.5">
                <Card className="border-border/40 shadow-sm rounded-2xl">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" /> Revenue & Profit Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    {revenueTrend.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data for this period</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={revenueTrend}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(174, 98%, 21%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(174, 98%, 21%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="revenue" stroke="hsl(174, 98%, 21%)" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                          <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profGrad)" strokeWidth={2} name="Profit" />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" /> Income vs Expense
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {incomeExpense.every(d => d.value === 0) ? (
                        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No transaction data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={incomeExpense}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Amount">
                              {incomeExpense.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <PieChartIcon className="h-4 w-4 text-primary" /> Order Sources
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex items-center justify-center">
                      {orderSources.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-12">No data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={orderSources} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3} strokeWidth={0}>
                              {orderSources.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ORDERS TAB */}
              <TabsContent value="orders" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-primary" /> Order Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex items-center justify-center">
                      {orderStatusData.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-10">No orders</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={45} paddingAngle={3} strokeWidth={0}>
                              {orderStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Payment Methods
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      {paymentMethods.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data</div>
                      ) : (
                        <div className="space-y-3">
                          {paymentMethods.map((m, i) => {
                            const total = paymentMethods.reduce((s, p) => s + p.value, 0);
                            const pct = total > 0 ? Math.round((m.value / total) * 100) : 0;
                            return (
                              <div key={i} className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="font-medium">{m.name}</span>
                                  <span className="text-muted-foreground">{m.value} ({pct}%)</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: m.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/40 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Orders per Day
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {revenueTrend.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={revenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="orders" fill="hsl(174, 98%, 21%)" radius={[4, 4, 0, 0]} name="Orders" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PRODUCTS TAB */}
              <TabsContent value="products" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" /> Top Products
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      {topProducts.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-10">No products</div>
                      ) : (
                        <div className="space-y-2">
                          {topProducts.map((p, i) => {
                            const podium = i < 3;
                            const medal = ["🥇", "🥈", "🥉"][i];
                            return (
                              <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${podium ? "bg-amber-500/10" : "bg-muted text-muted-foreground"}`}>
                                    {podium ? medal : i + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate text-xs sm:text-sm">{p.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{p.category}</p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <p className="font-semibold text-xs sm:text-sm">{formatPrice(p.price)}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Stock: <span className={p.stock <= 0 ? "text-destructive font-medium" : ""}>{p.stock}</span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/40 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Crown className="h-4 w-4 text-primary" /> Top Customers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      {topCustomers.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-10">No customer data</div>
                      ) : (
                        <div className="space-y-2">
                          {topCustomers.map((c, i) => {
                            const podium = i < 3;
                            const medal = ["🥇", "🥈", "🥉"][i];
                            return (
                              <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg border border-border/40 hover:shadow-sm transition-shadow">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${podium ? "bg-amber-500/10" : "bg-primary/10 text-primary"}`}>
                                    {podium ? medal : i + 1}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate text-xs sm:text-sm">{c.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{c.orders} orders</p>
                                  </div>
                                </div>
                                <p className="font-bold text-xs sm:text-sm shrink-0">{formatPrice(c.total)}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* FINANCE TAB */}
              <TabsContent value="finance" className="space-y-4 mt-4">
                <Card className="border-border/40 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Revenue vs Ad Spend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {adCosts.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No ad data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={[
                          { name: "Ad Spend", value: stats.totalAdSpend },
                          { name: "Ad Revenue", value: stats.totalAdRevenue },
                          { name: "Net Profit", value: stats.totalProfit },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Amount">
                            <Cell fill="hsl(0, 84%, 60%)" />
                            <Cell fill="hsl(174, 98%, 21%)" />
                            <Cell fill="hsl(142, 76%, 36%)" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-4 sm:p-5 !pt-4 sm:!pt-5">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">Profit Margin</p>
                        <Trophy className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="text-2xl font-bold">{stats.profitMargin.toFixed(1)}%</p>
                      <Progress value={Math.min(stats.profitMargin, 100)} className="h-1.5 mt-3" />
                      <p className="text-[11px] text-muted-foreground mt-2">Target: 30%+</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4 sm:p-5 !pt-4 sm:!pt-5">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">Completion Rate</p>
                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="text-2xl font-bold">{stats.completionRate.toFixed(1)}%</p>
                      <Progress value={stats.completionRate} className="h-1.5 mt-3" />
                      <p className="text-[11px] text-muted-foreground mt-2">{stats.completedOrders}/{stats.totalOrders} orders</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4 sm:p-5 !pt-4 sm:!pt-5">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">ROAS</p>
                        <Zap className="h-4 w-4 text-amber-500" />
                      </div>
                      <p className="text-2xl font-bold">{stats.roas.toFixed(2)}x</p>
                      <Progress value={Math.min(stats.roas * 25, 100)} className="h-1.5 mt-3" />
                      <p className="text-[11px] text-muted-foreground mt-2">Target: 3x+</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
