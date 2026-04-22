import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { couponSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import {
  Plus, Tag, Search, Trash2, Pencil, Copy, HelpCircle, LayoutGrid, List,
  TicketPercent, CheckCircle2, XCircle, TrendingUp, Sparkles, Calendar,
  ShoppingBag, RefreshCw, Filter, BadgePercent,
} from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const StatCard = ({ icon: Icon, label, value, tint = "primary", hint }: any) => (
  <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-2.5 sm:p-3.5 shadow-sm">
    <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full bg-${tint}/10 blur-2xl`} />
    <div className="relative flex items-center gap-2.5">
      <div className={`h-9 w-9 rounded-lg bg-${tint}/10 ring-1 ring-${tint}/20 flex items-center justify-center shrink-0`}>
        <Icon className={`h-4 w-4 text-${tint}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold leading-tight truncate">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
  </div>
);

const Coupons = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [view, setView] = useState<"list" | "grid">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [type, setType] = useState<"fixed" | "percentage">("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const formValidation = useFormValidation(couponSchema);

  const fetchCoupons = async () => {
    if (!user || !activeStore) return;
    setLoading(true);
    const { data } = await supabase.from("coupons").select("*").eq("user_id", user.id).eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (data) setCoupons(data);
    setLoading(false);
  };

  useEffect(() => { fetchCoupons(); }, [user, activeStore]);

  // Realtime sync
  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`coupons-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "coupons", filter: `store_id=eq.${activeStore.id}` }, () => fetchCoupons())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore]);

  const resetForm = () => {
    setCode(""); setType("percentage"); setValue(""); setMinOrder("0");
    setMaxUses(""); setIsActive(true); setExpiresAt(""); setEditId(null);
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setCode(result);
  };

  const handleSave = async () => {
    if (!user || !activeStore) return;
    const ok = formValidation.validateAll({
      code: code.toUpperCase(), type, value, minOrder: minOrder, maxUses: maxUses,
    });
    if (!ok) { toast.error("Please fix the errors below"); return; }

    const payload = {
      code: code.toUpperCase(), type, value: parseFloat(value),
      min_order: parseFloat(minOrder) || 0, max_uses: parseInt(maxUses) || 0,
      is_active: isActive, expires_at: expiresAt || null,
    };

    if (editId) {
      const { error } = await supabase.from("coupons").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon updated");
    } else {
      const { error } = await supabase.from("coupons").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon created");
    }
    setSheetOpen(false);
    resetForm();
    fetchCoupons();
  };

  const openEdit = (c: Coupon) => {
    setEditId(c.id); setCode(c.code); setType(c.type as "fixed" | "percentage"); setValue(String(c.value));
    setMinOrder(String(c.min_order)); setMaxUses(c.max_uses ? String(c.max_uses) : "");
    setIsActive(c.is_active); setExpiresAt(c.expires_at ? c.expires_at.slice(0, 10) : ""); setSheetOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("coupons").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else toast.success("Coupon deleted");
    setDeleteId(null);
    fetchCoupons();
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await supabase.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(c.is_active ? "Coupon deactivated" : "Coupon activated");
    fetchCoupons();
  };

  const copyCode = (codeStr: string) => {
    navigator.clipboard.writeText(codeStr);
    toast.success(`Copied "${codeStr}"`);
  };

  const isExpired = (c: Coupon) => c.expires_at && new Date(c.expires_at) < new Date();

  const stats = useMemo(() => {
    const active = coupons.filter(c => c.is_active && !isExpired(c)).length;
    const inactive = coupons.length - active;
    const totalUsed = coupons.reduce((s, c) => s + (c.used_count || 0), 0);
    return { total: coupons.length, active, inactive, totalUsed };
  }, [coupons]);

  const filtered = useMemo(() => {
    let list = coupons.filter(c => {
      if (statusFilter === "active" && (!c.is_active || isExpired(c))) return false;
      if (statusFilter === "inactive" && c.is_active && !isExpired(c)) return false;
      if (statusFilter === "expired" && !isExpired(c)) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sortBy === "usage") list = [...list].sort((a, b) => (b.used_count || 0) - (a.used_count || 0));
    else if (sortBy === "value") list = [...list].sort((a, b) => b.value - a.value);
    else if (sortBy === "expiry") list = [...list].sort((a, b) => {
      if (!a.expires_at) return 1;
      if (!b.expires_at) return -1;
      return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
    });
    return list;
  }, [coupons, statusFilter, typeFilter, search, sortBy]);

  return (
    <DashboardLayout>
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card mb-4 sm:mb-6">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <BadgePercent className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="hidden sm:block text-xl sm:text-2xl font-bold tracking-tight">Coupons</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Create & manage discount codes to boost sales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGuideOpen(true)}>
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Guide</span>
            </Button>
            <Button size="sm" className="flex-1 sm:flex-initial gap-1.5 shadow-md shadow-primary/20" onClick={() => { resetForm(); setSheetOpen(true); }}>
              <Plus className="h-4 w-4" />
              <span>Create Coupon</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <StatCard icon={TicketPercent} label="Total Coupons" value={stats.total} tint="primary" />
        <StatCard icon={CheckCircle2} label="Active" value={stats.active} tint="emerald-500" />
        <StatCard icon={XCircle} label="Inactive" value={stats.inactive} tint="muted-foreground" />
        <StatCard icon={TrendingUp} label="Total Redeemed" value={stats.totalUsed} tint="primary" hint="All-time uses" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search coupons by code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card/60 backdrop-blur-sm" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] sm:w-[130px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[110px] sm:w-[120px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[120px] sm:w-[130px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="usage">Most Used</SelectItem>
              <SelectItem value="value">Highest Value</SelectItem>
              <SelectItem value="expiry">Expiring Soon</SelectItem>
            </SelectContent>
          </Select>
          <div className="hidden sm:flex items-center rounded-md border border-border/60 bg-card/60 p-0.5 shrink-0">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={fetchCoupons}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm flex flex-col items-center justify-center py-16 sm:py-20 px-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-4">
            <Tag className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-1">No coupons found</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
            {coupons.length === 0 ? "Create your first discount coupon to attract more customers." : "Try adjusting filters or search."}
          </p>
          {coupons.length === 0 && (
            <Button onClick={() => { resetForm(); setSheetOpen(true); }} className="gap-2 shadow-md shadow-primary/20">
              <Sparkles className="h-4 w-4" /> Create Your First Coupon
            </Button>
          )}
        </div>
      ) : view === "grid" ? (
        // Grid view
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const expired = isExpired(c);
            return (
              <div key={c.id} className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-4 hover:shadow-lg hover:shadow-primary/5 transition-all">
                <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                        <TicketPercent className="h-4 w-4 text-primary" />
                      </div>
                      <code className="bg-muted/60 px-2 py-1 rounded text-sm font-mono font-bold tracking-wider truncate">{c.code}</code>
                    </div>
                    <Badge variant={expired ? "destructive" : c.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {expired ? "Expired" : c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-2xl font-bold text-primary">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</span>
                    <span className="text-xs text-muted-foreground">OFF</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                    <div className="flex items-center gap-1.5"><ShoppingBag className="h-3 w-3" /> Min order: <span className="text-foreground font-medium">৳{c.min_order}</span></div>
                    <div className="flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Used: <span className="text-foreground font-medium">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</span></div>
                    <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Expires: <span className="text-foreground font-medium">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</span></div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border/60">
                    <Button variant="ghost" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => copyCode(c.code)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} className="ml-1" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5 pb-safe">
            {filtered.map((c) => {
              const expired = isExpired(c);
              return (
                <div key={c.id} className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                        <TicketPercent className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono font-bold">{c.code}</code>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-bold text-primary">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</span> OFF · Min ৳{c.min_order}
                        </p>
                      </div>
                    </div>
                    <Badge variant={expired ? "destructive" : c.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {expired ? "Expired" : c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                    <span>Used {c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</span>
                    <span>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "No expiry"}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={() => copyCode(c.code)}>
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/60">
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min Order</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const expired = isExpired(c);
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors border-border/60">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="bg-muted/60 px-2 py-0.5 rounded text-sm font-mono font-bold tracking-wider">{c.code}</code>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(c.code)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell><span className="font-bold text-primary">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</span></TableCell>
                      <TableCell className="text-sm">৳{c.min_order}</TableCell>
                      <TableCell className="text-sm">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                          <Badge variant={expired ? "destructive" : c.is_active ? "default" : "secondary"} className="text-[10px]">
                            {expired ? "Expired" : c.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BadgePercent className="h-5 w-5 text-primary" />
              {editId ? "Edit Coupon" : "Create Coupon"}
            </SheetTitle>
            <SheetDescription>{editId ? "Update coupon details" : "Set up a new discount code"}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label>Coupon Code *</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); formValidation.clearField("code"); }}
                  error={!!formValidation.getError("code")}
                  placeholder="e.g. SAVE20"
                  className="flex-1 font-mono uppercase"
                />
                <Button variant="outline" size="sm" onClick={generateCode} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
              {formValidation.getError("code") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("code")}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "fixed" | "percentage")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (৳)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Value *</Label>
                <Input
                  type="number" min="0"
                  value={value}
                  onChange={(e) => { setValue(e.target.value); formValidation.clearField("value"); }}
                  error={!!formValidation.getError("value")}
                  placeholder={type === "percentage" ? "e.g. 20" : "e.g. 100"}
                />
                {formValidation.getError("value") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("value")}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Order (৳)</Label>
                <Input
                  type="number" min="0"
                  value={minOrder}
                  onChange={(e) => { setMinOrder(e.target.value); formValidation.clearField("minOrder"); }}
                  error={!!formValidation.getError("minOrder")}
                />
                {formValidation.getError("minOrder") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("minOrder")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Max Uses</Label>
                <Input
                  type="number" min="0"
                  value={maxUses}
                  onChange={(e) => { setMaxUses(e.target.value); formValidation.clearField("maxUses"); }}
                  error={!!formValidation.getError("maxUses")}
                  placeholder="Unlimited"
                />
                {formValidation.getError("maxUses") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("maxUses")}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 bg-muted/20">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Customers can use this coupon</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <Button className="w-full gap-2 shadow-md shadow-primary/20" onClick={handleSave}>
              {editId ? <><Pencil className="h-4 w-4" /> Update Coupon</> : <><Plus className="h-4 w-4" /> Create Coupon</>}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Guide Drawer */}
      <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" /> Coupons Guide
            </SheetTitle>
            <SheetDescription>How to create and manage discount codes</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {[
              { icon: Plus, title: "Create a coupon", desc: "Click 'Create Coupon', enter a code (or auto-generate), and set the discount type and value." },
              { icon: BadgePercent, title: "Discount types", desc: "Choose Percentage (e.g. 20% off) or Fixed amount (e.g. ৳100 off the order)." },
              { icon: ShoppingBag, title: "Min order & max uses", desc: "Set a minimum cart value and limit how many times the coupon can be used. Leave 0 for unlimited." },
              { icon: Calendar, title: "Expiry date", desc: "Optionally set a date when the coupon stops working. Leave empty for no expiry." },
              { icon: CheckCircle2, title: "Activate / Deactivate", desc: "Use the switch on each coupon to instantly enable or disable it without deleting." },
              { icon: Copy, title: "Share with customers", desc: "Copy the code and share via WhatsApp, email, or social media. Customers enter it at checkout." },
              { icon: TrendingUp, title: "Track usage", desc: "See how many times each coupon has been redeemed in real-time." },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl border border-border/60 bg-card/40">
                <div className="h-9 w-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-0.5">{item.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Pro tip</h4>
              </div>
              <p className="text-xs text-muted-foreground">Use short, memorable codes like SAVE20 or WELCOME10. They convert better than random strings.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Customers will no longer be able to use this code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Coupons;
