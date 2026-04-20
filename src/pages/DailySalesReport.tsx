import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import {
  Calendar, TrendingUp, ShoppingCart, DollarSign, Users, Printer, ArrowLeft, ArrowRight,
  BookOpen, Sparkles, Download, Receipt, CreditCard, Wallet, BarChart3, Activity,
  Award, Clock, ArrowUpRight, ArrowDownRight, Target, FileText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { format, subDays, addDays, startOfDay, endOfDay, isToday, getHours } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const PAYMENT_COLORS = [
  "hsl(var(--primary))", "hsl(142 76% 36%)", "hsl(38 92% 50%)",
  "hsl(217 91% 60%)", "hsl(280 65% 60%)", "hsl(0 84% 60%)",
];

const DailySalesReport = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: formatCurrency } = useCurrency();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calOpen, setCalOpen] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayStart = startOfDay(selectedDate).toISOString();
  const dayEnd = endOfDay(selectedDate).toISOString();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["daily-orders", storeId, dateStr],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name), order_items(quantity, price, products(name))")
        .eq("store_id", storeId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["daily-transactions", storeId, dateStr],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("store_id", storeId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      return data || [];
    },
  });

  // Yesterday for comparison
  const yStart = startOfDay(subDays(selectedDate, 1)).toISOString();
  const yEnd = endOfDay(subDays(selectedDate, 1)).toISOString();
  const { data: yesterdayOrders = [] } = useQuery({
    queryKey: ["yesterday-orders", storeId, dateStr],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("store_id", storeId!)
        .gte("created_at", yStart)
        .lte("created_at", yEnd);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const totalSales = orders.reduce((s, o: any) => s + Number(o.total_amount), 0);
    const totalCost = orders.reduce((s, o: any) => s + Number(o.cost_price || 0), 0);
    const totalDiscount = orders.reduce((s, o: any) => s + Number(o.discount || 0), 0);
    const profit = totalSales - totalCost - totalDiscount;
    const paidOrders = orders.filter((o: any) => o.payment_status === "paid").length;
    const unpaidOrders = orders.filter((o: any) => o.payment_status !== "paid").length;
    const cashSales = orders.filter((o: any) => (o.payment_method || "").toLowerCase().includes("cash")).reduce((s, o: any) => s + Number(o.total_amount), 0);
    const income = transactions.filter((t: any) => t.type === "income").reduce((s, t: any) => s + Number(t.amount), 0);
    const expense = transactions.filter((t: any) => t.type === "expense").reduce((s, t: any) => s + Number(t.amount), 0);
    const uniqueCustomers = new Set(orders.map((o: any) => o.customer_id).filter(Boolean)).size;
    const avgOrder = orders.length ? totalSales / orders.length : 0;
    const margin = totalSales ? (profit / totalSales) * 100 : 0;

    const methodBreakdown: Record<string, number> = {};
    orders.forEach((o: any) => {
      const m = (o.payment_method || "cash").toLowerCase();
      methodBreakdown[m] = (methodBreakdown[m] || 0) + Number(o.total_amount);
    });

    // Hourly distribution
    const hourly: Record<number, { orders: number; sales: number }> = {};
    for (let h = 0; h < 24; h++) hourly[h] = { orders: 0, sales: 0 };
    orders.forEach((o: any) => {
      const h = getHours(new Date(o.created_at));
      hourly[h].orders += 1;
      hourly[h].sales += Number(o.total_amount);
    });
    const hourlyData = Object.entries(hourly).map(([h, v]) => ({
      hour: `${h}h`, orders: v.orders, sales: v.sales,
    }));
    const peakHour = Object.entries(hourly).reduce((a, b) => (b[1].sales > a[1].sales ? b : a), ["0", { orders: 0, sales: 0 }])[0];

    // Top products
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    orders.forEach((o: any) => {
      (o.order_items || []).forEach((it: any) => {
        const name = it.products?.name || "Unknown";
        if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0 };
        productMap[name].qty += Number(it.quantity || 0);
        productMap[name].revenue += Number(it.price || 0) * Number(it.quantity || 0);
      });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      totalSales, totalCost, profit, totalDiscount, paidOrders, unpaidOrders,
      cashSales, income, expense, uniqueCustomers, methodBreakdown,
      orderCount: orders.length, avgOrder, margin, hourlyData, peakHour, topProducts,
    };
  }, [orders, transactions]);

  const yesterdayTotal = yesterdayOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
  const dod = yesterdayTotal > 0 ? ((stats.totalSales - yesterdayTotal) / yesterdayTotal) * 100 : 0;
  const netTotal = stats.totalSales + stats.income - stats.totalCost - stats.totalDiscount - stats.expense;

  const paymentChartData = Object.entries(stats.methodBreakdown).map(([name, value], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: value as number,
    color: PAYMENT_COLORS[i % PAYMENT_COLORS.length],
  }));

  const handlePrint = () => window.print();

  const exportCSV = () => {
    const rows = [
      ["Time", "Customer", "Items", "Amount", "Payment", "Status"],
      ...orders.map((o: any) => [
        format(new Date(o.created_at), "HH:mm"),
        (o.customers?.name || "Walk-in").replace(/,/g, ";"),
        o.order_items?.length || 0,
        o.total_amount, o.payment_method || "", o.payment_status || "",
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `daily-report-${dateStr}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-24 md:pb-6 print:space-y-4">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Daily Sales Report</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{format(selectedDate, "EEEE, dd MMMM yyyy")}{isToday(selectedDate) && " · Live"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap print:hidden">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant={isToday(selectedDate) ? "default" : "outline"} size="sm" className="h-9">
                  <Calendar className="h-4 w-4 mr-1.5" />
                  {isToday(selectedDate) ? "Today" : format(selectedDate, "dd MMM")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarUI mode="single" selected={selectedDate} onSelect={(d) => { if (d) { setSelectedDate(d); setCalOpen(false); } }} disabled={(d) => d > new Date()} />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => addDays(d, 1))} disabled={isToday(selectedDate)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCSV} disabled={!orders.length}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <BookOpen className="h-4 w-4" /> Guide
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Daily Sales — Master Guide</SheetTitle>
                  <SheetDescription>Reading and acting on your daily numbers</SheetDescription>
                </SheetHeader>
                <div className="space-y-3 mt-6 text-sm">
                  {[
                    { icon: Calendar, title: "1 · Date Navigation", desc: "Use arrows to step through days, click the date chip for a calendar picker, or hit Today for an instant snapshot of right now." },
                    { icon: DollarSign, title: "2 · Total Sales vs Yesterday", desc: "The DoD percentage shows how today compares to yesterday's revenue. Green = growth, red = decline. Watch for sudden drops." },
                    { icon: TrendingUp, title: "3 · Profit & Margin", desc: "Profit = Sales − Cost − Discounts. Margin % helps you compare days even when revenue varies. Healthy retail margin is 25–40%." },
                    { icon: Receipt, title: "4 · Average Order Value (AOV)", desc: "A higher AOV means customers are buying more per visit. Use bundles, upselling at POS, or minimum-order discounts to grow this number." },
                    { icon: CreditCard, title: "5 · Payment Breakdown", desc: "See exactly how money was collected — Cash, Card, UPI, bKash, Bank etc. Cross-check with Cash Register to spot leakage." },
                    { icon: Clock, title: "6 · Peak Hour Analysis", desc: "The hourly chart reveals when customers buy most. Schedule your best staff during peak hours; run promos during slow hours." },
                    { icon: Award, title: "7 · Top Products", desc: "Bestseller list of the day. Make sure these are always in stock — running out of top sellers kills daily revenue." },
                    { icon: FileText, title: "8 · Print & Export", desc: "Print a clean A4 report for end-of-day handover, or export CSV to share with accountant/owner." },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <step.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold mb-1">{step.title}</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4">
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Pro Tip</p>
                    <p className="text-xs text-muted-foreground">Make this report your daily ritual — review it every night before closing. Trends become obvious within 2 weeks.</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* PREMIUM KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
            <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Sales</p>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-primary">{formatCurrency(stats.totalSales)}</p>
              {yesterdayTotal > 0 && (
                <div className={`text-[10px] mt-1 flex items-center gap-0.5 ${dod >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {dod >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(dod).toFixed(1)}% vs yesterday
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5" />
            <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">Profit</p>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{formatCurrency(stats.profit)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Margin {stats.margin.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5" />
            <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">Orders</p>
                <ShoppingCart className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-600">{stats.orderCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{stats.paidOrders} paid · {stats.unpaidOrders} due</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5" />
            <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">Customers</p>
                <Users className="h-4 w-4 text-orange-600" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-orange-600">{stats.uniqueCustomers}</p>
              <p className="text-[10px] text-muted-foreground mt-1">AOV {formatCurrency(stats.avgOrder)}</p>
            </CardContent>
          </Card>
        </div>

        {/* HOURLY CHART + PAYMENT PIE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-0 shadow-md lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Hourly Sales Pulse</CardTitle>
              {stats.totalSales > 0 && (
                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Peak {stats.peakHour}h</Badge>
              )}
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.hourlyData}>
                  <defs>
                    <linearGradient id="hsales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#hsales)" name="Sales" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Payment Mix</CardTitle></CardHeader>
            <CardContent>
              {paymentChartData.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No sales today
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                        {paymentChartData.map((p, i) => <Cell key={i} fill={p.color} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} formatter={(v: any) => formatCurrency(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {paymentChartData.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          <span className="capitalize">{p.name}</span>
                        </div>
                        <span className="font-semibold tabular-nums">{formatCurrency(p.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* P&L + TOP PRODUCTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Profit & Loss Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><ArrowUpRight className="h-3 w-3 text-emerald-600" />Sales Revenue</span><span className="font-semibold text-emerald-600">+{formatCurrency(stats.totalSales)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><ArrowUpRight className="h-3 w-3 text-emerald-600" />Other Income</span><span className="font-semibold text-emerald-600">+{formatCurrency(stats.income)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><ArrowDownRight className="h-3 w-3 text-destructive" />Cost of Goods</span><span className="font-semibold text-destructive">-{formatCurrency(stats.totalCost)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><ArrowDownRight className="h-3 w-3 text-destructive" />Discounts Given</span><span className="font-semibold text-destructive">-{formatCurrency(stats.totalDiscount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1.5"><ArrowDownRight className="h-3 w-3 text-destructive" />Operating Expenses</span><span className="font-semibold text-destructive">-{formatCurrency(stats.expense)}</span></div>
                <div className="border-t-2 border-primary/20 pt-2.5 mt-2">
                  <div className="rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 p-3 flex justify-between items-center">
                    <span className="font-bold flex items-center gap-1.5"><Target className="h-4 w-4 text-primary" />Net Total</span>
                    <span className={`font-extrabold text-lg ${netTotal >= 0 ? "text-emerald-600" : "text-destructive"}`}>{formatCurrency(netTotal)}</span>
                  </div>
                </div>
                {stats.totalSales > 0 && (
                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Profit Margin</span><span>{stats.margin.toFixed(1)}%</span></div>
                    <Progress value={Math.max(0, Math.min(stats.margin, 100))} className="h-1.5" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Top Products Today</CardTitle></CardHeader>
            <CardContent>
              {stats.topProducts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <Award className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No products sold today
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stats.topProducts.map((p, i) => {
                    const max = stats.topProducts[0].revenue;
                    const pct = (p.revenue / max) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-zinc-400 text-white" : i === 2 ? "bg-orange-700 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <span className="truncate font-medium">{p.name}</span>
                          </div>
                          <span className="font-semibold tabular-nums shrink-0 ml-2">{formatCurrency(p.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-7">
                          <Progress value={pct} className="h-1 flex-1" />
                          <span className="text-[10px] text-muted-foreground shrink-0 w-12 text-right">{p.qty} sold</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ORDERS TABLE WITH TABS */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Order Log</CardTitle>
            <Badge variant="secondary">{stats.orderCount} orders</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="all" className="px-4 pb-3">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="all">All ({stats.orderCount})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({stats.paidOrders})</TabsTrigger>
                <TabsTrigger value="due">Due ({stats.unpaidOrders})</TabsTrigger>
              </TabsList>
              {(["all", "paid", "due"] as const).map(tab => {
                const list = tab === "all" ? orders : tab === "paid" ? orders.filter((o: any) => o.payment_status === "paid") : orders.filter((o: any) => o.payment_status !== "paid");
                return (
                  <TabsContent key={tab} value={tab} className="mt-3">
                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2">
                      {isLoading ? <p className="text-center py-6 text-sm text-muted-foreground">Loading...</p>
                        : list.length === 0 ? (
                          <div className="text-center py-10">
                            <Receipt className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">No orders</p>
                          </div>
                        ) : list.map((o: any) => (
                          <div key={o.id} className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-sm">{o.customers?.name || "Walk-in"}</p>
                                <p className="text-[11px] text-muted-foreground">{format(new Date(o.created_at), "hh:mm a")} · {o.order_items?.length || 0} items</p>
                              </div>
                              <Badge variant={o.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{o.payment_status}</Badge>
                            </div>
                            <div className="flex justify-between items-center">
                              <Badge variant="outline" className="capitalize text-[10px]">{o.payment_method}</Badge>
                              <span className="font-bold">{formatCurrency(Number(o.total_amount))}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Time</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                          ) : list.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-12">
                              <Receipt className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                              <p className="text-muted-foreground">No orders</p>
                            </TableCell></TableRow>
                          ) : list.map((o: any) => (
                            <TableRow key={o.id} className="hover:bg-muted/30">
                              <TableCell className="text-sm">{format(new Date(o.created_at), "hh:mm a")}</TableCell>
                              <TableCell className="font-medium">{o.customers?.name || "Walk-in"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{o.order_items?.length || 0} items</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(Number(o.total_amount))}</TableCell>
                              <TableCell><Badge variant="outline" className="capitalize text-xs">{o.payment_method}</Badge></TableCell>
                              <TableCell>
                                <Badge variant={o.payment_status === "paid" ? "default" : "destructive"} className="text-xs">{o.payment_status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DailySalesReport;
