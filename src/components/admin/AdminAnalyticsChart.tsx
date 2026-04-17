import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";

type Point = { date: string; orders: number; revenue: number };
type Range = 7 | 30;

const AdminAnalyticsChart = () => {
  const { adminCall } = useAdmin();
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (days: Range) => {
      setLoading(true);
      const res = await adminCall("get_analytics_trends", { days });
      if (Array.isArray(res)) setData(res);
      setLoading(false);
    },
    [adminCall],
  );

  useEffect(() => {
    load(range);
  }, [range, load]);

  // Realtime: refresh on new orders
  useEffect(() => {
    const channel = supabase
      .channel("admin-analytics-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        load(range);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [range, load]);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="p-4 md:p-6 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="text-white text-base md:text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Realtime Analytics
          </CardTitle>
          <div className="flex gap-4 mt-2 text-xs md:text-sm">
            <span className="text-slate-400">
              Orders: <span className="text-white font-semibold">{totalOrders}</span>
            </span>
            <span className="text-slate-400">
              Revenue: <span className="text-emerald-400 font-semibold">${totalRevenue.toLocaleString()}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
          {([7, 30] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant="ghost"
              onClick={() => setRange(r)}
              className={`h-7 px-3 text-xs ${
                range === r
                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {r}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4 pt-0">
        <div className="h-[280px] w-full">
          {loading && data.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 84% 45%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(160 84% 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.5} />
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
                  formatter={(v: number, n: string) => [n === "revenue" ? `$${v.toLocaleString()}` : v, n === "revenue" ? "Revenue" : "Orders"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(160 84% 45%)"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(217 91% 60%)"
                  strokeWidth={2}
                  fill="url(#ordGrad)"
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
