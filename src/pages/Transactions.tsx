import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2, CalendarIcon, TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  created_at: string;
  due_date: string | null;
  is_paid: boolean;
}

const CATEGORIES = ["sale", "service", "refund", "rent", "salary", "supplies", "marketing", "utilities", "other"];
const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)", "hsl(262, 83%, 58%)", "hsl(199, 89%, 48%)"];

const emptyForm = { type: "income" as "income" | "expense", amount: "", category: "", note: "", due_date: undefined as Date | undefined, is_paid: true };

const Transactions = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const fetchData = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("transactions").select("*").eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (data) setTransactions(data as Transaction[]);
  };

  useEffect(() => { if (user && activeStore) fetchData(); }, [user, activeStore]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("transactions").insert({
      user_id: user!.id,
      store_id: activeStore?.id,
      type: form.type,
      amount: parseFloat(form.amount),
      category: form.category,
      note: form.note,
      due_date: form.due_date?.toISOString() ?? null,
      is_paid: form.is_paid,
    });
    if (error) toast.error(error.message);
    else { toast.success("Transaction added"); setOpen(false); setForm(emptyForm); fetchData(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchData(); }
  };

  const togglePaid = async (t: Transaction) => {
    const { error } = await supabase.from("transactions").update({ is_paid: !t.is_paid }).eq("id", t.id);
    if (error) toast.error(error.message);
    else fetchData();
  };

  // Filtered data
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (dateFrom && new Date(t.created_at) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59);
        if (new Date(t.created_at) > end) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterCategory, dateFrom, dateTo]);

  // Calculations
  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const profit = totalIncome - totalExpense;
  const unpaidDues = transactions.filter((t) => !t.is_paid);
  const totalDue = unpaidDues.reduce((s, t) => s + Number(t.amount), 0);
  const overdueDues = unpaidDues.filter((t) => t.due_date && new Date(t.due_date) < new Date());

  // Chart data - by category
  const categoryData = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    filtered.forEach((t) => {
      const cat = t.category || "other";
      if (!map[cat]) map[cat] = { income: 0, expense: 0 };
      map[cat][t.type] += Number(t.amount);
    });
    return Object.entries(map).map(([name, vals]) => ({ name, ...vals }));
  }, [filtered]);

  // Pie data
  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense").forEach((t) => {
      const cat = t.category || "other";
      map[cat] = (map[cat] ?? 0) + Number(t.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const uniqueCategories = [...new Set(transactions.map((t) => t.category).filter(Boolean))];

  return (
    <DashboardLayout>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Finance</h1>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="dues">Dues</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">${totalIncome.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
                <TrendingDown className="h-5 w-5 text-destructive" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">${totalExpense.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
                <DollarSign className={`h-5 w-5 ${profit >= 0 ? "text-green-600" : "text-destructive"}`} />
              </CardHeader>
              <CardContent><div className={`text-2xl font-bold ${profit >= 0 ? "" : "text-destructive"}`}>${profit.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid Dues</CardTitle>
                <AlertCircle className={`h-5 w-5 ${overdueDues.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalDue.toFixed(2)}</div>
                {overdueDues.length > 0 && <p className="text-xs text-destructive mt-1">{overdueDues.length} overdue</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PP") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PP") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            {(dateFrom || dateTo || filterType !== "all" || filterCategory !== "all") && (
              <Button variant="ghost" onClick={() => { setFilterType("all"); setFilterCategory("all"); setDateFrom(undefined); setDateTo(undefined); }}>Clear</Button>
            )}
            <div className="flex-1" />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "income" | "expense" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Note</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Due Date (optional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.due_date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form.due_date ? format(form.due_date, "PP") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={form.due_date} onSelect={(d) => setForm({ ...form, due_date: d })} className={cn("p-3 pointer-events-auto")} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2 flex flex-col justify-end">
                      <Label>Payment Status</Label>
                      <Select value={form.is_paid ? "paid" : "unpaid"} onValueChange={(v) => setForm({ ...form, is_paid: v === "paid" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="unpaid">Unpaid (Due)</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full">Add Transaction</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
            <span>Showing <strong>{filtered.length}</strong></span>
            <span className="text-success">Income: ${totalIncome.toFixed(2)}</span>
            <span className="text-destructive">Expense: ${totalExpense.toFixed(2)}</span>
            <span className="font-bold">Profit: ${profit.toFixed(2)}</span>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            ) : (
              filtered.map((t) => {
                const isOverdue = !t.is_paid && t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className={`mobile-card ${isOverdue ? "border-destructive/30" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={t.type === "income" ? "default" : "destructive"} className="text-[10px]">{t.type}</Badge>
                        <span className="capitalize text-xs text-muted-foreground">{t.category}</span>
                      </div>
                      <span className="font-bold text-sm">${Number(t.amount).toFixed(2)}</span>
                    </div>
                    {t.note && <p className="text-xs text-muted-foreground truncate">{t.note}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{format(new Date(t.created_at), "PP")}</span>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => togglePaid(t)}>
                          {t.is_paid ? "✓ Paid" : isOverdue ? "⚠ Overdue" : "Due"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="rounded-md border hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Category</TableHead><TableHead>Note</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const isOverdue = !t.is_paid && t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <TableRow key={t.id} className={isOverdue ? "bg-destructive/5" : ""}>
                      <TableCell><Badge variant={t.type === "income" ? "default" : "destructive"}>{t.type}</Badge></TableCell>
                      <TableCell className="font-medium">${Number(t.amount).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{t.category}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{t.note}</TableCell>
                      <TableCell>{t.due_date ? format(new Date(t.due_date), "PP") : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => togglePaid(t)}>
                          {t.is_paid ? (
                            <span className="flex items-center gap-1 text-success"><CheckCircle className="h-3 w-3" />Paid</span>
                          ) : (
                            <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : "text-warning"}`}>
                              <AlertCircle className="h-3 w-3" />{isOverdue ? "Overdue" : "Due"}
                            </span>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{format(new Date(t.created_at), "PP")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transactions found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* DUES TAB */}
        <TabsContent value="dues" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Unpaid</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">${totalDue.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unpaid Count</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{unpaidDues.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">Overdue</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-destructive">{overdueDues.length}</div></CardContent>
            </Card>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Category</TableHead><TableHead>Note</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {unpaidDues.map((t) => {
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <TableRow key={t.id} className={isOverdue ? "bg-destructive/5" : ""}>
                      <TableCell><Badge variant={t.type === "income" ? "default" : "destructive"}>{t.type}</Badge></TableCell>
                      <TableCell className="font-medium">${Number(t.amount).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{t.category}</TableCell>
                      <TableCell>{t.note}</TableCell>
                      <TableCell>{t.due_date ? format(new Date(t.due_date), "PP") : "—"}</TableCell>
                      <TableCell><Badge variant={isOverdue ? "destructive" : "secondary"}>{isOverdue ? "Overdue" : "Pending"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => togglePaid(t)}>Mark Paid</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {unpaidDues.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No unpaid dues 🎉</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* REPORTS TAB */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Income vs Expense by Category</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" className="text-xs fill-muted-foreground capitalize" />
                        <YAxis className="text-xs fill-muted-foreground" />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} />
                        <Bar dataKey="income" fill="hsl(142, 76%, 36%)" name="Income" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" fill="hsl(var(--destructive))" name="Expense" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground text-center py-16">No data to display</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Expense Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground text-center py-16">No expense data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default Transactions;
