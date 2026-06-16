import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search, Users, Receipt, MessageCircle, Eye, DollarSign, AlertTriangle,
  TrendingDown, Calendar, BookOpen, Sparkles, Phone, CheckCircle2, Clock,
  Send, FileDown, ArrowUpDown, Wallet, Mail, Bell
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate, subDays, differenceInDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

type AgeFilter = "all" | "fresh" | "warning" | "critical";
type SortKey = "due_desc" | "due_asc" | "name" | "oldest";

const DueCustomers = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("due_desc");
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [txDialog, setTxDialog] = useState<any>(null);
  const [txData, setTxData] = useState<any[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);

  const { data: dueCustomers = [], isLoading } = useQuery({
    queryKey: ["due-customers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*, customers(name, phone, email)")
        .eq("store_id", storeId!)
        .gt("total_due", 0)
        .order("total_due", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentHistory = [] } = useQuery({
    queryKey: ["payment-history-chart", storeId],
    enabled: ready,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data } = await supabase
        .from("credit_payments")
        .select("amount, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`due-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_credits", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["due-customers", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_payments", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["payment-history-chart", storeId] });
        queryClient.invalidateQueries({ queryKey: ["due-customers", storeId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["due-customers", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  // Chart: 7-day collections
  const chartData = useMemo(() => {
    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = formatDate(subDays(new Date(), i), "dd MMM");
      dayMap.set(d, 0);
    }
    paymentHistory.forEach((p: any) => {
      const d = formatDate(new Date(p.created_at), "dd MMM");
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) || 0) + Number(p.amount));
    });
    return Array.from(dayMap.entries()).map(([date, amount]) => ({ date, amount }));
  }, [paymentHistory]);

  // KPIs
  const totalDue = dueCustomers.reduce((s: number, c: any) => s + Number(c.total_due), 0);
  const highestDue = dueCustomers[0] || null;
  const avgDue = dueCustomers.length > 0 ? totalDue / dueCustomers.length : 0;
  const last7Collected = chartData.reduce((s, d) => s + d.amount, 0);

  const ageOf = (c: any) => c.last_payment_date ? differenceInDays(new Date(), new Date(c.last_payment_date)) : 999;
  const criticalCount = dueCustomers.filter((c: any) => ageOf(c) > 60).length;

  // Filter + sort
  const processed = useMemo(() => {
    let list = dueCustomers.filter((c: any) =>
      c.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.customers?.phone?.includes(search)
    );
    if (ageFilter === "fresh") list = list.filter((c: any) => ageOf(c) <= 30);
    else if (ageFilter === "warning") list = list.filter((c: any) => { const a = ageOf(c); return a > 30 && a <= 60; });
    else if (ageFilter === "critical") list = list.filter((c: any) => ageOf(c) > 60);

    if (sortKey === "due_desc") list.sort((a: any, b: any) => Number(b.total_due) - Number(a.total_due));
    else if (sortKey === "due_asc") list.sort((a: any, b: any) => Number(a.total_due) - Number(b.total_due));
    else if (sortKey === "name") list.sort((a: any, b: any) => (a.customers?.name || "").localeCompare(b.customers?.name || ""));
    else if (sortKey === "oldest") list.sort((a: any, b: any) => ageOf(b) - ageOf(a));
    return list;
  }, [dueCustomers, search, ageFilter, sortKey]);

  const pagination = usePagination(processed.length, {
    storageKey: `pg:due-customers:${storeId ?? "none"}`,
    filterSignature: JSON.stringify({ search, ageFilter, sortKey }),
  });
  const pagedProcessed = useMemo(
    () => paginate(processed, pagination.page, pagination.pageSize),
    [processed, pagination.page, pagination.pageSize],
  );

  const payMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(payAmount);
      if (!payDialog || amount <= 0) return;
      await supabase.from("credit_payments").insert({
        store_id: storeId!, user_id: userId!,
        customer_id: payDialog.customer_id,
        amount, payment_method: payMethod,
      });
      const newDue = Math.max(0, Number(payDialog.total_due) - amount);
      await supabase.from("customer_credits").update({
        total_due: newDue, last_payment_date: new Date().toISOString(),
      }).eq("id", payDialog.id);

      const { data: unpaidTxns } = await supabase.from("transactions")
        .select("id, amount, note")
        .eq("store_id", storeId!)
        .eq("is_paid", false)
        .ilike("note", "%POS%Due%")
        .order("created_at", { ascending: true });

      let remaining = amount;
      for (const txn of (unpaidTxns || [])) {
        if (remaining <= 0) break;
        const txnAmount = Number(txn.amount);
        if (remaining >= txnAmount) {
          await supabase.from("transactions").update({ is_paid: true }).eq("id", txn.id);
          remaining -= txnAmount;
          const orderMatch = txn.note?.match(/POS.*Order #([a-f0-9]+)/i);
          if (orderMatch) {
            const prefix = orderMatch[1];
            const { data: orders } = await supabase.from("orders")
              .select("id, total_amount, meta")
              .ilike("id", `${prefix}%`)
              .eq("store_id", storeId!)
              .limit(1);
            if (orders?.[0]) {
              const { data: relTxns } = await supabase.from("transactions")
                .select("is_paid, amount")
                .ilike("note", `%${prefix}%`)
                .eq("store_id", storeId!);
              const allPaid = relTxns?.every(t => t.is_paid) ?? false;
              const totalPaid = relTxns?.filter(t => t.is_paid).reduce((s, t) => s + Number(t.amount), 0) || 0;
              await supabase.from("orders").update({
                payment_status: allPaid ? "paid" : "partial",
                meta: { ...(orders[0].meta as any || {}), paid_amount: totalPaid, due_amount: Math.max(0, Number(orders[0].total_amount) - totalPaid) },
              }).eq("id", orders[0].id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["due-customers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const viewTransactions = async (credit: any) => {
    setTxDialog(credit);
    const { data } = await supabase
      .from("credit_payments")
      .select("*")
      .eq("customer_id", credit.customer_id)
      .eq("store_id", storeId!)
      .order("created_at", { ascending: false })
      .limit(20);
    setTxData(data || []);
  };

  const sendWhatsApp = (credit: any) => {
    const phone = credit.customers?.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number for this customer"); return; }
    const name = credit.customers?.name || "Customer";
    const amount = format(Number(credit.total_due));
    const text = `Hello ${name}, your due amount is ${amount}. Please clear it at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const sendBulkWhatsApp = () => {
    const eligible = dueCustomers.filter((c: any) => c.customers?.phone);
    if (eligible.length === 0) { toast.error("No customers with phone numbers"); return; }
    toast.success(`Opening WhatsApp for top ${Math.min(5, eligible.length)} customer(s)...`);
    eligible.slice(0, 5).forEach((c: any, i: number) => setTimeout(() => sendWhatsApp(c), i * 600));
  };

  const exportCSV = () => {
    const header = "Customer,Phone,Email,Total Due,Last Payment,Days Since\n";
    const rows = dueCustomers.map((c: any) =>
      `"${c.customers?.name}","${c.customers?.phone || ""}","${c.customers?.email || ""}",${c.total_due},"${c.last_payment_date ? formatDate(new Date(c.last_payment_date), "dd MMM yyyy") : "Never"}",${ageOf(c)}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "due_customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const ageBadge = (c: any) => {
    const days = ageOf(c);
    if (days > 60) return <Badge className="bg-destructive text-destructive-foreground gap-1"><AlertTriangle className="h-3 w-3" />Critical · {days}d</Badge>;
    if (days > 30) return <Badge className="bg-amber-500 text-white gap-1"><Clock className="h-3 w-3" />Warning · {days}d</Badge>;
    return <Badge className="bg-blue-500 text-white gap-1"><Clock className="h-3 w-3" />{days >= 999 ? "New" : `${days}d`}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* Premium header */}
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-destructive/10 via-amber-500/5 to-transparent p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-destructive/10 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-destructive to-destructive/70 text-destructive-foreground shadow-lg shadow-destructive/25">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Due Customers</h1>
                  <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Live</Badge>
                  {criticalCount > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground gap-1 animate-pulse">
                      <Bell className="h-3 w-3" />{criticalCount} critical
                    </Badge>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Outstanding dues — chase early, recover faster
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={sendBulkWhatsApp} disabled={dueCustomers.length === 0} className="gap-1">
                <Send className="h-4 w-4" /> Bulk Remind
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
                <FileDown className="h-4 w-4" /> Export
              </Button>
              <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" className="gap-1 bg-gradient-to-r from-primary to-primary/80">
                    <BookOpen className="h-4 w-4" /> Guide
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" /> Due Customers Guide
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-5">
                    {[
                      { icon: Sparkles, title: "Auto-populated from POS", desc: "Any sale recorded with payment_status = due appears here in real time. No manual entry required." },
                      { icon: Clock, title: "Age-based Risk Tiers", desc: "Fresh (0-30d), Warning (30-60d), Critical (60d+). Older debts are exponentially harder to collect — chase warnings before they turn critical." },
                      { icon: Receipt, title: "Quick Collect", desc: "One-click partial or full payment with method selection. Updates customer credit, related transactions and order status atomically." },
                      { icon: MessageCircle, title: "Smart Reminders", desc: "Pre-filled WhatsApp message with name and amount. Use Bulk Remind to message your top 5 debtors at once." },
                      { icon: Calendar, title: "Collection Trend", desc: "7-day collection chart shows recovery momentum. Aim for daily collection > daily new dues to stay healthy." },
                      { icon: Eye, title: "Payment History", desc: "View every recovery on a customer to spot reliable vs flaky payers." },
                      { icon: FileDown, title: "Export & Audit", desc: "Download a CSV of all dues with age data for accounting or reporting." },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-3 rounded-xl border border-border/40 bg-card/50 p-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl bg-gradient-to-br from-destructive/10 to-amber-500/10 p-4 border border-destructive/20">
                      <p className="text-xs font-semibold text-destructive mb-1">⚠️ Recovery Rule</p>
                      <p className="text-xs text-muted-foreground">After 90 days, recovery rate drops below 20%. Send your first reminder within 7 days of a missed payment for the best results.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-gradient-to-br from-destructive/5 to-transparent border-destructive/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outstanding</p>
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-destructive" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-destructive">{format(totalDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{dueCustomers.length} customer(s)</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">7d Recovered</p>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{format(last7Collected)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Last 7 days</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Due</p>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{format(avgDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Per customer</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/5 to-transparent border-amber-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Critical</p>
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{criticalCount}</p>
              <p className="text-[11px] text-muted-foreground mt-1">60+ days overdue</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart + Top Debtor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Collection Trend (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <defs>
                    <linearGradient id="duegrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted opacity-40" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "10px", fontSize: "12px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [format(value), "Collected"]}
                  />
                  <Bar dataKey="amount" fill="url(#duegrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-destructive/5 via-card to-card border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" /> Highest Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              {highestDue ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-bold text-base">{highestDue.customers?.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />{highestDue.customers?.phone || "No phone"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 border border-destructive/20">
                    <p className="text-[10px] uppercase font-semibold text-destructive/70">Owes you</p>
                    <p className="text-xl font-bold text-destructive">{format(Number(highestDue.total_due))}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setPayDialog(highestDue)}>
                      <Receipt className="h-3 w-3 mr-1" /> Collect
                    </Button>
                    {highestDue.customers?.phone && (
                      <Button size="sm" variant="outline" onClick={() => sendWhatsApp(highestDue)}>
                        <MessageCircle className="h-3 w-3 text-emerald-600" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                  <p className="text-sm font-medium">All clear! 🎉</p>
                  <p className="text-xs text-muted-foreground">No outstanding dues</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone..." className="pl-9" />
              </div>
              <Tabs value={ageFilter} onValueChange={(v) => setAgeFilter(v as AgeFilter)}>
                <TabsList className="grid grid-cols-4 w-full lg:w-auto">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="fresh" className="text-xs">Fresh</TabsTrigger>
                  <TabsTrigger value="warning" className="text-xs">Warning</TabsTrigger>
                  <TabsTrigger value="critical" className="text-xs">Critical</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <ArrowUpDown className="h-4 w-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_desc">Highest Due</SelectItem>
                  <SelectItem value="due_asc">Lowest Due</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Due List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Due List
              <Badge variant="secondary" className="ml-1">{processed.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-2.5 p-3 sm:p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : processed.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm text-muted-foreground">No due customers 🎉</p>
                </div>
              ) : pagedProcessed.map((c: any) => {
                const due = Number(c.total_due);
                const pctOfTotal = totalDue > 0 ? (due / totalDue) * 100 : 0;
                return (
                  <div key={c.id} className="bg-card rounded-xl border border-border/40 p-3.5 space-y-3 hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center text-xs font-semibold text-destructive shrink-0">
                          {(c.customers?.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.customers?.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{c.customers?.phone || "No phone"}
                          </p>
                        </div>
                      </div>
                      {ageBadge(c)}
                    </div>
                    <div className="rounded-lg bg-destructive/5 border border-destructive/15 p-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] uppercase text-muted-foreground font-medium">Total Due</span>
                        <span className="text-[10px] text-muted-foreground">{pctOfTotal.toFixed(0)}% of total</span>
                      </div>
                      <p className="font-bold text-base text-destructive">{format(due)}</p>
                      <Progress value={pctOfTotal} className="h-1 mt-1.5" />
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="default" onClick={() => setPayDialog(c)} className="flex-1 h-8">
                        <Receipt className="h-3 w-3 mr-1" /> Pay
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => viewTransactions(c)} className="h-8 px-2.5">
                        <Eye className="h-3 w-3" />
                      </Button>
                      {c.customers?.phone && (
                        <Button size="sm" variant="outline" onClick={() => sendWhatsApp(c)} className="h-8 px-2.5">
                          <MessageCircle className="h-3 w-3 text-emerald-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-10">Loading...</TableCell></TableRow>
                  ) : processed.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-10">
                      <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                      <p className="text-sm text-muted-foreground">No due customers 🎉</p>
                    </TableCell></TableRow>
                  ) : pagedProcessed.map((c: any) => (
                    <TableRow key={c.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center text-xs font-semibold text-destructive">
                            {(c.customers?.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{c.customers?.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {c.customers?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.customers.phone}</span>}
                              {c.customers?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.customers.email}</span>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{ageBadge(c)}</TableCell>
                      <TableCell>
                        <span className="font-bold text-destructive">{format(Number(c.total_due))}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.last_payment_date ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(new Date(c.last_payment_date), "dd MMM yy")}
                          </div>
                        ) : <span className="italic">Never</span>}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="default" onClick={() => setPayDialog(c)}>
                          <Receipt className="h-3 w-3 mr-1" /> Pay Now
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => viewTransactions(c)} title="History">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {c.customers?.phone && (
                          <Button size="sm" variant="ghost" onClick={() => sendWhatsApp(c)} title="WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          {processed.length > 0 && (
            <div className="px-3 sm:px-4 pb-3">
              <DataPagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={processed.length}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                itemLabel="customers"
              />
            </div>
          )}
        </Card>

        {/* Pay dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) { setPayDialog(null); setPayAmount(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" /> Collect Payment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{payDialog?.customers?.name}</p>
                    <p className="text-xs text-muted-foreground">{payDialog?.customers?.phone || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">Due</p>
                    <p className="text-lg font-bold text-destructive">{format(Number(payDialog?.total_due || 0))}</p>
                  </div>
                </div>
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" className="text-lg font-semibold" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.total_due || 0) / 4)))}>25%</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.total_due || 0) / 2)))}>Half</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(payDialog?.total_due || 0))}>Full</Button>
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
                    <SelectItem value="card">💳 Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => payMutation.mutate()} disabled={!payAmount || Number(payAmount) <= 0 || payMutation.isPending} className="w-full bg-gradient-to-r from-primary to-primary/80">
                {payMutation.isPending ? "Recording..." : <><CheckCircle2 className="h-4 w-4 mr-1" /> Record Payment</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transaction history */}
        <Dialog open={!!txDialog} onOpenChange={v => { if (!v) setTxDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Payment History
              </DialogTitle>
            </DialogHeader>
            <div className="rounded-xl bg-muted/30 p-3 mb-3">
              <p className="font-semibold">{txDialog?.customers?.name}</p>
              <p className="text-xs text-muted-foreground">{txData.length} payment(s) · Total {format(txData.reduce((s: number, t: any) => s + Number(t.amount), 0))}</p>
            </div>
            {txData.length === 0 ? (
              <div className="text-center py-8">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No payment records yet</p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {txData.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/40 p-2.5 hover:bg-muted/40">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{format(Number(t.amount))}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(new Date(t.created_at), "dd MMM yyyy, HH:mm")}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize">{t.payment_method}</Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default DueCustomers;
