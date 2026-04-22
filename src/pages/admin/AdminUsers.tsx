import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronLeft, ChevronRight, Store, Eye, Search, Download, Clock, AlertTriangle, CheckCircle, Ban, Trash2, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";

interface StoreInfo { id: string; name: string; plan: string; }
interface UserRow {
  id: string; name: string; email: string; created_at: string;
  plan: string; storeCount: number; stores: StoreInfo[];
  start_date: string | null; end_date: string | null;
  remaining_days: number | null; plan_status: string;
  is_suspended?: boolean; suspended_at?: string | null; suspended_reason?: string | null;
}

const ITEMS_PER_PAGE = 15;

const exportCSV = (users: UserRow[]) => {
  const headers = ["Name", "Email", "Plan", "Status", "Expiry", "Remaining Days", "Stores", "Store Names", "Joined"];
  const rows = users.map((u) => [u.name || "", u.email, u.plan, u.plan_status, u.end_date ? new Date(u.end_date).toLocaleDateString() : "N/A", u.remaining_days !== null ? String(u.remaining_days) : "∞", String(u.storeCount), u.stores.map((s) => s.name).join("; "), new Date(u.created_at).toLocaleDateString()]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
};

const PlanStatusBadge = ({ status, remainingDays }: { status: string; remainingDays: number | null }) => {
  if (status === "lifetime") return <Badge variant="outline" className="text-[10px] bg-slate-600/20 text-slate-400 border-slate-500/30">Lifetime</Badge>;
  if (status === "expired") return <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Expired</Badge>;
  if (remainingDays !== null && remainingDays <= 7) return <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 gap-0.5"><Clock className="h-2.5 w-2.5" />{remainingDays}d left</Badge>;
  return <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-0.5"><CheckCircle className="h-2.5 w-2.5" />{remainingDays}d left</Badge>;
};

const AdminUsers = () => {
  const { adminCall, loading } = useAdmin();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [detailsTarget, setDetailsTarget] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadUsers = () => adminCall("get_users").then((data) => data && setUsers(data));
  useEffect(() => { loadUsers(); }, [adminCall]);

  const filtered = useMemo(() => {
    let list = users;
    if (search) { const q = search.toLowerCase(); list = list.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)); }
    if (planFilter !== "all") list = list.filter((u) => u.plan === planFilter);
    if (statusFilter === "active") list = list.filter((u) => !u.is_suspended);
    if (statusFilter === "suspended") list = list.filter((u) => u.is_suspended);
    return list;
  }, [users, search, planFilter, statusFilter]);

  useEffect(() => { setCurrentPage(1); }, [search, planFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const changePlan = async (storeId: string, newPlan: string) => {
    await adminCall("change_plan", { store_id: storeId, new_plan: newPlan });
    toast.success("Plan updated"); loadUsers();
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    const u = suspendTarget;
    setBusyId(u.id);
    const res = await adminCall("suspend_user", { user_id: u.id, reason: suspendReason.trim() || null });
    setBusyId(null);
    setSuspendTarget(null);
    setSuspendReason("");
    if (res?.success) { toast.success(`Suspended ${u.email}`); loadUsers(); }
  };

  const handleUnsuspend = async (u: UserRow) => {
    setBusyId(u.id);
    const res = await adminCall("unsuspend_user", { user_id: u.id });
    setBusyId(null);
    if (res?.success) { toast.success(`Reactivated ${u.email}`); loadUsers(); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const u = confirmDelete;
    setBusyId(u.id);
    const res = await adminCall("delete_user", { user_id: u.id, confirm: "DELETE" });
    setBusyId(null);
    setConfirmDelete(null);
    if (res?.success) { toast.success(`Deleted ${u.email} and all related data`); loadUsers(); }
  };

  const planColor = (plan: string) => {
    if (plan === "business") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (plan === "pro") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-slate-600/20 text-slate-400 border-slate-500/30";
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-white">Users</h1>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 h-9">
          <Download className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Export</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl" />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-32 h-10 bg-slate-800 border-slate-700 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All Plans</SelectItem>
            <SelectItem value="free" className="text-white">Free</SelectItem>
            <SelectItem value="pro" className="text-white">Pro</SelectItem>
            <SelectItem value="business" className="text-white">Business</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36 h-10 bg-slate-800 border-slate-700 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All Status</SelectItem>
            <SelectItem value="active" className="text-white">Active</SelectItem>
            <SelectItem value="suspended" className="text-white">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</p>

      {loading && users.length === 0 ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" /></div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2.5">
            {paginated.map((u) => (
              <div key={u.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 active:scale-[0.98] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{u.name || "—"}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {u.is_suspended && (
                      <button onClick={() => setDetailsTarget(u)} className="inline-flex">
                        <Badge variant="outline" className="text-[10px] shrink-0 bg-red-500/20 text-red-400 border-red-500/30 cursor-pointer hover:bg-red-500/30 gap-0.5">
                          <Ban className="h-2.5 w-2.5" />Suspended
                        </Badge>
                      </button>
                    )}
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${planColor(u.plan)}`}>{u.plan}</Badge>
                    <PlanStatusBadge status={u.plan_status} remainingDays={u.remaining_days} />
                  </div>
                </div>
                {u.is_suspended && u.suspended_reason && (
                  <div className="mt-2 px-2.5 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-[11px] text-red-300 line-clamp-2">
                      <span className="font-semibold">Reason:</span> {u.suspended_reason}
                    </p>
                    {u.suspended_at && (
                      <p className="text-[10px] text-red-400/70 mt-0.5">Since {new Date(u.suspended_at).toLocaleString()}</p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-700/50">
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Store className="h-3 w-3" />{u.storeCount}</span>
                    <span>{new Date(u.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {u.storeCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)} className="text-slate-400 hover:text-white h-8 px-2">
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedUser === u.id ? "rotate-180" : ""}`} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/users/${u.id}`)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 px-2">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {u.is_suspended ? (
                      <Button variant="ghost" size="sm" disabled={busyId === u.id} onClick={() => handleUnsuspend(u)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 px-2">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={busyId === u.id} onClick={() => { setSuspendTarget(u); setSuspendReason(""); }} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-8 px-2">
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={busyId === u.id} onClick={() => setConfirmDelete(u)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expandedUser === u.id && u.stores.length > 0 && (
                  <div className="mt-2.5 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {u.stores.map((store) => (
                      <div key={store.id} className="flex items-center justify-between bg-slate-700/40 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Store className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-sm text-white truncate">{store.name}</span>
                          <Badge variant="outline" className={`text-[9px] shrink-0 ${planColor(store.plan)}`}>{store.plan}</Badge>
                        </div>
                        <Select value={store.plan} onValueChange={(val) => changePlan(store.id, val)}>
                          <SelectTrigger className="w-24 h-7 bg-slate-700 border-slate-600 text-white text-[11px] rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-700 border-slate-600">
                            <SelectItem value="free" className="text-white text-xs">Free</SelectItem>
                            <SelectItem value="pro" className="text-white text-xs">Pro</SelectItem>
                            <SelectItem value="business" className="text-white text-xs">Business</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-slate-500 py-8">No users found.</p>}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:block bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Stores</TableHead>
                     <TableHead className="text-slate-400">Joined</TableHead>
                     <TableHead className="text-slate-400">Plan Status</TableHead>
                     <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((u) => (
                    <Collapsible key={u.id} open={expandedUser === u.id} onOpenChange={(open) => setExpandedUser(open ? u.id : null)} asChild>
                      <>
                        <TableRow className="border-slate-700 hover:bg-slate-700/30">
                          <TableCell className="text-white font-medium">{u.name || "—"}</TableCell>
                          <TableCell className="text-slate-300">{u.email}</TableCell>
                          <TableCell className="text-slate-300">
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center gap-1.5 hover:text-white transition-colors">
                                <Store className="h-3.5 w-3.5" />{u.storeCount} store{u.storeCount !== 1 ? "s" : ""}
                                {u.storeCount > 0 && <ChevronDown className={`h-3 w-3 transition-transform ${expandedUser === u.id ? "rotate-180" : ""}`} />}
                              </button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <PlanStatusBadge status={u.plan_status} remainingDays={u.remaining_days} />
                                </TooltipTrigger>
                                <TooltipContent className="bg-slate-700 text-white border-slate-600">
                                  {u.start_date && <p className="text-xs">Start: {new Date(u.start_date).toLocaleDateString()}</p>}
                                  {u.end_date && <p className="text-xs">Expiry: {new Date(u.end_date).toLocaleDateString()}</p>}
                                  {!u.end_date && u.plan === "free" && <p className="text-xs">Free plan — no expiry</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={planColor(u.plan)}>{u.plan}</Badge>
                              {u.is_suspended && (
                                <button onClick={() => setDetailsTarget(u)} className="inline-flex" title="View suspension details">
                                  <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 cursor-pointer hover:bg-red-500/30 gap-0.5">
                                    <Ban className="h-2.5 w-2.5" />Suspended
                                  </Badge>
                                </button>
                              )}
                              {u.is_suspended && (
                                <Button variant="ghost" size="icon" onClick={() => setDetailsTarget(u)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8" title="Suspension details"><Info className="h-4 w-4" /></Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/users/${u.id}`)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8" title="View"><Eye className="h-4 w-4" /></Button>
                              {u.is_suspended ? (
                                <Button variant="ghost" size="icon" disabled={busyId === u.id} onClick={() => handleUnsuspend(u)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8" title="Reactivate"><RotateCcw className="h-4 w-4" /></Button>
                              ) : (
                                <Button variant="ghost" size="icon" disabled={busyId === u.id} onClick={() => { setSuspendTarget(u); setSuspendReason(""); }} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-8 w-8" title="Suspend"><Ban className="h-4 w-4" /></Button>
                              )}
                              <Button variant="ghost" size="icon" disabled={busyId === u.id} onClick={() => setConfirmDelete(u)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8" title="Delete"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                            {u.is_suspended && u.suspended_reason && (
                              <p className="text-[11px] text-red-300/80 mt-1.5 line-clamp-1" title={u.suspended_reason}>
                                <span className="font-semibold">Reason:</span> {u.suspended_reason}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                        {u.stores.length > 0 && (
                          <CollapsibleContent asChild>
                            <TableRow className="border-slate-700/50 bg-slate-800/50">
                              <TableCell colSpan={6} className="py-3">
                                <div className="space-y-2 pl-4">
                                  <p className="text-xs text-slate-400 font-medium mb-2">Store Plans:</p>
                                  {u.stores.map((store) => (
                                    <div key={store.id} className="flex items-center justify-between bg-slate-700/30 rounded-lg px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <Store className="h-3.5 w-3.5 text-slate-400" />
                                        <span className="text-sm text-white">{store.name}</span>
                                        <Badge variant="outline" className={`text-[10px] ${planColor(store.plan)}`}>{store.plan}</Badge>
                                      </div>
                                      <Select value={store.plan} onValueChange={(val) => changePlan(store.id, val)}>
                                        <SelectTrigger className="w-28 h-7 bg-slate-700 border-slate-600 text-white text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-slate-700 border-slate-600">
                                          <SelectItem value="free" className="text-white">Free</SelectItem>
                                          <SelectItem value="pro" className="text-white">Pro</SelectItem>
                                          <SelectItem value="business" className="text-white">Business</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        )}
                      </>
                    </Collapsible>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No users found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="h-8 w-8 text-slate-400 hover:text-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm text-slate-300 px-2">{currentPage}/{totalPages}</span>
                <Button variant="ghost" size="icon" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="h-8 w-8 text-slate-400 hover:text-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" /> Delete user permanently?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will permanently delete <span className="font-semibold text-white">{confirmDelete?.email}</span> and ALL related data: stores, staff, products, orders, customers, subscriptions and reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white">
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsers;
