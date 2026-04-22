import { useEffect, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Search, RefreshCw, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ACTION_TYPES = [
  "all", "suspend_user", "unsuspend_user", "delete_user", "change_plan",
  "review_plan_payment", "send_broadcast", "delete_broadcast",
  "update_system_setting", "impersonate_user", "reset_user_password",
  "toggle_store", "delete_store",
];

const AdminAuditLogs = () => {
  const { adminCall, loading } = useAdmin();
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const fetchLogs = async () => {
    const data = await adminCall("get_audit_logs", {
      search,
      action_filter: actionFilter === "all" ? "" : actionFilter,
      limit: 300,
    });
    if (data) setLogs(data);
  };

  useEffect(() => { fetchLogs(); /* eslint-disable-next-line */ }, [actionFilter]);

  const actionColor = (a: string) => {
    if (a.includes("delete")) return "bg-red-500/20 text-red-400";
    if (a.includes("suspend")) return "bg-amber-500/20 text-amber-400";
    if (a.includes("impersonate")) return "bg-purple-500/20 text-purple-400";
    if (a.includes("broadcast")) return "bg-blue-500/20 text-blue-400";
    if (a.includes("payment")) return "bg-emerald-500/20 text-emerald-400";
    return "bg-slate-500/20 text-slate-300";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
          <ScrollText className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Audit Logs</h1>
          <p className="text-xs text-slate-400">Track every admin action across the platform</p>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by admin, target, or action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
              className="pl-9 bg-slate-900 border-slate-700 text-white"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full md:w-56 bg-slate-900 border-slate-700 text-white">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {ACTION_TYPES.map((a) => (
                <SelectItem key={a} value={a} className="text-white">{a === "all" ? "All actions" : a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={fetchLogs} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="bg-slate-800 border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">No audit logs yet.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{log.admin_email || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${actionColor(log.action)} border-0 text-xs`}>{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {log.target_label || log.target_id || "—"}
                    {log.target_type && <span className="text-slate-500"> ({log.target_type})</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-md truncate" title={JSON.stringify(log.details)}>
                    {log.details && Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminAuditLogs;
