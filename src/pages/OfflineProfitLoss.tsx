import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Truck, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "#f59e0b", "#10b981", "#6366f1", "#8b5cf6"];

const OfflineProfitLoss = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: fmt } = useCurrency();
  const [range, setRange] = useState("30");

  const startDate = startOfDay(subDays(new Date(), Number(range))).toISOString();
  const endDate = endOfDay(new Date()).toISOString();

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
    const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";

    // Expense breakdown by category
    const expenseByCategory: Record<string, number> = {};
    transactions.filter((t: any) => t.type === "expense").forEach((t: any) => {
      const cat = t.category || "Other";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(t.amount);
    });

    // Daily revenue chart
    const dailyMap: Record<string, { revenue: number; cost: number; profit: number }> = {};
    orders.forEach((o: any) => {
      const d = format(new Date(o.created_at), "MMM dd");
      if (!dailyMap[d]) dailyMap[d] = { revenue: 0, cost: 0, profit: 0 };
      dailyMap[d].revenue += Number(o.total_amount);
      dailyMap[d].cost += Number(o.cost_price);
      dailyMap[d].profit += Number(o.total_amount) - Number(o.cost_price);
    });
    const dailyChart = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v }));

    const expensePie = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }));

    return { revenue, cogs, grossProfit, discounts, purchaseTotal, otherIncome, expenses, netProfit, margin, dailyChart, expensePie };
  }, [orders, purchases, transactions]);

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Profit & Loss</h1>
            <p className="text-sm text-muted-foreground">Offline store financial overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 1 year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">Revenue</span></div>
              <p className="text-xl font-bold">{fmt(stats.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">Net Profit</span></div>
              <p className={`text-xl font-bold ${stats.netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(stats.netProfit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><Truck className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Purchases</span></div>
              <p className="text-xl font-bold">{fmt(stats.purchaseTotal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Margin</span></div>
              <p className="text-xl font-bold">{stats.margin}%</p>
            </CardContent>
          </Card>
        </div>

        {/* P&L Statement */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Profit & Loss Statement</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="font-medium">Sales Revenue</span><span className="font-bold text-green-600">{fmt(stats.revenue)}</span></div>
              <div className="flex justify-between py-1 pl-4"><span className="text-sm text-muted-foreground">Cost of Goods Sold</span><span className="text-destructive">-{fmt(stats.cogs)}</span></div>
              <div className="flex justify-between py-2 border-b bg-muted/30 px-2 rounded"><span className="font-medium">Gross Profit</span><span className="font-bold">{fmt(stats.grossProfit)}</span></div>
              <div className="flex justify-between py-1 pl-4"><span className="text-sm text-muted-foreground">Other Income</span><span className="text-green-600">+{fmt(stats.otherIncome)}</span></div>
              <div className="flex justify-between py-1 pl-4"><span className="text-sm text-muted-foreground">Discounts Given</span><span className="text-destructive">-{fmt(stats.discounts)}</span></div>
              <div className="flex justify-between py-1 pl-4"><span className="text-sm text-muted-foreground">Operating Expenses</span><span className="text-destructive">-{fmt(stats.expenses)}</span></div>
              <div className={`flex justify-between py-3 border-t-2 ${stats.netProfit >= 0 ? "border-green-500" : "border-destructive"}`}>
                <span className="text-lg font-bold">Net Profit</span>
                <span className={`text-xl font-bold ${stats.netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(stats.netProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Revenue vs Cost</CardTitle></CardHeader>
            <CardContent>
              {stats.dailyChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" fill="hsl(var(--destructive))" name="Cost" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No data for this period</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Expense Breakdown</CardTitle></CardHeader>
            <CardContent>
              {stats.expensePie.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={stats.expensePie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {stats.expensePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No expenses recorded</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OfflineProfitLoss;
