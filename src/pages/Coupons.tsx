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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Tag, Search, Trash2, Pencil, Copy } from "lucide-react";

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

const Coupons = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [type, setType] = useState<"fixed" | "percentage">("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");

  const fetchCoupons = async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase.from("coupons").select("*").eq("user_id", user.id).eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (data) setCoupons(data);
  };

  useEffect(() => { fetchCoupons(); }, [user, activeStore]);

  const resetForm = () => {
    setCode(""); setType("percentage"); setValue(""); setMinOrder("0");
    setMaxUses(""); setIsActive(true); setExpiresAt(""); setEditId(null);
  };

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setCode(result);
  };

  const handleSave = async () => {
    if (!user || !activeStore) return;
    if (!code.trim()) { toast.error("Coupon code is required"); return; }
    if (!value || parseFloat(value) <= 0) { toast.error("Discount value is required"); return; }

    const payload = {
      code: code.toUpperCase(), type, value: parseFloat(value),
      min_order: parseFloat(minOrder) || 0, max_uses: parseInt(maxUses) || 0,
      is_active: isActive, expires_at: expiresAt || null,
    };

    if (editId) {
      const { error } = await supabase.from("coupons").update(payload).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Coupon updated");
    } else {
      const { error } = await supabase.from("coupons").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore.id });
      if (error) toast.error(error.message);
      else toast.success("Coupon created");
    }
    setSheetOpen(false);
    resetForm();
    fetchCoupons();
  };

  const openEdit = (c: Coupon) => {
    setEditId(c.id); setCode(c.code); setType(c.type as "fixed" | "percentage"); setValue(String(c.value));
    setMinOrder(String(c.min_order)); setMaxUses(c.max_uses ? String(c.max_uses) : "");
    setIsActive(c.is_active); setExpiresAt(c.expires_at || ""); setSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("coupons").delete().eq("id", id);
    toast.success("Coupon deleted");
    fetchCoupons();
  };

  const filtered = useMemo(() => {
    return coupons.filter(c => {
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [coupons, statusFilter, search]);

  return (
    <DashboardLayout>
      <div className="hidden sm:block flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Coupons</h1>
        <Button size="sm" className="gap-2" onClick={() => { resetForm(); setSheetOpen(true); }}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create Coupon</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search coupons..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="premium-card flex flex-col items-center justify-center py-16 sm:py-20">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Tag className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-1">No coupons yet</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center px-4">Create discount coupons for your customers.</p>
          <Button onClick={() => { resetForm(); setSheetOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Coupon
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3 pb-safe">
            {filtered.map((c) => (
              <div key={c.id} className="mobile-card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm font-mono font-bold">{c.code}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-semibold">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Min Order</span>
                  <span>৳{c.min_order}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Usage</span>
                  <span>{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expires</span>
                  <span>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive gap-1.5" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block premium-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
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
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-0.5 rounded text-sm font-mono font-semibold">{c.code}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</TableCell>
                    <TableCell className="text-sm">৳{c.min_order}</TableCell>
                    <TableCell className="text-sm">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</TableCell>
                    <TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Coupon" : "Create Coupon"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 mt-6">
            <div className="space-y-2">
              <Label>Coupon Code *</Label>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE20" className="flex-1 font-mono" />
                <Button variant="outline" size="sm" onClick={generateCode}>Generate</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "fixed" | "percentage")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (৳)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value *</Label>
                <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percentage" ? "e.g. 20" : "e.g. 100"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min Order (৳)</Label>
                <Input type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Uses</Label>
                <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <Button className="w-full" onClick={handleSave}>{editId ? "Update" : "Create Coupon"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Coupons;
