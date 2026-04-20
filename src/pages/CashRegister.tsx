import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, AlertTriangle, CheckCircle2, Clock, Wallet, Plus, Minus, Printer,
  TrendingUp, TrendingDown, Eye, BookOpen, Sparkles, Calculator, Download,
  Banknote, ArrowUpRight, ArrowDownRight, Activity, ShieldCheck, Timer, Coins,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format as formatDate, differenceInMinutes, startOfDay, endOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Line, LineChart, Area, AreaChart } from "recharts";

const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const CashRegister = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { user } = useAuth();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [openAmount, setOpenAmount] = useState("");
  const [closeAmount, setCloseAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [movementType, setMovementType] = useState<"in" | "out">("in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [shiftDetailDialog, setShiftDetailDialog] = useState<any>(null);
  const [denomDialogOpen, setDenomDialogOpen] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["cash-shifts", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_register_shifts")
        .select("*")
        .eq("store_id", storeId!)
        .order("opened_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Today's POS cash sales for reconciliation
  const { data: todaysCashSales = 0 } = useQuery({
    queryKey: ["pos-cash-today", storeId],
    enabled: ready,
    queryFn: async () => {
      const start = startOfDay(new Date()).toISOString();
      const end = endOfDay(new Date()).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("total_amount, payment_method")
        .eq("store_id", storeId!)
        .gte("created_at", start)
        .lte("created_at", end);
      if (error) return 0;
      return (data || [])
        .filter((o: any) => (o.payment_method || "").toLowerCase().includes("cash"))
        .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`cash-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_register_shifts", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["cash-shifts", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const activeShift = shifts.find((s: any) => s.status === "open");
  const closedShifts = shifts.filter((s: any) => s.status === "closed");

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cash_register_shifts").insert({
        store_id: storeId!, user_id: userId!,
        opening_balance: Number(openAmount) || 0,
        opened_by: user?.email || "",
        status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setOpenAmount("");
      toast.success("Shift opened — happy selling!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return;
      const closing = Number(closeAmount) || 0;
      const expected = Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out);
      const mismatch = closing - expected;
      const { error } = await supabase.from("cash_register_shifts").update({
        closing_balance: closing,
        expected_balance: expected,
        mismatch,
        notes: closeNotes,
        status: "closed",
        closed_at: new Date().toISOString(),
      }).eq("id", activeShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setCloseDialogOpen(false);
      setCloseAmount("");
      setCloseNotes("");
      toast.success("Shift closed successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cashMovementMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return;
      const amount = Number(movementAmount) || 0;
      if (amount <= 0) throw new Error("Invalid amount");

      if (movementType === "in") {
        await supabase.from("cash_register_shifts").update({
          cash_in: Number(activeShift.cash_in) + amount,
          notes: [activeShift.notes, `+${amount} (${movementReason || "Manual cash in"})`].filter(Boolean).join(" | "),
        }).eq("id", activeShift.id);
      } else {
        await supabase.from("cash_register_shifts").update({
          cash_out: Number(activeShift.cash_out) + amount,
          notes: [activeShift.notes, `-${amount} (${movementReason || "Manual cash out"})`].filter(Boolean).join(" | "),
        }).eq("id", activeShift.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setCashMovementOpen(false);
      setMovementAmount("");
      setMovementReason("");
      toast.success(`Cash ${movementType === "in" ? "added" : "removed"} successfully`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const printShiftReport = (shift: any) => {
    const expected = Number(shift.opening_balance) + Number(shift.cash_in) - Number(shift.cash_out);
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Shift Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:15px;max-width:300px;margin:0 auto}h2{text-align:center;margin-bottom:10px}.row{display:flex;justify-content:space-between;padding:3px 0}.sep{border-top:1px dashed #333;margin:8px 0}.bold{font-weight:bold}.red{color:red}</style></head><body>
      <h2>Cash Register Report</h2>
      <div class="sep"></div>
      <div class="row"><span>Opened:</span><span>${formatDate(new Date(shift.opened_at), "dd MMM yyyy HH:mm")}</span></div>
      ${shift.closed_at ? `<div class="row"><span>Closed:</span><span>${formatDate(new Date(shift.closed_at), "dd MMM yyyy HH:mm")}</span></div>` : ""}
      <div class="row"><span>Opened By:</span><span>${shift.opened_by || "—"}</span></div>
      <div class="sep"></div>
      <div class="row bold"><span>Opening:</span><span>${Number(shift.opening_balance).toFixed(2)}</span></div>
      <div class="row"><span>Cash In:</span><span>+${Number(shift.cash_in).toFixed(2)}</span></div>
      <div class="row"><span>Cash Out:</span><span>-${Number(shift.cash_out).toFixed(2)}</span></div>
      <div class="sep"></div>
      <div class="row bold"><span>Expected:</span><span>${expected.toFixed(2)}</span></div>
      ${shift.closing_balance != null ? `<div class="row bold"><span>Actual:</span><span>${Number(shift.closing_balance).toFixed(2)}</span></div>` : ""}
      ${shift.mismatch != null && Number(shift.mismatch) !== 0 ? `<div class="row bold red"><span>Mismatch:</span><span>${Number(shift.mismatch).toFixed(2)}</span></div>` : ""}
      ${shift.notes ? `<div class="sep"></div><div><strong>Notes:</strong><br>${shift.notes}</div>` : ""}
      <script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  const exportCSV = () => {
    const rows = [
      ["Date", "Opened By", "Opening", "Cash In", "Cash Out", "Expected", "Closing", "Mismatch", "Notes"],
      ...closedShifts.map((s: any) => [
        formatDate(new Date(s.opened_at), "yyyy-MM-dd HH:mm"),
        s.opened_by || "",
        s.opening_balance, s.cash_in, s.cash_out,
        s.expected_balance, s.closing_balance, s.mismatch,
        (s.notes || "").replace(/,/g, ";"),
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cash-register-${formatDate(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  // Denomination counter total
  const denomTotal = useMemo(
    () => DENOMINATIONS.reduce((s, d) => s + d * (Number(denomCounts[d]) || 0), 0),
    [denomCounts]
  );
  const applyDenomTotal = () => {
    setCloseAmount(String(denomTotal));
    setDenomDialogOpen(false);
    toast.success("Cash count applied");
  };

  // Chart data
  const chartData = closedShifts.slice(0, 7).reverse().map((s: any) => ({
    date: formatDate(new Date(s.opened_at), "dd MMM"),
    cashIn: Number(s.cash_in) || 0,
    cashOut: Number(s.cash_out) || 0,
    mismatch: Number(s.mismatch) || 0,
  }));

  // Stats
  const totalMismatch = closedShifts.reduce((s: number, sh: any) => s + Math.abs(Number(sh.mismatch) || 0), 0);
  const shiftsWithMismatch = closedShifts.filter((s: any) => Number(s.mismatch) !== 0).length;
  const matchRate = closedShifts.length > 0 ? Math.round(((closedShifts.length - shiftsWithMismatch) / closedShifts.length) * 100) : 100;
  const totalCashIn = closedShifts.reduce((s: number, sh: any) => s + Number(sh.cash_in || 0), 0);

  // Active shift live values
  const expectedCash = activeShift
    ? Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out)
    : 0;
  const shiftDuration = activeShift
    ? differenceInMinutes(new Date(), new Date(activeShift.opened_at))
    : 0;
  const reconciliationGap = activeShift
    ? (Number(activeShift.cash_in) || 0) - todaysCashSales
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-24 md:pb-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                <Banknote className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Cash Register</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Live shift control · denomination counting · reconciliation</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!closedShifts.length}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <BookOpen className="h-4 w-4" /> Guide
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Cash Register — Master Guide</SheetTitle>
                  <SheetDescription>End-to-end shift management & cash reconciliation</SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-6 text-sm">
                  {[
                    { icon: Wallet, title: "1 · Open Shift", desc: "Count physical cash in your drawer at the start of your day. Enter that amount as Opening Balance and click Open Shift. Only one shift can be active per store at a time." },
                    { icon: ArrowUpRight, title: "2 · Cash In", desc: "Use Cash In for any non-sales money entering the drawer (loan repayment, bank withdrawal, owner top-up). POS cash sales are tracked separately under Today's POS Cash." },
                    { icon: ArrowDownRight, title: "3 · Cash Out", desc: "Record petty cash, supplier payments, owner draws or any cash leaving the drawer. Always add a reason — it appears in the audit trail." },
                    { icon: Calculator, title: "4 · Denomination Counter", desc: "When closing, click 'Count Denominations' to enter ₹2000, ₹500, ₹100… notes and coins. The system multiplies and totals automatically — perfect for accurate cash counts." },
                    { icon: ShieldCheck, title: "5 · Reconciliation", desc: "We compare your POS cash sales with shift cash-in to flag any leakage. A green tick means everything matches; a red gap means missing cash." },
                    { icon: AlertTriangle, title: "6 · Mismatch Detection", desc: "Closing < Expected = shortage (theft / wrong change / unrecorded expense). Closing > Expected = surplus (uncounted sale / extra deposit). Investigate every mismatch." },
                    { icon: Printer, title: "7 · Print & Export", desc: "Print thermal receipts for each shift or export the full history to CSV for accountant/auditor reconciliation." },
                    { icon: Activity, title: "8 · Match Rate KPI", desc: "Track your team's accuracy over time. Aim for 95%+ match rate. Persistent mismatches usually indicate training gaps or process issues." },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <step.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold mb-1">{step.title}</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4">
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Pro Tip</p>
                    <p className="text-xs text-muted-foreground">Close your shift at the same time daily. Consistent timing makes mismatch patterns easier to spot and prevents end-of-day confusion.</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* ACTIVE SHIFT — Premium Live Card */}
        {activeShift ? (
          <Card className="relative overflow-hidden border-0 shadow-xl shadow-emerald-500/10">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent" />
            <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/10 rounded-full blur-3xl" />
            <CardContent className="relative p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <div className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Live Shift</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5">
                    <Timer className="h-3 w-3 mr-1" />
                    {Math.floor(shiftDuration / 60)}h {shiftDuration % 60}m
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatDate(new Date(activeShift.opened_at), "dd MMM, hh:mm a")} · {activeShift.opened_by}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                <div className="rounded-xl bg-background/60 backdrop-blur border border-border/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Opening</p>
                  <p className="text-base sm:text-lg font-bold">{format(Number(activeShift.opening_balance))}</p>
                </div>
                <div className="rounded-xl bg-background/60 backdrop-blur border border-border/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Cash In</p>
                  <p className="text-base sm:text-lg font-bold text-emerald-600">{format(Number(activeShift.cash_in))}</p>
                </div>
                <div className="rounded-xl bg-background/60 backdrop-blur border border-border/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-destructive mb-1 flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />Cash Out</p>
                  <p className="text-base sm:text-lg font-bold text-destructive">{format(Number(activeShift.cash_out))}</p>
                </div>
                <div className="rounded-xl bg-background/60 backdrop-blur border border-border/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">POS Sales (cash)</p>
                  <p className="text-base sm:text-lg font-bold text-blue-600">{format(todaysCashSales)}</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-primary mb-1 font-semibold">Expected in Drawer</p>
                  <p className="text-base sm:text-xl font-extrabold text-primary">{format(expectedCash)}</p>
                </div>
              </div>

              {/* Reconciliation hint */}
              {todaysCashSales > 0 && (
                <div className={`rounded-lg p-2.5 mb-4 text-xs flex items-center gap-2 ${
                  Math.abs(reconciliationGap) < 1 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>
                  {Math.abs(reconciliationGap) < 1 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  <span>
                    POS cash sales <strong>{format(todaysCashSales)}</strong> vs Cash In <strong>{format(Number(activeShift.cash_in))}</strong>
                    {Math.abs(reconciliationGap) >= 1 && ` · Gap ${format(reconciliationGap)} — review entries`}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" onClick={() => { setMovementType("in"); setCashMovementOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Cash In
                </Button>
                <Button variant="outline" size="sm" className="border-destructive/30 hover:bg-destructive/10 text-destructive" onClick={() => { setMovementType("out"); setCashMovementOpen(true); }}>
                  <Minus className="h-3.5 w-3.5 mr-1" /> Cash Out
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDenomCounts({}); setDenomDialogOpen(true); }}>
                  <Calculator className="h-3.5 w-3.5 mr-1" /> Count Drawer
                </Button>
                <Button size="sm" className="ml-auto bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20" onClick={() => setCloseDialogOpen(true)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Close Shift
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed bg-gradient-to-br from-muted/30 to-transparent">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
                <div className="flex items-center gap-3 sm:flex-1">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Opening Balance — start a new shift</Label>
                    <Input type="number" value={openAmount} onChange={e => setOpenAmount(e.target.value)} placeholder="0.00" className="mt-1 h-11 text-lg font-semibold" />
                  </div>
                </div>
                <Button onClick={() => openShiftMutation.mutate()} disabled={openShiftMutation.isPending} className="h-11 px-6 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20">
                  <Wallet className="h-4 w-4 mr-2" /> Open Shift
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PREMIUM KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Shifts", value: closedShifts.length, icon: Clock, color: "text-primary", bg: "from-primary/10 to-primary/5", trend: null },
            { label: "Total Cash In", value: format(totalCashIn), icon: TrendingUp, color: "text-emerald-600", bg: "from-emerald-500/10 to-emerald-500/5", trend: null },
            { label: "Mismatched", value: shiftsWithMismatch, icon: AlertTriangle, color: "text-amber-600", bg: "from-amber-500/10 to-amber-500/5", trend: format(totalMismatch) },
            { label: "Match Rate", value: `${matchRate}%`, icon: ShieldCheck, color: matchRate >= 95 ? "text-emerald-600" : matchRate >= 80 ? "text-amber-600" : "text-destructive", bg: matchRate >= 95 ? "from-emerald-500/10 to-emerald-500/5" : "from-amber-500/10 to-amber-500/5", trend: null },
          ].map((kpi, i) => (
            <Card key={i} className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.bg}`} />
              <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">{kpi.label}</p>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className={`text-xl sm:text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
                {kpi.trend && <p className="text-[10px] text-muted-foreground mt-0.5">Total: {kpi.trend}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* MATCH RATE BAR */}
        {closedShifts.length > 0 && (
          <Card className="border-0 shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Cash Accuracy Score</p>
                <span className="text-xs text-muted-foreground">{closedShifts.length - shiftsWithMismatch} of {closedShifts.length} shifts matched</span>
              </div>
              <Progress value={matchRate} className="h-2" />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>0%</span><span>Target 95%</span><span>100%</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CHART */}
        {chartData.length > 0 && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Shift Cash Flow — Last 7</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient>
                    <linearGradient id="cOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
                  <Area type="monotone" dataKey="cashIn" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cIn)" name="Cash In" />
                  <Area type="monotone" dataKey="cashOut" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#cOut)" name="Cash Out" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* SHIFT HISTORY */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Shift History</CardTitle>
            <Badge variant="secondary">{closedShifts.length} shifts</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-2 p-3">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : closedShifts.length === 0 ? (
                <div className="text-center py-10">
                  <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-muted-foreground text-sm">No closed shifts yet</p>
                </div>
              ) : closedShifts.map((s: any) => {
                const matched = Number(s.mismatch) === 0;
                return (
                  <div key={s.id} className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-sm">{formatDate(new Date(s.opened_at), "dd MMM yyyy")}</p>
                        <p className="text-[11px] text-muted-foreground">{s.opened_by || "—"}</p>
                      </div>
                      {matched ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Matched</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{format(Number(s.mismatch))}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2.5 text-center">
                      <div className="rounded-lg bg-background/60 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Opening</p>
                        <p className="font-bold text-xs">{format(Number(s.opening_balance))}</p>
                      </div>
                      <div className="rounded-lg bg-background/60 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Closing</p>
                        <p className="font-bold text-xs">{format(Number(s.closing_balance))}</p>
                      </div>
                      <div className="rounded-lg bg-background/60 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Net</p>
                        <p className="font-bold text-xs text-emerald-600">+{format(Number(s.cash_in) - Number(s.cash_out))}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => printShiftReport(s)}>
                        <Printer className="h-3 w-3 mr-1" /> Print
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setShiftDetailDialog(s)}>
                        <Eye className="h-3 w-3 mr-1" /> Details
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
                    <TableHead>Opened By</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Cash In</TableHead>
                    <TableHead className="text-right">Cash Out</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : closedShifts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12">
                      <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-muted-foreground">No closed shifts yet</p>
                    </TableCell></TableRow>
                  ) : closedShifts.map((s: any) => {
                    const matched = Number(s.mismatch) === 0;
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">{formatDate(new Date(s.opened_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.opened_by || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{format(Number(s.opening_balance))}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">+{format(Number(s.cash_in))}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">-{format(Number(s.cash_out))}</TableCell>
                        <TableCell className="text-right font-bold">{format(Number(s.closing_balance))}</TableCell>
                        <TableCell>
                          {matched ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Matched</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{format(Number(s.mismatch))}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => printShiftReport(s)} title="Print"><Printer className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setShiftDetailDialog(s)} title="Details"><Eye className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* CASH MOVEMENT DIALOG */}
        <Dialog open={cashMovementOpen} onOpenChange={setCashMovementOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {movementType === "in" ? <><ArrowUpRight className="h-5 w-5 text-emerald-600" /> Add Cash In</> : <><ArrowDownRight className="h-5 w-5 text-destructive" /> Record Cash Out</>}
              </DialogTitle>
              <DialogDescription>{movementType === "in" ? "Money entering drawer outside of POS sales" : "Money leaving the drawer (petty cash, payments)"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Amount</Label>
                <Input type="number" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} placeholder="0.00" className="mt-1 h-11 text-lg font-semibold" autoFocus />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[100, 500, 1000, 2000, 5000].map(q => (
                    <Button key={q} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMovementAmount(String(q))}>+{q}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={movementReason} onChange={e => setMovementReason(e.target.value)} placeholder={movementType === "in" ? "e.g. Loan repayment received" : "e.g. Petty cash withdrawal"} className="mt-1" />
              </div>
              <Button onClick={() => cashMovementMutation.mutate()} disabled={!movementAmount || cashMovementMutation.isPending} className="w-full h-11">
                {cashMovementMutation.isPending ? "Recording..." : `Record Cash ${movementType === "in" ? "In" : "Out"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DENOMINATION COUNTER DIALOG */}
        <Dialog open={denomDialogOpen} onOpenChange={setDenomDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Cash Denomination Counter</DialogTitle>
              <DialogDescription>Count physical notes & coins — total is calculated automatically</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {DENOMINATIONS.map(d => {
                const count = Number(denomCounts[d]) || 0;
                const subtotal = d * count;
                return (
                  <div key={d} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20">
                    <Badge variant="outline" className="font-mono w-14 justify-center">×{d}</Badge>
                    <Input
                      type="number"
                      min={0}
                      value={denomCounts[d] || ""}
                      onChange={e => setDenomCounts({ ...denomCounts, [d]: e.target.value })}
                      placeholder="0"
                      className="h-9 flex-1 text-center"
                    />
                    <span className="text-sm font-semibold w-24 text-right tabular-nums">{format(subtotal)}</span>
                  </div>
                );
              })}
            </div>
            <Separator />
            <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
              <span className="font-semibold">Total Counted</span>
              <span className="text-xl font-extrabold text-primary tabular-nums">{format(denomTotal)}</span>
            </div>
            <Button onClick={applyDenomTotal} className="w-full" disabled={denomTotal === 0}>
              Use this total as Closing Balance
            </Button>
          </DialogContent>
        </Dialog>

        {/* CLOSE SHIFT DIALOG */}
        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Close Shift & Reconcile</DialogTitle>
              <DialogDescription>Compare physical drawer count with system-expected balance</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Opening</span><span className="font-medium">{format(Number(activeShift?.opening_balance || 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cash In</span><span className="text-emerald-600 font-medium">+{format(Number(activeShift?.cash_in || 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cash Out</span><span className="text-destructive font-medium">-{format(Number(activeShift?.cash_out || 0))}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between font-bold"><span>Expected in Drawer</span><span className="text-primary">{format(expectedCash)}</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Actual Closing Balance</Label>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDenomCounts({}); setDenomDialogOpen(true); }}>
                    <Calculator className="h-3 w-3 mr-1" /> Count
                  </Button>
                </div>
                <Input type="number" value={closeAmount} onChange={e => setCloseAmount(e.target.value)} placeholder="Count your cash" className="h-11 text-lg font-semibold" />
              </div>
              {closeAmount && activeShift && (() => {
                const mm = Number(closeAmount) - expectedCash;
                const ok = Math.abs(mm) < 0.01;
                return (
                  <div className={`p-3 rounded-lg border ${ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" : mm < 0 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"}`}>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {ok ? "Perfect match!" : `${mm > 0 ? "Surplus" : "Shortage"}: ${format(Math.abs(mm))}`}
                    </p>
                    {!ok && <p className="text-xs mt-1 opacity-80">{mm < 0 ? "Drawer has less cash than expected — investigate" : "Extra cash — possible unrecorded sale"}</p>}
                  </div>
                );
              })()}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Reason for mismatch, anything to flag..." rows={2} className="mt-1" />
              </div>
              <Button onClick={() => closeShiftMutation.mutate()} disabled={!closeAmount || closeShiftMutation.isPending} className="w-full h-11">
                {closeShiftMutation.isPending ? "Closing..." : "Confirm & Close Shift"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* SHIFT DETAIL DIALOG */}
        <Dialog open={!!shiftDetailDialog} onOpenChange={v => { if (!v) setShiftDetailDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Shift Details</DialogTitle></DialogHeader>
            {shiftDetailDialog && (
              <Tabs defaultValue="summary">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="audit">Audit Trail</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-2.5 text-sm">
                    <div className="rounded-lg bg-muted/40 p-2.5"><p className="text-[10px] uppercase text-muted-foreground">Opened</p><p className="font-semibold">{formatDate(new Date(shiftDetailDialog.opened_at), "dd MMM HH:mm")}</p></div>
                    <div className="rounded-lg bg-muted/40 p-2.5"><p className="text-[10px] uppercase text-muted-foreground">Closed</p><p className="font-semibold">{shiftDetailDialog.closed_at ? formatDate(new Date(shiftDetailDialog.closed_at), "dd MMM HH:mm") : "—"}</p></div>
                    <div className="rounded-lg bg-muted/40 p-2.5"><p className="text-[10px] uppercase text-muted-foreground">Opening</p><p className="font-bold">{format(Number(shiftDetailDialog.opening_balance))}</p></div>
                    <div className="rounded-lg bg-muted/40 p-2.5"><p className="text-[10px] uppercase text-muted-foreground">Closing</p><p className="font-bold">{format(Number(shiftDetailDialog.closing_balance))}</p></div>
                    <div className="rounded-lg bg-emerald-500/10 p-2.5"><p className="text-[10px] uppercase text-emerald-600">Cash In</p><p className="font-bold text-emerald-600">+{format(Number(shiftDetailDialog.cash_in))}</p></div>
                    <div className="rounded-lg bg-destructive/10 p-2.5"><p className="text-[10px] uppercase text-destructive">Cash Out</p><p className="font-bold text-destructive">-{format(Number(shiftDetailDialog.cash_out))}</p></div>
                    <div className="rounded-lg bg-primary/10 p-2.5 col-span-2"><p className="text-[10px] uppercase text-primary">Expected vs Actual</p><p className="font-bold">{format(Number(shiftDetailDialog.expected_balance))} → {format(Number(shiftDetailDialog.closing_balance))}</p></div>
                    <div className={`rounded-lg p-2.5 col-span-2 ${Number(shiftDetailDialog.mismatch) === 0 ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                      <p className={`text-[10px] uppercase ${Number(shiftDetailDialog.mismatch) === 0 ? "text-emerald-600" : "text-destructive"}`}>Mismatch</p>
                      <p className={`font-extrabold text-lg ${Number(shiftDetailDialog.mismatch) !== 0 ? "text-destructive" : "text-emerald-600"}`}>{format(Number(shiftDetailDialog.mismatch))}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => printShiftReport(shiftDetailDialog)}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Receipt
                  </Button>
                </TabsContent>
                <TabsContent value="audit" className="pt-3">
                  {shiftDetailDialog.notes ? (
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">
                      <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Audit Log</p>
                      <div className="space-y-1.5">
                        {shiftDetailDialog.notes.split(" | ").map((n: string, i: number) => (
                          <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-background border-l-2 border-primary">{n}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center py-6 text-sm text-muted-foreground">No audit entries</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default CashRegister;
