import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPlanLimits, formatVolume, type VolumeStep } from "@/lib/planConfig";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Store, Package, Users, ShoppingCart, DollarSign, Eye, Clock, Calendar, AlertTriangle, CheckCircle, Crown } from "lucide-react";

interface StoreWithStats {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  plan: string;
  productCount: number;
  customerCount: number;
  orderCount: number;
  revenue: number;
}

interface UserDetails {
  profile: { id: string; name: string; email: string; created_at: string };
  stores: StoreWithStats[];
  plan_info?: {
    plan: string;
    start_date: string | null;
    end_date: string | null;
    remaining_days: number | null;
    plan_status: string;
    volume: number | null;
    price: number | null;
    billing_type: string | null;
  };
}

const planColor = (plan: string) => {
  if (plan === "business") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (plan === "pro") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-slate-600/20 text-slate-400 border-slate-500/30";
};

const getAdminLimits = (plan: string, volume: number | null) => {
  const limits = getPlanLimits(plan, (volume ?? 500) as VolumeStep);
  return { products: limits.maxProducts, customers: limits.maxCustomers, stores: limits.maxStores };
};

const AdminUserDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { adminCall, loading } = useAdmin();
  const [data, setData] = useState<UserDetails | null>(null);

  useEffect(() => {
    if (userId) adminCall("get_user_details", { user_id: userId }).then(setData);
  }, [userId, adminCall]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  if (!data) return <p className="text-slate-400">User not found.</p>;

  const { profile, stores, plan_info } = data;
  const totalRevenue = stores.reduce((s, st) => s + st.revenue, 0);
  const resolvedPlan =
    plan_info?.plan ||
    stores.find((store) => store.plan && store.plan !== "free")?.plan ||
    stores[0]?.plan ||
    "free";

  return (
    <div className="space-y-6">
...
      {/* Global Usage (across all stores) */}
      {(() => {
        const userPlan = resolvedPlan;
        const globalLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
        const globalProducts = stores.reduce((s, st) => s + st.productCount, 0);
        const globalCustomers = stores.reduce((s, st) => s + st.customerCount, 0);
        const globalStores = stores.length;
        const prodPct = Math.min(100, Math.round((globalProducts / globalLimits.products) * 100));
        const custPct = Math.min(100, Math.round((globalCustomers / globalLimits.customers) * 100));
        const storePct = Math.min(100, Math.round((globalStores / globalLimits.stores) * 100));

        return (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Global Usage ({userPlan} plan)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Products", current: globalProducts, max: globalLimits.products, pct: prodPct },
                { label: "Customers", current: globalCustomers, max: globalLimits.customers, pct: custPct },
                { label: "Stores", current: globalStores, max: globalLimits.stores, pct: storePct },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{item.label} (Global Limit)</span>
                    <span className="text-slate-300">{item.current}/{item.max}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.pct >= 90 ? "bg-red-500" : item.pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* Store cards */}
      <h2 className="text-lg font-semibold text-white">Stores</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {stores.map((store) => (
          <Card key={store.id} className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Store className="h-4 w-4 text-slate-400" />
                  {store.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={planColor(store.plan)}>{store.plan}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/stores/${store.id}`)} className="text-emerald-400 hover:text-emerald-300 h-7 px-2 text-xs">
                    <Eye className="h-3 w-3 mr-1" /> View
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div><p className="text-lg font-bold text-white">{store.orderCount}</p><p className="text-xs text-slate-400">Orders</p></div>
                <div><p className="text-lg font-bold text-white">৳{store.revenue.toLocaleString()}</p><p className="text-xs text-slate-400">Revenue</p></div>
                <div><p className="text-lg font-bold text-white">{store.productCount}</p><p className="text-xs text-slate-400">Products</p></div>
                <div><p className="text-lg font-bold text-white">{store.customerCount}</p><p className="text-xs text-slate-400">Customers</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
        {stores.length === 0 && <p className="text-slate-500">No stores.</p>}
      </div>
    </div>
  );
};

export default AdminUserDetails;
