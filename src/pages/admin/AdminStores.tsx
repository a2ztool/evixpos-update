import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Trash2, Eye, Search, Download, ChevronLeft, ChevronRight, Globe, MapPin } from "lucide-react";
import { toast } from "sonner";

interface StoreRow {
  id: string; name: string; phone: string; address: string; is_active: boolean; created_at: string; store_mode: string;
  owner: { name: string; email: string };
}

const ITEMS_PER_PAGE = 15;

const exportCSV = (stores: StoreRow[]) => {
  const headers = ["Store Name", "Owner Name", "Owner Email", "Phone", "Mode", "Status", "Created"];
  const rows = stores.map((s) => [s.name, s.owner.name || "", s.owner.email, s.phone || "", s.store_mode || "online", s.is_active ? "Active" : "Disabled", new Date(s.created_at).toLocaleDateString()]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `stores_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
};

const AdminStores = () => {
  const { adminCall, loading } = useAdmin();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  const loadStores = () => adminCall("get_stores").then(setStores);
  useEffect(() => { loadStores(); }, [adminCall]);

  const filtered = useMemo(() => {
    let list = stores;
    if (search) { const q = search.toLowerCase(); list = list.filter((s) => s.name.toLowerCase().includes(q) || s.owner.name?.toLowerCase().includes(q) || s.owner.email?.toLowerCase().includes(q) || s.phone?.includes(q)); }
    if (statusFilter === "active") list = list.filter((s) => s.is_active);
    if (statusFilter === "disabled") list = list.filter((s) => !s.is_active);
    return list;
  }, [stores, search, statusFilter]);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const toggleStore = async (storeId: string, isActive: boolean) => {
    await adminCall("toggle_store", { store_id: storeId, is_active: isActive });
    toast.success(isActive ? "Store enabled" : "Store disabled"); loadStores();
  };

  const deleteStore = async (storeId: string) => {
    if (!confirm("Delete this store permanently?")) return;
    await adminCall("delete_store", { store_id: storeId });
    toast.success("Store deleted"); loadStores();
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-white">Stores</h1>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 h-9">
          <Download className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Export</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search stores..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-32 h-10 bg-slate-800 border-slate-700 text-white rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All Status</SelectItem>
            <SelectItem value="active" className="text-white">Active</SelectItem>
            <SelectItem value="disabled" className="text-white">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} store{filtered.length !== 1 ? "s" : ""}</p>

      {loading && stores.length === 0 ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" /></div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2.5">
            {paginated.map((s) => (
              <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 active:scale-[0.98] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{s.owner.name || "—"} · {s.owner.email}</p>
                  </div>
                   <div className="flex items-center gap-1.5">
                     <Badge variant="outline" className={`text-[10px] shrink-0 ${s.store_mode === "offline" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-sky-500/20 text-sky-400 border-sky-500/30"}`}>
                       {s.store_mode === "offline" ? <><MapPin className="h-2.5 w-2.5 mr-0.5" />Offline</> : <><Globe className="h-2.5 w-2.5 mr-0.5" />Online</>}
                     </Badge>
                     <Badge variant="outline" className={`text-[10px] shrink-0 ${s.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                       {s.is_active ? "Active" : "Off"}
                     </Badge>
                   </div>
                </div>
                {s.phone && <p className="text-xs text-slate-500 mt-1.5">{s.phone}</p>}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-700/50">
                  <span className="text-[11px] text-slate-500">{new Date(s.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center gap-2">
                    <Switch checked={s.is_active} onCheckedChange={(checked) => toggleStore(s.id, checked)} className="scale-90" />
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/stores/${s.id}`)} className="text-emerald-400 hover:bg-emerald-500/10 h-8 w-8 p-0"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteStore(s.id)} className="text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-slate-500 py-8">No stores found.</p>}
          </div>

          {/* Desktop Table */}
          <Card className="hidden md:block bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Store Name</TableHead>
                    <TableHead className="text-slate-400">Owner</TableHead>
                     <TableHead className="text-slate-400">Phone</TableHead>
                     <TableHead className="text-slate-400">Mode</TableHead>
                     <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((s) => (
                    <TableRow key={s.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{s.name}</TableCell>
                      <TableCell>
                        <div><p className="text-slate-300 text-sm">{s.owner.name || "—"}</p><p className="text-slate-500 text-xs">{s.owner.email}</p></div>
                      </TableCell>
                       <TableCell className="text-slate-300">{s.phone || "—"}</TableCell>
                       <TableCell>
                         <Badge variant="outline" className={s.store_mode === "offline" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-sky-500/20 text-sky-400 border-sky-500/30"}>
                           {s.store_mode === "offline" ? "Offline" : "Online"}
                         </Badge>
                       </TableCell>
                       <TableCell><Badge variant="outline" className={s.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>{s.is_active ? "Active" : "Disabled"}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-sm">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/stores/${s.id}`)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8"><Eye className="h-4 w-4" /></Button>
                          <Switch checked={s.is_active} onCheckedChange={(checked) => toggleStore(s.id, checked)} />
                          <Button variant="ghost" size="icon" onClick={() => deleteStore(s.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">No stores found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</p>
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

export default AdminStores;
