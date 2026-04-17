import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

type StoreRow = { store_id: string | null; total_amount: number | string | null };
type StoreInfo = { id: string; name: string };
type LeaderRow = { id: string; name: string; revenue: number };

const AdminTopStores = () => {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setUnavailable(false);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);

        const { data: orders, error } = await supabase
          .from("orders")
          .select("store_id, total_amount")
          .gte("created_at", since.toISOString());
        if (error) throw error;

        const totals = new Map<string, number>();
        ((orders ?? []) as StoreRow[]).forEach((o) => {
          if (!o.store_id) return;
          totals.set(o.store_id, (totals.get(o.store_id) ?? 0) + (Number(o.total_amount) || 0));
        });

        const topIds = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (topIds.length === 0) {
          setRows([]);
          return;
        }

        const { data: stores } = await supabase
          .from("stores")
          .select("id, name")
          .in("id", topIds.map(([id]) => id));

        const nameMap = new Map((stores ?? []).map((s: StoreInfo) => [s.id, s.name]));
        setRows(
          topIds.map(([id, revenue]) => ({
            id,
            name: nameMap.get(id) ?? "Unknown Store",
            revenue,
          })),
        );
      } catch {
        setRows([]);
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const max = rows[0]?.revenue || 1;

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base text-white md:text-lg">
          <Trophy className="h-5 w-5 text-amber-400" />
          Top Stores (Last 30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-400" />
          </div>
        ) : unavailable || rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No store revenue data available.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, idx) => (
              <li key={r.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs md:text-sm">
                  <span className="flex items-center gap-2 text-white">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-amber-400">
                      {idx + 1}
                    </span>
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="font-semibold text-emerald-400">${r.revenue.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                    style={{ width: `${Math.max(4, (r.revenue / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminTopStores;
