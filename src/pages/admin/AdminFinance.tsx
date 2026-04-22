import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdmin } from "@/hooks/useAdmin";
import { DollarSign, TrendingUp, TrendingDown, Users, AlertCircle, RefreshCcw, Calendar, Loader2 } from "lucide-react";

interface Metrics {
  mrr: number;
  arr: number;
  planCounts: Record<string, number>;
  revenue30: number;
  revenuePrev30: number;
  revenueGrowthPct: number;
  churnRate: number;
  failedPayments: number;
  refundTotal: number;
  upcomingRenewals: number;
}

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n));

const AdminFinance = () => {
  const { adminCall } = useAdmin();
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await adminCall("get_finance_metrics");
      setM(data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  }
  if (!m) return <div className="text-slate-400">No data</div>;

  const cards = [
    { label: "MRR (Monthly Recurring)", value: `₹${fmt(m.mrr)}`, icon: DollarSign, color: "emerald" },
    { label: "ARR (Annual Run-rate)", value: `₹${fmt(m.arr)}`, icon: TrendingUp, color: "blue" },
    { label: "Revenue (30d)", value: `₹${fmt(m.revenue30)}`, icon: DollarSign, color: "violet", sub: `${m.revenueGrowthPct >= 0 ? "+" : ""}${m.revenueGrowthPct.toFixed(1)}% vs prev 30d` },
    { label: "Churn Rate (30d)", value: `${m.churnRate.toFixed(1)}%`, icon: TrendingDown, color: "rose" },
    { label: "Active Pro", value: fmt(m.planCounts.pro || 0), icon: Users, color: "amber" },
    { label: "Active Business", value: fmt(m.planCounts.business || 0), icon: Users, color: "indigo" },
    { label: "Failed Payments (30d)", value: fmt(m.failedPayments), icon: AlertCircle, color: "rose" },
    { label: "Refunds (30d)", value: `₹${fmt(m.refundTotal)}`, icon: RefreshCcw, color: "amber" },
    { label: "Upcoming Renewals (7d)", value: fmt(m.upcomingRenewals), icon: Calendar, color: "emerald" },
  ];

  const colorClass = (c: string) => ({
    emerald: "bg-emerald-600/20 text-emerald-400",
    blue: "bg-blue-600/20 text-blue-400",
    violet: "bg-violet-600/20 text-violet-400",
    rose: "bg-rose-600/20 text-rose-400",
    amber: "bg-amber-600/20 text-amber-400",
    indigo: "bg-indigo-600/20 text-indigo-400",
  } as Record<string, string>)[c];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Finance Dashboard</h1>
          <p className="text-sm text-slate-400">Revenue, churn, renewals & payment health</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <Card key={i} className="bg-slate-800 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-slate-400 font-medium">{c.label}</CardTitle>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass(c.color)}`}>
                <c.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white">{c.value}</div>
              {c.sub && <p className="text-[10px] text-slate-500 mt-1">{c.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminFinance;
