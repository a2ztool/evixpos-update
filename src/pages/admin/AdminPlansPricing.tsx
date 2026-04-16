import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, RefreshCw, Crown, Shield, Zap, Users, Store, Package, TrendingUp, Clock, BarChart3 } from "lucide-react";

interface PlanRow {
  id?: string;
  plan_type: string;
  volume: number;
  price_inr: number;
  store_limit: number;
  product_limit: number;
  customer_limit: number;
}

interface PlanStats {
  totalUsers: number;
  planBreakdown: { free: number; pro: number; business: number };
  expiringSoon: number;
  totalRevenue: number;
}

const VOLUME_STEPS = [500, 1000, 5000, 10000, 20000, 50000, 100000];

const AdminPlansPricing = () => {
  const { adminCall, loading: adminLoading } = useAdmin();
  const [configs, setConfigs] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<PlanStats | null>(null);
  const [planHistory, setPlanHistory] = useState<any[]>([]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("plans_config" as any)
      .select("*")
      .order("plan_type")
      .order("volume");
    if (error) {
      toast.error("Failed to load plans config: " + error.message);
    } else {
      setConfigs((data as any[]) || []);
    }
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminCall("get_plan_stats");
      if (data) setStats(data);
    } catch {}
  }, [adminCall]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await adminCall("get_plan_history");
      if (data) setPlanHistory(data);
    } catch {}
  }, [adminCall]);

  useEffect(() => {
    fetchConfigs();
    fetchStats();
    fetchHistory();
  }, [fetchConfigs, fetchStats, fetchHistory]);

  const updateField = (index: number, field: keyof PlanRow, value: number) => {
    setConfigs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const result = await adminCall("update_plans_config", { configs });
      if (result?.success) {
        toast.success("Plans config updated! Changes are live now.");
        fetchConfigs();
      } else {
        toast.error("Failed to save");
      }
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
    setSaving(false);
  };

  const formatVol = (v: number) => (v >= 1000 ? `${v / 1000}K` : `${v}`);

  const PlanIcon = ({ plan }: { plan: string }) => {
    if (plan === "pro") return <Crown className="h-4 w-4 text-emerald-400" />;
    if (plan === "business") return <Shield className="h-4 w-4 text-orange-400" />;
    return <Zap className="h-4 w-4 text-slate-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const freeConfig = configs.find(c => c.plan_type === "free");
  const proConfigs = configs.filter(c => c.plan_type === "pro");
  const businessConfigs = configs.filter(c => c.plan_type === "business");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Plans & Pricing</h1>
          <p className="text-sm text-slate-400">Control all plan pricing, limits and volume tiers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfigs} className="border-slate-600 text-slate-300">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
            { label: "Pro Users", value: stats.planBreakdown.pro, icon: Crown, color: "text-emerald-400" },
            { label: "Business Users", value: stats.planBreakdown.business, icon: Shield, color: "text-orange-400" },
            { label: "Expiring Soon", value: stats.expiringSoon, icon: Clock, color: "text-red-400" },
          ].map(s => (
            <Card key={s.label} className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="pricing" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="pricing">Pricing & Limits</TabsTrigger>
          <TabsTrigger value="history">Plan History</TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="space-y-4">
          {/* Free Plan */}
          {freeConfig && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5 text-slate-400" /> Free Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      <Store className="h-3 w-3 inline mr-1" />Store Limit
                    </label>
                    <Input
                      type="number"
                      value={freeConfig.store_limit}
                      onChange={e => {
                        const idx = configs.findIndex(c => c.plan_type === "free");
                        if (idx >= 0) updateField(idx, "store_limit", Number(e.target.value));
                      }}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      <Package className="h-3 w-3 inline mr-1" />Product Limit
                    </label>
                    <Input
                      type="number"
                      value={freeConfig.product_limit}
                      onChange={e => {
                        const idx = configs.findIndex(c => c.plan_type === "free");
                        if (idx >= 0) updateField(idx, "product_limit", Number(e.target.value));
                      }}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      <Users className="h-3 w-3 inline mr-1" />Customer Limit
                    </label>
                    <Input
                      type="number"
                      value={freeConfig.customer_limit}
                      onChange={e => {
                        const idx = configs.findIndex(c => c.plan_type === "free");
                        if (idx >= 0) updateField(idx, "customer_limit", Number(e.target.value));
                      }}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pro & Business Volume Tables */}
          {[
            { label: "Pro Plan", key: "pro", icon: Crown, color: "text-emerald-400", rows: proConfigs },
            { label: "Business Plan", key: "business", icon: Shield, color: "text-orange-400", rows: businessConfigs },
          ].map(plan => (
            <Card key={plan.key} className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <plan.icon className={`h-5 w-5 ${plan.color}`} /> {plan.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-2">Volume</th>
                        <th className="text-left py-2 px-2">Price (₹/mo)</th>
                        <th className="text-left py-2 px-2">Stores</th>
                        <th className="text-left py-2 px-2">Products</th>
                        <th className="text-left py-2 px-2">Customers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.map((row, i) => {
                        const globalIdx = configs.findIndex(
                          c => c.plan_type === row.plan_type && c.volume === row.volume
                        );
                        return (
                          <tr key={row.volume} className="border-b border-slate-700/50">
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="border-slate-600 text-slate-300">
                                {formatVol(row.volume)}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                value={row.price_inr}
                                onChange={e => updateField(globalIdx, "price_inr", Number(e.target.value))}
                                className="bg-slate-900 border-slate-600 text-white h-8 w-24"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                value={row.store_limit}
                                onChange={e => updateField(globalIdx, "store_limit", Number(e.target.value))}
                                className="bg-slate-900 border-slate-600 text-white h-8 w-20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                value={row.product_limit}
                                onChange={e => updateField(globalIdx, "product_limit", Number(e.target.value))}
                                className="bg-slate-900 border-slate-600 text-white h-8 w-20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                value={row.customer_limit}
                                onChange={e => updateField(globalIdx, "customer_limit", Number(e.target.value))}
                                className="bg-slate-900 border-slate-600 text-white h-8 w-24"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-400" /> Recent Plan Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {planHistory.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No plan history yet</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {planHistory.map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                          <TrendingUp className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">
                            {h.user_email || h.user_id?.slice(0, 8)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {h.old_plan || "none"} → {h.new_plan || "none"}
                            {h.action && <Badge className="ml-2 text-[10px]" variant="outline">{h.action}</Badge>}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">
                        {h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPlansPricing;
