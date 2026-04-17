import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2 } from "lucide-react";

type PaymentRow = { status: string };

const AdminPaymentSuccessRate = () => {
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setUnavailable(false);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data, error } = await supabase
          .from("plan_payments")
          .select("status")
          .gte("created_at", since.toISOString());
        if (error) throw error;

        const rows = (data ?? []) as PaymentRow[];
        const success = rows.filter((r) => ["approved", "completed", "success", "paid"].includes(r.status?.toLowerCase())).length;
        const failed = rows.filter((r) => ["rejected", "failed", "declined"].includes(r.status?.toLowerCase())).length;
        const pending = rows.length - success - failed;
        setStats({ total: rows.length, success, failed, pending });
      } catch {
        setStats({ total: 0, success: 0, failed: 0, pending: 0 });
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base text-white md:text-lg">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          Payment Success Rate (30d)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-400" />
          </div>
        ) : unavailable ? (
          <p className="py-4 text-center text-sm text-slate-400">Payment data unavailable.</p>
        ) : (
          <>
            <div className="mb-4 text-center">
              <p className="text-3xl font-bold text-emerald-400 md:text-4xl">{successRate}%</p>
              <p className="text-xs text-slate-400">{stats.success} of {stats.total} payments succeeded</p>
            </div>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${successRate}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-700/40 p-2">
                <p className="font-bold text-emerald-400">{stats.success}</p>
                <p className="text-slate-400">Success</p>
              </div>
              <div className="rounded-lg bg-slate-700/40 p-2">
                <p className="font-bold text-amber-400">{stats.pending}</p>
                <p className="text-slate-400">Pending</p>
              </div>
              <div className="rounded-lg bg-slate-700/40 p-2">
                <p className="font-bold text-red-400">{stats.failed}</p>
                <p className="text-slate-400">Failed</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminPaymentSuccessRate;
