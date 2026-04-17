import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Clock, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncLog {
  id: string;
  status: string;
  rows_synced: number | null;
  error_message: string | null;
  created_at: string;
}

interface Props {
  storeId?: string;
  refreshKey?: number;
}

export const SyncHistoryPanel = ({ storeId, refreshKey }: Props) => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("google_sheets_sync_log")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(10);
      setLogs(data || []);
      setLoading(false);
    })();
  }, [storeId, refreshKey]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Recent Sync Activity</div>
        </div>
        <span className="text-xs text-muted-foreground">Last 10 syncs</span>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No sync activity yet</div>
          <div className="text-xs text-muted-foreground/70 mt-1">Click "Sync Now" to start</div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {logs.map((log) => {
            const ok = log.status === "success";
            return (
              <div key={log.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                }`}>
                  {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {ok ? `Synced ${log.rows_synced ?? 0} rows` : "Sync failed"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {log.error_message || formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
