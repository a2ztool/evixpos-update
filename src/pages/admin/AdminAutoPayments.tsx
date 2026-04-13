import { useState, useEffect } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { 
  Zap, CheckCircle2, XCircle, Clock, ArrowUpRight, RefreshCw, 
  Search, Filter, TrendingUp, Activity, DollarSign, BarChart3
} from "lucide-react";

interface AutoPaymentLog {
  id: string;
  gateway_id: string | null;
  user_id: string;
  store_id: string | null;
  plan: string;
  amount: number;
  currency: string;
  transaction_ref: string;
  status: string;
  gateway_response: Record<string, unknown>;
  plan_activated: boolean;
  error_message: string;
  created_at: string;
  updated_at: string;
}

interface GatewayInfo {
  id: string;
  gateway_name: string;
  icon_url: string;
  currency: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  initiated: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Clock, label: "Initiated" },
  success: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Success" },
  failed: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle, label: "Failed" },
  refunded: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: RefreshCw, label: "Refunded" },
};

const AdminAutoPayments = () => {
  const { adminCall } = useAdmin();
  const [logs, setLogs] = useState<AutoPaymentLog[]>([]);
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsData, gwData] = await Promise.all([
        adminCall("get_auto_payment_logs"),
        adminCall("get_payment_gateways"),
      ]);
      setLogs(logsData || []);
      setGateways((gwData || []).filter((g: any) => g.mode === "auto"));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filteredLogs = logs.filter(log => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (gatewayFilter !== "all" && log.gateway_id !== gatewayFilter) return false;
    if (searchTerm && !log.transaction_ref?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Stats
  const totalSuccess = logs.filter(l => l.status === "success").length;
  const totalFailed = logs.filter(l => l.status === "failed").length;
  const totalRevenue = logs.filter(l => l.status === "success").reduce((s, l) => s + Number(l.amount), 0);
  const activatedCount = logs.filter(l => l.plan_activated).length;

  const getGatewayName = (gwId: string | null) => {
    if (!gwId) return "Unknown";
    return gateways.find(g => g.id === gwId)?.gateway_name || gwId.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" />
            Auto Payments Dashboard
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Track all automatic payment transactions and plan activations
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" className="gap-2 border-slate-600 text-slate-300">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalSuccess}</p>
                <p className="text-xs text-slate-400">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalFailed}</p>
                <p className="text-xs text-slate-400">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">৳{totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{activatedCount}</p>
                <p className="text-xs text-slate-400">Plans Activated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by transaction ref..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="initiated">Initiated</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
          <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Gateway" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Gateways</SelectItem>
            {gateways.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.gateway_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            Transaction Logs
            <Badge variant="outline" className="text-slate-400 border-slate-600 ml-2">
              {filteredLogs.length} records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-slate-400">Gateway</TableHead>
                <TableHead className="text-slate-400">Transaction Ref</TableHead>
                <TableHead className="text-slate-400">Plan</TableHead>
                <TableHead className="text-slate-400">Amount</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Plan Activated</TableHead>
                <TableHead className="text-slate-400">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No auto payment transactions yet</p>
                    <p className="text-xs mt-1">Configure a gateway in "Auto" mode to start receiving automatic payments</p>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.map(log => {
                const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.initiated;
                const StatusIcon = statusCfg.icon;
                return (
                  <TableRow key={log.id} className="border-slate-700">
                    <TableCell className="text-slate-300 text-xs">
                      {format(new Date(log.created_at), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-white font-medium text-sm">
                      {getGatewayName(log.gateway_id)}
                    </TableCell>
                    <TableCell className="text-slate-300 font-mono text-xs">
                      {log.transaction_ref || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 uppercase text-[10px]">
                        {log.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-white font-medium">
                      {log.currency} {Number(log.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusCfg.color} text-[10px] gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.plan_activated ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                          ✓ Activated
                        </Badge>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-red-400 text-xs max-w-[150px] truncate">
                      {log.error_message || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAutoPayments;
