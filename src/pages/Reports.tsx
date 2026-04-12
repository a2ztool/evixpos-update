import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Users, Package } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";

const Reports = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [adCosts, setAdCosts] = useState<any[]>([]);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    if (!user || !activeStore) return;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));
    const sinceISO = since.toISOString();
    const sid = activeStore.id;

    Promise.all([
      supabase.from("orders").select("total_amount, cost_price, status, created_at, customer_id").eq("store_id", sid).gte("created_at", sinceISO),
      supabase.from("products").select("name, price, stock").eq("store_id", sid),
      supabase.from("customers").select("id, name").eq("store_id", sid),
      supabase.from("ad_costs").select("amount, revenue, ad_date").eq("store_id", sid).gte("ad_date", since.toISOString().split("T")[0]),
    ]).then(([o, p, c, a]) => {
      if (o.data) setOrders(o.data);
      if (p.data) setProducts(p.data);
      if (c.data) setCustomers(c.data);
      if (a.data) setAdCosts(a.data);
    });
  }, [user, activeStore, period]);

  const monthlyChart = useMemo(() => {
    const map: Record<string, { month: string; revenue: number; profit: number }> = {};
    orders.filter((o) => o.status === "completed").forEach((o) => {
      const m = new Date(o.created_at).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
      if (!map[m]) map[m] = { month: m, revenue: 0, profit: 0 };
      map[m].revenue += Number(o.total_amount);
      map[m].profit += Number(o.total_amount) - Number(o.cost_price);
    });
    return Object.values(map);
  }, [orders]);

  const adChart = useMemo(() => {
    const totalSpend = adCosts.reduce((s, a) => s + Number(a.amount), 0);
    const totalRev = adCosts.reduce((s, a) => s + Number(a.revenue), 0);
    return [{ name: "Ad Spend", value: totalSpend }, { name: "Ad Revenue", value: totalRev }];
  }, [adCosts]);

  const topProducts = useMemo(() => {
    return products.slice(0, 5).map((p) => ({ name: p.name, stock: p.stock, price: Number(p.price) }));
  }, [products]);

  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; orders: number; total: number }> = {};
    orders.filter((o) => o.status === "completed" && o.customer_id).forEach((o) => {
      const cid = o.customer_id;
      if (!map[cid]) {
        const c = customers.find((c) => c.id === cid);
        map[cid] = { name: c?.name || "Unknown", orders: 0, total: 0 };
      }
      map[cid].orders++;
      map[cid].total += Number(o.total_amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders, customers]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" /> Reports</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[130px] sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
            <SelectItem value="90">Last 90 Days</SelectItem>
            <SelectItem value="365">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Monthly Revenue & Profit */}
      <Card className="mb-4 sm:mb-6"><CardContent className="pt-4 sm:pt-6">
        <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Monthly Revenue & Profit (৳)</h3>
        {monthlyChart.length === 0 ? <p className="text-muted-foreground text-center py-10 text-sm">No sales data for this period</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" />
              <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Revenue vs Ad Spend */}
        <Card><CardContent className="pt-4 sm:pt-6">
          <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Revenue vs Ad Spend</h3>
          {adCosts.length === 0 ? <p className="text-muted-foreground text-center py-10 text-sm">No data</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={adChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
                <Bar dataKey="value" radius={[4,4,0,0]}>
                  {adChart.map((_, i) => <Cell key={i} fill={i === 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        {/* Top Products */}
        <Card><CardContent className="pt-4 sm:pt-6">
          <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base flex items-center gap-2"><Package className="h-4 w-4" /> Top 5 Products</h3>
          {topProducts.length === 0 ? <p className="text-muted-foreground text-center py-10 text-sm">No product data</p> : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30">
                  <span className="truncate flex-1 font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Stock: {p.stock}</span>
                  <span className="font-semibold ml-2">৳{p.price.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* Top Customers */}
      <Card><CardContent className="pt-4 sm:pt-6">
        <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base flex items-center gap-2"><Users className="h-4 w-4" /> Top 5 Customers</h3>
        {topCustomers.length === 0 ? <p className="text-muted-foreground text-center py-10 text-sm">No customer data</p> : (
          <div className="space-y-2 sm:space-y-3">
            {topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">{i + 1}</div>
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold">৳{c.total.toFixed(0)}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{c.orders} orders</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </DashboardLayout>
  );
};

export default Reports;
