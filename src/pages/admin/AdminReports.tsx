import { useEffect, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalStores: number;
  totalOrders: number;
  totalRevenue: number;
  activeSubs: number;
  planBreakdown: { free: number; pro: number; business: number };
}

const AdminReports = () => {
  const { adminCall } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => { adminCall("get_stats").then(setStats); }, [adminCall]);

  if (!stats) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  const totalPlanUsers = stats.planBreakdown.free + stats.planBreakdown.pro + stats.planBreakdown.business;
  const conversionRate = totalPlanUsers > 0
    ? Math.round(((stats.planBreakdown.pro + stats.planBreakdown.business) / totalPlanUsers) * 100)
    : 0;
  const avgRevenuePerOrder = stats.totalOrders > 0
    ? Math.round(stats.totalRevenue / stats.totalOrders)
    : 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Reports & Analytics</h1>
        <p className="text-slate-400 text-xs mt-0.5">Insights derived from platform data</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Conversion Rate", value: `${conversionRate}%`, sub: "Free → Paid", icon: TrendingUp, color: "text-emerald-400" },
          { label: "Avg Order Value", value: `৳${avgRevenuePerOrder.toLocaleString()}`, sub: `${stats.totalOrders} orders`, icon: BarChart3, color: "text-blue-400" },
          { label: "Stores/User", value: stats.totalUsers > 0 ? (stats.totalStores / stats.totalUsers).toFixed(1) : "0", sub: `${stats.totalStores} stores`, icon: TrendingUp, color: "text-purple-400" },
          { label: "Paid Users", value: stats.planBreakdown.pro + stats.planBreakdown.business, sub: `of ${totalPlanUsers}`, icon: TrendingDown, color: "text-amber-400" },
        ].map((m) => (
          <Card key={m.label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-slate-700/50">
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">{m.label}</p>
                  <p className="text-base md:text-lg font-bold text-white">{m.value}</p>
                  <p className="text-[10px] text-slate-500">{m.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan Distribution with progress bars */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
          <CardTitle className="text-white text-base">Plan Distribution</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-2 space-y-4">
          {(["free", "pro", "business"] as const).map((plan) => {
            const count = stats.planBreakdown[plan];
            const pct = totalPlanUsers > 0 ? Math.round((count / totalPlanUsers) * 100) : 0;
            const colors = { free: "bg-slate-500", pro: "bg-blue-500", business: "bg-amber-500" };
            return (
              <div key={plan} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300 capitalize font-medium">{plan}</span>
                  <span className="text-slate-400">{count} users ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${colors[plan]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
          <CardTitle className="text-white text-base">Platform Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-2">
          <div className="divide-y divide-slate-700">
            {[
              ["Total Users", stats.totalUsers],
              ["Total Stores", stats.totalStores],
              ["Total Orders", stats.totalOrders],
              ["Total Revenue", `৳${stats.totalRevenue.toLocaleString()}`],
              ["Active Subscriptions", stats.activeSubs],
              ["Avg Revenue/Order", `৳${avgRevenuePerOrder.toLocaleString()}`],
              ["Paid Conversion", `${conversionRate}%`],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between items-center py-2.5">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="text-sm text-white font-semibold">{val}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReports;
