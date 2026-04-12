import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, TrendingUp, Users, Package, DollarSign, ShoppingCart,
  Download, FileText, Calendar, ArrowUpRight, ArrowDownRight, Percent,
  RefreshCw, Target, PieChart as PieChartIcon
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, AreaChart, Area, Legend
} from "recharts";
import { useCurrency } from "@/hooks/useCurrency";

const CHART_COLORS = [
  "hsl(174, 98%, 21%)", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316"
];

const Reports = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { format: formatPrice } = useCurrency();
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [adCosts, setAdCosts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("all");

  const fetchData = useCallback(async () => {
    if (!user || !activeStore) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));
    const sinceISO = since.toISOString();
    const sid = activeStore.id;

    const [o, p, c, a, t] = await Promise.all([
      supabase.from("orders").select("total_amount, cost_price, status, created_at, customer_id, payment_method, payment_status, source").eq("store_id", sid).gte("created_at", sinceISO),
      supabase.from("products").select("id, name, price, stock, category, base_cost").eq("store_id", sid),
      supabase.from("customers").select("id, name, created_at").eq("store_id", sid),
      supabase.from("ad_costs").select("amount, revenue, ad_date, platform").eq("store_id", sid).gte("ad_date", since.toISOString().split("T")[0]),
      supabase.from("transactions").select("amount, type, category, created_at").eq("store_id", sid).gte("created_at", sinceISO),
    ]);

    if (o.data) setOrders(o.data);
    if (p.data) setProducts(p.data);
    if (c.data) setCustomers(c.data);
    if (a.data) setAdCosts(a.data);
    if (t.data) setTransactions(t.data);
    setLoading(false);
  }, [user, activeStore, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Previous period orders for comparison ──
  const prevOrders = useMemo(() => {
    const days = parseInt(period);
    const now = new Date();
    const prevEnd = new Date(now);
    prevEnd.setDate(prevEnd.getDate() - days);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);
    // We don't have prev data loaded, so estimate 0 for now
    return { revenue: 0, orders: 0 };
  }, [period]);

  const completedOrders = useMemo(() => orders.filter(o => o.status === "completed"), [orders]);

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

    return {
      totalRevenue, totalCost, totalProfit, avgOrderValue,
      totalOrders: orders.length, completedOrders: completedOrders.length,
      pendingOrders, cancelledOrders, profitMargin, newCustomers,
      totalAdSpend, totalAdRevenue, roas, totalCustomers: customers.length,
      totalProducts: products.length
    };
  }, [orders, completedOrders, customers, products, adCosts, period]);

  // ── Revenue Trend ──
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

  // ── Order Status Distribution ──
  const orderStatusData = useMemo(() => [
    { name: "Completed", value: stats.completedOrders, color: "hsl(142, 76%, 36%)" },
    { name: "Pending", value: stats.pendingOrders, color: "hsl(38, 92%, 50%)" },
    { name: "Cancelled", value: stats.cancelledOrders, color: "hsl(0, 84%, 60%)" },
  ].filter(d => d.value > 0), [stats]);

  // ── Payment Method Breakdown ──
  const paymentMethods = useMemo(() => {
    const map: Record<string, number> = {};
    completedOrders.forEach(o => {
      const m = o.payment_method || "cash";
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: CHART_COLORS[i % CHART_COLORS.length]
    }));
  }, [completedOrders]);

  // ── Top Products by Revenue ──
  const topProducts = useMemo(() => {
    return products
      .map(p => ({ name: p.name, stock: p.stock, price: Number(p.price), category: p.category || "Uncategorized" }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 8);
  }, [products]);

  // ── Top Customers ──
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

  // ── Order Source Breakdown ──
  const orderSources = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const s = o.source || "manual";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: CHART_COLORS[i % CHART_COLORS.length]
    }));
  }, [orders]);

  // ── Income vs Expense ──
  const incomeExpense = useMemo(() => {
    const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return [
      { name: "Income", value: income, color: "hsl(142, 76%, 36%)" },
      { name: "Expense", value: expense, color: "hsl(0, 84%, 60%)" },
    ];
  }, [transactions]);

  // ── Export CSV ──
  const exportCSV = () => {
    const headers = ["Date", "Status", "Amount", "Cost", "Profit", "Payment Method", "Source"];
    const rows = orders.map(o => [
      new Date(o.created_at).toLocaleDateString(),
      o.status,
      o.total_amount,
      o.cost_price || 0,
      Number(o.total_amount) - Number(o.cost_price || 0),
      o.payment_method,
      o.source
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

  const StatCard = ({ label, value, icon: Icon, sub, trend, color }: any) => (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-xl sm:text-2xl font-bold">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color || "bg-primary/10"}`}>
            <Icon className={`h-4 w-4 ${color ? "text-white" : "text-primary"}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            {trend >= 0 ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-destructive" />
            )}
            <span className={`text-[11px] font-medium ${trend >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="text-[11px] text-muted-foreground">vs prev</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>
            {p.name}: {typeof p.value === "number" ? `৳${p.value.toLocaleString()}` : p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Reports & Analytics
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Business insights for <span className="font-medium text-foreground">{activeStore?.name || "your store"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[130px] sm:w-[150px] h-9">
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
            <Button variant="outline" size="sm" onClick={fetchData} className="h-9">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-4">
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
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Revenue" value={`৳${stats.totalRevenue.toLocaleString()}`} icon={DollarSign} sub={`${stats.completedOrders} completed`} color="bg-primary" />
              <StatCard label="Net Profit" value={`৳${stats.totalProfit.toLocaleString()}`} icon={TrendingUp} sub={`${stats.profitMargin.toFixed(1)}% margin`} color="bg-emerald-500" />
              <StatCard label="Total Orders" value={stats.totalOrders} icon={ShoppingCart} sub={`${stats.pendingOrders} pending`} color="bg-blue-500" />
              <StatCard label="Avg Order Value" value={`৳${Math.round(stats.avgOrderValue).toLocaleString()}`} icon={Target} sub={`${stats.totalCustomers} customers`} color="bg-purple-500" />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="New Customers" value={stats.newCustomers} icon={Users} sub={`of ${stats.totalCustomers} total`} />
              <StatCard label="Products" value={stats.totalProducts} icon={Package} sub={`${products.filter(p => p.stock <= 0).length} out of stock`} />
              <StatCard label="Ad Spend" value={`৳${stats.totalAdSpend.toLocaleString()}`} icon={Percent} sub={`ROAS: ${stats.roas.toFixed(1)}x`} />
              <StatCard label="Ad Revenue" value={`৳${stats.totalAdRevenue.toLocaleString()}`} icon={ArrowUpRight} sub={`from ${adCosts.length} campaigns`} />
            </div>

            {/* Tabs for Charts */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex h-9">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                <TabsTrigger value="products" className="text-xs">Products & Customers</TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Revenue Trend */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" /> Revenue & Profit Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {revenueTrend.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data for this period</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={revenueTrend}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(174, 98%, 21%)" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="hsl(174, 98%, 21%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
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

                {/* Income vs Expense + Order Sources */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" /> Income vs Expense
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {incomeExpense.every(d => d.value === 0) ? (
                        <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">No transaction data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
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

                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <PieChartIcon className="h-4 w-4 text-primary" /> Order Sources
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex items-center justify-center">
                      {orderSources.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie data={orderSources} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3} strokeWidth={0}>
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
                  {/* Order Status */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-primary" /> Order Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex items-center justify-center">
                      {orderStatusData.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-10">No orders</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3} strokeWidth={0}>
                              {orderStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  {/* Payment Methods */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Payment Methods
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {paymentMethods.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data</div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          {paymentMethods.map((m, i) => {
                            const total = paymentMethods.reduce((s, p) => s + p.value, 0);
                            const pct = total > 0 ? Math.round((m.value / total) * 100) : 0;
                            return (
                              <div key={i} className="space-y-1">
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

                {/* Orders per Day */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Orders per Day
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {revenueTrend.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
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

              {/* PRODUCTS & CUSTOMERS TAB */}
              <TabsContent value="products" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top Products */}
                  <Card className="border-border/50 shadow-sm">
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
                          {topProducts.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs font-semibold text-muted-foreground w-5">{i + 1}</span>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{p.category}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <p className="font-semibold">৳{p.price.toLocaleString()}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  Stock: <span className={p.stock <= 0 ? "text-destructive font-medium" : ""}>{p.stock}</span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Customers */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" /> Top Customers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      {topCustomers.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-10">No customer data</div>
                      ) : (
                        <div className="space-y-2">
                          {topCustomers.map((c, i) => (
                            <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg border border-border/50 hover:shadow-sm transition-shadow">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                                  {i + 1}
                                </div>
                                <div>
                                  <p className="font-medium">{c.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{c.orders} orders</p>
                                </div>
                              </div>
                              <p className="font-bold">৳{c.total.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue vs Ad Spend */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Revenue vs Ad Spend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {adCosts.length === 0 ? (
                      <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">No ad data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={[
                          { name: "Ad Spend", value: stats.totalAdSpend },
                          { name: "Ad Revenue", value: stats.totalAdRevenue },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Amount">
                            <Cell fill="hsl(0, 84%, 60%)" />
                            <Cell fill="hsl(174, 98%, 21%)" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
