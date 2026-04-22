import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Activity, UserPlus, ShoppingCart, Wallet, RefreshCw, Radio } from "lucide-react";

interface ActivityRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  event_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  signup: { icon: UserPlus, color: "text-sky-400 bg-sky-500/15 border-sky-500/30", label: "Signup" },
  order: { icon: ShoppingCart, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", label: "Order" },
  payment: { icon: Wallet, color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "Payment" },
};

const FILTERS = ["all", "signup", "order", "payment"] as const;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
};

const AdminLiveActivity = () => {
  const { adminCall } = useAdmin();
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<typeof FILTERS[number]>("all");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [feed, st] = await Promise.all([
      adminCall("get_activity_feed", { limit: 100, event_type: filter === "all" ? undefined : filter }, { silent: true }),
      adminCall("get_activity_stats", {}, { silent: true }),
    ]);
    if (feed) setItems(feed);
    if (st?.last_24h) setStats(st.last_24h);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  // Realtime subscription
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel("admin_activity_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_activity_feed" },
        (payload) => {
          const row = payload.new as ActivityRow;
          if (filter !== "all" && row.event_type !== filter) return;
          setItems((prev) => [row, ...prev].slice(0, 100));
          setStats((s) => ({ ...s, [row.event_type]: (s[row.event_type] || 0) + 1 }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [live, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-400" /> Live Activity
          </h1>
          <p className="text-sm text-slate-400 mt-1">Real-time platform events as they happen</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={live ? "default" : "outline"}
            onClick={() => setLive(!live)}
            className={live ? "bg-emerald-600 hover:bg-emerald-700" : "border-slate-600 text-slate-200"}
          >
            <Radio className={`h-3.5 w-3.5 mr-1.5 ${live ? "animate-pulse" : ""}`} /> {live ? "Live" : "Paused"}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="border-slate-600 text-slate-200">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["signup","order","payment"] as const).map((t) => {
          const m = TYPE_META[t];
          const Icon = m.icon;
          return (
            <Card key={t} className="bg-slate-800 border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats[t] || 0}</p>
                  <p className="text-xs text-slate-400">{m.label}s · 24h</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className={filter === f ? "bg-emerald-600 hover:bg-emerald-700 capitalize" : "border-slate-600 text-slate-300 capitalize"}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Feed */}
      <Card className="bg-slate-800 border-slate-700 divide-y divide-slate-700/50">
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400">
            {loading ? "Loading…" : "No activity yet. Events will appear here in real time."}
          </div>
        )}
        {items.map((row) => {
          const meta = TYPE_META[row.event_type] || { icon: Activity, color: "text-slate-400 bg-slate-700/50 border-slate-600", label: row.event_type };
          const Icon = meta.icon;
          const amount = row.metadata?.amount as number | undefined;
          return (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${meta.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{row.event_label || meta.label}</p>
                <p className="text-xs text-slate-400 truncate">{row.user_email || "Unknown user"}</p>
              </div>
              {amount !== undefined && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  {Number(amount).toLocaleString()}
                </Badge>
              )}
              <span className="text-xs text-slate-500 whitespace-nowrap">{formatTime(row.created_at)}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

export default AdminLiveActivity;
