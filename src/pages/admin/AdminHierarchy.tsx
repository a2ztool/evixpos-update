import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronRight, Store, User, Users as UsersIcon, Search,
  Ban, RotateCcw, Trash2, KeyRound, Crown, Mail, ShieldCheck, ShieldOff, Copy, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type StaffNode = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  password_set: boolean;
  last_sign_in_at: string | null;
};

type StoreNode = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  staff: StaffNode[];
};

type OwnerNode = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  is_suspended: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  plan: string;
  plan_end_date: string | null;
  password_set: boolean;
  last_sign_in_at: string | null;
  stores: StoreNode[];
  unassigned_staff: StaffNode[];
};

const planColor = (plan: string) => {
  if (plan === "business") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (plan === "pro") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-slate-600/20 text-slate-400 border-slate-500/30";
};

const AdminHierarchy = () => {
  const { adminCall, loading } = useAdmin();
  const [owners, setOwners] = useState<OwnerNode[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [storeExpanded, setStoreExpanded] = useState<Record<string, boolean>>({});

  const [suspendTarget, setSuspendTarget] = useState<OwnerNode | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<OwnerNode | null>(null);
  const [resetTarget, setResetTarget] = useState<{ email: string; label: string } | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadHierarchy = () =>
    adminCall("get_user_hierarchy").then((data) => data && setOwners(data));

  useEffect(() => { loadHierarchy(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    let list = owners;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.name?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.stores.some((s) => s.name?.toLowerCase().includes(q) ||
          s.staff.some((m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)))
      );
    }
    if (planFilter !== "all") list = list.filter((o) => o.plan === planFilter);
    if (statusFilter === "active") list = list.filter((o) => !o.is_suspended);
    if (statusFilter === "suspended") list = list.filter((o) => o.is_suspended);
    return list;
  }, [owners, search, planFilter, statusFilter]);

  const toggleAll = (open: boolean) => {
    const o: Record<string, boolean> = {};
    const s: Record<string, boolean> = {};
    filtered.forEach((u) => {
      o[u.id] = open;
      u.stores.forEach((st) => { s[st.id] = open; });
    });
    setExpanded(o);
    setStoreExpanded(s);
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    setBusy(suspendTarget.id);
    const res = await adminCall("suspend_user", {
      user_id: suspendTarget.id,
      reason: suspendReason.trim() || null,
    });
    setBusy(null);
    setSuspendTarget(null);
    setSuspendReason("");
    if (res?.success) { toast.success("User suspended"); loadHierarchy(); }
  };

  const handleUnsuspend = async (o: OwnerNode) => {
    setBusy(o.id);
    const res = await adminCall("unsuspend_user", { user_id: o.id });
    setBusy(null);
    if (res?.success) { toast.success("User reactivated"); loadHierarchy(); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(confirmDelete.id);
    const res = await adminCall("delete_user", { user_id: confirmDelete.id, confirm: "DELETE" });
    setBusy(null);
    setConfirmDelete(null);
    if (res?.success) { toast.success("User deleted"); loadHierarchy(); }
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setBusy(resetTarget.email);
    const res = await adminCall("reset_user_password", { email: resetTarget.email });
    setBusy(null);
    if (res?.success) {
      setResetLink(res.action_link || null);
      toast.success("Recovery link generated");
    }
  };

  const ownerCount = filtered.length;
  const storeCount = filtered.reduce((n, o) => n + o.stores.length, 0);
  const staffCount = filtered.reduce(
    (n, o) => n + o.unassigned_staff.length + o.stores.reduce((m, s) => m + s.staff.length, 0),
    0,
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">User Hierarchy</h1>
          <p className="text-xs text-slate-400 mt-1">Owner → Stores → Staff with secure access details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toggleAll(true)} className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 h-9">Expand all</Button>
          <Button variant="outline" size="sm" onClick={() => toggleAll(false)} className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 h-9">Collapse all</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: "Owners", value: ownerCount, icon: User, color: "text-emerald-400" },
          { label: "Stores", value: storeCount, icon: Store, color: "text-blue-400" },
          { label: "Staff", value: staffCount, icon: UsersIcon, color: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-700/60 flex items-center justify-center">
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400">{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search owner / store / staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl" />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-32 h-10 bg-slate-800 border-slate-700 text-white rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All plans</SelectItem>
            <SelectItem value="free" className="text-white">Free</SelectItem>
            <SelectItem value="pro" className="text-white">Pro</SelectItem>
            <SelectItem value="business" className="text-white">Business</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36 h-10 bg-slate-800 border-slate-700 text-white rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All status</SelectItem>
            <SelectItem value="active" className="text-white">Active</SelectItem>
            <SelectItem value="suspended" className="text-white">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && owners.length === 0 ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const isOpen = !!expanded[o.id];
            return (
              <Card key={o.id} className="bg-slate-800 border-slate-700">
                <CardContent className="p-0">
                  {/* Owner row */}
                  <div className="p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [o.id]: !isOpen }))}
                        className="mt-0.5 w-7 h-7 rounded-lg bg-slate-700/60 hover:bg-slate-700 flex items-center justify-center text-slate-300 shrink-0"
                        aria-label="Toggle"
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </button>
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <Crown className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm md:text-base font-semibold text-white truncate">{o.name || "—"}</p>
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Owner</Badge>
                          <Badge variant="outline" className={`text-[10px] ${planColor(o.plan)}`}>{o.plan.toUpperCase()}</Badge>
                          {o.is_suspended ? (
                            <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 gap-0.5"><Ban className="h-2.5 w-2.5" />Suspended</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Active</Badge>
                          )}
                          {o.password_set ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-600/20 text-slate-300 border-slate-500/30 gap-0.5"><ShieldCheck className="h-2.5 w-2.5" />Password set</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30 gap-0.5"><ShieldOff className="h-2.5 w-2.5" />No password</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5"><Mail className="h-3 w-3" />{o.email}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                          <span>Joined {new Date(o.created_at).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{o.stores.length} store{o.stores.length !== 1 ? "s" : ""}</span>
                          <span>•</span>
                          <span>{o.stores.reduce((n, s) => n + s.staff.length, 0) + o.unassigned_staff.length} staff</span>
                          {o.last_sign_in_at && (<><span>•</span><span>Last login {new Date(o.last_sign_in_at).toLocaleDateString()}</span></>)}
                        </div>
                        {o.is_suspended && o.suspended_reason && (
                          <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5 line-clamp-2">
                            <span className="font-semibold">Reason:</span> {o.suspended_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" title="Reset password" onClick={() => { setResetLink(null); setResetTarget({ email: o.email, label: o.name || o.email }); }} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-8 w-8">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {o.is_suspended ? (
                          <Button variant="ghost" size="icon" title="Reactivate" disabled={busy === o.id} onClick={() => handleUnsuspend(o)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Suspend" disabled={busy === o.id} onClick={() => { setSuspendTarget(o); setSuspendReason(""); }} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-8 w-8">
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Delete" disabled={busy === o.id} onClick={() => setConfirmDelete(o)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Stores + staff */}
                  {isOpen && (
                    <div className="border-t border-slate-700/60 bg-slate-900/30 p-3 md:p-4 space-y-2">
                      {o.stores.length === 0 && o.unassigned_staff.length === 0 && (
                        <p className="text-xs text-slate-500 italic px-1">No stores or staff yet.</p>
                      )}

                      {o.stores.map((s) => {
                        const sOpen = storeExpanded[s.id] !== false; // default open
                        return (
                          <div key={s.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl">
                            <button
                              onClick={() => setStoreExpanded((p) => ({ ...p, [s.id]: !sOpen }))}
                              className="w-full flex items-center gap-3 p-2.5 md:p-3 text-left"
                            >
                              <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${sOpen ? "rotate-90" : ""}`} />
                              <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                                <Store className="h-3.5 w-3.5 text-blue-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium text-white truncate">{s.name}</p>
                                  {!s.is_active && <Badge variant="outline" className="text-[9px] bg-slate-600/30 text-slate-400 border-slate-500/30">Inactive</Badge>}
                                  <span className="text-[11px] text-slate-500">{s.staff.length} staff</span>
                                </div>
                              </div>
                            </button>
                            {sOpen && (
                              <div className="px-2.5 md:px-3 pb-2.5 space-y-1.5">
                                {s.staff.length === 0 ? (
                                  <p className="text-[11px] text-slate-500 italic pl-10">No staff in this store.</p>
                                ) : (
                                  s.staff.map((m) => (
                                    <StaffRow key={m.id} m={m} ownerSuspended={o.is_suspended} onReset={() => { setResetLink(null); setResetTarget({ email: m.email, label: m.name || m.email }); }} />
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {o.unassigned_staff.length > 0 && (
                        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5 md:p-3">
                          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><UsersIcon className="h-3.5 w-3.5" /> Unassigned staff</p>
                          <div className="space-y-1.5">
                            {o.unassigned_staff.map((m) => (
                              <StaffRow key={m.id} m={m} ownerSuspended={o.is_suspended} onReset={() => { setResetLink(null); setResetTarget({ email: m.email, label: m.name || m.email }); }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-slate-500 py-10">No users match your filters.</p>}
        </div>
      )}

      {/* Suspend dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Ban className="h-5 w-5 text-amber-400" /> Suspend account</DialogTitle>
            <DialogDescription className="text-slate-300">
              {suspendTarget?.name || suspendTarget?.email} and all their staff will be signed out and blocked from the dashboard.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason (optional)" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendTarget(null)} className="text-slate-300 hover:text-white hover:bg-slate-700">Cancel</Button>
            <Button onClick={handleSuspend} className="bg-amber-600 hover:bg-amber-700 text-white"><Ban className="h-4 w-4 mr-1.5" /> Suspend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete user?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will permanently delete {confirmDelete?.email}, all their stores, staff, orders, products and related data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600 border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetLink(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-400" /> Reset password</DialogTitle>
            <DialogDescription className="text-slate-300">
              Generate a secure password reset link for <span className="text-white font-medium">{resetTarget?.label}</span> ({resetTarget?.email}). The user's current password is never exposed.
            </DialogDescription>
          </DialogHeader>
          {resetLink ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Share this one-time recovery link with the user:</p>
              <div className="flex gap-2">
                <Input value={resetLink} readOnly className="bg-slate-700/50 border-slate-600 text-white text-xs" />
                <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => { navigator.clipboard.writeText(resetLink); toast.success("Link copied"); }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => window.open(resetLink, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">A one-time recovery link will be generated. Lovable Cloud auth will also email it to the user automatically.</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResetTarget(null); setResetLink(null); }} className="text-slate-300 hover:text-white hover:bg-slate-700">Close</Button>
            {!resetLink && (
              <Button onClick={handleReset} disabled={busy === resetTarget?.email} className="bg-blue-600 hover:bg-blue-700 text-white"><KeyRound className="h-4 w-4 mr-1.5" /> Generate link</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StaffRow = ({ m, ownerSuspended, onReset }: { m: StaffNode; ownerSuspended: boolean; onReset: () => void }) => {
  const blocked = !m.is_active || ownerSuspended;
  return (
    <div className="flex items-center gap-2.5 pl-7 md:pl-10 py-1.5 px-2 rounded-lg hover:bg-slate-700/30">
      <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
        <User className="h-3 w-3 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs md:text-sm text-white font-medium truncate">{m.name || "—"}</p>
          <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/30">Staff</Badge>
          <Badge variant="outline" className="text-[9px] bg-slate-600/30 text-slate-300 border-slate-500/30 capitalize">{m.role || "member"}</Badge>
          {blocked ? (
            <Badge variant="outline" className="text-[9px] bg-red-500/15 text-red-300 border-red-500/30">Blocked</Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Active</Badge>
          )}
          {m.password_set ? (
            <Badge variant="outline" className="text-[9px] bg-slate-600/20 text-slate-300 border-slate-500/30">Password set</Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/30">No password</Badge>
          )}
        </div>
        <p className="text-[10px] md:text-[11px] text-slate-400 truncate">{m.email}{m.last_sign_in_at && ` • Last login ${new Date(m.last_sign_in_at).toLocaleDateString()}`}</p>
      </div>
      <Button variant="ghost" size="icon" title="Reset password" onClick={onReset} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 w-7 shrink-0">
        <KeyRound className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default AdminHierarchy;
