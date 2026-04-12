import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, CheckCircle, Search, BookOpen, AlertTriangle,
  TrendingUp, TrendingDown, Clock, DollarSign, Users, Calendar,
  Download, ArrowUpRight, ArrowDownRight, Bell, History, Filter,
  CreditCard, BarChart3, PieChart, Eye
} from "lucide-react";
import { differenceInDays, format as fnsFormat, subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Due {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  due_date: string | null;
  is_paid: boolean;
  created_at: string;
}

interface PaymentLog {
  id: string;
  due_id: string;
  amount: number;
  paid_at: string;
  category: string;
  type: "income" | "expense";
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#06b6d4",
];

const DATE_PRESETS = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
];

const DueBook = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { format: formatCurrency, symbol } = useCurrency();
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailSheet, setDetailSheet] = useState<Due | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    amount: "",
    category: "",
    note: "",
    due_date: "",
  });
  const [statusFilter, setStatusFilter] = useState("unpaid");
  const [typeFilter, setTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);

  // Fetch dues
  const fetchDues = useCallback(async () => {
    if (!activeStore || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("store_id", activeStore.id)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });

    if (!error && data) {
      setDues(data as Due[]);
      // Build payment logs from paid entries
      const logs: PaymentLog[] = (data as Due[])
        .filter((d) => d.is_paid)
        .map((d) => ({
          id: d.id,
          due_id: d.id,
          amount: d.amount,
          paid_at: d.created_at,
          category: d.category || "Uncategorized",
          type: d.type,
        }));
      setPaymentLogs(logs);
    }
    setLoading(false);
  }, [activeStore, user]);

  useEffect(() => {
    fetchDues();
  }, [fetchDues]);

  // Realtime subscription
  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`duebook-${activeStore.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `store_id=eq.${activeStore.id}` },
        () => fetchDues()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, fetchDues]);

  // Filtered dues
  const filtered = useMemo(() => {
    let result = dues;

    // Status filter
    if (statusFilter === "unpaid") result = result.filter((d) => !d.is_paid);
    else if (statusFilter === "paid") result = result.filter((d) => d.is_paid);
    else if (statusFilter === "overdue")
      result = result.filter((d) => !d.is_paid && d.due_date && differenceInDays(new Date(d.due_date), new Date()) < 0);

    // Type filter
    if (typeFilter === "income") result = result.filter((d) => d.type === "income");
    else if (typeFilter === "expense") result = result.filter((d) => d.type === "expense");

    // Date preset
    if (datePreset !== "all") {
      const now = new Date();
      let start: Date;
      if (datePreset === "month") start = startOfMonth(now);
      else if (datePreset === "7d") start = subDays(now, 7);
      else if (datePreset === "30d") start = subDays(now, 30);
      else start = subDays(now, 90);
      result = result.filter((d) => d.due_date && new Date(d.due_date) >= start);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        [d.category, d.note].some((f) => (f || "").toLowerCase().includes(q))
      );
    }

    return result;
  }, [dues, statusFilter, typeFilter, datePreset, search]);

  // Stats
  const stats = useMemo(() => {
    const unpaid = dues.filter((d) => !d.is_paid);
    const paid = dues.filter((d) => d.is_paid);
    const receivable = unpaid.filter((d) => d.type === "income").reduce((s, d) => s + Number(d.amount), 0);
    const payable = unpaid.filter((d) => d.type === "expense").reduce((s, d) => s + Number(d.amount), 0);
    const totalCollected = paid.filter((d) => d.type === "income").reduce((s, d) => s + Number(d.amount), 0);
    const totalPaidOut = paid.filter((d) => d.type === "expense").reduce((s, d) => s + Number(d.amount), 0);
    const overdue = unpaid.filter((d) => d.due_date && differenceInDays(new Date(d.due_date), new Date()) < 0);
    const overdueAmount = overdue.reduce((s, d) => s + Number(d.amount), 0);
    const dueSoon = unpaid.filter((d) => {
      if (!d.due_date) return false;
      const days = differenceInDays(new Date(d.due_date), new Date());
      return days >= 0 && days <= 7;
    });
    const collectionRate = (totalCollected + totalPaidOut) > 0 ? 
      ((totalCollected + totalPaidOut) / (totalCollected + totalPaidOut + receivable + payable)) * 100 : 0;

    return {
      receivable, payable, totalCollected, totalPaidOut,
      overdueCount: overdue.length, overdueAmount,
      dueSoonCount: dueSoon.length, totalDues: unpaid.length,
      paidCount: paid.length, collectionRate,
      netDue: receivable - payable,
    };
  }, [dues]);

  // Category breakdown for chart
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { receivable: number; payable: number }>();
    dues.filter((d) => !d.is_paid).forEach((d) => {
      const cat = d.category || "Uncategorized";
      const entry = map.get(cat) || { receivable: 0, payable: 0 };
      if (d.type === "income") entry.receivable += Number(d.amount);
      else entry.payable += Number(d.amount);
      map.set(cat, entry);
    });
    return Array.from(map.entries())
      .map(([name, val]) => ({ name, ...val, total: val.receivable + val.payable }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [dues]);

  // Due timeline for area chart
  const timeline = useMemo(() => {
    const map = new Map<string, { date: string; receivable: number; payable: number }>();
    dues.forEach((d) => {
      if (!d.due_date) return;
      const dateKey = d.due_date.split("T")[0];
      const entry = map.get(dateKey) || { date: dateKey, receivable: 0, payable: 0 };
      if (d.type === "income") entry.receivable += Number(d.amount);
      else entry.payable += Number(d.amount);
      map.set(dateKey, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [dues]);

  // Pie data for type distribution
  const pieData = useMemo(() => [
    { name: "Receivable", value: stats.receivable, color: "hsl(var(--success))" },
    { name: "Payable", value: stats.payable, color: "hsl(var(--destructive))" },
  ].filter(d => d.value > 0), [stats]);

  // Top debtors/creditors
  const topPersons = useMemo(() => {
    const map = new Map<string, { name: string; receivable: number; payable: number; count: number }>();
    dues.filter((d) => !d.is_paid && d.category).forEach((d) => {
      const name = d.category;
      const entry = map.get(name) || { name, receivable: 0, payable: 0, count: 0 };
      if (d.type === "income") entry.receivable += Number(d.amount);
      else entry.payable += Number(d.amount);
      entry.count++;
      map.set(name, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
      .slice(0, 10);
  }, [dues]);

  // Form handlers
  const openAdd = () => {
    setEditId(null);
    setForm({ type: "income", amount: "", category: "", note: "", due_date: "" });
    setSheetOpen(true);
  };

  const openEdit = (d: Due) => {
    setEditId(d.id);
    setForm({
      type: d.type,
      amount: String(d.amount),
      category: d.category || "",
      note: d.note || "",
      due_date: d.due_date ? d.due_date.split("T")[0] : "",
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
      type: form.type as "income" | "expense",
      amount: Number(form.amount),
      category: form.category,
      note: form.note,
      due_date: form.due_date || null,
      is_paid: false,
    };

    if (editId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Due updated successfully");
    } else {
      const { error } = await supabase.from("transactions").insert({
        ...payload,
        user_id: user!.id,
        store_id: activeStore?.id,
      });
      if (error) toast.error(error.message);
      else toast.success("Due added successfully");
    }
    setSheetOpen(false);
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ is_paid: true }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Marked as paid ✓");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Deleted");
  };

  // CSV Export
  const exportCSV = () => {
    const headers = ["Type", "Category", "Amount", "Due Date", "Status", "Note", "Created"];
    const rows = filtered.map((d) => [
      d.type === "income" ? "Receivable" : "Payable",
      d.category || "",
      d.amount,
      d.due_date || "",
      d.is_paid ? "Paid" : "Unpaid",
      (d.note || "").replace(/,/g, ";"),
      d.created_at,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `due-book-${fnsFormat(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported successfully");
  };

  const getDaysInfo = (d: Due) => {
    if (!d.due_date) return { daysLeft: null, isOverdue: false, label: "No date", variant: "secondary" as const };
    const daysLeft = differenceInDays(new Date(d.due_date), new Date());
    const isOverdue = daysLeft < 0 && !d.is_paid;
    if (d.is_paid) return { daysLeft, isOverdue: false, label: "Paid", variant: "default" as const };
    if (isOverdue) return { daysLeft, isOverdue: true, label: `${Math.abs(daysLeft)}d overdue`, variant: "destructive" as const };
    if (daysLeft <= 3) return { daysLeft, isOverdue: false, label: `${daysLeft}d left`, variant: "destructive" as const };
    if (daysLeft <= 7) return { daysLeft, isOverdue: false, label: `${daysLeft}d left`, variant: "secondary" as const };
    return { daysLeft, isOverdue: false, label: `${daysLeft}d left`, variant: "outline" as const };
  };

  // Loading skeleton
  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              Due Book
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track receivables, payables & payment history
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Due
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-green-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Receivable</p>
                <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{formatCurrency(stats.receivable, 0)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Collected: {formatCurrency(stats.totalCollected, 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-red-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Payable</p>
                <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-destructive">{formatCurrency(stats.payable, 0)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Paid out: {formatCurrency(stats.totalPaidOut, 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Overdue</p>
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.overdueCount}</p>
              <p className="text-[10px] sm:text-xs text-destructive mt-1">
                {formatCurrency(stats.overdueAmount, 0)} overdue
              </p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-md transition-all duration-300 border-l-4 border-l-primary">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Net Balance</p>
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${stats.netDue >= 0 ? "text-green-600" : "text-destructive"}`}>
                {stats.netDue >= 0 ? "+" : ""}{formatCurrency(Math.abs(stats.netDue), 0)}
              </p>
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Collection Rate</span>
                  <span>{stats.collectionRate.toFixed(0)}%</span>
                </div>
                <Progress value={stats.collectionRate} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due Soon (7d)</p>
                <p className="text-lg font-bold">{stats.dueSoonCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Settled</p>
                <p className="text-lg font-bold">{stats.paidCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <BarChart3 className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Dues</p>
                <p className="text-lg font-bold">{stats.totalDues}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="dues" className="gap-1.5 text-xs sm:text-sm">
              <BookOpen className="h-3.5 w-3.5" /> Due List
            </TabsTrigger>
            <TabsTrigger value="persons" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" /> People
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Timeline Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Due Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {timeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={timeline}>
                        <defs>
                          <linearGradient id="dueGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dueRed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => fnsFormat(new Date(v), "dd MMM")} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${symbol}${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value: number) => [formatCurrency(value, 0)]}
                        />
                        <Area type="monotone" dataKey="receivable" name="Receivable" stroke="hsl(var(--success))" fill="url(#dueGreen)" strokeWidth={2} />
                        <Area type="monotone" dataKey="payable" name="Payable" stroke="hsl(var(--destructive))" fill="url(#dueRed)" strokeWidth={2} />
                        <Legend />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                      No data to display
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Distribution Pie + Category Bar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-primary" /> Due Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <RePieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [formatCurrency(value, 0)]} />
                          <Legend />
                        </RePieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
                        No dues yet
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={categoryBreakdown} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${symbol}${v}`} />
                          <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => [formatCurrency(value, 0)]} />
                          <Bar dataKey="receivable" name="Receivable" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="payable" name="Payable" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
                        No categories
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Due List Tab */}
          <TabsContent value="dues" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by person or note..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="income">Receivable</SelectItem>
                  <SelectItem value="expense">Payable</SelectItem>
                </SelectContent>
              </Select>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filtered.length} entries found</p>
              <p className="text-sm font-medium">
                Total: {formatCurrency(filtered.reduce((s, d) => s + Number(d.amount), 0), 0)}
              </p>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3 pb-safe">
              {filtered.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16">
                  <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No dues found</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Add Due
                  </Button>
                </Card>
              ) : (
                filtered.map((d) => {
                  const info = getDaysInfo(d);
                  return (
                    <Card key={d.id} className={`overflow-hidden transition-all duration-200 hover:shadow-md ${info.isOverdue ? "border-destructive/40" : ""}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={d.type === "income"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            }>
                              {d.type === "income" ? "Receivable" : "Payable"}
                            </Badge>
                            <Badge variant={info.variant}>{info.label}</Badge>
                          </div>
                          <p className={`text-lg font-bold ${d.type === "income" ? "text-green-600" : "text-destructive"}`}>
                            {formatCurrency(d.amount, 0)}
                          </p>
                        </div>
                        {d.category && (
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <p className="text-sm font-medium">{d.category}</p>
                          </div>
                        )}
                        {d.note && <p className="text-xs text-muted-foreground line-clamp-2">{d.note}</p>}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due: {d.due_date ? fnsFormat(new Date(d.due_date), "dd MMM yyyy") : "—"}
                          </span>
                        </div>
                        <div className="flex gap-2 pt-1 border-t">
                          {!d.is_paid && (
                            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" onClick={() => markPaid(d.id)}>
                              <CheckCircle className="h-3.5 w-3.5" /> Mark Paid
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(d)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Person / Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((d) => {
                      const info = getDaysInfo(d);
                      return (
                        <TableRow key={d.id} className={`group transition-colors ${info.isOverdue ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/50"}`}>
                          <TableCell>
                            <Badge className={d.type === "income"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            }>
                              {d.type === "income" ? "↗ Receivable" : "↙ Payable"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{d.category || "—"}</TableCell>
                          <TableCell className={`text-right font-bold ${d.type === "income" ? "text-green-600" : "text-destructive"}`}>
                            {formatCurrency(d.amount)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {d.due_date ? fnsFormat(new Date(d.due_date), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell><Badge variant={info.variant}>{info.label}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{d.note || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!d.is_paid && (
                                <Button variant="ghost" size="icon" onClick={() => markPaid(d.id)} title="Mark Paid" className="h-8 w-8 text-green-600 hover:bg-green-50">
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="h-8 w-8">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12">
                          <BookOpen className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                          <p className="text-muted-foreground text-sm">No dues found</p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
                            <Plus className="h-4 w-4 mr-1" /> Add Due
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>

          {/* People Tab */}
          <TabsContent value="persons" className="space-y-4">
            {topPersons.length === 0 ? (
              <Card className="flex flex-col items-center justify-center py-16">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No person/category data yet</p>
                <p className="text-muted-foreground text-xs mt-1">Add dues with a category/person name to see breakdown</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topPersons.map((p, i) => {
                  const total = p.receivable + p.payable;
                  const net = p.receivable - p.payable;
                  return (
                    <Card key={p.name} className="hover:shadow-md transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.count} active dues</p>
                            </div>
                          </div>
                          <p className={`text-lg font-bold ${net >= 0 ? "text-green-600" : "text-destructive"}`}>
                            {net >= 0 ? "+" : ""}{formatCurrency(Math.abs(net), 0)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/10">
                            <p className="text-[10px] text-green-600 font-medium">Receivable</p>
                            <p className="text-sm font-bold text-green-700">{formatCurrency(p.receivable, 0)}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/10">
                            <p className="text-[10px] text-red-600 font-medium">Payable</p>
                            <p className="text-sm font-bold text-red-700">{formatCurrency(p.payable, 0)}</p>
                          </div>
                        </div>
                        {total > 0 && (
                          <div className="mt-3">
                            <Progress value={(p.receivable / total) * 100} className="h-1.5" />
                            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                              <span>{((p.receivable / total) * 100).toFixed(0)}% receivable</span>
                              <span>{((p.payable / total) * 100).toFixed(0)}% payable</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {editId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editId ? "Edit Due" : "Add New Due"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-6">
              {/* Live Preview */}
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Preview</p>
                      <p className="text-sm font-medium">{form.category || "Person/Category"}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={form.type === "income"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                      }>
                        {form.type === "income" ? "Receivable" : "Payable"}
                      </Badge>
                      <p className={`text-lg font-bold mt-1 ${form.type === "income" ? "text-green-600" : "text-destructive"}`}>
                        {form.amount ? formatCurrency(Number(form.amount), 0) : `${symbol}0`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v: "income" | "expense") => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">
                      <span className="flex items-center gap-2">
                        <ArrowUpRight className="h-3.5 w-3.5 text-green-600" /> Receivable (Someone owes me)
                      </span>
                    </SelectItem>
                    <SelectItem value="expense">
                      <span className="flex items-center gap-2">
                        <ArrowDownRight className="h-3.5 w-3.5 text-red-600" /> Payable (I owe someone)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Amount ({symbol}) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="Enter amount"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Person / Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g., John Doe, Office Rent"
                />
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>

              <Button type="submit" className="w-full gap-2">
                {editId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editId ? "Update Due" : "Add Due"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default DueBook;
