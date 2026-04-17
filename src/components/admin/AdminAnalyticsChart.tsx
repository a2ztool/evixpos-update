import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";

type Point = { date: string; orders: number; revenue: number };
type Range = 7 | 30;

type OrderRow = {
  created_at: string;
  total_amount: number | string | null;
};

const buildTrendData = (orders: OrderRow[], days: Range) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const buckets: Record<string, Point> = {};
  for (let i = 0; i < days; i++) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    buckets[key] = { date: key, orders: 0, revenue: 0 };
  }

  orders.forEach((order) => {
    const key = new Date(order.created_at).toISOString().slice(0, 10);
    if (!buckets[key]) return;
    buckets[key].orders += 1;
    buckets[key].revenue += Number(order.total_amount) || 0;
  });

  return Object.values(buckets);
};

const AdminAnalyticsChart = () => {
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (days: Range) => {
    setLoading(true);
    setUnavailable(false);

    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));

      const { data: orders, error } = await supabase
        .from("orders")
        .select("created_at, total_amount")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      setData(buildTrendData((orders ?? []) as OrderRow[], days));
    } catch {
      setData([]);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-analytics-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void load(range);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [range, load]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const totalOrders = data.reduce((sum, item) => sum + item.orders, 0);
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-4 md:p-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-white md:text-lg">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Realtime Analytics
          </CardTitle>
          <div className="mt-2 flex gap-4 text-xs md:text-sm">
            <span className="text-slate-400">
              Orders: <span className="font-semibold text-white">{totalOrders}</span>
            </span>
            <span className="text-slate-400">
              Revenue: <span className="font-semibold text-emerald-400">${totalRevenue.toLocaleString()}</span>
            </span>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-700/50 p-1">
          {([7, 30] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant="ghost"
              onClick={() => setRange(value)}
              className={`h-7 px-3 text-xs ${
                range === value
                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-400"
                  : "text-slate-400 hover:bg-slate-700 hover:text-white"
              }`}
            >
              Last {value} days
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-2 pt-0 md:p-4">
        <div className="h-[280px] w-full">
          {loading && data.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-400" />
            </div>
          ) : unavailable ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Analytics data is temporarily unavailable.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="admin-revenue-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 84% 45%)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(160 84% 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="admin-orders-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="hsl(215 28% 25%)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="hsl(215 16% 60%)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="hsl(215 16% 60%)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(217 33% 17%)",
                    border: "1px solid hsl(215 28% 25%)",
                    borderRadius: 8,
                    color: "white",
                    fontSize: 12,
                  }}
                  labelFormatter={formatDate}
                  formatter={(value: number, name: string) => [
                    name === "revenue" ? `$${value.toLocaleString()}` : value,
                    name === "revenue" ? "Revenue" : "Orders",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(160 84% 45%)"
                  strokeWidth={2}
                  fill="url(#admin-revenue-gradient)"
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(217 91% 60%)"
                  strokeWidth={2}
                  fill="url(#admin-orders-gradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminAnalyticsChart;
