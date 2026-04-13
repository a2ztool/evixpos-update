import { useState, useEffect } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Eye, Clock, Search, ExternalLink, Loader2 } from "lucide-react";

interface PlanPayment {
  id: string; user_id: string; store_id: string | null; plan: string; amount: number; currency: string;
  gateway_name: string; transaction_id: string; proof_url: string; status: string; admin_notes: string;
  user_email: string; user_name: string; store_name: string; created_at: string; expires_at: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  expired: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const AdminPayments = () => {
  const { adminCall } = useAdmin();
  const [payments, setPayments] = useState<PlanPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<PlanPayment | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPayments = async () => {
    setLoading(true);
    const data = await adminCall("get_plan_payments");
    setPayments(data || []); setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, []);

  const handleAction = async (paymentId: string, action: "approved" | "rejected") => {
    setActionLoading(true);
    try {
      await adminCall("review_plan_payment", { payment_id: paymentId, status: action, admin_notes: adminNotes });
      toast.success(action === "approved" ? "Payment approved! Plan upgraded." : "Payment rejected.");
      setSelectedPayment(null); setAdminNotes(""); fetchPayments();
    } catch (err: any) { toast.error(err.message || "Action failed"); }
    setActionLoading(false);
  };

  const filtered = payments.filter(p => {
    const matchSearch = !search || p.user_email?.toLowerCase().includes(search.toLowerCase()) || p.user_name?.toLowerCase().includes(search.toLowerCase()) || p.transaction_id?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const pendingCount = payments.filter(p => p.status === "pending").length;
  const currencySymbol = (c: string) => c === "BDT" ? "৳" : c === "INR" ? "₹" : "$";

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Payments</h1>
          <p className="text-slate-400 text-xs mt-0.5">Review payment submissions</p>
        </div>
        {pendingCount > 0 && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-2.5">{pendingCount} Pending</Badge>}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-9 h-10 bg-slate-800 border-slate-700 text-white rounded-xl" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["all", "pending", "approved", "rejected", "expired"].map(s => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} onClick={() => setFilterStatus(s)}
              className={`text-xs capitalize shrink-0 rounded-xl h-10 px-3 ${filterStatus === s ? "bg-emerald-600 hover:bg-emerald-700 border-0" : "border-slate-700 text-slate-300"}`}>
              {s}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" /></div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2.5">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No payments found</p>
            ) : filtered.map(p => (
              <button key={p.id} onClick={() => { setSelectedPayment(p); setAdminNotes(p.admin_notes || ""); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-3.5 text-left active:scale-[0.98] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{p.user_name || "Unknown"}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{p.user_email}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 capitalize ${statusColors[p.status] || ""}`}>
                    {p.status === "pending" && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                    {p.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-700/50">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-white font-bold">{currencySymbol(p.currency)}{p.amount}</span>
                    <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600 capitalize">{p.plan}</Badge>
                  </div>
                  <span className="text-[11px] text-slate-500">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop Table */}
          <Card className="hidden md:block bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">User</TableHead>
                    <TableHead className="text-slate-400">Plan</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-slate-400">Gateway</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No payments found</TableCell></TableRow>
                  ) : filtered.map(p => (
                    <TableRow key={p.id} className="border-slate-700">
                      <TableCell><div><p className="text-white text-sm font-medium">{p.user_name || "Unknown"}</p><p className="text-slate-400 text-xs">{p.user_email}</p></div></TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600 capitalize">{p.plan}</Badge></TableCell>
                      <TableCell className="text-white font-medium">{currencySymbol(p.currency)}{p.amount}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{p.gateway_name || "N/A"}</TableCell>
                      <TableCell><Badge variant="outline" className={statusColors[p.status] || ""}>{p.status === "pending" && <Clock className="h-3 w-3 mr-1" />}{p.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}{p.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}{p.status}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => { setSelectedPayment(p); setAdminNotes(p.admin_notes || ""); }} className="text-slate-400 hover:text-white h-8 w-8"><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Review Sheet (bottom sheet on mobile, dialog on desktop) */}
      <Sheet open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <SheetContent side="bottom" className="bg-slate-800 border-slate-700 rounded-t-2xl max-h-[90vh] overflow-y-auto md:max-w-lg md:mx-auto pb-safe">
          <SheetHeader>
            <SheetTitle className="text-white">Review Payment</SheetTitle>
          </SheetHeader>
          {selectedPayment && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-400 text-xs">User</p><p className="font-medium text-white">{selectedPayment.user_name}</p><p className="text-[11px] text-slate-500">{selectedPayment.user_email}</p></div>
                <div><p className="text-slate-400 text-xs">Store</p><p className="font-medium text-white">{selectedPayment.store_name || "N/A"}</p></div>
                <div><p className="text-slate-400 text-xs">Plan</p><p className="font-medium text-white capitalize">{selectedPayment.plan}</p></div>
                <div><p className="text-slate-400 text-xs">Amount</p><p className="font-medium text-emerald-400">{currencySymbol(selectedPayment.currency)}{selectedPayment.amount}</p></div>
                <div><p className="text-slate-400 text-xs">Gateway</p><p className="font-medium text-white">{selectedPayment.gateway_name || "N/A"}</p></div>
                <div><p className="text-slate-400 text-xs">Txn ID</p><p className="font-medium font-mono text-[11px] text-white">{selectedPayment.transaction_id || "N/A"}</p></div>
              </div>

              {selectedPayment.proof_url && (
                <div>
                  <p className="text-slate-400 text-xs mb-2">Payment Proof</p>
                  <a href={selectedPayment.proof_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-emerald-400 hover:underline"><ExternalLink className="h-4 w-4" /> View Screenshot</a>
                  <div className="mt-2 rounded-xl border border-slate-600 overflow-hidden max-h-48"><img src={selectedPayment.proof_url} alt="Proof" className="w-full object-contain" /></div>
                </div>
              )}

              <div>
                <p className="text-slate-400 text-xs mb-1">Admin Notes</p>
                <Textarea className="bg-slate-700 border-slate-600 text-sm text-white rounded-xl" placeholder="Add notes..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)} />
              </div>

              {selectedPayment.status === "pending" ? (
                <div className="flex gap-3">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl text-base" onClick={() => handleAction(selectedPayment.id, "approved")} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Approve
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 h-12 rounded-xl text-base" onClick={() => handleAction(selectedPayment.id, "rejected")} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />} Reject
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className={`w-full justify-center py-3 text-sm ${statusColors[selectedPayment.status]}`}>
                  {selectedPayment.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                </Badge>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminPayments;
