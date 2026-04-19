import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Search, ShoppingBag, FileDown, Eye, Receipt, Wallet, TrendingUp,
  BookOpen, Sparkles, AlertTriangle, Filter, Crown, ArrowUpRight, ShieldCheck,
  Calendar, CheckCircle2, Package,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate, subDays, startOfMonth } from "date-fns";
import { normalizePaymentMethods } from "@/lib/paymentMethods";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid } from "recharts";

type StatusFilter = "all" | "paid" | "partial" | "unpaid";
type SortBy = "recent" | "amount_high" | "due_high";

const Purchases = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [guideOpen, setGuideOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "",
  });
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [detailDialog, setDetailDialog] = useState<any>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("store_id", storeId!).eq("is_active", true);
      return data || [];
    },
  });

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`purchases-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["purchases", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = validateWithToast(purchaseSchema, form, toast.error);
      if (!parsed) throw new Error("Validation failed");
      const total = Number(form.total_amount) || 0;
      const paid = Number(form.paid_amount) || 0;
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
      const { error } = await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: form.supplier_id || null,
        total_amount: total, paid_amount: paid,
        payment_status: status, payment_method: form.payment_method,
        notes: form.notes,
      });
      if (error) throw error;

      if (form.supplier_id && total > paid) {
        const due = total - paid;
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", form.supplier_id).single();
        if (sup) {
          await supabase.from("suppliers").update({ balance_due: Number(sup.balance_due) + due }).eq("id", form.supplier_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      setForm({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
      toast.success("Purchase recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");
      const due = Number(payDialog.total_amount) - Number(payDialog.paid_amount);
      const newPaid = Number(payDialog.paid_amount) + Math.min(amount, due);
      const newStatus = newPaid >= Number(payDialog.total_amount) ? "paid" : "partial";

      await supabase.from("purchases").update({
        paid_amount: newPaid, payment_status: newStatus, payment_method: payMethod,
      }).eq("id", payDialog.id);

      if (payDialog.supplier_id) {
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", payDialog.supplier_id).single();
        if (sup) {
          const reducedDue = Math.max(0, Number(sup.balance_due) - Math.min(amount, due));
          await supabase.from("suppliers").update({ balance_due: reducedDue }).eq("id", payDialog.supplier_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment updated!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportCSV = () => {
    const header = "Date,Supplier,Total,Paid,Due,Status,Method,Notes\n";
    const rows = purchases.map((p: any) =>
      `"${formatDate(new Date(p.purchase_date), "dd MMM yyyy")}","${p.suppliers?.name || ""}",${p.total_amount},${p.paid_amount},${Math.max(0, p.total_amount - p.paid_amount)},"${p.payment_status}","${p.payment_method}","${(p.notes || "").replace(/"/g, "'")}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `purchases-${formatDate(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Analytics
  const stats = useMemo(() => {
    const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const totalPaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount), 0);
    const totalDue = totalPurchases - totalPaid;
    const monthStart = startOfMonth(new Date());
    const thisMonth = purchases.filter((p: any) => new Date(p.purchase_date) >= monthStart);
    const monthSpend = thisMonth.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
    const unpaidCount = purchases.filter((p: any) => p.payment_status !== "paid").length;
    // Top supplier by spend
    const bySupplier: Record<string, { name: string; total: number; due: number }> = {};
    purchases.forEach((p: any) => {
      const k = p.supplier_id || "_unknown";
      const name = p.suppliers?.name || "Walk-in";
      if (!bySupplier[k]) bySupplier[k] = { name, total: 0, due: 0 };
      bySupplier[k].total += Number(p.total_amount);
      bySupplier[k].due += Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
    });
    const top = Object.values(bySupplier).sort((a, b) => b.total - a.total)[0];
    const paidPct = totalPurchases > 0 ? (totalPaid / totalPurchases) * 100 : 0;
    return { totalPurchases, totalPaid, totalDue, monthSpend, unpaidCount, top, paidPct, monthCount: thisMonth.length };
  }, [purchases]);

  // 7-day spend trend
  const trend = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) days[formatDate(subDays(new Date(), i), "MMM d")] = 0;
    purchases.forEach((p: any) => {
      const k = formatDate(new Date(p.purchase_date), "MMM d");
      if (k in days) days[k] += Number(p.total_amount || 0);
    });
    return Object.entries(days).map(([day, amount]) => ({ day, amount }));
  }, [purchases]);

  // Filter + sort
  const filteredPurchases = useMemo(() => {
    let arr = purchases.filter((p: any) => {
      const ms = p.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) || p.notes?.toLowerCase().includes(search.toLowerCase());
      const mst = statusFilter === "all" || p.payment_status === statusFilter;
      return ms && mst;
    });
    if (sortBy === "amount_high") arr = [...arr].sort((a: any, b: any) => Number(b.total_amount) - Number(a.total_amount));
    else if (sortBy === "due_high") arr = [...arr].sort((a: any, b: any) =>
      (Number(b.total_amount) - Number(b.paid_amount)) - (Number(a.total_amount) - Number(a.paid_amount))
    );
    return arr;
  }, [purchases, search, statusFilter, sortBy]);

  const statusTabs: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: purchases.length },
    { id: "unpaid", label: "Unpaid", count: purchases.filter((p: any) => p.payment_status === "unpaid").length },
    { id: "partial", label: "Partial", count: purchases.filter((p: any) => p.payment_status === "partial").length },
    { id: "paid", label: "Paid", count: purchases.filter((p: any) => p.payment_status === "paid").length },
  ];

  const statusBadge = (s: string) => {
    if (s === "paid") return <Badge className="bg-emerald-500 text-white text-xs gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Paid</Badge>;
    if (s === "partial") return <Badge className="bg-amber-500 text-white text-xs">Partial</Badge>;
    return <Badge className="bg-destructive text-destructive-foreground text-xs">Unpaid</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-20 md:pb-6">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/30">
                <ShoppingBag className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Purchases Ledger</h1>
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Inventory procurement & payables tracking
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><BookOpen className="h-4 w-4" /> Guide</Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Purchases Guide</SheetTitle>
                    <SheetDescription>Master your procurement workflow in 7 steps.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-5 space-y-4 text-sm">
                    {[
                      { t: "1. Record a Purchase", d: "Click 'New Purchase' and select supplier, total amount, paid amount, and payment method. Status auto-calculates." },
                      { t: "2. Auto Status Logic", d: "If Paid ≥ Total → Paid. If Paid > 0 but < Total → Partial. If Paid = 0 → Unpaid. The unpaid balance auto-adds to the supplier's due." },
                      { t: "3. Pay Down Dues", d: "Click 'Pay' on any partial/unpaid row to record additional payments. Supplier balance updates instantly." },
                      { t: "4. Smart Filters", d: "Use status tabs (All / Unpaid / Partial / Paid) and sort by date, amount, or outstanding due." },
                      { t: "5. Spend Trend", d: "The 7-day spend chart shows your procurement velocity. A spike often means restocking — plan cash flow." },
                      { t: "6. Top Vendor Spotlight", d: "Identify your highest-spend supplier to negotiate volume discounts or better credit terms." },
                      { t: "7. Export for Accounting", d: "CSV export includes date, supplier, totals, payment status & method — perfect for monthly reconciliation." },
                    ].map((s, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3">
                        <p className="font-semibold text-foreground">{s.t}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.d}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="font-semibold text-primary flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Pro Tip</p>
                      <p className="text-xs text-muted-foreground mt-1">Always link a supplier — it auto-syncs the due balance to the Suppliers page for unified accounts payable.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 hidden sm:inline-flex">
                <FileDown className="h-4 w-4" /> Export
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5 shadow-lg shadow-primary/30">
                    <Plus className="h-4 w-4" /> New Purchase
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record Purchase</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Supplier</Label>
                      <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select supplier (optional)" /></SelectTrigger>
                        <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Total Amount *</Label><Input type="number" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} placeholder="0.00" /></div>
                      <div><Label>Paid Amount</Label><Input type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} placeholder="0.00" /></div>
                    </div>
                    {form.total_amount && (
                      <div className="rounded-lg bg-muted/50 p-2.5 text-sm flex justify-between">
                        <span className="text-muted-foreground">Outstanding Due</span>
                        <span className="font-bold text-destructive">{format(Math.max(0, Number(form.total_amount) - Number(form.paid_amount)))}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" size="sm" type="button" onClick={() => setForm(p => ({ ...p, paid_amount: "0" }))}>Credit</Button>
                      <Button variant="outline" size="sm" type="button" onClick={() => setForm(p => ({ ...p, paid_amount: String(Math.round(Number(p.total_amount) / 2)) }))}>Half</Button>
                      <Button variant="outline" size="sm" type="button" onClick={() => setForm(p => ({ ...p, paid_amount: p.total_amount }))}>Full</Button>
                    </div>
                    <div>
                      <Label>Payment Method</Label>
                      <Select value={form.payment_method} onValueChange={v => setForm(p => ({ ...p, payment_method: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">💵 Cash</SelectItem>
                          <SelectItem value="bank">🏦 Bank Transfer</SelectItem>
                          <SelectItem value="bkash">📱 bKash</SelectItem>
                          <SelectItem value="nagad">📱 Nagad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Items, invoice #, description..." /></div>
                    <Button onClick={() => createMutation.mutate()} disabled={!form.total_amount || createMutation.isPending} className="w-full">
                      {createMutation.isPending ? "Saving..." : "Record Purchase"}
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
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Lifetime</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{format(stats.totalPurchases)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{purchases.length} entries</p>
            </CardContent>
          </Card>
          <Card className="border bg-gradient-to-br from-card to-emerald-500/5 hover:shadow-lg transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Paid</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{format(stats.totalPaid)}</p>
              <Progress value={stats.paidPct} className="h-1 mt-1.5" />
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.paidPct.toFixed(0)}% settled</p>
            </CardContent>
          </Card>
          <Card className={`border bg-gradient-to-br hover:shadow-lg transition-shadow ${stats.totalDue > 0 ? "from-card to-destructive/10" : "from-card to-emerald-500/5"}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <Wallet className={`h-4 w-4 ${stats.totalDue > 0 ? "text-destructive" : "text-emerald-600"}`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Payable</span>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${stats.totalDue > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(stats.totalDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.unpaidCount} pending</p>
            </CardContent>
          </Card>
          <Card className="border bg-gradient-to-br from-card to-amber-500/5 hover:shadow-lg transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">This Month</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{format(stats.monthSpend)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.monthCount} purchases</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Supplier + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {stats.top && (
            <Card className="lg:col-span-1 border bg-gradient-to-br from-amber-500/10 via-card to-card overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Vendor (by spend)</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{stats.top.name}</p>
                    <p className="text-xs text-muted-foreground">Lifetime supplier</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total Spend</span>
                    <span className="font-bold">{format(stats.top.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className={`font-bold ${stats.top.due > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(stats.top.due)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className={`${stats.top ? "lg:col-span-2" : "lg:col-span-3"} border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpRight className="h-3.5 w-3.5 text-primary" /> 7-Day Spend Trend
                  </p>
                  <p className="text-lg font-bold mt-0.5">{format(trend.reduce((s, t) => s + t.amount, 0))}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">procurement</Badge>
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

        {/* Filters */}
        <Card className="border">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier or notes..." className="pl-9" />
              </div>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="amount_high">Highest Amount</SelectItem>
                  <SelectItem value="due_high">Highest Due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
              {statusTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    statusFilter === tab.id
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
                <p className="text-center py-12 text-muted-foreground text-sm">Loading...</p>
              ) : filteredPurchases.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No purchases match your filters</p>
                </div>
              ) : filteredPurchases.map((p: any) => {
                const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                const paidPct = Number(p.total_amount) > 0 ? (Number(p.paid_amount) / Number(p.total_amount)) * 100 : 0;
                return (
                  <div key={p.id} className="p-3 space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${due > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                          <ShoppingBag className={`h-5 w-5 ${due > 0 ? "text-amber-600" : "text-emerald-600"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{p.suppliers?.name || "Walk-in"}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</p>
                        </div>
                      </div>
                      {statusBadge(p.payment_status)}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className="rounded-md bg-muted/40 p-1.5"><p className="text-muted-foreground">Total</p><p className="font-bold text-xs">{format(Number(p.total_amount))}</p></div>
                      <div className="rounded-md bg-emerald-500/10 p-1.5"><p className="text-muted-foreground">Paid</p><p className="font-bold text-xs text-emerald-600">{format(Number(p.paid_amount))}</p></div>
                      <div className={`rounded-md p-1.5 ${due > 0 ? "bg-destructive/10" : "bg-muted/40"}`}><p className="text-muted-foreground">Due</p><p className={`font-bold text-xs ${due > 0 ? "text-destructive" : ""}`}>{format(due)}</p></div>
                    </div>
                    <Progress value={paidPct} className="h-1" />
                    {p.notes && <p className="text-[11px] text-muted-foreground line-clamp-1">📝 {p.notes}</p>}
                    <div className="flex gap-1.5">
                      {due > 0 && (
                        <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => { setPayDialog(p); setPayAmount(""); }}>
                          <Receipt className="h-3 w-3 mr-1" /> Pay {format(due)}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDetailDialog(p)}>
                        <Eye className="h-3 w-3" />
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
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid / Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredPurchases.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12">
                      <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No purchases match your filters</p>
                    </TableCell></TableRow>
                  ) : filteredPurchases.map((p: any) => {
                    const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                    const paidPct = Number(p.total_amount) > 0 ? (Number(p.paid_amount) / Number(p.total_amount)) * 100 : 0;
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm">
                          <div className="font-medium">{formatDate(new Date(p.purchase_date), "dd MMM")}</div>
                          <div className="text-[10px] text-muted-foreground">{formatDate(new Date(p.purchase_date), "yyyy")}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${due > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                              <ShoppingBag className={`h-4 w-4 ${due > 0 ? "text-amber-600" : "text-emerald-600"}`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{p.suppliers?.name || "Walk-in"}</p>
                              {p.notes && <p className="text-[10px] text-muted-foreground line-clamp-1 max-w-[180px]">{p.notes}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">{format(Number(p.total_amount))}</TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[140px]">
                            <div className="flex justify-between text-xs">
                              <span className="text-emerald-600 font-medium">{format(Number(p.paid_amount))}</span>
                              {due > 0 && <span className="text-destructive font-medium">−{format(due)}</span>}
                            </div>
                            <Progress value={paidPct} className="h-1" />
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(p.payment_status)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{p.payment_method}</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          {due > 0 && (
                            <Button size="sm" variant="outline" onClick={() => { setPayDialog(p); setPayAmount(""); }}>
                              <Receipt className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDetailDialog(p)} title="Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {stats.unpaidCount > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-foreground">
              <strong>{stats.unpaidCount}</strong> purchase{stats.unpaidCount > 1 ? "s" : ""} with outstanding dues totaling{" "}
              <strong className="text-destructive">{format(stats.totalDue)}</strong>. Use the <strong>Unpaid</strong> filter to settle them.
            </p>
          </div>
        )}

        {/* Pay Purchase Due Dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Pay Purchase Due</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-semibold mb-1.5">{payDialog?.suppliers?.name || "Walk-in"}</p>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-bold">{format(Number(payDialog?.total_amount || 0))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Already Paid</span><span className="text-emerald-600 font-semibold">{format(Number(payDialog?.paid_amount || 0))}</span></div>
                <div className="flex justify-between text-sm pt-1 border-t mt-1"><span className="text-muted-foreground">Remaining</span><span className="font-bold text-destructive">{format(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)))}</span></div>
              </div>
              <div><Label>Payment Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" /></div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)) * 0.25)))}>25%</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)) / 2)))}>Half</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0))))}>Full</Button>
              </div>
              <div>
                <Label>Method</Label>
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
              <Button onClick={() => payMutation.mutate()} disabled={!payAmount || payMutation.isPending} className="w-full">
                {payMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase Detail Dialog */}
        <Dialog open={!!detailDialog} onOpenChange={v => { if (!v) setDetailDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Purchase Details</DialogTitle>
            </DialogHeader>
            {detailDialog && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs">Supplier</span><p className="font-medium">{detailDialog.suppliers?.name || "Walk-in"}</p></div>
                  <div><span className="text-muted-foreground text-xs">Date</span><p className="font-medium">{formatDate(new Date(detailDialog.purchase_date), "dd MMM yyyy")}</p></div>
                  <div><span className="text-muted-foreground text-xs">Total</span><p className="font-bold">{format(Number(detailDialog.total_amount))}</p></div>
                  <div><span className="text-muted-foreground text-xs">Paid</span><p className="font-bold text-emerald-600">{format(Number(detailDialog.paid_amount))}</p></div>
                  <div><span className="text-muted-foreground text-xs">Status</span><div className="mt-0.5">{statusBadge(detailDialog.payment_status)}</div></div>
                  <div><span className="text-muted-foreground text-xs">Method</span><div className="mt-0.5"><Badge variant="outline" className="capitalize">{detailDialog.payment_method}</Badge></div></div>
                </div>
                {detailDialog.notes && (
                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <span className="text-muted-foreground text-xs">Notes</span>
                    <p className="text-sm mt-0.5">{detailDialog.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Purchases;
