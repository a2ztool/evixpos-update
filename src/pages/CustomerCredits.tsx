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
  Search, DollarSign, Users, Receipt, MessageCircle, FileDown, Eye, Pencil,
  TrendingDown, TrendingUp, AlertTriangle, BookOpen, Sparkles, ArrowUpDown,
  Wallet, Phone, Calendar, CheckCircle2, Clock, ChevronRight, Send, Filter
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { creditPaymentSchema, creditLimitSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { format as formatDate, differenceInDays } from "date-fns";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

type RiskFilter = "all" | "overdue" | "over_limit" | "paid";
type SortKey = "due_desc" | "due_asc" | "name" | "recent";

const CustomerCredits = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("due_desc");
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [editLimitDialog, setEditLimitDialog] = useState<any>(null);
  const [newLimit, setNewLimit] = useState("");
  const [txDialog, setTxDialog] = useState<any>(null);
  const [txData, setTxData] = useState<any[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const payValidation = useFormValidation(creditPaymentSchema);
  const limitValidation = useFormValidation(creditLimitSchema);

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["customer-credits", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId!)
        .order("total_due", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["credit-payments", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_payments")
        .select("*, customers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`credits-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_credits", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["customer-credits", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_payments", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["credit-payments", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      queryClient.invalidateQueries({ queryKey: ["credit-payments"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCreditLimit = async () => {
    if (!editLimitDialog) return;
    const { error } = await supabase.from("customer_credits").update({
      credit_limit: Number(newLimit) || 0,
    }).eq("id", editLimitDialog.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Credit limit updated");
      queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
    }
    setEditLimitDialog(null);
    setNewLimit("");
  };

  const viewTransactions = async (credit: any) => {
    setTxDialog(credit);
    const { data } = await supabase
      .from("credit_payments")
      .select("*")
      .eq("customer_id", credit.customer_id)
      .eq("store_id", storeId!)
      .order("created_at", { ascending: false })
      .limit(50);
    setTxData(data || []);
  };

  const sendWhatsApp = (credit: any) => {
    const phone = credit.customers?.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number"); return; }
    const name = credit.customers?.name || "Customer";
    const amount = format(Number(credit.total_due));
    const text = `Hello ${name}, your due amount is ${amount}. Please clear it at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const bulkRemind = () => {
    const eligible = credits.filter((c: any) => Number(c.total_due) > 0 && c.customers?.phone);
    if (eligible.length === 0) { toast.error("No customers with phone & due"); return; }
    toast.success(`Opening ${eligible.length} reminder(s)...`);
    eligible.slice(0, 5).forEach((c: any, i: number) => setTimeout(() => sendWhatsApp(c), i * 600));
    if (eligible.length > 5) toast.info(`Showing first 5. Use individual buttons for rest.`);
  };

  const exportCSV = () => {
    const header = "Customer,Phone,Credit Limit,Total Due,Last Payment\n";
    const rows = credits.map((c: any) =>
      `"${c.customers?.name}","${c.customers?.phone || ""}",${c.credit_limit},${c.total_due},"${c.last_payment_date ? formatDate(new Date(c.last_payment_date), "dd MMM yyyy") : ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "customer_credits.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ===== Computed analytics =====
  const totalDue = credits.reduce((s: number, c: any) => s + Number(c.total_due), 0);
  const customersWithDue = credits.filter((c: any) => Number(c.total_due) > 0).length;
  const totalCollected = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const overLimitCount = credits.filter((c: any) =>
    Number(c.credit_limit) > 0 && Number(c.total_due) > Number(c.credit_limit)
  ).length;
  const collectionRate = totalDue + totalCollected > 0
    ? Math.round((totalCollected / (totalDue + totalCollected)) * 100)
    : 0;

  // Aging buckets
  const aging = useMemo(() => {
    const now = new Date();
    const buckets = { current: 0, b30: 0, b60: 0, b90: 0 };
    credits.forEach((c: any) => {
      const due = Number(c.total_due);
      if (due <= 0) return;
      const days = c.last_payment_date ? differenceInDays(now, new Date(c.last_payment_date)) : 999;
      if (days <= 30) buckets.current += due;
      else if (days <= 60) buckets.b30 += due;
      else if (days <= 90) buckets.b60 += due;
      else buckets.b90 += due;
    });
    return buckets;
  }, [credits]);

  // Top debtor
  const topDebtor = useMemo(() => credits.find((c: any) => Number(c.total_due) > 0), [credits]);

  // Filtered + sorted list
  const processed = useMemo(() => {
    const now = new Date();
    let list = credits.filter((c: any) =>
      c.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.customers?.phone?.includes(search)
    );

    if (riskFilter === "overdue") {
      list = list.filter((c: any) => {
        const days = c.last_payment_date ? differenceInDays(now, new Date(c.last_payment_date)) : 999;
        return Number(c.total_due) > 0 && days > 30;
      });
    } else if (riskFilter === "over_limit") {
      list = list.filter((c: any) => Number(c.credit_limit) > 0 && Number(c.total_due) > Number(c.credit_limit));
    } else if (riskFilter === "paid") {
      list = list.filter((c: any) => Number(c.total_due) === 0);
    }

    if (sortKey === "due_desc") list.sort((a: any, b: any) => Number(b.total_due) - Number(a.total_due));
    else if (sortKey === "due_asc") list.sort((a: any, b: any) => Number(a.total_due) - Number(b.total_due));
    else if (sortKey === "name") list.sort((a: any, b: any) => (a.customers?.name || "").localeCompare(b.customers?.name || ""));
    else if (sortKey === "recent") list.sort((a: any, b: any) =>
      new Date(b.last_payment_date || 0).getTime() - new Date(a.last_payment_date || 0).getTime()
    );

    return list;
  }, [credits, search, riskFilter, sortKey]);

  const pagination = usePagination(processed.length, {
    storageKey: `pg:customer-credits:${storeId ?? "_"}`,
    filterSignature: JSON.stringify({ search, riskFilter, sortKey }),
  });
  const pagedRecords = paginate(processed as any[], pagination.page, pagination.pageSize);

  const getRiskBadge = (c: any) => {
    const due = Number(c.total_due);
    if (due === 0) return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Paid</Badge>;
    if (Number(c.credit_limit) > 0 && due > Number(c.credit_limit))
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Over Limit</Badge>;
    const days = c.last_payment_date ? differenceInDays(new Date(), new Date(c.last_payment_date)) : 999;
    if (days > 60) return <Badge className="bg-destructive/90 text-destructive-foreground gap-1"><Clock className="h-3 w-3" />Overdue</Badge>;
    if (days > 30) return <Badge className="bg-amber-500/90 text-white gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    return <Badge className="bg-blue-500/90 text-white">Active</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* ===== Premium header ===== */}
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Customer Credits</h1>
                  <Badge variant="outline" className="gap-1 hidden sm:inline-flex"><Sparkles className="h-3 w-3" />Live</Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Track customer dues, collect payments & send smart reminders
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={bulkRemind} className="gap-1">
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
                      <BookOpen className="h-5 w-5 text-primary" />
                      Customer Credits Guide
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-5">
                    {[
                      { icon: Sparkles, title: "Auto Sync from POS", desc: "Whenever a sale is recorded with payment_status = due, the customer automatically appears here with the outstanding balance." },
                      { icon: Wallet, title: "Set Credit Limits", desc: "Click on the credit limit to set per-customer maximum. Customers exceeding the limit are flagged Over Limit so cashiers can decline credit at POS." },
                      { icon: Receipt, title: "Collect Payments", desc: "Click Collect, choose Full / Half or enter a custom amount, pick the payment method (Cash, bKash, Nagad, Bank). Real-time sync updates POS instantly." },
                      { icon: MessageCircle, title: "WhatsApp Reminders", desc: "One-click WhatsApp reminder with pre-filled friendly text. Use Bulk Remind to message your top 5 debtors at once." },
                      { icon: Clock, title: "Aging Analysis", desc: "Watch the aging buckets (0-30, 30-60, 60-90, 90+) to spot stale dues. Older balances are harder to recover — chase them early." },
                      { icon: Filter, title: "Smart Filters", desc: "Filter by Overdue, Over Limit, or Paid. Sort by amount or recent activity to prioritise collections." },
                      { icon: Eye, title: "Transaction History", desc: "View every payment ever received from a customer with date, amount and method. Great for resolving disputes." },
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
                    <div className="rounded-xl bg-gradient-to-br from-primary/10 to-amber-500/10 p-4 border border-primary/20">
                      <p className="text-xs font-semibold text-primary mb-1">💡 Pro Tip</p>
                      <p className="text-xs text-muted-foreground">Set credit limits proportional to a customer's average monthly purchase. Most retail businesses use 1.5×–2× the monthly average to balance trust and risk.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* ===== KPI Cards ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="relative overflow-hidden bg-gradient-to-br from-destructive/5 to-transparent border-destructive/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Due</p>
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-destructive">{format(totalDue)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{customersWithDue} customer(s) owe you</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collected</p>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{format(totalCollected)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Last 20 payments</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collection Rate</p>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{collectionRate}%</p>
              <Progress value={collectionRate} className="h-1.5 mt-2" />
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/5 to-transparent border-amber-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk Alerts</p>
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{overLimitCount}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Over credit limit</p>
            </CardContent>
          </Card>
        </div>

        {/* ===== Aging + Top Debtor ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Aging Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "0-30 days", value: aging.current, color: "emerald", tone: "Healthy" },
                  { label: "30-60 days", value: aging.b30, color: "blue", tone: "Watch" },
                  { label: "60-90 days", value: aging.b60, color: "amber", tone: "Risk" },
                  { label: "90+ days", value: aging.b90, color: "destructive", tone: "Critical" },
                ].map((b) => {
                  const pct = totalDue > 0 ? (b.value / totalDue) * 100 : 0;
                  return (
                    <div key={b.label} className="rounded-xl border border-border/40 p-3 bg-muted/20">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{b.label}</p>
                      <p className={`text-base sm:text-lg font-bold mt-1 ${b.color === "destructive" ? "text-destructive" : b.color === "amber" ? "text-amber-600" : b.color === "blue" ? "text-blue-600" : "text-emerald-600"}`}>
                        {format(b.value)}
                      </p>
                      <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${b.color === "destructive" ? "bg-destructive" : b.color === "amber" ? "bg-amber-500" : b.color === "blue" ? "bg-blue-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{b.tone} · {pct.toFixed(0)}%</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Top Debtor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDebtor ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-bold text-base">{topDebtor.customers?.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />{topDebtor.customers?.phone || "No phone"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 border border-destructive/20">
                    <p className="text-[10px] uppercase font-semibold text-destructive/70">Owes</p>
                    <p className="text-xl font-bold text-destructive">{format(Number(topDebtor.total_due))}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setPayDialog(topDebtor)}>
                      <Receipt className="h-3 w-3 mr-1" /> Collect
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => sendWhatsApp(topDebtor)}>
                      <MessageCircle className="h-3 w-3 text-emerald-600" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                  <p className="text-sm font-medium">All clear!</p>
                  <p className="text-xs text-muted-foreground">No outstanding dues</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== Filters ===== */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer name or phone..." className="pl-9" />
              </div>
              <Tabs value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilter)}>
                <TabsList className="grid grid-cols-4 w-full lg:w-auto">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="overdue" className="text-xs">Overdue</TabsTrigger>
                  <TabsTrigger value="over_limit" className="text-xs">Over Limit</TabsTrigger>
                  <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
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
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="recent">Recent Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ===== Customer list ===== */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Customer Dues
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
                  <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No credit records found</p>
                </div>
              ) : pagedRecords.map((c: any) => {
                const due = Number(c.total_due);
                const limit = Number(c.credit_limit);
                const usagePct = limit > 0 ? Math.min(100, (due / limit) * 100) : 0;
                return (
                  <div key={c.id} className="bg-card rounded-xl border border-border/40 p-3.5 space-y-3 hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.customers?.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />{c.customers?.phone || "No phone"}
                        </p>
                      </div>
                      {getRiskBadge(c)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Due</p>
                        <p className={`font-bold text-sm ${due > 0 ? "text-destructive" : "text-emerald-600"}`}>{format(due)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Limit</p>
                        <p className="font-bold text-sm">{limit > 0 ? format(limit) : "—"}</p>
                      </div>
                    </div>
                    {limit > 0 && <Progress value={usagePct} className="h-1" />}
                    <div className="flex gap-1.5">
                      {due > 0 && (
                        <Button size="sm" variant="default" onClick={() => setPayDialog(c)} className="flex-1 h-8">
                          <Receipt className="h-3 w-3 mr-1" /> Collect
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => viewTransactions(c)} className="h-8 px-2.5">
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditLimitDialog(c); setNewLimit(String(c.credit_limit)); }} className="h-8 px-2.5">
                        <Pencil className="h-3 w-3" />
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
                    <TableHead>Credit Usage</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10">Loading...</TableCell></TableRow>
                  ) : processed.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No credit records found</p>
                    </TableCell></TableRow>
                  ) : pagedRecords.map((c: any) => {
                    const due = Number(c.total_due);
                    const limit = Number(c.credit_limit);
                    const usagePct = limit > 0 ? Math.min(100, (due / limit) * 100) : 0;
                    return (
                      <TableRow key={c.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary">
                              {(c.customers?.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{c.customers?.name}</p>
                              <p className="text-xs text-muted-foreground">{c.customers?.phone || "No phone"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getRiskBadge(c)}</TableCell>
                        <TableCell>
                          <button className="flex flex-col gap-1 hover:text-primary transition-colors w-32" onClick={() => { setEditLimitDialog(c); setNewLimit(String(c.credit_limit)); }}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{limit > 0 ? format(limit) : "Unlimited"}</span>
                              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            </div>
                            {limit > 0 && <Progress value={usagePct} className="h-1" />}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${due > 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {format(due)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.last_payment_date ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(new Date(c.last_payment_date), "dd MMM yy")}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => viewTransactions(c)} title="History">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {due > 0 && (
                            <Button size="sm" variant="default" onClick={() => setPayDialog(c)}>
                              <Receipt className="h-3 w-3 mr-1" /> Collect
                            </Button>
                          )}
                          {c.customers?.phone && (
                            <Button size="sm" variant="ghost" onClick={() => sendWhatsApp(c)} title="WhatsApp">
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {processed.length > 0 && (
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={processed.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="credit records"
          />
        )}

        {/* ===== Recent Payments ===== */}
        {payments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Recent Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(new Date(p.created_at), "dd MMM yy HH:mm")}</TableCell>
                        <TableCell className="font-medium text-sm">{p.customers?.name}</TableCell>
                        <TableCell className="text-emerald-600 font-bold">{format(Number(p.amount))}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{p.payment_method}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="sm:hidden p-3 space-y-2">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/40 p-2.5">
                    <div>
                      <p className="text-sm font-medium">{p.customers?.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(new Date(p.created_at), "dd MMM, HH:mm")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-emerald-600 font-bold text-sm">{format(Number(p.amount))}</p>
                      <Badge variant="secondary" className="text-[10px] capitalize">{p.payment_method}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== Pay dialog ===== */}
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
                <Input type="number" value={payAmount} onChange={e => { setPayAmount(e.target.value); payValidation.clearField("amount"); }} placeholder="0.00" className="text-lg font-semibold" error={!!payValidation.getError("amount")} />
                {payValidation.getError("amount") && <p className="text-xs text-destructive mt-1 animate-fade-in">{payValidation.getError("amount")}</p>}
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
              <Button onClick={() => { if (!payValidation.validateAll({ amount: payAmount, payment_method: payMethod })) return; payMutation.mutate(); }} disabled={!payAmount || Number(payAmount) <= 0 || payMutation.isPending} className="w-full bg-gradient-to-r from-primary to-primary/80">
                {payMutation.isPending ? "Recording..." : <><CheckCircle2 className="h-4 w-4 mr-1" /> Record Payment</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== Edit Credit Limit ===== */}
        <Dialog open={!!editLimitDialog} onOpenChange={v => { if (!v) setEditLimitDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Credit Limit</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">For <span className="font-semibold text-foreground">{editLimitDialog?.customers?.name}</span>. Set 0 for unlimited.</p>
              <div>
                <Label>Credit Limit</Label>
                <Input type="number" value={newLimit} onChange={e => { setNewLimit(e.target.value); limitValidation.clearField("credit_limit"); }} placeholder="0 = unlimited" className="text-lg font-semibold" error={!!limitValidation.getError("credit_limit")} />
                {limitValidation.getError("credit_limit") && <p className="text-xs text-destructive mt-1 animate-fade-in">{limitValidation.getError("credit_limit")}</p>}
              </div>
              <Button onClick={() => { if (!limitValidation.validateAll({ credit_limit: newLimit })) return; updateCreditLimit(); }} className="w-full">Save Limit</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== Transaction History ===== */}
        <Dialog open={!!txDialog} onOpenChange={v => { if (!v) setTxDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Transaction History
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

export default CustomerCredits;
