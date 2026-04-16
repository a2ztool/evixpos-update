import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight, Store, Eye, Search, Download, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface StoreInfo { id: string; name: string; plan: string; }
interface UserRow {
  id: string; name: string; email: string; created_at: string;
  plan: string; storeCount: number; stores: StoreInfo[];
  start_date: string | null; end_date: string | null;
  remaining_days: number | null; plan_status: string;
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
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  const loadUsers = () => adminCall("get_users").then(setUsers);
  useEffect(() => { loadUsers(); }, [adminCall]);

  const filtered = useMemo(() => {
    let list = users;
    if (search) { const q = search.toLowerCase(); list = list.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)); }
    if (planFilter !== "all") list = list.filter((u) => u.plan === planFilter);
    return list;
  }, [users, search, planFilter]);

  useEffect(() => { setCurrentPage(1); }, [search, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const changePlan = async (storeId: string, newPlan: string) => {
    await adminCall("change_plan", { store_id: storeId, new_plan: newPlan });
    toast.success("Plan updated"); loadUsers();
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
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${planColor(u.plan)}`}>{u.plan}</Badge>
                </div>
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
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={planColor(u.plan)}>{u.plan}</Badge>
                              <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/users/${u.id}`)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8"><Eye className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {u.stores.length > 0 && (
                          <CollapsibleContent asChild>
                            <TableRow className="border-slate-700/50 bg-slate-800/50">
                              <TableCell colSpan={5} className="py-3">
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
                  {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No users found.</TableCell></TableRow>}
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
    </div>
  );
};

export default AdminUsers;
