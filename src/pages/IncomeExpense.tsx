import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { validateWithToast, transactionSchema } from "@/lib/validations";
import {
  Plus, Trash2, Pencil, TrendingUp, TrendingDown, ArrowUpDown, Search,
  Download, Calendar, DollarSign, Wallet, PiggyBank, BarChart3,
  FileText, Sparkles, Lightbulb, ShieldCheck, Zap, Target, ArrowUpRight,
  ArrowDownRight, Activity, CreditCard
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isWithinInterval, subDays, startOfDay, isToday } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  is_paid: boolean;
  created_at: string;
  store_id: string | null;
}

const CHART_COLORS = [
  "hsl(142 76% 36%)", "hsl(217 91% 60%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)",
  "hsl(262 83% 58%)", "hsl(330 81% 60%)", "hsl(189 94% 43%)", "hsl(24 95% 53%)"
];

const INCOME_CATEGORIES = ["Salary", "Freelance", "Sales", "Investment", "Gift", "Refund", "Other Income"];
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Food", "Transport", "Marketing", "Supplies", "Salary Payment", "Tax", "Other Expense"];

type DatePreset = "today" | "week" | "month" | "last30" | "last90" | "year" | "all" | "custom";

const IncomeExpense = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { format: formatCurrency, symbol } = useCurrency();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    amount: "",
    category: "",
    note: "",
    created_at: new Date()
  });
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("store_id", activeStore.id)
      .eq("is_paid", true)
      .order("created_at", { ascending: false });
    if (data) setTxns(data as Transaction[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => {
    if (user && activeStore) fetchData();
  }, [user, activeStore, fetchData]);

  useEffect(() => {
    if (!user || !activeStore) return;
    const channel = supabase
      .channel(`transactions-${activeStore.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "transactions",
        filter: `store_id=eq.${activeStore.id}`
      }, () => fetchData());
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeStore, fetchData]);

  const getDateRange = useCallback((): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: new Date() };
      case "week": return { from: startOfWeek(new Date()), to: endOfWeek(new Date()) };
      case "month": return { from: startOfMonth(new Date()), to: endOfMonth(new Date()) };
      case "last30": return { from: subDays(new Date(), 30), to: new Date() };
      case "last90": return { from: subDays(new Date(), 90), to: new Date() };
      case "year": return { from: new Date(new Date().getFullYear(), 0, 1), to: new Date() };
      case "custom":
        if (customDateFrom && customDateTo) return { from: customDateFrom, to: customDateTo };
        return null;
      case "all": return null;
      default: return null;
    }
  }, [datePreset, customDateFrom, customDateTo]);

  const filtered = useMemo(() => {
    const range = getDateRange();
    return txns.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && (t.category || "Uncategorized") !== categoryFilter) return false;
      if (search && ![t.category, t.note].some((f) => (f || "").toLowerCase().includes(search.toLowerCase()))) return false;
      if (range) {
        const d = new Date(t.created_at);
        if (!isWithinInterval(d, { start: range.from, end: range.to })) return false;
      }
      return true;
    });
  }, [txns, typeFilter, categoryFilter, search, getDateRange]);

  const stats = useMemo(() => {
    const income = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const txCount = filtered.length;
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    const burnRate = income > 0 ? (expense / income) * 100 : (expense > 0 ? 100 : 0);
    const avgTxn = txCount > 0 ? (income + expense) / txCount : 0;
    return { income, expense, net: income - expense, txCount, savingsRate, burnRate, avgTxn };
  }, [filtered]);

  // Today's snapshot
  const todayStats = useMemo(() => {
    const today = txns.filter((t) => isToday(new Date(t.created_at)));
    const income = today.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = today.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, count: today.length };
  }, [txns]);

  // Period over period comparison (prev period)
  const prevPeriodStats = useMemo(() => {
    const range = getDateRange();
    if (!range) return null;
    const periodMs = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - periodMs);
    const prevTo = new Date(range.from.getTime());
    const prev = txns.filter((t) => {
      const d = new Date(t.created_at);
      return d >= prevFrom && d < prevTo;
    });
    const income = prev.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = prev.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense };
  }, [txns, getDateRange]);

  const incomeChange = prevPeriodStats && prevPeriodStats.income > 0
    ? ((stats.income - prevPeriodStats.income) / prevPeriodStats.income) * 100 : null;
  const expenseChange = prevPeriodStats && prevPeriodStats.expense > 0
    ? ((stats.expense - prevPeriodStats.expense) / prevPeriodStats.expense) * 100 : null;

  const categoryData = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    filtered.forEach((t) => {
      const c = t.category || "Uncategorized";
      if (!map[c]) map[c] = { income: 0, expense: 0 };
      map[c][t.type] += Number(t.amount);
    });
    return Object.entries(map)
      .map(([name, vals]) => ({ name, value: vals.income + vals.expense, ...vals }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topExpenseCategories = useMemo(() =>
    categoryData.filter(c => c.expense > 0).sort((a, b) => b.expense - a.expense).slice(0, 5)
  , [categoryData]);

  const topIncomeCategories = useMemo(() =>
    categoryData.filter(c => c.income > 0).sort((a, b) => b.income - a.income).slice(0, 5)
  , [categoryData]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, { month: string; income: number; expense: number }> = {};
    filtered.forEach((t) => {
      const m = format(new Date(t.created_at), "MMM yy");
      if (!map[m]) map[m] = { month: m, income: 0, expense: 0 };
      map[m][t.type] += Number(t.amount);
    });
    return Object.values(map).reverse();
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const map: Record<string, { day: string; income: number; expense: number }> = {};
    filtered.slice(0, 100).forEach((t) => {
      const d = format(new Date(t.created_at), "dd MMM");
      if (!map[d]) map[d] = { day: d, income: 0, expense: 0 };
      map[d][t.type] += Number(t.amount);
    });
    return Object.values(map).reverse().slice(-14);
  }, [filtered]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    txns.forEach((t) => cats.add(t.category || "Uncategorized"));
    return Array.from(cats).sort();
  }, [txns]);

  const openAdd = (type: "income" | "expense") => {
    setEditId(null);
    setForm({ type, amount: "", category: "", note: "", created_at: new Date() });
    setSheetOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setEditId(t.id);
    setForm({
      type: t.type, amount: String(t.amount), category: t.category || "",
      note: t.note || "", created_at: new Date(t.created_at)
    });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateWithToast(transactionSchema, {
      type: form.type, amount: form.amount, category: form.category, note: form.note,
    }, toast.error);
    if (!parsed) return;
    const payload = {
      type: form.type, amount: Number(form.amount), category: form.category,
      note: form.note, is_paid: true, created_at: form.created_at.toISOString()
    };
    if (editId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Transaction updated!");
    } else {
      const { error } = await supabase.from("transactions").insert({
        ...payload, user_id: effectiveUserId!, store_id: activeStore?.id
      });
      if (error) toast.error(error.message); else toast.success("Transaction added!");
    }
    setSheetOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("transactions").delete().eq("id", id);
    toast.success("Transaction deleted");
    fetchData();
  };

  const exportCSV = () => {
    const headers = ["Date", "Type", "Category", "Amount", "Note"];
    const rows = filtered.map((t) => [
      format(new Date(t.created_at), "yyyy-MM-dd"), t.type,
      t.category || "Uncategorized", Number(t.amount).toFixed(2),
      `"${(t.note || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `income-expense-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const currentCategories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Premium Hero Header */}
        <Card className="rounded-2xl border-border/50 overflow-hidden relative bg-gradient-to-br from-primary/5 via-background to-background">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-0" />
          <CardContent className="!p-5 sm:!p-6 relative">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shrink-0">
                  <Wallet className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Income & Expense</h1>
                    <Badge variant="secondary" className="gap-1 text-[10px] font-semibold">
                      <Sparkles className="h-3 w-3" /> PREMIUM
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Track cashflow, savings rate, category breakdown & financial health
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setGuideOpen(!guideOpen)} className="gap-1.5 rounded-xl">
                  <Lightbulb className="h-4 w-4" /> Guide
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                      <Download className="h-4 w-4" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={exportCSV}>
                      <FileText className="h-4 w-4 mr-2" /> Export CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => openAdd("expense")} className="gap-1.5 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10">
                  <TrendingDown className="h-4 w-4" /> Expense
                </Button>
                <Button size="sm" onClick={() => openAdd("income")} className="gap-1.5 rounded-xl shadow-md bg-green-600 hover:bg-green-700 text-white">
                  <TrendingUp className="h-4 w-4" /> Income
                </Button>
              </div>
            </div>

            {/* Today's snapshot strip */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3 pt-4 border-t border-border/40">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Today In</p>
                  <p className="text-sm font-bold text-green-600 tabular-nums truncate">{formatCurrency(todayStats.income, 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Today Out</p>
                  <p className="text-sm font-bold text-destructive tabular-nums truncate">{formatCurrency(todayStats.expense, 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Today Txns</p>
                  <p className="text-sm font-bold tabular-nums">{todayStats.count}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Guide Section */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <CollapsibleContent>
            <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="!p-5 sm:!p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Income & Expense Quick Guide</h3>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">Close</Button>
                  </CollapsibleTrigger>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { icon: Plus, title: "1. Record", desc: "Click Add Income or Expense to log every transaction. Pick a category and date.", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
                    { icon: Target, title: "2. Categorize", desc: "Use clear categories (Rent, Marketing, Salary) so reports show where money flows.", color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
                    { icon: BarChart3, title: "3. Analyze", desc: "Switch period (Today/Week/Month) to see savings rate, burn rate & trends with prev-period comparison.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
                    { icon: Download, title: "4. Export", desc: "Download CSV anytime for accounting, tax filing or sharing with your accountant.", color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
                  ].map((step, i) => (
                    <div key={i} className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                      <div className={`h-9 w-9 rounded-xl ${step.color} flex items-center justify-center`}>
                        <step.icon className="h-4 w-4" />
                      </div>
                      <p className="font-semibold text-sm">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-3 flex gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <strong>Pro tip:</strong> POS sales auto-sync as Income. Aim for a savings rate above 20% — anything over 50% is excellent for a healthy business.
                  </p>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Compact Premium KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Total Income", value: formatCurrency(stats.income, 0),
              sub: incomeChange !== null ? `${incomeChange >= 0 ? "↑" : "↓"} ${Math.abs(incomeChange).toFixed(1)}% vs prev` : "Track your earnings",
              icon: TrendingUp, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", border: "border-l-green-500",
              trendColor: incomeChange !== null && incomeChange >= 0 ? "text-green-600" : "text-destructive",
            },
            {
              label: "Total Expense", value: formatCurrency(stats.expense, 0),
              sub: expenseChange !== null ? `${expenseChange >= 0 ? "↑" : "↓"} ${Math.abs(expenseChange).toFixed(1)}% vs prev` : "Track your spending",
              icon: TrendingDown, color: "text-destructive", bg: "bg-red-100 dark:bg-red-900/30", border: "border-l-red-500",
              trendColor: expenseChange !== null && expenseChange <= 0 ? "text-green-600" : "text-destructive",
            },
            {
              label: "Net Profit/Loss", value: `${stats.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(stats.net), 0)}`,
              sub: `${stats.savingsRate.toFixed(1)}% savings rate`,
              icon: PiggyBank, color: stats.net >= 0 ? "text-green-600" : "text-destructive",
              bg: "bg-primary/10", border: "border-l-primary", trendColor: "text-muted-foreground",
            },
            {
              label: "Transactions", value: String(stats.txCount),
              sub: `Avg ${formatCurrency(stats.avgTxn, 0)}`,
              icon: Activity, color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30", border: "border-l-violet-500",
              trendColor: "text-muted-foreground",
            },
          ].map((s, i) => (
            <Card key={i} className={`rounded-2xl border-l-4 ${s.border} hover:shadow-md transition-all`}>
              <CardContent className="!p-3.5 sm:!p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 shrink-0 rounded-xl ${s.bg} flex items-center justify-center`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
                    {loading ? <Skeleton className="h-6 w-20 mt-1" /> : (
                      <p className={`text-lg sm:text-xl font-bold tabular-nums ${s.color} mt-0.5 truncate`}>{s.value}</p>
                    )}
                    <p className={`text-[10px] truncate mt-0.5 ${s.trendColor}`}>{s.sub}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Health Bar — Savings vs Burn */}
        <Card className="rounded-2xl">
          <CardContent className="!p-4 sm:!p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Financial Health</p>
              </div>
              <Badge variant={stats.savingsRate >= 20 ? "default" : stats.savingsRate >= 0 ? "secondary" : "destructive"} className="text-[10px]">
                {stats.savingsRate >= 50 ? "Excellent" : stats.savingsRate >= 20 ? "Healthy" : stats.savingsRate >= 0 ? "Caution" : "At Risk"}
              </Badge>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Savings Rate</span>
                  <span className="font-semibold text-green-600 tabular-nums">{stats.savingsRate.toFixed(1)}%</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, stats.savingsRate))} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Burn Rate (Expense / Income)</span>
                  <span className="font-semibold text-destructive tabular-nums">{Math.min(999, stats.burnRate).toFixed(1)}%</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, stats.burnRate))} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Analytics / Transactions / Categories */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl h-11 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <ArrowUpDown className="h-3.5 w-3.5" /> Transactions
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <Target className="h-3.5 w-3.5" /> Categories
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="rounded-2xl lg:col-span-2">
                <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Income vs Expense Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                  {loading ? <Skeleton className="h-[220px] w-full" /> : dailyTrend.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                      <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">No trend data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={dailyTrend}>
                        <defs>
                          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" fontSize={10} tickLine={false} />
                        <YAxis fontSize={10} tickLine={false} tickFormatter={(v) => `${symbol}${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} formatter={(value: number) => [formatCurrency(value, 0)]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                        <Area type="monotone" dataKey="income" stroke="hsl(142 76% 36%)" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
                        <Area type="monotone" dataKey="expense" stroke="hsl(var(--destructive))" fill="url(#expenseGrad)" strokeWidth={2} name="Expense" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> By Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                  {loading ? <Skeleton className="h-[220px] w-full" /> : categoryData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                      <DollarSign className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">No category data</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={categoryData.slice(0, 8)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={50} outerRadius={80} paddingAngle={3}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false} fontSize={9}
                        >
                          {categoryData.slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }}
                          formatter={(value: number) => [formatCurrency(value, 0), "Amount"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {monthlyTrend.length > 1 && (
              <Card className="rounded-2xl">
                <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Monthly Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={10} tickLine={false} />
                      <YAxis fontSize={10} tickLine={false} tickFormatter={(v) => `${symbol}${v}`} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} formatter={(value: number) => [formatCurrency(value, 0)]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="income" fill="hsl(142 76% 36%)" radius={[8, 8, 0, 0]} name="Income" />
                      <Bar dataKey="expense" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} name="Expense" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="list" className="space-y-4">
            {/* Filters */}
            <Card className="rounded-2xl">
              <CardContent className="!p-4 sm:!p-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by category or note..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[130px] rounded-xl"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[160px] rounded-xl"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                    <SelectTrigger className="w-full sm:w-[140px] rounded-xl"><SelectValue placeholder="Period" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="last30">Last 30 Days</SelectItem>
                      <SelectItem value="last90">Last 90 Days</SelectItem>
                      <SelectItem value="year">This Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {datePreset === "custom" && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl">
                          <Calendar className="h-3.5 w-3.5" />
                          {customDateFrom ? format(customDateFrom, "dd MMM yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl">
                          <Calendar className="h-3.5 w-3.5" />
                          {customDateTo ? format(customDateTo, "dd MMM yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={customDateTo} onSelect={setCustomDateTo} className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 px-1">
                  <p className="text-xs text-muted-foreground">{filtered.length} transactions</p>
                  <p className="text-xs font-medium">
                    Net: <span className={`font-bold tabular-nums ${stats.net >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {stats.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(stats.net), 0)}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3 pb-safe">
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="rounded-2xl"><CardContent className="!p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
              )) : filtered.length === 0 ? (
                <Card className="rounded-2xl">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <ArrowUpDown className="h-12 w-12 text-muted-foreground/20 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">No transactions found</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">Add your first income or expense</p>
                  </CardContent>
                </Card>
              ) : filtered.map((t) => (
                <Card key={t.id} className="rounded-2xl overflow-hidden">
                  <CardContent className="!p-3.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${t.type === "income" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                          {t.type === "income"
                            ? <TrendingUp className="h-4 w-4 text-green-600" />
                            : <TrendingDown className="h-4 w-4 text-destructive" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{t.category || "Uncategorized"}</p>
                          {t.note && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.note}</p>}
                        </div>
                      </div>
                      <p className={`font-bold text-sm tabular-nums ${t.type === "income" ? "text-green-600" : "text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount, 0)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(t.created_at), "dd MMM yyyy, hh:mm a")}
                      </span>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Card className="rounded-2xl overflow-hidden">
                <CardContent className="!p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                        </TableRow>
                      )) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <ArrowUpDown className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                            <p className="text-muted-foreground text-sm">No transactions found</p>
                          </TableCell>
                        </TableRow>
                      ) : filtered.map((t) => (
                        <TableRow key={t.id} className="group">
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(t.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${t.type === "income"
                              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
                              : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                            }`}>
                              {t.type === "income" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{t.category || "Uncategorized"}</TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${t.type === "income" ? "text-green-600" : "text-destructive"}`}>
                            {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount, 0)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.note || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl">
                <CardHeader className="!p-5 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" /> Top Income Sources
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 pt-0 space-y-2.5">
                  {topIncomeCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No income data</p>
                  ) : topIncomeCategories.map((c) => {
                    const pct = stats.income > 0 ? (c.income / stats.income) * 100 : 0;
                    return (
                      <div key={c.name} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="font-bold text-green-600 tabular-nums">{formatCurrency(c.income, 0)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="!p-5 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-destructive" /> Top Expense Categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 pt-0 space-y-2.5">
                  {topExpenseCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No expense data</p>
                  ) : topExpenseCategories.map((c) => {
                    const pct = stats.expense > 0 ? (c.expense / stats.expense) * 100 : 0;
                    return (
                      <div key={c.name} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="font-bold text-destructive tabular-nums">{formatCurrency(c.expense, 0)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex gap-2">
              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Insight:</strong> Focus on growing your top income source while reducing your largest expense category for the biggest impact on net profit.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {editId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editId ? "Edit" : "Add"} {form.type === "income" ? "Income" : "Expense"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-6">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={form.type === "income" ? "default" : "outline"}
                    className={`rounded-xl ${form.type === "income" ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={() => setForm({ ...form, type: "income", category: "" })}>
                    <TrendingUp className="h-4 w-4 mr-1.5" /> Income
                  </Button>
                  <Button type="button" variant={form.type === "expense" ? "default" : "outline"}
                    className={`rounded-xl ${form.type === "expense" ? "bg-destructive hover:bg-destructive/90" : ""}`}
                    onClick={() => setForm({ ...form, type: "expense", category: "" })}>
                    <TrendingDown className="h-4 w-4 mr-1.5" /> Expense
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Amount ({symbol}) *</Label>
                <Input type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00" required className="text-lg font-semibold rounded-xl" />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {currentCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Or type a custom category..." className="text-sm rounded-xl" />
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl">
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(form.created_at, "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={form.created_at}
                      onSelect={(d) => d && setForm({ ...form, created_at: d })} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3} placeholder="Add a note..." className="rounded-xl" />
              </div>

              <Button type="submit" className="w-full rounded-xl" size="lg">
                {editId ? "Update Transaction" : "Save Transaction"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default IncomeExpense;
