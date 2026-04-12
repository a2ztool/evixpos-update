import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, ShoppingCart, DollarSign, Clock, Package,
  Users, Zap, ArrowUpRight, ArrowDownRight, Activity,
  BarChart3, RefreshCw, Wallet, ArrowDownLeft, ArrowUpFromLine,
  AlertTriangle, XCircle, Megaphone, ShoppingBag
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";

type DateRange = "today" | "7d" | "30d" | "custom";

interface AnalyticsOrder {
  id: string;
  total_amount: number;
  cost_price: number;
  status: string;
  payment_status: string;
  created_at: string;
  customer_id: string | null;
}

const DashboardAnalytics = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { symbol, format: fmtCurrency } = useCurrency();

  const [range, setRange] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [allOrders, setAllOrders] = useState<AnalyticsOrder[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; price: number; stock: number; type: string }[]>([]);
  const [orderItems, setOrderItems] = useState<{ product_id: string | null; quantity: number; price: number }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [activeSubs, setActiveSubs] = useState(0);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [expired, setExpired] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [finance, setFinance] = useState({ cashBalance: 0, receivable: 0, payable: 0 });

  const dateRange = useMemo(() => {
    const now = new Date();
    if (range === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (range === "7d") return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    if (range === "30d") return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    if (range === "custom" && customFrom && customTo) {
      return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) };
    }
    return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
  }, [range, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    if (!user || !activeStore) return;
    setLoading(true);
    const sid = activeStore.id;
    const fromISO = dateRange.from.toISOString();
    const toISO = dateRange.to.toISOString();
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 86400000).toISOString();

    const [ordersRes, allOrdRes, prodsRes, itemsRes, custRes, subsRes, adRes, transRes] = await Promise.all([
      supabase.from("orders").select("id, total_amount, cost_price, status, payment_status, created_at, customer_id")
        .eq("store_id", sid).gte("created_at", fromISO).lte("created_at", toISO).order("created_at", { ascending: false }),
      supabase.from("orders").select("id, total_amount, cost_price, status, payment_status, created_at, customer_id")
        .eq("store_id", sid).order("created_at", { ascending: false }).limit(200),
      supabase.from("products").select("id, name, price, stock, type").eq("store_id", sid),
      supabase.from("order_items").select("product_id, quantity, price"),
      supabase.from("customers").select("id, name").eq("store_id", sid),
      supabase.from("subscriptions").select("id, status, end_date").eq("store_id", sid),
      supabase.from("ad_costs").select("amount").eq("store_id", sid),
      supabase.from("transactions").select("amount, type, is_paid").eq("store_id", sid),
    ]);

    setOrders(ordersRes.data ?? []);
    setAllOrders(allOrdRes.data ?? []);
    setProducts(prodsRes.data ?? []);
    setOrderItems(itemsRes.data ?? []);
    setCustomers(custRes.data ?? []);

    const subs = subsRes.data ?? [];
    setActiveSubs(subs.filter(s => s.status === "active").length);
    setExpiringSoon(subs.filter(s => s.status === "active" && s.end_date && new Date(s.end_date) <= new Date(sevenDaysLater)).length);
    setExpired(subs.filter(s => s.status === "expired" || (s.end_date && new Date(s.end_date) < now)).length);
    setAdSpend((adRes.data ?? []).reduce((s, a) => s + Number(a.amount), 0));

    const trans = transRes.data ?? [];
    const income = trans.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = trans.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    setFinance({
      cashBalance: income - expense,
      receivable: trans.filter(t => t.type === "income" && !t.is_paid).reduce((s, t) => s + Number(t.amount), 0),
      payable: trans.filter(t => t.type === "expense" && !t.is_paid).reduce((s, t) => s + Number(t.amount), 0),
    });

    setLoading(false);
  }, [user, activeStore, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Supabase Realtime
  useEffect(() => {
    if (!activeStore) return;
    const channelName = `analytics-realtime-${activeStore.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${activeStore.id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `store_id=eq.${activeStore.id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `store_id=eq.${activeStore.id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore?.id, fetchData]);

  // Computed stats
  const stats = useMemo(() => {
    const completed = orders.filter(o => o.status === "completed");
    const totalRevenue = completed.reduce((s, o) => s + Number(o.total_amount), 0);
    const totalProfit = completed.reduce((s, o) => s + Number(o.total_amount) - Number(o.cost_price || 0), 0);
    const pending = orders.filter(o => o.status === "pending").length;
    const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
    const todaySales = todayOrders.filter(o => o.status === "completed").reduce((s, o) => s + Number(o.total_amount), 0);

    return { totalRevenue, totalProfit, totalOrders: orders.length, completedOrders: completed.length, pendingOrders: pending, todaySales, todayOrders: todayOrders.length, avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0 };
  }, [orders]);

  // Sales chart
  const salesChart = useMemo(() => {
    const days: Record<string, { date: string; sales: number; profit: number }> = {};
    const dayCount = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : Math.max(1, Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / 86400000));
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      if (isWithinInterval(d, { start: dateRange.from, end: dateRange.to })) {
        const key = format(d, range === "30d" ? "dd MMM" : "EEE dd");
        days[key] = { date: key, sales: 0, profit: 0 };
      }
    }
    orders.filter(o => o.status === "completed").forEach(o => {
      const key = format(new Date(o.created_at), range === "30d" ? "dd MMM" : "EEE dd");
      if (days[key]) {
        days[key].sales += Number(o.total_amount);
        days[key].profit += Number(o.total_amount) - Number(o.cost_price || 0);
      }
    });
    return Object.values(days);
  }, [orders, range, dateRange]);

  // Orders trend
  const ordersTrend = useMemo(() => {
    const days: Record<string, { date: string; completed: number; pending: number; cancelled: number }> = {};
    const dayCount = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 7;
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      if (isWithinInterval(d, { start: dateRange.from, end: dateRange.to })) {
        const key = format(d, "EEE dd");
        days[key] = { date: key, completed: 0, pending: 0, cancelled: 0 };
      }
    }
    orders.forEach(o => {
      const key = format(new Date(o.created_at), "EEE dd");
      if (days[key]) {
        if (o.status === "completed") days[key].completed++;
        else if (o.status === "pending") days[key].pending++;
        else days[key].cancelled++;
      }
    });
    return Object.values(days);
  }, [orders, range, dateRange]);

  // Top products
  const topProducts = useMemo(() => {
    const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    orderItems.forEach(item => {
      if (!item.product_id) return;
      const prod = products.find(p => p.id === item.product_id);
      if (!prod) return;
      if (!prodMap[item.product_id]) prodMap[item.product_id] = { name: prod.name, qty: 0, revenue: 0 };
      prodMap[item.product_id].qty += item.quantity;
      prodMap[item.product_id].revenue += item.quantity * Number(item.price);
    });
    return Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orderItems, products]);

  // Best customers
  const bestCustomers = useMemo(() => {
    const custMap: Record<string, { name: string; orders: number; total: number }> = {};
    orders.filter(o => o.status === "completed" && o.customer_id).forEach(o => {
      const cid = o.customer_id!;
      if (!custMap[cid]) {
        const c = customers.find(c => c.id === cid);
        custMap[cid] = { name: c?.name || "Unknown", orders: 0, total: 0 };
      }
      custMap[cid].orders++;
      custMap[cid].total += Number(o.total_amount);
    });
    return Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders, customers]);

  // Recent orders live feed
  const recentLive = useMemo(() => {
    return orders.slice(0, 6).map(o => {
      const cust = customers.find(c => c.id === o.customer_id);
      return { id: o.id, amount: Number(o.total_amount), customer: cust?.name || "Walk-in", time: o.created_at, status: o.status };
    });
  }, [orders, customers]);

  // Comparison
  const comparison = useMemo(() => {
    const periodMs = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFrom = new Date(dateRange.from.getTime() - periodMs);
    const prevTo = new Date(dateRange.from.getTime() - 1);
    const prevOrders = allOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= prevFrom && d <= prevTo && o.status === "completed";
    });
    const prevRevenue = prevOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    if (prevRevenue === 0) return { revenueChange: stats.totalRevenue > 0 ? 100 : 0 };
    return { revenueChange: ((stats.totalRevenue - prevRevenue) / prevRevenue) * 100 };
  }, [allOrders, stats, dateRange]);

  const SkeletonCard = () => (
    <Card className="border-border/30 bg-card/50"><CardContent className="p-4 space-y-3">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-2.5 w-16" />
    </CardContent></Card>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-16" /></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
      </div>
    );
  }

  const statCards = [
    { label: "TODAY'S SALES", value: fmtCurrency(stats.todaySales, 0), icon: DollarSign, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-600", sub: `${stats.todayOrders} orders today` },
    { label: "TOTAL REVENUE", value: fmtCurrency(stats.totalRevenue, 0), icon: TrendingUp, iconBg: "bg-blue-500/10", iconColor: "text-blue-600", sub: comparison.revenueChange !== 0 ? `${comparison.revenueChange > 0 ? "+" : ""}${comparison.revenueChange.toFixed(1)}% vs prev` : "No prev data", trend: comparison.revenueChange },
    { label: "NET PROFIT", value: fmtCurrency(stats.totalProfit, 0), icon: Activity, iconBg: "bg-primary/10", iconColor: "text-primary", sub: stats.totalRevenue > 0 ? `${((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)}% margin` : "—" },
    { label: "TOTAL ORDERS", value: String(stats.totalOrders), icon: ShoppingCart, iconBg: "bg-violet-500/10", iconColor: "text-violet-600", sub: `${stats.completedOrders} completed` },
    { label: "PENDING", value: String(stats.pendingOrders), icon: Clock, iconBg: "bg-orange-500/10", iconColor: "text-orange-600", sub: "Awaiting action" },
    { label: "ACTIVE SUBS", value: String(activeSubs), icon: RefreshCw, iconBg: "bg-cyan-500/10", iconColor: "text-cyan-600", sub: `${expiringSoon} expiring soon` },
    { label: "CUSTOMERS", value: String(customers.length), icon: Users, iconBg: "bg-teal-500/10", iconColor: "text-teal-600", sub: "Total customers" },
    { label: "AVG ORDER", value: fmtCurrency(stats.avgOrderValue, 0), icon: Zap, iconBg: "bg-pink-500/10", iconColor: "text-pink-600", sub: "Per completed order" },
  ];

  const financeCards = [
    { label: "CASH BALANCE", value: fmtCurrency(finance.cashBalance, 0), icon: Wallet, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-600" },
    { label: "RECEIVABLE", value: fmtCurrency(finance.receivable, 0), icon: ArrowDownLeft, iconBg: "bg-blue-500/10", iconColor: "text-blue-600" },
    { label: "PAYABLE", value: fmtCurrency(finance.payable, 0), icon: ArrowUpFromLine, iconBg: "bg-rose-500/10", iconColor: "text-rose-600" },
    { label: "AD SPEND", value: fmtCurrency(adSpend, 0), icon: Megaphone, iconBg: "bg-pink-500/10", iconColor: "text-pink-600" },
  ];

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30",
      pending: "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30",
      cancelled: "text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30",
    };
    return styles[status] || "";
  };

  return (
    <div className="space-y-5">
      {/* Section Header + Date Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
            <BarChart3 className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              Live Analytics
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground">Real-time business insights · Auto-updates</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border/40">
          {(["today", "7d", "30d", "custom"] as DateRange[]).map(r => (
            <button
              key={r}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange(r)}
            >
              {r === "today" ? "Today" : r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40 h-8 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40 h-8 text-xs" />
        </div>
      )}

      {/* Main Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <Card key={card.label} className="border-border/30 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-muted/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-3 sm:p-4 relative">
              <div className="flex items-start justify-between mb-2">
                <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
                {card.trend !== undefined && card.trend !== 0 && (
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-semibold ${card.trend > 0 ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30" : "text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
                    {card.trend > 0 ? <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />}
                    {Math.abs(card.trend).toFixed(0)}%
                  </Badge>
                )}
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground tracking-widest">{card.label}</p>
              <p className="text-lg sm:text-xl font-extrabold tracking-tight mt-0.5">{card.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Finance Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {financeCards.map(card => (
          <Card key={card.label} className="border-border/30 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground tracking-widest">{card.label}</p>
                  <p className="text-base sm:text-lg font-extrabold tracking-tight">{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales & Profit Chart */}
        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Sales & Profit ({symbol})
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-medium">{range === "today" ? "Today" : range === "7d" ? "Last 7 Days" : range === "30d" ? "Last 30 Days" : "Custom"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {salesChart.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">No data for this period</div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesChart}>
                    <defs>
                      <linearGradient id="analyticsSalesG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="analyticsProfitG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${symbol}${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: 12 }}
                      formatter={(v: number, name: string) => [fmtCurrency(v, 0), name === "sales" ? "Sales" : "Profit"]} />
                    <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#analyticsSalesG)" dot={false} />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#analyticsProfitG)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center gap-5 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="h-2 w-2 rounded-full bg-primary" /> Sales</div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="h-2 w-2 rounded-full bg-emerald-500" /> Profit</div>
            </div>
          </CardContent>
        </Card>

        {/* Orders Trend */}
        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-violet-600" /> Orders Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersTrend.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">No data for this period</div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ordersTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: 12 }} />
                    <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cancelled" name="Cancelled" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="h-2 w-2 rounded-sm bg-primary" /> Completed</div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="h-2 w-2 rounded-sm bg-amber-500" /> Pending</div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><div className="h-2 w-2 rounded-sm bg-destructive" /> Cancelled</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Products */}
        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" /> Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No product data yet</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className={`h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i === 0 ? "bg-amber-500/10 text-amber-600" : i === 1 ? "bg-slate-400/10 text-slate-500" : "bg-primary/10 text-primary"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.qty} sold</p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0">{fmtCurrency(p.revenue, 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Order Feed */}
        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" /> Recent Orders
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLive.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No recent orders</p>
            ) : (
              <div className="space-y-2">
                {recentLive.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{o.customer}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(o.time), "hh:mm a")}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs font-bold">{fmtCurrency(o.amount, 0)}</p>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusBadge(o.status)}`}>
                        {o.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Best Customers */}
        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-600" /> Best Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestCustomers.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No customer data yet</p>
            ) : (
              <div className="space-y-2">
                {bestCustomers.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i === 0 ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.orders} orders</p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0">{fmtCurrency(c.total, 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardAnalytics;
