import { useEffect, useState, lazy, Suspense } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Store, ShoppingCart, DollarSign, Crown } from "lucide-react";

const AdminAnalyticsChart = lazy(() => import("@/components/admin/AdminAnalyticsChart"));
const AdminTopStores = lazy(() => import("@/components/admin/AdminTopStores"));
const AdminPaymentSuccessRate = lazy(() => import("@/components/admin/AdminPaymentSuccessRate"));

interface Stats {
  totalUsers: number;
  totalStores: number;
  totalOrders: number;
  totalRevenue: number;
  activeSubs: number;
  planBreakdown: { free: number; pro: number; business: number };
}

const AdminDashboard = () => {
  const { adminCall, loading } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    adminCall("get_stats").then(setStats);
  }, [adminCall]);

  const cards = stats
    ? [
        { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
        { label: "Total Stores", value: stats.totalStores, icon: Store, color: "text-purple-400", bg: "bg-purple-500/10" },
        { label: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, color: "text-amber-400", bg: "bg-amber-500/10" },
        { label: "Total Revenue", value: `$${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        { label: "Active Subs", value: stats.activeSubs, icon: Crown, color: "text-pink-400", bg: "bg-pink-500/10" },
      ]
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {loading && !stats ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
        </div>
      ) : (
        <>
          {/* Mobile: 2-col grid, Desktop: 5-col */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {cards.map((c) => (
              <Card key={c.label} className="bg-slate-800 border-slate-700">
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <div className={`p-2 md:p-2.5 rounded-xl ${c.bg}`}>
                      <c.icon className={`h-4 w-4 md:h-5 md:w-5 ${c.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] md:text-xs text-slate-400 truncate">{c.label}</p>
                      <p className="text-base md:text-lg font-bold text-white truncate">{c.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {stats && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white text-base md:text-lg">Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  {(["free", "pro", "business"] as const).map((plan) => (
                    <div key={plan} className="text-center p-3 md:p-4 rounded-xl bg-slate-700/50">
                      <p className="text-xl md:text-2xl font-bold text-white">{stats.planBreakdown[plan]}</p>
                      <p className="text-xs md:text-sm text-slate-400 capitalize">{plan}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Suspense
            fallback={
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-6 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
                </CardContent>
              </Card>
            }
          >
            <AdminAnalyticsChart />
          </Suspense>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <Suspense fallback={<Card className="bg-slate-800 border-slate-700 h-64" />}>
              <AdminTopStores />
            </Suspense>
            <Suspense fallback={<Card className="bg-slate-800 border-slate-700 h-64" />}>
              <AdminPaymentSuccessRate />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;

