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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { dueSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import {
  Plus, Trash2, Pencil, CheckCircle, Search, BookOpen, AlertTriangle,
  TrendingUp, Clock, DollarSign, Users, Calendar,
  Download, ArrowUpRight, ArrowDownRight, Bell,
  BarChart3, PieChart, MessageCircle, Lightbulb, ChevronDown,
  Phone, Copy, Send, Sparkles, ShieldCheck, Zap, FileText
} from "lucide-react";
import { differenceInDays, format as fnsFormat, subDays, startOfMonth } from "date-fns";
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

const DATE_PRESETS = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
];

// Phone helpers — phone is embedded in note as "📱+880xxx | actual note"
const PHONE_RE = /📱\s*([+\d][\d\s\-()]{6,20})/;
const extractPhone = (note: string | null): string => {
  if (!note) return "";
  const m = note.match(PHONE_RE);
  return m ? m[1].replace(/[\s\-()]/g, "") : "";
};
const stripPhone = (note: string | null): string => {
  if (!note) return "";
  return note.replace(PHONE_RE, "").replace(/^\s*\|\s*/, "").trim();
};
const buildNote = (phone: string, note: string): string => {
  const cleanPhone = phone.trim();
  if (!cleanPhone) return note.trim();
  return `📱${cleanPhone}${note.trim() ? ` | ${note.trim()}` : ""}`;
};

