import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageGuide from "@/components/PageGuide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Truck, Printer, Download,
  Activity, Target, Wallet, Receipt, PieChart as PieIcon, BarChart3, Sparkles,
  ArrowUpRight, ArrowDownRight, Percent, CircleDollarSign, AlertTriangle, CheckCircle2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { subDays, startOfDay, endOfDay, format, differenceInDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line
} from "recharts";
import { toast } from "sonner";

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "#f59e0b", "#10b981", "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6"];

const guideSteps = [
  { title: "Select Period", description: "Choose 7, 30, 90 days or 1 year to analyze financial performance over different timeframes." },
  { title: "Read KPI Cards", description: "Revenue = total sales. Net Profit = what you actually keep. Margin % shows business efficiency. Aim for 15%+." },
  { title: "Period Comparison", description: "% indicators compare current vs previous period. Green arrow = growth, red = decline. Track trends weekly." },
  { title: "P&L Statement", description: "Standard accounting format: Revenue → COGS → Gross Profit → Expenses → Net Profit. Same as audited reports." },
  { title: "Profit Trend Chart", description: "Daily revenue, cost & profit lines. Look for widening gap between revenue and cost — that's growing profit." },
  { title: "Expense Breakdown", description: "Pie chart shows where money goes. If one category exceeds 40%, investigate cost optimization opportunities." },
  { title: "Cash Flow", description: "Operating cash = Net Profit + non-cash items. Negative? You're spending more than earning — act fast." },
  { title: "Export & Print", description: "Download CSV for accountants or print for board meetings. Use month-end for financial closing." },
];

