import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Gift, Users, DollarSign, Wallet, CheckCircle, XCircle, Clock,
  TrendingUp, Search, UserCheck, Star, Eye,
} from "lucide-react";
import { format } from "date-fns";
import { getMethodById } from "@/lib/withdrawMethods";

const parseDetails = (raw: string): Record<string, string> => {
  try { return JSON.parse(raw || "{}"); } catch { return { account: raw }; }
};

const AdminReferrals = () => {
  const [settings, setSettings] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wdFilter, setWdFilter] = useState("all");
  const [detailsModal, setDetailsModal] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");

  const fetchAll = useCallback(async () => {
    const [s, r, w] = await Promise.all([
      supabase.from("referral_settings").select("*").order("total_earnings", { ascending: false }),
      supabase.from("referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("referral_withdrawals").select("*").order("created_at", { ascending: false }),
    ]);
    if (s.data) setSettings(s.data);
    if (r.data) setReferrals(r.data);
    if (w.data) setWithdrawals(w.data);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalEarnings = settings.reduce((s, r) => s + Number(r.total_earnings || 0), 0);
  const totalReferrals = referrals.length;
  const totalPayouts = withdrawals.filter(w => w.status === "completed").reduce((s, w) => s + Number(w.amount), 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");
  const premiumRefs = referrals.filter(r => r.plan !== "free").length;

  const handleWithdrawalAction = async (id: string, action: "completed" | "rejected", note?: string) => {
    const updateData: any = { status: action };
    if (note) updateData.notes = note;
    const { error } = await supabase.from("referral_withdrawals").update(updateData).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Withdrawal ${action}`);
    setDetailsModal(null);
    setAdminNote("");
    fetchAll();
  };

  const filteredReferrals = referrals.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.referred_email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredWithdrawals = withdrawals.filter(w => {
    if (wdFilter !== "all" && w.status !== wdFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Gift className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">Referral Management</h1>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Referrers", value: settings.length, icon: Users, color: "text-blue-500" },
          { label: "Total Referrals", value: totalReferrals, icon: UserCheck, color: "text-green-500" },
          { label: "Premium Converts", value: premiumRefs, icon: Star, color: "text-yellow-500" },
          { label: "Total Earnings", value: `৳${totalEarnings.toFixed(2)}`, icon: DollarSign, color: "text-emerald-500" },
          { label: "Total Payouts", value: `৳${totalPayouts.toFixed(2)}`, icon: Wallet, color: "text-purple-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Withdrawals */}
      {pendingWithdrawals.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <Clock className="h-5 w-5" /> Pending Withdrawal Requests ({pendingWithdrawals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingWithdrawals.map(w => {
                  const method = getMethodById(w.method);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm">{format(new Date(w.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell className="text-xs font-mono">{w.user_id.slice(0, 8)}...</TableCell>
                      <TableCell className="font-semibold">৳{Number(w.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm">
                          <span>{method?.emoji || "💳"}</span>
                          <span>{method?.label || w.method}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setDetailsModal(w); setAdminNote(""); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleWithdrawalAction(w.id, "completed")} className="gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleWithdrawalAction(w.id, "rejected")} className="gap-1">
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Referrer Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Referrer Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>Earnings</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map(s => {
                const userRefs = referrals.filter(r => r.referrer_id === s.user_id).length;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-mono">{s.user_id.slice(0, 12)}...</TableCell>
                    <TableCell><Badge variant="outline">{s.referral_code}</Badge></TableCell>
                    <TableCell>{s.total_clicks}</TableCell>
                    <TableCell>{userRefs}</TableCell>
                    <TableCell className="font-semibold">৳{Number(s.total_earnings).toFixed(2)}</TableCell>
                    <TableCell>৳{Number(s.pending_balance).toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
              {settings.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No referrers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All Referrals */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> All Referrals</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search email..." className="pl-8 w-48" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead>Referred Email</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReferrals.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{format(new Date(r.created_at), "MMM dd, yyyy")}</TableCell>
                  <TableCell className="text-xs font-mono">{r.referrer_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-sm">{r.referred_email}</TableCell>
                  <TableCell><Badge variant={r.plan === "free" ? "secondary" : "default"}>{r.plan}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">৳{Number(r.commission_amount).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={r.is_paid ? "default" : "outline"}>{r.is_paid ? "Paid" : "Unpaid"}</Badge></TableCell>
                </TableRow>
              ))}
              {filteredReferrals.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No referrals found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All Withdrawals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> All Withdrawals</CardTitle>
            <Select value={wdFilter} onValueChange={setWdFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWithdrawals.map(w => {
                const method = getMethodById(w.method);
                return (
                  <TableRow key={w.id}>
                    <TableCell className="text-sm">{format(new Date(w.created_at), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="text-xs font-mono">{w.user_id.slice(0, 8)}...</TableCell>
                    <TableCell className="font-semibold">৳{Number(w.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <span>{method?.emoji || "💳"}</span>
                        <span>{method?.label || w.method}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => { setDetailsModal(w); setAdminNote(""); }}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.status === "completed" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                        {w.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredWithdrawals.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No withdrawals</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Withdrawal Details Modal */}
      <Dialog open={!!detailsModal} onOpenChange={() => setDetailsModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdrawal Details</DialogTitle></DialogHeader>
          {detailsModal && (() => {
            const method = getMethodById(detailsModal.method);
            const details = parseDetails(detailsModal.account_number);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Amount</span>
                    <p className="font-bold text-lg">৳{Number(detailsModal.amount).toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Method</span>
                    <p className="flex items-center gap-1.5 font-medium">
                      <span>{method?.emoji || "💳"}</span> {method?.label || detailsModal.method}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date</span>
                    <p>{format(new Date(detailsModal.created_at), "MMM dd, yyyy HH:mm")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>
                      <Badge variant={detailsModal.status === "completed" ? "default" : detailsModal.status === "rejected" ? "destructive" : "secondary"}>
                        {detailsModal.status}
                      </Badge>
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Payment Details</p>
                  {Object.entries(details).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>

                {detailsModal.notes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">User Notes:</span>
                    <p className="mt-1">{detailsModal.notes}</p>
                  </div>
                )}

                {detailsModal.status === "pending" && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Admin Note (optional)</span>
                      <Textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} placeholder="Add a note..." />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 gap-1" onClick={() => handleWithdrawalAction(detailsModal.id, "completed", adminNote || undefined)}>
                        <CheckCircle className="h-4 w-4" /> Approve
                      </Button>
                      <Button variant="destructive" className="flex-1 gap-1" onClick={() => handleWithdrawalAction(detailsModal.id, "rejected", adminNote || undefined)}>
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReferrals;
