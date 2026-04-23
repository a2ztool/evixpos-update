import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Truck, ShoppingBag, Edit2, Eye, Trash2,
  AlertTriangle, Phone, Mail, CheckCircle2, History, Package, BookOpen, ShieldCheck, Sparkles,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { normalizePaymentMethods } from "@/lib/paymentMethods";

const OnlineSuppliersPurchases = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { user } = useAuth();
  const { format } = useCurrency();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"suppliers" | "purchases">("suppliers");
  const [search, setSearch] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  // Supplier dialog
  const [supDialog, setSupDialog] = useState(false);
  const [supEditId, setSupEditId] = useState<string | null>(null);
  const [supForm, setSupForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  // Purchase dialog
  const [purDialog, setPurDialog] = useState(false);
  const [purForm, setPurForm] = useState({
    supplier_id: "",
    product_name: "",
    quantity: "1",
    unit_price: "",
    paid_amount: "",
    payment_method: "cash",
    purchase_date: formatDate(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  // History
  const [historySupplier, setHistorySupplier] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);

  // Detail dialog
  const [detail, setDetail] = useState<any>(null);

  // Edit purchase
  const [purEditId, setPurEditId] = useState<string | null>(null);

  // Delete confirmations
  const [delSupplier, setDelSupplier] = useState<any>(null);
  const [delPurchase, setDelPurchase] = useState<any>(null);

  // ── Queries ──
  const { data: suppliers = [] } = useQuery({
    queryKey: ["online-suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("*")
        .eq("store_id", storeId!).eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["online-purchases", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases").select("*, suppliers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentMethodOptions = [] } = useQuery({
    queryKey: ["online-pm", storeId, user?.id],
    enabled: ready && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings").select("payment_methods")
        .eq("store_id", storeId!).maybeSingle();
      const methods = normalizePaymentMethods(data?.payment_methods).filter(m => m.enabled);
      return methods.length > 0 ? methods : [{ id: "cash", name: "Cash", enabled: true, config: {} }];
    },
  });

  useEffect(() => {
    if (paymentMethodOptions.length > 0 && !paymentMethodOptions.find(m => m.id === purForm.payment_method)) {
      setPurForm(p => ({ ...p, payment_method: paymentMethodOptions[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodOptions]);

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase.channel(`online-sup-pur-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["online-suppliers", storeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["online-purchases", storeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, qc]);

  // ── Mutations ──
  const saveSupplier = useMutation({
    mutationFn: async () => {
      if (!supForm.name.trim()) throw new Error("Supplier name required");
      if (supEditId) {
        const { error } = await supabase.from("suppliers").update({
          name: supForm.name.trim(), phone: supForm.phone, email: supForm.email,
          address: supForm.address, notes: supForm.notes,
        }).eq("id", supEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          store_id: storeId!, user_id: userId!,
          name: supForm.name.trim(), phone: supForm.phone, email: supForm.email,
          address: supForm.address, notes: supForm.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-suppliers", storeId] });
      setSupDialog(false);
      setSupForm({ name: "", phone: "", email: "", address: "", notes: "" });
      setSupEditId(null);
      toast.success(supEditId ? "Supplier updated" : "Supplier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Adjust supplier balance_due by a delta (can be negative). */
  const adjustSupplierDue = async (supplierId: string | null, delta: number) => {
    if (!supplierId || delta === 0) return;
    const { data: sup } = await supabase.from("suppliers")
      .select("balance_due").eq("id", supplierId).maybeSingle();
    if (sup) {
      const next = Math.max(0, Number(sup.balance_due) + delta);
      await supabase.from("suppliers").update({ balance_due: next }).eq("id", supplierId);
    }
  };

  const savePurchase = useMutation({
    mutationFn: async () => {
      const qty = Number(purForm.quantity) || 0;
      const unit = Number(purForm.unit_price) || 0;
      const total = qty * unit;
      const paid = Number(purForm.paid_amount) || 0;
      if (!purForm.product_name.trim()) throw new Error("Product name required");
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (unit <= 0) throw new Error("Unit price must be > 0");
      if (paid < 0 || paid > total) throw new Error("Paid amount invalid");

      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
      const composedNotes = [
        `${purForm.product_name.trim()} × ${qty} @ ${format(unit)}`,
        purForm.notes?.trim() || "",
      ].filter(Boolean).join(" — ");

      if (purEditId) {
        // Reverse old supplier due first
        const { data: old } = await supabase.from("purchases")
          .select("supplier_id, total_amount, paid_amount").eq("id", purEditId).maybeSingle();
        if (old) {
          const oldDue = Math.max(0, Number(old.total_amount) - Number(old.paid_amount));
          await adjustSupplierDue(old.supplier_id, -oldDue);
        }

        const { error: ue } = await supabase.from("purchases").update({
          supplier_id: purForm.supplier_id || null,
          total_amount: total, paid_amount: paid,
          payment_status: status,
          payment_method: purForm.payment_method,
          purchase_date: purForm.purchase_date,
          notes: composedNotes,
        }).eq("id", purEditId);
        if (ue) throw ue;

        // Replace purchase_items
        await supabase.from("purchase_items").delete().eq("purchase_id", purEditId);
        await supabase.from("purchase_items").insert({
          purchase_id: purEditId, product_id: null,
          quantity: qty, unit_cost: unit, total_cost: total,
        });

        // Apply new supplier due
        const newDue = total - paid;
        await adjustSupplierDue(purForm.supplier_id || null, newDue);
      } else {
        const { data: p, error: pe } = await supabase.from("purchases").insert({
          store_id: storeId!, user_id: userId!,
          supplier_id: purForm.supplier_id || null,
          total_amount: total, paid_amount: paid,
          payment_status: status,
          payment_method: purForm.payment_method,
          purchase_date: purForm.purchase_date,
          notes: composedNotes,
        }).select("id").single();
        if (pe) throw pe;

        if (p?.id) {
          await supabase.from("purchase_items").insert({
            purchase_id: p.id, product_id: null,
            quantity: qty, unit_cost: unit, total_cost: total,
          });
        }

        await adjustSupplierDue(purForm.supplier_id || null, total - paid);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-purchases", storeId] });
      qc.invalidateQueries({ queryKey: ["online-suppliers", storeId] });
      setPurDialog(false);
      setPurEditId(null);
      setPurForm({
        supplier_id: "", product_name: "", quantity: "1", unit_price: "", paid_amount: "",
        payment_method: paymentMethodOptions[0]?.id || "cash",
        purchase_date: formatDate(new Date(), "yyyy-MM-dd"), notes: "",
      });
      toast.success(purEditId ? "Purchase updated" : "Purchase recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSupplierMut = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete to preserve purchase history references
      const { error } = await supabase.from("suppliers")
        .update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-suppliers", storeId] });
      setDelSupplier(null);
      toast.success("Supplier deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePurchaseMut = useMutation({
    mutationFn: async (purchase: any) => {
      // Reverse supplier due
      const due = Math.max(0, Number(purchase.total_amount) - Number(purchase.paid_amount));
      await adjustSupplierDue(purchase.supplier_id, -due);
      // Cascade items then purchase
      await supabase.from("purchase_items").delete().eq("purchase_id", purchase.id);
      const { error } = await supabase.from("purchases").delete().eq("id", purchase.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-purchases", storeId] });
      qc.invalidateQueries({ queryKey: ["online-suppliers", storeId] });
      setDelPurchase(null);
      setDetail(null);
      toast.success("Purchase deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Stats ──
  const stats = useMemo(() => {
    const total = purchases.reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);
    const paid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
    return { total, paid, due: Math.max(0, total - paid), count: purchases.length };
  }, [purchases]);

  // ── Filter ──
  const filteredSuppliers = useMemo(() =>
    suppliers.filter((s: any) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.includes(search)
    ), [suppliers, search]);

  const filteredPurchases = useMemo(() =>
    purchases.filter((p: any) =>
      p.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.notes?.toLowerCase().includes(search.toLowerCase())
    ), [purchases, search]);

  const openSupplierEdit = (s: any) => {
    setSupForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setSupEditId(s.id);
    setSupDialog(true);
  };

  const openPurchaseEdit = async (p: any) => {
    // Try to load purchase_items for accurate qty/unit; fallback to parsing notes
    const { data: items } = await supabase.from("purchase_items")
      .select("quantity, unit_cost").eq("purchase_id", p.id).limit(1);
    const item = items?.[0];
    let qty = item?.quantity ? String(item.quantity) : "1";
    let unit = item?.unit_cost ? String(item.unit_cost) : "";
    let productName = "";
    let extraNotes = "";
    if (p.notes) {
      const parts = String(p.notes).split(" — ");
      const head = parts[0] || "";
      const m = head.match(/^(.+?)\s×\s/);
      productName = m ? m[1] : head;
      extraNotes = parts.slice(1).join(" — ");
    }
    if (!unit && Number(qty) > 0) {
      unit = String(Number(p.total_amount) / Number(qty));
    }
    setPurForm({
      supplier_id: p.supplier_id || "",
      product_name: productName,
      quantity: qty,
      unit_price: unit,
      paid_amount: String(p.paid_amount ?? ""),
      payment_method: p.payment_method || paymentMethodOptions[0]?.id || "cash",
      purchase_date: p.purchase_date,
      notes: extraNotes,
    });
    setPurEditId(p.id);
    setPurDialog(true);
    setDetail(null);
  };

  const openHistory = async (s: any) => {
    setHistorySupplier(s);
    const { data } = await supabase.from("purchases").select("*")
      .eq("supplier_id", s.id).eq("store_id", storeId!)
      .order("created_at", { ascending: false }).limit(50);
    setHistoryData(data || []);
  };

  const statusBadge = (s: string) => {
    if (s === "paid") return <Badge className="bg-emerald-500 text-white text-xs gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Paid</Badge>;
    if (s === "partial") return <Badge className="bg-amber-500 text-white text-xs">Partial</Badge>;
    return <Badge className="bg-destructive text-destructive-foreground text-xs">Unpaid</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-20 md:pb-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/30">
                <Truck className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Suppliers & Purchases</h1>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Manage vendors and procurement in one place</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5"><BookOpen className="h-4 w-4" /> Guide</Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Suppliers & Purchases Guide</SheetTitle>
                    <SheetDescription>Master vendor management and procurement in 6 steps.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-5 space-y-3 text-sm">
                    {[
                      { t: "1. Add a Supplier", d: "Click 'Supplier' to store vendor name, phone, email and address. Phone enables WhatsApp follow-ups later." },
                      { t: "2. Record a Purchase", d: "Click 'Purchase', pick the supplier, enter product name, quantity, unit price, paid amount and date." },
                      { t: "3. Auto Status", d: "Paid ≥ Total → Paid · Paid > 0 → Partial · Paid = 0 → Unpaid. Unpaid balance auto-adds to supplier's due." },
                      { t: "4. Stats Overview", d: "Top cards show Total Purchase, Paid, Due and total Records — your procurement health at a glance." },
                      { t: "5. View History", d: "Click 'History' on any supplier card to see every purchase made with that vendor." },
                      { t: "6. Search & Tabs", d: "Use the search bar to filter suppliers or purchases. Switch tabs to focus on one list at a time." },
                    ].map((s, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3">
                        <p className="font-semibold text-foreground">{s.t}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.d}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="font-semibold text-primary flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Pro Tip</p>
                      <p className="text-xs text-muted-foreground mt-1">Always link purchases to suppliers — that way the system tracks running dues automatically and you never lose payment history.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <Button size="sm" variant="outline" onClick={() => { setSupEditId(null); setSupForm({ name: "", phone: "", email: "", address: "", notes: "" }); setSupDialog(true); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> <span className="hidden xs:inline">Supplier</span><span className="xs:hidden">Sup.</span>
              </Button>
              <Button size="sm" onClick={() => setPurDialog(true)} className="gap-1.5 shadow-lg shadow-primary/30">
                <Plus className="h-4 w-4" /> Purchase
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Card className="overflow-hidden"><CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Total Purchase</p>
                <p className="text-base sm:text-xl font-bold mt-0.5 truncate">{format(stats.total)}</p>
              </div>
              <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent></Card>
          <Card className="overflow-hidden"><CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Paid</p>
                <p className="text-base sm:text-xl font-bold mt-0.5 text-emerald-600 truncate">{format(stats.paid)}</p>
              </div>
              <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent></Card>
          <Card className="overflow-hidden"><CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Due</p>
                <p className="text-base sm:text-xl font-bold mt-0.5 text-destructive truncate">{format(stats.due)}</p>
              </div>
              <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent></Card>
          <Card className="overflow-hidden"><CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Records</p>
                <p className="text-base sm:text-xl font-bold mt-0.5 truncate">{stats.count}</p>
              </div>
              <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-accent/40 flex items-center justify-center">
                <Package className="h-4 w-4" />
              </div>
            </div>
          </CardContent></Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers or purchases..." className="pl-9" />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="h-4 w-4" /> Suppliers ({suppliers.length})</TabsTrigger>
            <TabsTrigger value="purchases" className="gap-1.5"><ShoppingBag className="h-4 w-4" /> Purchases ({purchases.length})</TabsTrigger>
          </TabsList>

          {/* Suppliers tab */}
          <TabsContent value="suppliers" className="mt-4">
            {filteredSuppliers.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No suppliers yet. Add your first vendor.</p>
              </CardContent></Card>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {filteredSuppliers.map((s: any) => (
                    <Card key={s.id}><CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{s.name}</p>
                          {s.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {s.phone}</p>}
                          {s.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Due</p>
                          <p className={`font-bold text-sm ${Number(s.balance_due) > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(Number(s.balance_due))}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => openHistory(s)}><History className="h-3 w-3" /> History</Button>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => openSupplierEdit(s)}><Edit2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDelSupplier(s)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </CardContent></Card>
                  ))}
                </div>
                {/* Desktop table */}
                <Card className="hidden md:block"><CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Name</TableHead><TableHead>Contact</TableHead>
                      <TableHead className="text-right">Balance Due</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filteredSuppliers.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.phone || "—"}{s.email && ` · ${s.email}`}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${Number(s.balance_due) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {format(Number(s.balance_due))}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1.5 justify-end">
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => openHistory(s)}><History className="h-3 w-3" /> History</Button>
                              <Button size="sm" variant="ghost" onClick={() => openSupplierEdit(s)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDelSupplier(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent></Card>
              </>
            )}
          </TabsContent>

          {/* Purchases tab */}
          <TabsContent value="purchases" className="mt-4">
            {filteredPurchases.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-muted-foreground">
                <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No purchase records yet.</p>
              </CardContent></Card>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {filteredPurchases.map((p: any) => (
                    <Card key={p.id}><CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{p.suppliers?.name || "Walk-in"}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{p.notes || "—"}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")} · {p.payment_method}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{format(Number(p.total_amount))}</p>
                          {statusBadge(p.payment_status)}
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => setDetail(p)}>
                          <Eye className="h-3 w-3" /> View
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => openPurchaseEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDelPurchase(p)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </CardContent></Card>
                  ))}
                </div>
                {/* Desktop table */}
                <Card className="hidden md:block"><CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Notes</TableHead>
                      <TableHead>Method</TableHead><TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filteredPurchases.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                          <TableCell className="font-medium">{p.suppliers?.name || "Walk-in"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{p.notes || "—"}</TableCell>
                          <TableCell className="text-sm capitalize">{p.payment_method}</TableCell>
                          <TableCell className="text-right font-medium">{format(Number(p.total_amount))}</TableCell>
                          <TableCell className="text-right text-emerald-600">{format(Number(p.paid_amount))}</TableCell>
                          <TableCell>{statusBadge(p.payment_status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => setDetail(p)}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openPurchaseEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDelPurchase(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent></Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Supplier Dialog */}
      <Dialog open={supDialog} onOpenChange={setSupDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{supEditId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={supForm.name} onChange={e => setSupForm(p => ({ ...p, name: e.target.value }))} placeholder="Supplier name" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={supForm.phone} onChange={e => setSupForm(p => ({ ...p, phone: e.target.value }))} placeholder="+880..." /></div>
              <div><Label>Email</Label><Input value={supForm.email} onChange={e => setSupForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." /></div>
            </div>
            <div><Label>Address</Label><Input value={supForm.address} onChange={e => setSupForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea value={supForm.notes} onChange={e => setSupForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            <Button onClick={() => saveSupplier.mutate()} disabled={saveSupplier.isPending} className="w-full">
              {saveSupplier.isPending ? "Saving..." : supEditId ? "Update Supplier" : "Add Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog */}
      <Dialog open={purDialog} onOpenChange={(v) => { setPurDialog(v); if (!v) setPurEditId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{purEditId ? "Edit Purchase" : "New Purchase"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Supplier</Label>
              <Select value={purForm.supplier_id} onValueChange={v => setPurForm(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier (optional)" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Product *</Label><Input value={purForm.product_name} onChange={e => setPurForm(p => ({ ...p, product_name: e.target.value }))} placeholder="Product name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input type="number" value={purForm.quantity} onChange={e => setPurForm(p => ({ ...p, quantity: e.target.value }))} /></div>
              <div><Label>Unit Price</Label><Input type="number" value={purForm.unit_price} onChange={e => setPurForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="0.00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Paid Amount</Label><Input type="number" value={purForm.paid_amount} onChange={e => setPurForm(p => ({ ...p, paid_amount: e.target.value }))} placeholder="0.00" /></div>
              <div><Label>Date</Label><Input type="date" value={purForm.purchase_date} onChange={e => setPurForm(p => ({ ...p, purchase_date: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={purForm.payment_method} onValueChange={v => setPurForm(p => ({ ...p, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethodOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={purForm.notes} onChange={e => setPurForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes" /></div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm flex justify-between">
              <span>Total: <span className="font-bold">{format((Number(purForm.quantity) || 0) * (Number(purForm.unit_price) || 0))}</span></span>
              <span>Due: <span className="font-bold text-destructive">{format(Math.max(0, (Number(purForm.quantity) || 0) * (Number(purForm.unit_price) || 0) - (Number(purForm.paid_amount) || 0)))}</span></span>
            </div>
            <Button onClick={() => savePurchase.mutate()} disabled={savePurchase.isPending} className="w-full">
              {savePurchase.isPending ? "Saving..." : "Record Purchase"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historySupplier} onOpenChange={(v) => !v && setHistorySupplier(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase History — {historySupplier?.name}</DialogTitle></DialogHeader>
          {historyData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No purchases yet for this supplier.</p>
          ) : (
            <div className="space-y-2">
              {historyData.map((p: any) => (
                <div key={p.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.notes || "Purchase"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")} · {p.payment_method}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{format(Number(p.total_amount))}</p>
                    {statusBadge(p.payment_status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{detail.suppliers?.name || "Walk-in"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(new Date(detail.purchase_date), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="capitalize">{detail.payment_method}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{format(Number(detail.total_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-emerald-600 font-medium">{format(Number(detail.paid_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="text-destructive font-medium">{format(Math.max(0, Number(detail.total_amount) - Number(detail.paid_amount)))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span>{statusBadge(detail.payment_status)}</div>
              {detail.notes && <div className="pt-2 border-t"><p className="text-muted-foreground text-xs mb-1">Notes</p><p>{detail.notes}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default OnlineSuppliersPurchases;
