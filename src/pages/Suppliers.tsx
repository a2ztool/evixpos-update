import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Search, Truck, Phone, Mail, Edit2, Trash2, FileDown, MessageCircle,
  Receipt, Eye, DollarSign, Users, BookOpen, Sparkles, AlertTriangle,
  TrendingUp, Crown, Send, ArrowUpRight, ShieldCheck, Wallet, Filter,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { supplierSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { format as formatDate, differenceInDays, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid } from "recharts";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

type FilterTier = "all" | "due" | "paid" | "critical";

const Suppliers = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<FilterTier>("all");
  const [sortBy, setSortBy] = useState<"recent" | "due_high" | "due_low" | "name">("due_high");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [historyDialog, setHistoryDialog] = useState<any>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const formValidation = useFormValidation(supplierSchema);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Recent purchases for trend chart
  const { data: recentPurchases = [] } = useQuery({
    queryKey: ["supplier-purchases-trend", storeId],
    enabled: ready,
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data } = await supabase
        .from("purchases")
        .select("created_at, paid_amount, total_amount")
        .eq("store_id", storeId!)
        .gte("created_at", since);
      return data || [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`suppliers-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["suppliers", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["supplier-purchases-trend", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formValidation.validateAll(form)) throw new Error("Please fix the errors below");
      if (editId) {
        const { error } = await supabase.from("suppliers").update({
          name: form.name, phone: form.phone, email: form.email,
          address: form.address, notes: form.notes,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          store_id: storeId!, user_id: userId!, name: form.name,
          phone: form.phone, email: form.email, address: form.address, notes: form.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      resetForm();
      toast.success(editId ? "Supplier updated" : "Supplier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier removed");
    },
  });

  const paySupplierMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");
      const newDue = Math.max(0, Number(payDialog.balance_due) - amount);
      await supabase.from("suppliers").update({ balance_due: newDue }).eq("id", payDialog.id);
      await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: payDialog.id,
        total_amount: 0, paid_amount: amount,
        payment_status: "paid", payment_method: payMethod,
        notes: `Due payment to ${payDialog.name}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-purchases-trend", storeId] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded! Supplier due updated.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => { setForm({ name: "", phone: "", email: "", address: "", notes: "" }); setEditId(null); };

  const openEdit = (s: any) => {
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setEditId(s.id);
    setDialogOpen(true);
  };

  const viewPurchaseHistory = async (supplier: any) => {
    setHistoryDialog(supplier);
    const { data } = await supabase
      .from("purchases")
      .select("*")
      .eq("supplier_id", supplier.id)
      .eq("store_id", storeId!)
      .order("created_at", { ascending: false })
      .limit(20);
    setPurchaseHistory(data || []);
  };

  const sendWhatsApp = (supplier: any) => {
    const phone = supplier.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number"); return; }
    const text = `Hello ${supplier.name}, your outstanding balance with us is ${format(Number(supplier.balance_due))}. Please confirm the payment schedule. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const bulkWhatsApp = () => {
    const targets = suppliers.filter((s: any) => Number(s.balance_due) > 0 && s.phone).slice(0, 5);
    if (targets.length === 0) { toast.error("No suppliers with phone + due"); return; }
    targets.forEach((s: any, i: number) => setTimeout(() => sendWhatsApp(s), i * 600));
    toast.success(`Opening ${targets.length} WhatsApp chats...`);
  };

  const exportCSV = () => {
    const header = "Name,Phone,Email,Address,Balance Due,Last Updated\n";
    const rows = suppliers.map((s: any) =>
      `"${s.name}","${s.phone || ""}","${s.email || ""}","${(s.address || "").replace(/"/g, "'")}",${s.balance_due || 0},"${formatDate(new Date(s.updated_at || s.created_at), "yyyy-MM-dd")}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `suppliers-${formatDate(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Analytics
  const stats = useMemo(() => {
    const totalDue = suppliers.reduce((s: number, x: any) => s + Number(x.balance_due || 0), 0);
    const withDue = suppliers.filter((s: any) => Number(s.balance_due) > 0);
    const critical = withDue.filter((s: any) => {
      const days = differenceInDays(new Date(), new Date(s.updated_at || s.created_at));
      return days > 60;
    });
    const avgDue = withDue.length ? totalDue / withDue.length : 0;
    const top = [...suppliers].sort((a: any, b: any) => Number(b.balance_due) - Number(a.balance_due))[0];
    return {
      totalDue, withDue: withDue.length, critical: critical.length, avgDue,
      paidUp: suppliers.length - withDue.length, top,
    };
  }, [suppliers]);

  const trend = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      days[formatDate(d, "MMM d")] = 0;
    }
    recentPurchases.forEach((p: any) => {
      const k = formatDate(new Date(p.created_at), "MMM d");
      if (k in days) days[k] += Number(p.paid_amount || 0);
    });
    return Object.entries(days).map(([day, amount]) => ({ day, amount }));
  }, [recentPurchases]);

  // Filter + sort
  const filtered = useMemo(() => {
    let arr = suppliers.filter((s: any) =>
      s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
    );
    if (filterTier === "due") arr = arr.filter((s: any) => Number(s.balance_due) > 0);
    if (filterTier === "paid") arr = arr.filter((s: any) => Number(s.balance_due) === 0);
    if (filterTier === "critical") {
      arr = arr.filter((s: any) => {
        const days = differenceInDays(new Date(), new Date(s.updated_at || s.created_at));
        return Number(s.balance_due) > 0 && days > 60;
      });
    }
    if (sortBy === "due_high") arr.sort((a: any, b: any) => Number(b.balance_due) - Number(a.balance_due));
    else if (sortBy === "due_low") arr.sort((a: any, b: any) => Number(a.balance_due) - Number(b.balance_due));
    else if (sortBy === "name") arr.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return arr;
  }, [suppliers, search, filterTier, sortBy]);

  const pagination = usePagination(filtered.length, {
    storageKey: `pg:suppliers:${storeId ?? "_"}`,
    filterSignature: JSON.stringify({ search, filterTier, sortBy }),
  });
  const paged = paginate(filtered as any[], pagination.page, pagination.pageSize);

  const ageBadge = (s: any) => {
    if (Number(s.balance_due) === 0) return <Badge variant="secondary" className="text-xs">Clear</Badge>;
    const days = differenceInDays(new Date(), new Date(s.updated_at || s.created_at));
    if (days > 60) return <Badge className="bg-destructive text-destructive-foreground text-xs">Critical · {days}d</Badge>;
    if (days > 30) return <Badge className="bg-amber-500 text-white text-xs">Watch · {days}d</Badge>;
    return <Badge className="bg-blue-500 text-white text-xs">Fresh · {days}d</Badge>;
  };

  const filterTabs: { id: FilterTier; label: string; count: number }[] = [
    { id: "all", label: "All", count: suppliers.length },
    { id: "due", label: "With Due", count: stats.withDue },
    { id: "critical", label: "Critical", count: stats.critical },
    { id: "paid", label: "Paid Up", count: stats.paidUp },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-20 md:pb-6">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/30">
                  <Truck className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Suppliers Hub</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Vendor relationships & payables intelligence
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <BookOpen className="h-4 w-4" /> Guide
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" /> Suppliers Hub Guide
                    </SheetTitle>
                    <SheetDescription>Master vendor management & payables in 7 steps.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-5 space-y-4 text-sm">
                    {[
                      { t: "1. Add a Supplier", d: "Click 'Add Supplier' and store name, phone, email, address & private notes. Phone enables WhatsApp reminders." },
                      { t: "2. Auto-Tracked Balance", d: "Every Purchase you record on credit auto-increments the supplier's balance_due. Cash purchases keep it at 0." },
                      { t: "3. Pay Down Dues", d: "Click 'Pay' to record a partial or full payment. The system creates a payment-only purchase row and reduces the balance." },
                      { t: "4. Age Tiers (Risk)", d: "Fresh (0-30d), Watch (30-60d) and Critical (60d+) badges classify how long a balance has been pending. Focus on Critical first." },
                      { t: "5. Top Vendor Spotlight", d: "Your highest outstanding supplier is pinned at the top with one-click Pay & WhatsApp Reminder shortcuts." },
                      { t: "6. Bulk Reminders", d: "'Remind All' opens up to 5 WhatsApp chats with pre-filled balance messages — perfect for end-of-month follow-ups." },
                      { t: "7. Export & Audit", d: "Export the full list as CSV including last-updated dates for accounting handoff or backups." },
                    ].map((s, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3">
                        <p className="font-semibold text-foreground">{s.t}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.d}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="font-semibold text-primary flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Pro Tip</p>
                      <p className="text-xs text-muted-foreground mt-1">Pay critical suppliers (60d+) first to maintain credit goodwill and unlock better wholesale terms.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 hidden sm:inline-flex">
                <FileDown className="h-4 w-4" /> Export
              </Button>
              {stats.withDue > 0 && (
                <Button variant="outline" size="sm" onClick={bulkWhatsApp} className="gap-1.5 hidden sm:inline-flex">
                  <Send className="h-4 w-4 text-green-600" /> Remind All
                </Button>
              )}
              <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5 shadow-lg shadow-primary/30">
                    <Plus className="h-4 w-4" /> Add Supplier
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input
                        value={form.name}
                        onChange={e => { setForm(p => ({ ...p, name: e.target.value })); formValidation.clearField("name"); }}
                        error={!!formValidation.getError("name")}
                        placeholder="Supplier name"
                      />
                      {formValidation.getError("name") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("name")}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input
                          value={form.phone}
                          onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); formValidation.clearField("phone"); }}
                          error={!!formValidation.getError("phone")}
                          placeholder="+880..."
                        />
                        {formValidation.getError("phone") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("phone")}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input
                          value={form.email}
                          onChange={e => { setForm(p => ({ ...p, email: e.target.value })); formValidation.clearField("email"); }}
                          error={!!formValidation.getError("email")}
                          placeholder="Email"
                        />
                        {formValidation.getError("email") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("email")}</p>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Address</Label>
                      <Input
                        value={form.address}
                        onChange={e => { setForm(p => ({ ...p, address: e.target.value })); formValidation.clearField("address"); }}
                        error={!!formValidation.getError("address")}
                        placeholder="Address"
                      />
                      {formValidation.getError("address") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("address")}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea
                        value={form.notes}
                        onChange={e => { setForm(p => ({ ...p, notes: e.target.value })); formValidation.clearField("notes"); }}
                        aria-invalid={!!formValidation.getError("notes")}
                        className={formValidation.getError("notes") ? "border-destructive focus-visible:ring-destructive" : ""}
                        placeholder="Internal notes"
                        rows={2}
                      />
                      {formValidation.getError("notes") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("notes")}</p>}
                    </div>
                    <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">
                      {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Add Supplier"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border bg-gradient-to-br from-card to-primary/5 hover:shadow-lg transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vendors</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{suppliers.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total suppliers</p>
            </CardContent>
          </Card>
          <Card className="border bg-gradient-to-br from-card to-destructive/5 hover:shadow-lg transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <Wallet className="h-4 w-4 text-destructive" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Payable</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-destructive">{format(stats.totalDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.withDue} pending</p>
            </CardContent>
          </Card>
          <Card className="border bg-gradient-to-br from-card to-amber-500/5 hover:shadow-lg transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg Due</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{format(stats.avgDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Per supplier w/ due</p>
            </CardContent>
          </Card>
          <Card className={`border bg-gradient-to-br hover:shadow-lg transition-shadow ${stats.critical > 0 ? "from-card to-destructive/10 ring-1 ring-destructive/30" : "from-card to-emerald-500/5"}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className={`h-4 w-4 ${stats.critical > 0 ? "text-destructive animate-pulse" : "text-emerald-500"}`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Critical</span>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${stats.critical > 0 ? "text-destructive" : "text-emerald-600"}`}>{stats.critical}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">60d+ overdue</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Supplier + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {stats.top && Number(stats.top.balance_due) > 0 && (
            <Card className="lg:col-span-1 border bg-gradient-to-br from-amber-500/10 via-card to-card overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Outstanding</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center">
                    <Truck className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{stats.top.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{stats.top.phone || "No phone"}</p>
                  </div>
                </div>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Balance Due</span>
                  <span className="text-lg font-bold text-destructive">{format(Number(stats.top.balance_due))}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => { setPayDialog(stats.top); setPayAmount(""); }} className="gap-1">
                    <Receipt className="h-3 w-3" /> Pay
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendWhatsApp(stats.top)} className="gap-1" disabled={!stats.top.phone}>
                    <MessageCircle className="h-3 w-3 text-green-600" /> Remind
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className={`${stats.top && Number(stats.top.balance_due) > 0 ? "lg:col-span-2" : "lg:col-span-3"} border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpRight className="h-3.5 w-3.5 text-primary" /> 7-Day Payment Trend
                  </p>
                  <p className="text-lg font-bold mt-0.5">{format(trend.reduce((s, t) => s + t.amount, 0))}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">paid to vendors</Badge>
              </div>
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
                    <RTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => format(Number(v))}
                    />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card className="border">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="pl-9" />
              </div>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_high">Highest Due First</SelectItem>
                  <SelectItem value="due_low">Lowest Due First</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="recent">Recently Added</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTier(tab.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    filterTier === tab.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {tab.label} <span className="opacity-70">· {tab.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="border">
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {isLoading ? (
                <p className="text-center py-12 text-muted-foreground text-sm">Loading suppliers...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No suppliers match your filters</p>
                </div>
              ) : paged.map((s: any) => {
                const due = Number(s.balance_due || 0);
                const pct = stats.totalDue > 0 ? (due / stats.totalDue) * 100 : 0;
                return (
                  <div key={s.id} className="p-3 space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${due > 0 ? "bg-destructive/10" : "bg-emerald-500/10"}`}>
                          <Truck className={`h-5 w-5 ${due > 0 ? "text-destructive" : "text-emerald-600"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{s.name}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {s.phone && <span className="truncate">{s.phone}</span>}
                            {ageBadge(s)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${due > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(due)}</p>
                        <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% of total</p>
                      </div>
                    </div>
                    {due > 0 && stats.totalDue > 0 && <Progress value={pct} className="h-1" />}
                    <div className="flex gap-1.5">
                      {due > 0 && (
                        <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => { setPayDialog(s); setPayAmount(""); }}>
                          <Receipt className="h-3 w-3 mr-1" /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => viewPurchaseHistory(s)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      {s.phone && (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => sendWhatsApp(s)}>
                          <MessageCircle className="h-3 w-3 text-green-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(s)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => deleteMutation.mutate(s.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Supplier</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Balance Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12">
                      <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No suppliers match your filters</p>
                    </TableCell></TableRow>
                  ) : paged.map((s: any) => {
                    const due = Number(s.balance_due || 0);
                    const pct = stats.totalDue > 0 ? (due / stats.totalDue) * 100 : 0;
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${due > 0 ? "bg-destructive/10" : "bg-emerald-500/10"}`}>
                              <Truck className={`h-5 w-5 ${due > 0 ? "text-destructive" : "text-emerald-600"}`} />
                            </div>
                            <div>
                              <p className="font-semibold">{s.name}</p>
                              {s.address && <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{s.address}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5 text-sm">
                            {s.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-muted-foreground" />{s.phone}</div>}
                            {s.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{s.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell>{ageBadge(s)}</TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[140px]">
                            <p className={`font-bold ${due > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(due)}</p>
                            {due > 0 && stats.totalDue > 0 && (
                              <>
                                <Progress value={pct} className="h-1" />
                                <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}% of payable</p>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {due > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setPayDialog(s); setPayAmount(""); }}>
                              <Receipt className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => viewPurchaseHistory(s)} title="History">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {s.phone && (
                            <Button variant="ghost" size="icon" onClick={() => sendWhatsApp(s)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {!isLoading && filtered.length > 0 && (
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filtered.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="suppliers"
          />
        )}

        {/* Mobile bulk actions bar */}
        {stats.withDue > 0 && (
          <div className="sm:hidden fixed bottom-16 left-0 right-0 z-30 px-3">
            <Card className="border shadow-2xl bg-card/95 backdrop-blur">
              <CardContent className="p-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={exportCSV} className="flex-1 gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> Export
                </Button>
                <Button size="sm" onClick={bulkWhatsApp} className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700">
                  <Send className="h-3.5 w-3.5" /> Remind All
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pay Supplier Dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" /> Pay Supplier
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-semibold">{payDialog?.name}</p>
                <p className="text-xs text-muted-foreground">Outstanding: <span className="font-bold text-destructive">{format(Number(payDialog?.balance_due || 0))}</span></p>
              </div>
              <div>
                <Label>Payment Amount</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.balance_due || 0) * 0.25)))}>25%</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.balance_due || 0) / 2)))}>Half</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(payDialog?.balance_due || 0))}>Full</Button>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Cash</SelectItem>
                    <SelectItem value="bkash">📱 bKash</SelectItem>
                    <SelectItem value="nagad">📱 Nagad</SelectItem>
                    <SelectItem value="bank">🏦 Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => paySupplierMutation.mutate()} disabled={!payAmount || paySupplierMutation.isPending} className="w-full">
                {paySupplierMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase History Dialog */}
        <Dialog open={!!historyDialog} onOpenChange={v => { if (!v) setHistoryDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Purchase History
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{historyDialog?.name}</p>
            </DialogHeader>
            {purchaseHistory.length === 0 ? (
              <div className="text-center py-10">
                <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No purchases yet</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-muted/50 p-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Lifetime Total</span>
                  <span className="font-bold">{format(purchaseHistory.reduce((s: number, p: any) => s + Number(p.total_amount), 0))}</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseHistory.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{formatDate(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell>{format(Number(p.total_amount))}</TableCell>
                          <TableCell className="text-emerald-600">{format(Number(p.paid_amount))}</TableCell>
                          <TableCell>
                            <Badge variant={p.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{p.payment_status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Suppliers;
