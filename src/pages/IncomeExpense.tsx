import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
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
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, TrendingUp, TrendingDown, ArrowUpDown, Search,
  Download, Calendar, Filter, DollarSign, Wallet, PiggyBank, BarChart3,
  FileText, ChevronDown
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isWithinInterval, subDays } from "date-fns";
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
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7"
];

const INCOME_CATEGORIES = ["Salary", "Freelance", "Sales", "Investment", "Gift", "Refund", "Other Income"];
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Food", "Transport", "Marketing", "Supplies", "Salary Payment", "Tax", "Other Expense"];

type DatePreset = "today" | "week" | "month" | "last30" | "last90" | "year" | "all" | "custom";

const IncomeExpense = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
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

  // Real-time subscription
  useEffect(() => {
    if (!user || !activeStore) return;
    const channel = supabase
      .channel(`transactions-${activeStore.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `store_id=eq.${activeStore.id}`
      }, () => {
        fetchData();
      });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeStore, fetchData]);

  const getDateRange = useCallback((): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: new Date(now.setHours(0, 0, 0, 0)), to: new Date() };
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
    return { income, expense, net: income - expense, txCount };
  }, [filtered]);

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
      type: t.type,
      amount: String(t.amount),
      category: t.category || "",
      note: t.note || "",
      created_at: new Date(t.created_at)
    });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    const payload = {
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      note: form.note,
      is_paid: true,
      created_at: form.created_at.toISOString()
    };
    if (editId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Transaction updated!");
    } else {
      const { error } = await supabase.from("transactions").insert({
        ...payload,
        user_id: user!.id,
        store_id: activeStore?.id
      });
      if (error) toast.error(error.message);
      else toast.success("Transaction added!");
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
      format(new Date(t.created_at), "yyyy-MM-dd"),
      t.type,
      t.category || "Uncategorized",
      Number(t.amount).toFixed(2),
      `"${(t.note || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `income-expense-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const currentCategories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Income & Expense
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Track your financial transactions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportCSV}>
                <FileText className="h-4 w-4 mr-2" /> Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => openAdd("expense")} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10">
            <TrendingDown className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span> Expense
          </Button>
          <Button size="sm" onClick={() => openAdd("income")} className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span> Income
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Total Income</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-lg sm:text-2xl font-bold text-green-600">৳{stats.income.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Total Expense</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-lg sm:text-2xl font-bold text-destructive">৳{stats.expense.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <PiggyBank className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Net Profit/Loss</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className={`text-lg sm:text-2xl font-bold ${stats.net >= 0 ? "text-green-600" : "text-destructive"}`}>
                {stats.net >= 0 ? "+" : ""}৳{stats.net.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -mr-6 -mt-6" />
          <CardContent className="pt-4 pb-3 sm:pt-5 sm:pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-violet-500" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Transactions</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-lg sm:text-2xl font-bold">{stats.txCount}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Income vs Expense Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="day" fontSize={10} tickLine={false} className="fill-muted-foreground" />
                  <YAxis fontSize={10} tickLine={false} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
                  <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2} name="Expense" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : categoryData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                <DollarSign className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No category data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData.slice(0, 8)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={9}
                  >
                    {categoryData.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                    formatter={(value: number) => [`৳${value.toLocaleString()}`, "Amount"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Bar Chart */}
      {monthlyTrend.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Monthly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="month" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px"
                  }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by category or note..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {allCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
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
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
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
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
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
        </CardContent>
      </Card>

      {/* Transaction List */}
      {/* Mobile cards */}
      <div className="md:hidden space-y-3 pb-safe">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ArrowUpDown className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">No transactions found</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Add your first income or expense</p>
            </CardContent>
          </Card>
        ) : filtered.map((t) => (
          <Card key={t.id} className="overflow-hidden">
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                    t.type === "income" ? "bg-green-500/10" : "bg-red-500/10"
                  }`}>
                    {t.type === "income"
                      ? <TrendingUp className="h-4 w-4 text-green-600" />
                      : <TrendingDown className="h-4 w-4 text-red-500" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.category || "Uncategorized"}</p>
                    {t.note && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.note}</p>}
                  </div>
                </div>
                <p className={`font-bold text-sm ${t.type === "income" ? "text-green-600" : "text-destructive"}`}>
                  {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString()}
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <ArrowUpDown className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No transactions found</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((t) => (
                  <TableRow key={t.id} className="group">
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(t.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${
                        t.type === "income"
                          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
                          : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                      }`}>
                        {t.type === "income" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.category || "Uncategorized"}</TableCell>
                    <TableCell className={`text-right font-semibold ${t.type === "income" ? "text-green-600" : "text-destructive"}`}>
                      {t.type === "income" ? "+" : "-"}৳{Number(t.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.note || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-destructive" />
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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
                <Button
                  type="button"
                  variant={form.type === "income" ? "default" : "outline"}
                  className={form.type === "income" ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={() => setForm({ ...form, type: "income", category: "" })}
                >
                  <TrendingUp className="h-4 w-4 mr-1.5" /> Income
                </Button>
                <Button
                  type="button"
                  variant={form.type === "expense" ? "default" : "outline"}
                  className={form.type === "expense" ? "bg-destructive hover:bg-destructive/90" : ""}
                  onClick={() => setForm({ ...form, type: "expense", category: "" })}
                >
                  <TrendingDown className="h-4 w-4 mr-1.5" /> Expense
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Amount (৳) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                required
                className="text-lg font-semibold"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {currentCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Or type a custom category..."
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(form.created_at, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={form.created_at}
                    onSelect={(d) => d && setForm({ ...form, created_at: d })}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={3}
                placeholder="Add a note..."
              />
            </div>

            <Button type="submit" className="w-full" size="lg">
              {editId ? "Update Transaction" : "Save Transaction"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default IncomeExpense;