const OfflineProfitLoss = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: fmt } = useCurrency();
  const [range, setRange] = useState("30");

  const days = Number(range);
  const startDate = startOfDay(subDays(new Date(), days)).toISOString();
  const endDate = endOfDay(new Date()).toISOString();
  const prevStartDate = startOfDay(subDays(new Date(), days * 2)).toISOString();
  const prevEndDate = endOfDay(subDays(new Date(), days)).toISOString();

  const { data: orders = [] } = useQuery({
    queryKey: ["pl-orders", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount, cost_price, discount, payment_method, payment_status, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      return data || [];
    },
  });

  const { data: prevOrders = [] } = useQuery({
    queryKey: ["pl-prev-orders", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount, cost_price")
        .eq("store_id", storeId!)
        .gte("created_at", prevStartDate)
        .lte("created_at", prevEndDate);
      return data || [];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["pl-purchases", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("total_amount, paid_amount, purchase_date")
        .eq("store_id", storeId!)
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      return data || [];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["pl-transactions", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, type, category, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const revenue = orders.reduce((s, o: any) => s + Number(o.total_amount), 0);
    const cogs = orders.reduce((s, o: any) => s + Number(o.cost_price), 0);
    const discounts = orders.reduce((s, o: any) => s + Number(o.discount), 0);
    const grossProfit = revenue - cogs;
    const purchaseTotal = purchases.reduce((s, p: any) => s + Number(p.total_amount), 0);
    const otherIncome = transactions.filter((t: any) => t.type === "income").reduce((s, t: any) => s + Number(t.amount), 0);
    const expenses = transactions.filter((t: any) => t.type === "expense").reduce((s, t: any) => s + Number(t.amount), 0);
    const netProfit = grossProfit - discounts - expenses + otherIncome;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const orderCount = orders.length;
    const aov = orderCount > 0 ? revenue / orderCount : 0;

    // Previous period comparison
    const prevRevenue = prevOrders.reduce((s, o: any) => s + Number(o.total_amount), 0);
    const prevCogs = prevOrders.reduce((s, o: any) => s + Number(o.cost_price), 0);
    const prevProfit = prevRevenue - prevCogs;
    const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    const profitChange = prevProfit > 0 ? ((grossProfit - prevProfit) / prevProfit) * 100 : 0;

    // Expense breakdown
    const expenseByCategory: Record<string, number> = {};
    transactions.filter((t: any) => t.type === "expense").forEach((t: any) => {
      const cat = t.category || "Other";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(t.amount);
    });
    const expensePie = Object.entries(expenseByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Daily chart
    const dailyMap: Record<string, { date: string; revenue: number; cost: number; profit: number; expense: number }> = {};
    orders.forEach((o: any) => {
      const d = format(new Date(o.created_at), "MMM dd");
      if (!dailyMap[d]) dailyMap[d] = { date: d, revenue: 0, cost: 0, profit: 0, expense: 0 };
      dailyMap[d].revenue += Number(o.total_amount);
      dailyMap[d].cost += Number(o.cost_price);
      dailyMap[d].profit += Number(o.total_amount) - Number(o.cost_price);
    });
    transactions.filter((t: any) => t.type === "expense").forEach((t: any) => {
      const d = format(new Date(t.created_at), "MMM dd");
      if (!dailyMap[d]) dailyMap[d] = { date: d, revenue: 0, cost: 0, profit: 0, expense: 0 };
      dailyMap[d].expense += Number(t.amount);
    });
    const dailyChart = Object.values(dailyMap);

    // Cash flow proxy
    const cashIn = revenue + otherIncome;
    const cashOut = cogs + expenses + purchaseTotal;
    const cashFlow = cashIn - cashOut;

    // Health score
    const healthScore = Math.max(0, Math.min(100, Math.round(
      (margin >= 20 ? 40 : margin >= 10 ? 25 : margin >= 0 ? 10 : 0) +
      (revenueChange >= 10 ? 30 : revenueChange >= 0 ? 20 : 5) +
      (cashFlow > 0 ? 30 : 10)
    )));

    // Top expense category
    const topExpense = expensePie[0] || null;

    return {
      revenue, cogs, grossProfit, discounts, purchaseTotal, otherIncome, expenses, netProfit,
      margin, grossMargin, orderCount, aov, revenueChange, profitChange, prevRevenue,
      expensePie, dailyChart, cashIn, cashOut, cashFlow, healthScore, topExpense,
    };
  }, [orders, purchases, transactions, prevOrders]);

  const exportCSV = () => {
    const rows = [
      ["Profit & Loss Report", `Last ${days} days`],
      [],
      ["Metric", "Amount"],
      ["Sales Revenue", stats.revenue.toFixed(2)],
      ["Cost of Goods Sold", `-${stats.cogs.toFixed(2)}`],
      ["Gross Profit", stats.grossProfit.toFixed(2)],
      ["Other Income", `+${stats.otherIncome.toFixed(2)}`],
      ["Discounts Given", `-${stats.discounts.toFixed(2)}`],
      ["Operating Expenses", `-${stats.expenses.toFixed(2)}`],
      ["Net Profit", stats.netProfit.toFixed(2)],
      ["Net Margin %", stats.margin.toFixed(2)],
      [],
      ["Cash In", stats.cashIn.toFixed(2)],
      ["Cash Out", stats.cashOut.toFixed(2)],
      ["Cash Flow", stats.cashFlow.toFixed(2)],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-loss-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("P&L report exported");
  };

  const healthStatus = stats.healthScore >= 70 ? { label: "Healthy", color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 } :
    stats.healthScore >= 40 ? { label: "Moderate", color: "text-amber-600", bg: "bg-amber-500/10", icon: Activity } :
    { label: "At Risk", color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle };
  const HealthIcon = healthStatus.icon;

  return (
    <DashboardLayout>
      <div className="space-y-5 print:space-y-3 pb-20">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center shrink-0">
              <CircleDollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                Profit & Loss
                <Sparkles className="h-4 w-4 text-primary/70" />
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Real-time financial intelligence dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <PageGuide title="P&L Guide" steps={guideSteps} />
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 1 year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
              <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Export</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9">
              <Printer className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        </div>

        {/* Health Banner */}
        <Card className={`border-0 bg-gradient-to-r from-card via-card to-${stats.healthScore >= 70 ? "emerald" : stats.healthScore >= 40 ? "amber" : "red"}-500/5 overflow-hidden`}>
          <CardContent className="px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`h-14 w-14 rounded-2xl ${healthStatus.bg} flex items-center justify-center`}>
                  <HealthIcon className={`h-7 w-7 ${healthStatus.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Financial Health</p>
                    <Badge variant="outline" className={`${healthStatus.color} border-current text-[10px] h-4`}>{healthStatus.label}</Badge>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold mt-1">{stats.healthScore}<span className="text-base text-muted-foreground font-normal">/100</span></p>
                </div>
              </div>
              <div className="flex-1 sm:max-w-md">
                <Progress value={stats.healthScore} className="h-2" />
                <div className="flex justify-between mt-2 text-[11px] text-muted-foreground">
                  <span>Margin: {stats.margin.toFixed(1)}%</span>
                  <span>Growth: {stats.revenueChange >= 0 ? "+" : ""}{stats.revenueChange.toFixed(1)}%</span>
                  <span>Cash: {stats.cashFlow >= 0 ? "+" : ""}{fmt(stats.cashFlow)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Revenue", value: fmt(stats.revenue), icon: DollarSign, change: stats.revenueChange, color: "from-primary/20 to-primary/5", iconColor: "text-primary" },
            { label: "Net Profit", value: fmt(stats.netProfit), icon: TrendingUp, change: stats.profitChange, color: stats.netProfit >= 0 ? "from-emerald-500/20 to-emerald-500/5" : "from-red-500/20 to-red-500/5", iconColor: stats.netProfit >= 0 ? "text-emerald-600" : "text-destructive" },
            { label: "Gross Margin", value: `${stats.grossMargin.toFixed(1)}%`, icon: Percent, change: 0, color: "from-violet-500/20 to-violet-500/5", iconColor: "text-violet-600", sub: `${stats.orderCount} orders` },
            { label: "Avg Order", value: fmt(stats.aov), icon: ShoppingCart, change: 0, color: "from-amber-500/20 to-amber-500/5", iconColor: "text-amber-600", sub: `Cash flow ${fmt(stats.cashFlow)}` },
          ].map((kpi, i) => (
            <Card key={i} className="relative overflow-hidden border-border/40 hover:shadow-lg transition-all">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-60`} />
              <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-9 w-9 rounded-xl bg-background/80 backdrop-blur-sm border border-border/40 flex items-center justify-center`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.iconColor}`} />
                  </div>
                  {kpi.change !== 0 && (
                    <Badge variant="outline" className={`text-[10px] h-5 gap-0.5 ${kpi.change >= 0 ? "text-emerald-600 border-emerald-500/30" : "text-destructive border-destructive/30"}`}>
                      {kpi.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(kpi.change).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{kpi.label}</p>
                <p className="text-lg sm:text-2xl font-bold tracking-tight">{kpi.value}</p>
                {kpi.sub && <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs: Statement / Trends / Cash Flow */}
        <Tabs defaultValue="statement" className="w-full">
          <TabsList className="grid w-full sm:w-auto grid-cols-3 sm:inline-flex">
            <TabsTrigger value="statement" className="text-xs"><Receipt className="h-3.5 w-3.5 mr-1" />Statement</TabsTrigger>
            <TabsTrigger value="trends" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Trends</TabsTrigger>
            <TabsTrigger value="cashflow" className="text-xs"><Wallet className="h-3.5 w-3.5 mr-1" />Cash Flow</TabsTrigger>
          </TabsList>

          {/* Statement */}
          <TabsContent value="statement" className="mt-4">
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />Profit & Loss Statement
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">Last {days} days</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-3 border-b border-border/60">
                    <span className="font-semibold text-sm">Sales Revenue</span>
                    <span className="font-bold text-emerald-600 text-base">{fmt(stats.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 pl-6">
                    <span className="text-sm text-muted-foreground">(−) Cost of Goods Sold</span>
                    <span className="text-destructive text-sm">−{fmt(stats.cogs)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-3 rounded-lg my-1">
                    <div>
                      <span className="font-semibold text-sm">Gross Profit</span>
                      <span className="text-[11px] text-muted-foreground ml-2">({stats.grossMargin.toFixed(1)}% margin)</span>
                    </div>
                    <span className="font-bold">{fmt(stats.grossProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 pl-6">
                    <span className="text-sm text-muted-foreground">(+) Other Income</span>
                    <span className="text-emerald-600 text-sm">+{fmt(stats.otherIncome)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 pl-6">
                    <span className="text-sm text-muted-foreground">(−) Discounts Given</span>
                    <span className="text-destructive text-sm">−{fmt(stats.discounts)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 pl-6">
                    <span className="text-sm text-muted-foreground">(−) Operating Expenses</span>
                    <span className="text-destructive text-sm">−{fmt(stats.expenses)}</span>
                  </div>
                  <div className={`flex justify-between items-center py-4 mt-2 border-t-2 px-3 rounded-lg bg-gradient-to-r ${stats.netProfit >= 0 ? "from-emerald-500/10 to-transparent border-emerald-500/40" : "from-destructive/10 to-transparent border-destructive/40"}`}>
                    <div>
                      <span className="text-base font-bold">Net Profit</span>
                      <span className="text-xs text-muted-foreground ml-2">({stats.margin.toFixed(1)}% margin)</span>
                    </div>
                    <span className={`text-xl sm:text-2xl font-bold ${stats.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(stats.netProfit)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trends */}
          <TabsContent value="trends" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Revenue · Cost · Profit Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.dailyChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={stats.dailyChart}>
                        <defs>
                          <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revG)" strokeWidth={2} name="Revenue" />
                        <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profG)" strokeWidth={2} name="Profit" />
                        <Line type="monotone" dataKey="cost" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Cost" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
                      <BarChart3 className="h-10 w-10 opacity-30 mb-2" />
                      <p className="text-sm">No data for this period</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary" />Expense Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.expensePie.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={stats.expensePie} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                            {stats.expensePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2 max-h-[100px] overflow-y-auto">
                        {stats.expensePie.slice(0, 5).map((e, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="truncate">{e.name}</span>
                            </div>
                            <span className="font-medium tabular-nums">{fmt(e.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
                      <PieIcon className="h-10 w-10 opacity-30 mb-2" />
                      <p className="text-sm">No expenses recorded</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Cash Flow */}
          <TabsContent value="cashflow" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
                <CardContent className="px-4 py-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cash In</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{fmt(stats.cashIn)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Sales + Other income</p>
                </CardContent>
              </Card>
              <Card className="border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent">
                <CardContent className="px-4 py-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight className="h-4 w-4 text-destructive" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cash Out</span>
                  </div>
                  <p className="text-2xl font-bold text-destructive">{fmt(stats.cashOut)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">COGS + Expenses + Purchases</p>
                </CardContent>
              </Card>
              <Card className={`${stats.cashFlow >= 0 ? "border-primary/30 bg-gradient-to-br from-primary/5" : "border-amber-500/30 bg-gradient-to-br from-amber-500/5"} to-transparent`}>
                <CardContent className="px-4 py-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className={`h-4 w-4 ${stats.cashFlow >= 0 ? "text-primary" : "text-amber-600"}`} />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Net Cash Flow</span>
                  </div>
                  <p className={`text-2xl font-bold ${stats.cashFlow >= 0 ? "text-primary" : "text-amber-600"}`}>{fmt(stats.cashFlow)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{stats.cashFlow >= 0 ? "Positive — healthy" : "Negative — review costs"}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Daily Cash Movement</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.dailyChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={stats.dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Cash In" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" fill="hsl(var(--destructive))" name="COGS" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" fill="#f59e0b" name="Expenses" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Insights */}
        {(stats.revenue > 0 || stats.expenses > 0) && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardContent className="px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Smart Insights</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {stats.margin < 10 && stats.revenue > 0 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p>Net margin is <b>{stats.margin.toFixed(1)}%</b> — below healthy 15% benchmark. Review pricing or reduce COGS.</p>
                  </div>
                )}
                {stats.revenueChange < 0 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <TrendingDown className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p>Revenue dropped <b>{Math.abs(stats.revenueChange).toFixed(1)}%</b> vs previous period. Investigate marketing & customer retention.</p>
                  </div>
                )}
                {stats.topExpense && stats.expenses > 0 && (stats.topExpense.value / stats.expenses) > 0.4 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <Target className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                    <p><b>{stats.topExpense.name}</b> consumes {((stats.topExpense.value / stats.expenses) * 100).toFixed(0)}% of expenses. Consider optimization.</p>
                  </div>
                )}
                {stats.margin >= 20 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p>Excellent margin of <b>{stats.margin.toFixed(1)}%</b>! Reinvest profits into inventory or marketing for growth.</p>
                  </div>
                )}
                {stats.cashFlow < 0 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <Wallet className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p>Negative cash flow of <b>{fmt(Math.abs(stats.cashFlow))}</b>. Pause non-essential purchases this period.</p>
                  </div>
                )}
                {stats.discounts > stats.grossProfit * 0.1 && stats.grossProfit > 0 && (
                  <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Percent className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p>Discounts ({fmt(stats.discounts)}) eat into profit. Tighten coupon rules.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default OfflineProfitLoss;
