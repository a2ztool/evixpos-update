import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Store, Package, Users, ShoppingCart, DollarSign, Eye, Clock, Calendar, AlertTriangle, CheckCircle } from "lucide-react";

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
  plan_info?: { plan: string; start_date: string | null; end_date: string | null; remaining_days: number | null; plan_status: string };
}

const planColor = (plan: string) => {
  if (plan === "business") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (plan === "pro") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-slate-600/20 text-slate-400 border-slate-500/30";
};

const PLAN_LIMITS: Record<string, { products: number; customers: number }> = {
  free: { products: 25, customers: 50 },
  pro: { products: 100, customers: 1000 },
  business: { products: 500, customers: 5000 },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white">{profile.name || profile.email}</h1>
          <p className="text-sm text-slate-400">{profile.email} · Joined {new Date(profile.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Stores", value: stores.length, icon: Store, color: "text-blue-400" },
          { label: "Total Products", value: stores.reduce((s, st) => s + st.productCount, 0), icon: Package, color: "text-emerald-400" },
          { label: "Total Customers", value: stores.reduce((s, st) => s + st.customerCount, 0), icon: Users, color: "text-purple-400" },
          { label: "Total Revenue", value: `৳${totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan Info Card */}
      {plan_info && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" /> Plan Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-700/40 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Plan</p>
                <p className="text-sm font-bold text-white capitalize">{plan_info.plan}</p>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Status</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {plan_info.plan_status === "active" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                  {plan_info.plan_status === "expired" && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                  {plan_info.plan_status === "lifetime" && <CheckCircle className="h-3.5 w-3.5 text-slate-400" />}
                  <span className={`text-sm font-semibold capitalize ${plan_info.plan_status === "active" ? "text-emerald-400" : plan_info.plan_status === "expired" ? "text-red-400" : "text-slate-300"}`}>
                    {plan_info.plan_status}
                  </span>
                </div>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Expiry Date</p>
                <p className="text-sm font-bold text-white">
                  {plan_info.end_date ? new Date(plan_info.end_date).toLocaleDateString() : "N/A"}
                </p>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Remaining</p>
                <p className={`text-sm font-bold ${plan_info.remaining_days !== null && plan_info.remaining_days <= 7 ? "text-amber-400" : "text-white"}`}>
                  {plan_info.remaining_days !== null ? `${plan_info.remaining_days} days` : "∞"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Store cards */}
      <h2 className="text-lg font-semibold text-white">Stores</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {stores.map((store) => {
          const limits = PLAN_LIMITS[store.plan] || PLAN_LIMITS.free;
          const prodPct = Math.min(100, Math.round((store.productCount / limits.products) * 100));
          const custPct = Math.min(100, Math.round((store.customerCount / limits.customers) * 100));

          return (
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
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-lg font-bold text-white">{store.orderCount}</p><p className="text-xs text-slate-400">Orders</p></div>
                  <div><p className="text-lg font-bold text-white">৳{store.revenue.toLocaleString()}</p><p className="text-xs text-slate-400">Revenue</p></div>
                  <div><p className="text-lg font-bold text-white">{store.productCount}</p><p className="text-xs text-slate-400">Products</p></div>
                </div>

                {/* Usage bars */}
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Products</span>
                      <span className="text-slate-300">{store.productCount}/{limits.products}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${prodPct >= 90 ? "bg-red-500" : prodPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${prodPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Customers</span>
                      <span className="text-slate-300">{store.customerCount}/{limits.customers}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${custPct >= 90 ? "bg-red-500" : custPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${custPct}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {stores.length === 0 && <p className="text-slate-500">No stores.</p>}
      </div>
    </div>
  );
};

export default AdminUserDetails;