const DueBook = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { format: formatCurrency, symbol } = useCurrency();
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    amount: "",
    category: "",
    phone: "",
    note: "",
    due_date: "",
  });
  const formValidation = useFormValidation(dueSchema);
  const [statusFilter, setStatusFilter] = useState("unpaid");
  const [typeFilter, setTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [guideOpen, setGuideOpen] = useState(false);
  const [reminderModal, setReminderModal] = useState<Due | null>(null);
  const [reminderText, setReminderText] = useState("");
  const [reminderPhone, setReminderPhone] = useState("");
  // Map: order-id-prefix -> { name, phone } resolved from POS-linked orders
  const [orderCustomerMap, setOrderCustomerMap] = useState<Record<string, { name: string; phone: string }>>({});

  const fetchDues = useCallback(async () => {
    if (!activeStore || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("store_id", activeStore.id)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (!error && data) setDues(data as Due[]);
    setLoading(false);
  }, [activeStore, user]);

  // Resolve customer name + phone for POS-linked dues by joining via orders → customers
  useEffect(() => {
    if (!activeStore || dues.length === 0) return;
    const orderPrefixes = Array.from(new Set(
      dues
        .map((d) => d.note?.match(/POS.*Order #([a-f0-9]+)/i)?.[1])
        .filter((p): p is string => !!p)
    ));
    if (orderPrefixes.length === 0) { setOrderCustomerMap({}); return; }
    (async () => {
      const orFilter = orderPrefixes.map((p) => `id.ilike.${p}%`).join(",");
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_id, customers(name, phone)")
        .eq("store_id", activeStore.id)
        .or(orFilter);
      if (!orders) return;
      const map: Record<string, { name: string; phone: string }> = {};
      orders.forEach((o: any) => {
        const prefix = (o.id as string).slice(0, 8);
        map[prefix] = {
          name: o.customers?.name || "",
          phone: o.customers?.phone || "",
        };
      });
      setOrderCustomerMap(map);
    })();
  }, [activeStore, dues]);

  // Resolve display name + phone for any due (POS-linked customers take precedence)
  const getDueContact = useCallback((d: Due): { name: string; phone: string } => {
    const orderPrefix = d.note?.match(/POS.*Order #([a-f0-9]+)/i)?.[1];
    if (orderPrefix && orderCustomerMap[orderPrefix]) {
      const c = orderCustomerMap[orderPrefix];
      return {
        name: c.name || d.category || "Customer",
        phone: c.phone || extractPhone(d.note),
      };
    }
    return { name: d.category || "—", phone: extractPhone(d.note) };
  }, [orderCustomerMap]);

  useEffect(() => { fetchDues(); }, [fetchDues]);

  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`duebook-${activeStore.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `store_id=eq.${activeStore.id}` },
        () => fetchDues()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, fetchDues]);

  const filtered = useMemo(() => {
    let result = dues;
    if (statusFilter === "unpaid") result = result.filter((d) => !d.is_paid);
    else if (statusFilter === "paid") result = result.filter((d) => d.is_paid);
    else if (statusFilter === "overdue")
      result = result.filter((d) => !d.is_paid && d.due_date && differenceInDays(new Date(d.due_date), new Date()) < 0);
    if (typeFilter === "income") result = result.filter((d) => d.type === "income");
    else if (typeFilter === "expense") result = result.filter((d) => d.type === "expense");
    if (datePreset !== "all") {
      const now = new Date();
      let start: Date;
      if (datePreset === "month") start = startOfMonth(now);
      else if (datePreset === "7d") start = subDays(now, 7);
      else if (datePreset === "30d") start = subDays(now, 30);
      else start = subDays(now, 90);
      result = result.filter((d) => d.due_date && new Date(d.due_date) >= start);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        [d.category, d.note].some((f) => (f || "").toLowerCase().includes(q))
      );
    }
    return result;
  }, [dues, statusFilter, typeFilter, datePreset, search]);

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
    const reachable = unpaid.filter((d) => d.type === "income" && extractPhone(d.note)).length;
    return {
      receivable, payable, totalCollected, totalPaidOut,
      overdueCount: overdue.length, overdueAmount,
      dueSoonCount: dueSoon.length, totalDues: unpaid.length,
      paidCount: paid.length, collectionRate,
      netDue: receivable - payable, reachable,
    };
  }, [dues]);

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

  const pieData = useMemo(() => [
    { name: "Receivable", value: stats.receivable, color: "hsl(var(--success, 142 76% 36%))" },
    { name: "Payable", value: stats.payable, color: "hsl(var(--destructive))" },
  ].filter(d => d.value > 0), [stats]);

  const topPersons = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; receivable: number; payable: number; count: number }>();
    dues.filter((d) => !d.is_paid && d.category).forEach((d) => {
      const name = d.category;
      const entry = map.get(name) || { name, phone: "", receivable: 0, payable: 0, count: 0 };
      if (d.type === "income") entry.receivable += Number(d.amount);
      else entry.payable += Number(d.amount);
      if (!entry.phone) entry.phone = extractPhone(d.note);
      entry.count++;
      map.set(name, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
      .slice(0, 12);
  }, [dues]);

  const openAdd = () => {
    setEditId(null);
    setForm({ type: "income", amount: "", category: "", phone: "", note: "", due_date: "" });
    setSheetOpen(true);
  };

  const openEdit = (d: Due) => {
    setEditId(d.id);
    setForm({
      type: d.type,
      amount: String(d.amount),
      category: d.category || "",
      phone: extractPhone(d.note),
      note: stripPhone(d.note),
      due_date: d.due_date ? d.due_date.split("T")[0] : "",
    });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalNote = buildNote(form.phone, form.note);
    const ok = formValidation.validateAll({
      type: form.type, amount: form.amount, category: form.category, note: finalNote,
    });
    if (!ok) { toast.error("Please fix the errors below"); return; }
    const payload = {
      type: form.type as "income" | "expense",
      amount: Number(form.amount),
      category: form.category,
      note: finalNote,
      due_date: form.due_date || null,
      is_paid: false,
    };
    if (editId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Due updated successfully");
    } else {
      const { error } = await supabase.from("transactions").insert({
        ...payload, user_id: effectiveUserId!, store_id: activeStore?.id,
      });
      if (error) toast.error(error.message); else toast.success("Due added successfully");
    }
    setSheetOpen(false);
  };

  const markPaid = async (id: string) => {
    const { data: txn, error } = await supabase.from("transactions").update({ is_paid: true }).eq("id", id).select("note").single();
    if (error) { toast.error(error.message); return; }
    const orderMatch = txn?.note?.match(/POS.*Order #([a-f0-9]+)/i);
    if (orderMatch) {
      const orderIdPrefix = orderMatch[1];
      const { data: orders } = await supabase.from("orders")
        .select("id, total_amount, meta, payment_status")
        .ilike("id", `${orderIdPrefix}%`)
        .eq("store_id", activeStore?.id || "")
        .limit(1);
      if (orders?.[0]) {
        const order = orders[0];
        const { data: relatedTxns } = await supabase.from("transactions")
          .select("is_paid, amount")
          .ilike("note", `%${orderIdPrefix}%`)
          .eq("store_id", activeStore?.id || "");
        const allPaid = relatedTxns?.every(t => t.is_paid) ?? false;
        const totalPaid = relatedTxns?.filter(t => t.is_paid).reduce((s, t) => s + Number(t.amount), 0) || 0;
        const newStatus = allPaid ? "paid" : totalPaid > 0 ? "partial" : "unpaid";
        if (order.payment_status !== newStatus) {
          await supabase.from("orders").update({
            payment_status: newStatus,
            meta: { ...(order.meta as any || {}), paid_amount: totalPaid, due_amount: Math.max(0, Number(order.total_amount) - totalPaid) },
          }).eq("id", order.id);
        }
      }
    }
    toast.success("Marked as paid ✓");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Deleted");
  };

  const exportCSV = () => {
    const headers = ["Type", "Person", "Phone", "Amount", "Due Date", "Status", "Note", "Created"];
    const rows = filtered.map((d) => [
      d.type === "income" ? "Receivable" : "Payable",
      d.category || "",
      extractPhone(d.note),
      d.amount,
      d.due_date || "",
      d.is_paid ? "Paid" : "Unpaid",
      stripPhone(d.note).replace(/,/g, ";"),
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

  const buildReminderMessage = (d: Due, name?: string) => {
    const storeName = activeStore?.name || "our store";
    const amount = formatCurrency(d.amount, 0);
    const dueStr = d.due_date ? fnsFormat(new Date(d.due_date), "dd MMM yyyy") : "soon";
    const daysLeft = d.due_date ? differenceInDays(new Date(d.due_date), new Date()) : null;
    const status = daysLeft !== null && daysLeft < 0 ? `${Math.abs(daysLeft)} days OVERDUE` : `due on ${dueStr}`;
    const who = name || d.category || "Customer";
    return `Hi ${who}, this is a friendly reminder from *${storeName}*.\n\nYou have a pending payment of *${amount}* (${status}).\n\nKindly clear it at your earliest convenience. Thank you! 🙏`;
  };

  const openReminder = (d: Due) => {
    const contact = getDueContact(d);
    setReminderPhone(contact.phone);
    setReminderText(buildReminderMessage(d, contact.name));
    setReminderModal(d);
    if (!contact.phone) {
      toast.warning("No phone number on file for this customer. Please enter manually.");
    }
  };

  const sendWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/[\s\-()+]/g, "");
    if (!cleanPhone) {
      toast.error("Please enter a phone number");
      return;
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Opening WhatsApp...");
  };

  const sendBulkReminders = () => {
    const targets = filtered.filter((d) => !d.is_paid && d.type === "income" && extractPhone(d.note));
    if (targets.length === 0) {
      toast.error("No customers with phone numbers in current view");
      return;
    }
    targets.slice(0, 5).forEach((d, i) => {
      setTimeout(() => sendWhatsApp(extractPhone(d.note), buildReminderMessage(d)), i * 400);
    });
    toast.success(`Opening ${Math.min(targets.length, 5)} WhatsApp chats...`);
  };

  const copyReminder = () => {
    navigator.clipboard.writeText(reminderText);
    toast.success("Message copied!");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

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
                  <BookOpen className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Due Book</h1>
                    <Badge variant="secondary" className="gap-1 text-[10px] font-semibold">
                      <Sparkles className="h-3 w-3" /> PREMIUM
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Track receivables, payables, send WhatsApp reminders & analyze cashflow
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setGuideOpen(!guideOpen)} className="gap-1.5 rounded-xl">
                  <Lightbulb className="h-4 w-4" /> Guide
                </Button>
                <Button variant="outline" size="sm" onClick={sendBulkReminders} className="gap-1.5 rounded-xl border-green-500/40 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 dark:text-green-400">
                  <Send className="h-4 w-4" /> Bulk Remind
                </Button>
                <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 rounded-xl">
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Button size="sm" onClick={openAdd} className="gap-1.5 rounded-xl shadow-md">
                  <Plus className="h-4 w-4" /> Add Due
                </Button>
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
                    <h3 className="font-semibold">Due Book Quick Guide</h3>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">Close</Button>
                  </CollapsibleTrigger>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { icon: Plus, title: "1. Add Due", desc: "Click 'Add Due' to record receivables (others owe you) or payables (you owe others). Add phone for reminders.", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
                    { icon: MessageCircle, title: "2. WhatsApp Reminder", desc: "Click the green WhatsApp icon next to any due to send a polite payment reminder instantly.", color: "text-green-600 bg-green-100 dark:bg-green-900/30" },
                    { icon: CheckCircle, title: "3. Mark Paid", desc: "When payment is received, click the check mark to settle. Linked POS orders update automatically.", color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
                    { icon: BarChart3, title: "4. Analyze", desc: "Use Analytics tab for cashflow timeline, category breakdown, and People tab for customer-wise summary.", color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
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
                    <strong>Pro tip:</strong> Add a phone number while creating dues to enable one-click WhatsApp reminders. Use "Bulk Remind" to message up to 5 overdue customers at once.
                  </p>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Compact Premium KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Receivable", value: formatCurrency(stats.receivable, 0), sub: `Collected ${formatCurrency(stats.totalCollected, 0)}`, icon: ArrowUpRight, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", border: "border-l-green-500" },
            { label: "Payable", value: formatCurrency(stats.payable, 0), sub: `Paid out ${formatCurrency(stats.totalPaidOut, 0)}`, icon: ArrowDownRight, color: "text-destructive", bg: "bg-red-100 dark:bg-red-900/30", border: "border-l-red-500" },
            { label: "Overdue", value: String(stats.overdueCount), sub: `${formatCurrency(stats.overdueAmount, 0)} pending`, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", border: "border-l-amber-500" },
            { label: "Net Balance", value: `${stats.netDue >= 0 ? "+" : "-"}${formatCurrency(Math.abs(stats.netDue), 0)}`, sub: `${stats.collectionRate.toFixed(0)}% collection rate`, icon: DollarSign, color: stats.netDue >= 0 ? "text-green-600" : "text-destructive", bg: "bg-primary/10", border: "border-l-primary" },
          ].map((s, i) => (
            <Card key={i} className={`rounded-2xl border-l-4 ${s.border} hover:shadow-md transition-all`}>
              <CardContent className="!p-3.5 sm:!p-4 flex items-center gap-3">
                <div className={`h-9 w-9 shrink-0 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
                  <p className={`text-lg sm:text-xl font-bold tabular-nums ${s.color} mt-0.5 truncate`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mini stats — compact horizontal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Due Soon (7d)", value: stats.dueSoonCount, icon: Clock, color: "text-primary", bg: "bg-primary/10" },
            { label: "Settled", value: stats.paidCount, icon: CheckCircle, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" },
            { label: "Active Dues", value: stats.totalDues, icon: BarChart3, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
            { label: "Reachable", value: stats.reachable, icon: Phone, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
          ].map((s, i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="!p-3.5 sm:!p-4 flex items-center gap-3">
                <div className={`h-9 w-9 shrink-0 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
                  <p className="text-xl font-bold tabular-nums mt-0.5">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl h-11 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="dues" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <BookOpen className="h-3.5 w-3.5" /> Due List
            </TabsTrigger>
            <TabsTrigger value="persons" className="gap-1.5 text-xs sm:text-sm rounded-xl">
              <Users className="h-3.5 w-3.5" /> People
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl">
                <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Due Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                  {timeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={timeline}>
                        <defs>
                          <linearGradient id="dueGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dueRed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => fnsFormat(new Date(v), "dd MMM")} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${symbol}${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} formatter={(value: number) => [formatCurrency(value, 0)]} />
                        <Area type="monotone" dataKey="receivable" name="Receivable" stroke="hsl(142 76% 36%)" fill="url(#dueGreen)" strokeWidth={2} />
                        <Area type="monotone" dataKey="payable" name="Payable" stroke="hsl(var(--destructive))" fill="url(#dueRed)" strokeWidth={2} />
                        <Legend />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data to display</div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-2xl">
                  <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-primary" /> Due Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <RePieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => [formatCurrency(value, 0)]} />
                          <Legend />
                        </RePieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">No dues yet</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader className="!p-5 sm:!p-6 pb-2 sm:pb-2">
                    <CardTitle className="text-sm font-semibold">Category Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="!p-5 sm:!p-6 pt-2 sm:pt-2">
                    {categoryBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={categoryBreakdown} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${symbol}${v}`} />
                          <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => [formatCurrency(value, 0)]} />
                          <Bar dataKey="receivable" name="Receivable" fill="hsl(142 76% 36%)" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="payable" name="Payable" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">No categories</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Due List Tab */}
          <TabsContent value="dues" className="space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="!p-4 sm:!p-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by person, phone or note..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="income">Receivable</SelectItem>
                      <SelectItem value="expense">Payable</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={datePreset} onValueChange={setDatePreset}>
                    <SelectTrigger className="w-full sm:w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between mt-3 px-1">
                  <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
                  <p className="text-xs font-medium">
                    Total: <span className="font-bold text-foreground">{formatCurrency(filtered.reduce((s, d) => s + Number(d.amount), 0), 0)}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3 pb-safe">
              {filtered.length === 0 ? (
                <Card className="rounded-2xl flex flex-col items-center justify-center py-16">
                  <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No dues found</p>
                  <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Add Due
                  </Button>
                </Card>
              ) : (
                filtered.map((d) => {
                  const info = getDaysInfo(d);
                  const phone = extractPhone(d.note);
                  const cleanNote = stripPhone(d.note);
                  return (
                    <Card key={d.id} className={`rounded-2xl overflow-hidden transition-all hover:shadow-md ${info.isOverdue ? "border-destructive/40" : ""}`}>
                      <CardContent className="!p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={d.type === "income"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            }>
                              {d.type === "income" ? "Receivable" : "Payable"}
                            </Badge>
                            <Badge variant={info.variant}>{info.label}</Badge>
                          </div>
                          <p className={`text-lg font-bold tabular-nums ${d.type === "income" ? "text-green-600" : "text-destructive"}`}>
                            {formatCurrency(d.amount, 0)}
                          </p>
                        </div>
                        {d.category && (
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <p className="text-sm font-medium">{d.category}</p>
                            {phone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {phone}
                              </span>
                            )}
                          </div>
                        )}
                        {cleanNote && <p className="text-xs text-muted-foreground line-clamp-2">{cleanNote}</p>}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Due: {d.due_date ? fnsFormat(new Date(d.due_date), "dd MMM yyyy") : "—"}
                        </div>
                        <div className="flex gap-2 pt-2 border-t">
                          {!d.is_paid && d.type === "income" && (
                            <Button variant="outline" size="sm" className="flex-1 gap-1.5 rounded-xl border-green-500/40 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 dark:text-green-400" onClick={() => openReminder(d)}>
                              <MessageCircle className="h-3.5 w-3.5" /> Remind
                            </Button>
                          )}
                          {!d.is_paid && (
                            <Button variant="outline" size="sm" className="flex-1 gap-1.5 rounded-xl text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" onClick={() => markPaid(d.id)}>
                              <CheckCircle className="h-3.5 w-3.5" /> Paid
                            </Button>
                          )}
                          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" onClick={() => openEdit(d)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(d.id)}>
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
              <Card className="rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Type</TableHead>
                      <TableHead>Person / Phone</TableHead>
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
                      const contact = getDueContact(d);
                      const phone = contact.phone;
                      const cleanNote = stripPhone(d.note);
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
                          <TableCell>
                            <div>
                              <p className="font-medium">{contact.name || "—"}</p>
                              {phone ? (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" /> {phone}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground/60 italic mt-0.5">No phone</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-bold tabular-nums ${d.type === "income" ? "text-green-600" : "text-destructive"}`}>
                            {formatCurrency(d.amount)}
                          </TableCell>
                          <TableCell className="text-sm">{d.due_date ? fnsFormat(new Date(d.due_date), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell><Badge variant={info.variant}>{info.label}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{cleanNote || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!d.is_paid && d.type === "income" && (
                                <Button variant="ghost" size="icon" onClick={() => openReminder(d)} title="Send WhatsApp Reminder" className="h-8 w-8 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {!d.is_paid && (
                                <Button variant="ghost" size="icon" onClick={() => markPaid(d.id)} title="Mark Paid" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
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
                          <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={openAdd}>
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
              <Card className="rounded-2xl flex flex-col items-center justify-center py-16">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No person/category data yet</p>
                <p className="text-muted-foreground text-xs mt-1">Add dues with a category/person name to see breakdown</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topPersons.map((p) => {
                  const total = p.receivable + p.payable;
                  const net = p.receivable - p.payable;
                  return (
                    <Card key={p.name} className="rounded-2xl hover:shadow-md transition-all">
                      <CardContent className="!p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold shadow-md">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.count} active dues</p>
                              {p.phone && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-2.5 w-2.5" /> {p.phone}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className={`text-lg font-bold tabular-nums shrink-0 ${net >= 0 ? "text-green-600" : "text-destructive"}`}>
                            {net >= 0 ? "+" : ""}{formatCurrency(Math.abs(net), 0)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
                            <p className="text-[10px] text-green-600 dark:text-green-400 font-semibold uppercase">Receivable</p>
                            <p className="text-sm font-bold text-green-700 dark:text-green-400 tabular-nums">{formatCurrency(p.receivable, 0)}</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                            <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase">Payable</p>
                            <p className="text-sm font-bold text-red-700 dark:text-red-400 tabular-nums">{formatCurrency(p.payable, 0)}</p>
                          </div>
                        </div>
                        {total > 0 && (
                          <div>
                            <Progress value={(p.receivable / total) * 100} className="h-1.5" />
                            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                              <span>{((p.receivable / total) * 100).toFixed(0)}% receivable</span>
                              <span>{((p.payable / total) * 100).toFixed(0)}% payable</span>
                            </div>
                          </div>
                        )}
                        {p.phone && p.receivable > 0 && (
                          <Button
                            variant="outline" size="sm"
                            className="w-full gap-1.5 rounded-xl border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                            onClick={() => {
                              const message = `Hi ${p.name}, this is a friendly reminder from *${activeStore?.name || "our store"}*.\n\nYou have a total pending balance of *${formatCurrency(p.receivable, 0)}* across ${p.count} entries.\n\nKindly clear it at your earliest convenience. Thank you! 🙏`;
                              sendWhatsApp(p.phone, message);
                            }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Send Reminder
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* WhatsApp Reminder Modal */}
        <Dialog open={!!reminderModal} onOpenChange={(o) => !o && setReminderModal(null)}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </div>
                Send WhatsApp Reminder
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  value={reminderPhone}
                  onChange={(e) => setReminderPhone(e.target.value)}
                  placeholder="+880 17xx xxx xxx"
                  className="rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Include country code (e.g. +880 for Bangladesh)</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Message</Label>
                <Textarea
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  rows={7}
                  className="rounded-xl text-sm"
                />
              </div>
              <div className="rounded-xl bg-muted/50 p-3 flex gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  This opens WhatsApp with your message pre-filled. Customer must have WhatsApp installed.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copyReminder} className="gap-1.5 rounded-xl">
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button onClick={() => { sendWhatsApp(reminderPhone, reminderText); setReminderModal(null); }} className="gap-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white">
                <Send className="h-4 w-4" /> Send via WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              <Card className="rounded-2xl bg-muted/50 border-dashed">
                <CardContent className="!p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Preview</p>
                      <p className="text-sm font-medium">{form.category || "Person/Category"}</p>
                      {form.phone && <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-2.5 w-2.5" />{form.phone}</p>}
                    </div>
                    <div className="text-right">
                      <Badge className={form.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {form.type === "income" ? "Receivable" : "Payable"}
                      </Badge>
                      <p className={`text-lg font-bold mt-1 tabular-nums ${form.type === "income" ? "text-green-600" : "text-destructive"}`}>
                        {form.amount ? formatCurrency(Number(form.amount), 0) : `${symbol}0`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v: "income" | "expense") => setForm({ ...form, type: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income"><span className="flex items-center gap-2"><ArrowUpRight className="h-3.5 w-3.5 text-green-600" /> Receivable (Someone owes me)</span></SelectItem>
                    <SelectItem value="expense"><span className="flex items-center gap-2"><ArrowDownRight className="h-3.5 w-3.5 text-red-600" /> Payable (I owe someone)</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Amount ({symbol}) *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.amount}
                  onChange={(e) => { setForm({ ...form, amount: e.target.value }); formValidation.clearField("amount"); }}
                  error={!!formValidation.getError("amount")}
                  placeholder="Enter amount"
                  className="rounded-xl"
                />
                {formValidation.getError("amount") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("amount")}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Person / Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => { setForm({ ...form, category: e.target.value }); formValidation.clearField("category"); }}
                  error={!!formValidation.getError("category")}
                  placeholder="e.g., John Doe, Office Rent"
                  className="rounded-xl"
                />
                {formValidation.getError("category") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("category")}</p>}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone (for WhatsApp reminders)</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+880 17xx xxx xxx" className="rounded-xl" />
                <p className="text-[10px] text-muted-foreground">Optional. Include country code to enable one-click WhatsApp reminders.</p>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded-xl" />
              </div>

              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea
                  value={form.note}
                  onChange={(e) => { setForm({ ...form, note: e.target.value }); formValidation.clearField("note"); }}
                  aria-invalid={!!formValidation.getError("note")}
                  className={`rounded-xl ${formValidation.getError("note") ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  rows={3}
                  placeholder="Additional details..."
                />
                {formValidation.getError("note") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("note")}</p>}
              </div>

              <Button type="submit" className="w-full gap-2 rounded-xl">
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
