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
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3,
  Download, FileText, Calendar, Percent, Package, ArrowUpRight,
  ArrowDownRight, Target, Zap, PiggyBank
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

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

  // Real-time
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

  const stats = useMemo(() => {
    const revenue = completedOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const cost = completedOrders.reduce((s, o) => s + Number(o.cost_price), 0);
    const discount = completedOrders.reduce((s, o) => s + Number(o.discount), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgOrderValue = completedOrders.length > 0 ? revenue / completedOrders.length : 0;
    const pendingOrders = allFilteredOrders.filter((o) => o.status === "pending").length;
    const cancelledOrders = allFilteredOrders.filter((o) => o.status === "cancelled").length;
    return {
      revenue, cost, profit, margin, discount, avgOrderValue,
      completedCount: completedOrders.length,
      pendingCount: pendingOrders,
      cancelledCount: cancelledOrders,
      totalOrders: allFilteredOrders.length
    };
  }, [completedOrders, allFilteredOrders]);

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

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Sales & Profit
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Analyze revenue, costs & profit margins
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
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
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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

      {/* Custom date range */}
      {datePreset === "custom" && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
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
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
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

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Revenue</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-lg sm:text-2xl font-bold">৳{stats.revenue.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Total Cost</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-lg sm:text-2xl font-bold text-destructive">৳{stats.cost.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${stats.profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {stats.profit >= 0 ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
              </div>
              <span className="text-xs text-muted-foreground font-medium">Net Profit</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className={`text-lg sm:text-2xl font-bold ${stats.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {stats.profit >= 0 ? "+" : ""}৳{stats.profit.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Percent className="h-4 w-4 text-violet-500" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Profit Margin</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className={`text-lg sm:text-2xl font-bold ${stats.margin >= 20 ? "text-green-600" : stats.margin >= 0 ? "text-amber-500" : "text-destructive"}`}>
                {stats.margin.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        {[
          { label: "Completed", value: stats.completedCount.toString(), icon: ShoppingCart, color: "text-green-600" },
          { label: "Pending", value: stats.pendingCount.toString(), icon: Target, color: "text-amber-500" },
          { label: "Cancelled", value: stats.cancelledCount.toString(), icon: TrendingDown, color: "text-destructive" },
          { label: "Avg Order", value: `৳${stats.avgOrderValue.toFixed(0)}`, icon: Zap, color: "text-primary" },
          { label: "Discounts", value: `৳${stats.discount.toFixed(0)}`, icon: PiggyBank, color: "text-violet-500" },
          { label: "Total Orders", value: stats.totalOrders.toString(), icon: BarChart3, color: "" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-3 pb-2 text-center">
              <m.icon className={`h-3.5 w-3.5 mx-auto mb-1 ${m.color || "text-muted-foreground"}`} />
              <p className="text-xs text-muted-foreground">{m.label}</p>
              {loading ? <Skeleton className="h-5 w-12 mx-auto mt-1" /> : (
                <p className="text-sm sm:text-base font-bold">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Revenue & Cost Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Revenue, Cost & Profit Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
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

        {/* Payment Methods Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent>
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

      {/* Monthly + Source + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Monthly Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Monthly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
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

        {/* Order Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Order Sources
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
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{s.name}</span>
                        <span className="text-muted-foreground text-xs">{s.value} orders ({pct.toFixed(0)}%)</span>
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

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Top Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.qty} units sold</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">৳{p.revenue.toLocaleString()}</p>
                    <p className={`text-[10px] ${p.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                      Profit: ৳{p.profit.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profit Margin Indicator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            Profit Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-20 w-full" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Gross Revenue</p>
                <p className="text-lg font-bold">৳{stats.revenue.toLocaleString()}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
                <p className="text-lg font-bold text-destructive">-৳{stats.cost.toLocaleString()}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Discounts Given</p>
                <p className="text-lg font-bold text-amber-500">-৳{stats.discount.toLocaleString()}</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${stats.profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="text-xs text-muted-foreground mb-1">Net Profit</p>
                <p className={`text-lg font-bold ${stats.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {stats.profit >= 0 ? "+" : ""}৳{stats.profit.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default SalesProfit;
