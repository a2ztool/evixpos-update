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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Download, Calendar as CalendarIcon,
  ArrowUpRight, ArrowDownRight, Filter, Search, FileText, FileSpreadsheet,
  Settings2, Link2, Sparkles, BookOpen, Activity, ArrowLeft
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, subDays, startOfDay } from "date-fns";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

interface PaymentAccount { id: string; name: string; enabled: boolean; }
interface Txn {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string | null;
  note: string | null;
  is_paid: boolean;
  created_at: string;
  store_id: string | null;
  account_id: string | null;
  order_id: string | null;
  source?: "manual" | "pos" | "woocommerce" | "due_payment";
  meta?: { gateway?: string; orderRef?: string };
}

type DatePreset = "today" | "week" | "month" | "last30" | "last90" | "year" | "all" | "custom";

const UNASSIGNED = "__unassigned__";

const AccountBook = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { format: formatCurrency } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [wcMapping, setWcMapping] = useState<Record<string, string>>({});
  const [orderGateways, setOrderGateways] = useState<Record<string, string>>({}); // order_id -> wc payment_method
  const [orderSources, setOrderSources] = useState<Record<string, string>>({}); // order_id -> source

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");

  // Manual entry sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    amount: "",
    category: "",
    note: "",
    account_id: "",
    created_at: new Date(),
  });

  // Mapping dialog
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [draftMapping, setDraftMapping] = useState<Record<string, string>>({});

  // ─── Load accounts + mapping from business_settings ───
  const loadSettings = useCallback(async () => {
    if (!activeStore || !effectiveUserId) return;
    let { data } = await supabase
      .from("business_settings")
      .select("payment_methods, notification_prefs")
      .eq("user_id", effectiveUserId)
      .eq("store_id", activeStore.id)
      .maybeSingle();
    if (!data) {
      const fb = await supabase
        .from("business_settings")
        .select("payment_methods, notification_prefs")
        .eq("user_id", effectiveUserId)
        .maybeSingle();
      data = fb.data as any;
    }
    const list = ((data?.payment_methods as any[]) || [])
      .filter((p) => p && p.enabled !== false)
      .map((p) => ({ id: String(p.id), name: p.name || p.id, enabled: !!p.enabled }));
    setAccounts(list);
    const prefs = (data?.notification_prefs as any) || {};
    setWcMapping(prefs.wc_account_mapping || {});
  }, [activeStore, effectiveUserId]);

  // ─── Load transactions + their order info ───
  const loadTxns = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    const { data: rawTxns } = await supabase
      .from("transactions")
      .select("*")
      .eq("store_id", activeStore.id)
      .eq("is_paid", true)
      .order("created_at", { ascending: false })
      .limit(2000);

    const orderIds = Array.from(new Set((rawTxns || []).map((t: any) => t.order_id).filter(Boolean)));
    let gateways: Record<string, string> = {};
    let sources: Record<string, string> = {};
    if (orderIds.length) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, payment_method, source")
        .in("id", orderIds as string[]);
      (orderData || []).forEach((o: any) => {
        gateways[o.id] = (o.payment_method || "").toLowerCase();
        sources[o.id] = (o.source || "").toLowerCase();
      });
    }
    setOrderGateways(gateways);
    setOrderSources(sources);
    setTxns((rawTxns || []) as Txn[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadTxns(); }, [loadTxns]);

  // Realtime
  useEffect(() => {
    if (!activeStore) return;
    const ch = supabase
      .channel(`accountbook-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `store_id=eq.${activeStore.id}` }, () => loadTxns())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeStore, loadTxns]);

  // ─── Resolve effective account for a transaction ───
  const resolveAccountId = useCallback(
    (t: Txn): string => {
      if (t.account_id) return t.account_id;
      if (t.order_id) {
        const gateway = orderGateways[t.order_id];
        if (gateway) {
          // 1. Manual override mapping
          const mapped = wcMapping[gateway];
          if (mapped && accounts.some((a) => a.id === mapped)) return mapped;
          // 2. Auto-match: account id equals gateway
          const auto = accounts.find((a) => a.id.toLowerCase() === gateway);
          if (auto) return auto.id;
          // 3. Common aliases
          const alias: Record<string, string> = { cod: "cash", bacs: "bank", cheque: "cash" };
          const aliased = alias[gateway];
          if (aliased && accounts.some((a) => a.id === aliased)) return aliased;
        }
      }
      return UNASSIGNED;
    },
    [orderGateways, wcMapping, accounts]
  );

  const sourceOf = useCallback((t: Txn): string => {
    if (!t.order_id) return "manual";
    const s = orderSources[t.order_id];
    if (s === "woocommerce") return "woocommerce";
    if (s === "pos") return "pos";
    return s || "order";
  }, [orderSources]);

  // ─── Date filter ───
  const dateRange = useMemo((): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: startOfDay(now), to: now };
      case "week": return { from: startOfWeek(now), to: endOfWeek(now) };
      case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last30": return { from: subDays(now, 30), to: now };
      case "last90": return { from: subDays(now, 90), to: now };
      case "year": return { from: new Date(now.getFullYear(), 0, 1), to: now };
      case "custom": return customFrom && customTo ? { from: customFrom, to: customTo } : null;
      default: return null;
    }
  }, [datePreset, customFrom, customTo]);

  // Enriched txns with resolved account
  const enriched = useMemo(
    () => txns.map((t) => ({ ...t, _accountId: resolveAccountId(t), _source: sourceOf(t) })),
    [txns, resolveAccountId, sourceOf]
  );

  const dateFiltered = useMemo(() => {
    if (!dateRange) return enriched;
    return enriched.filter((t) => isWithinInterval(new Date(t.created_at), { start: dateRange.from, end: dateRange.to }));
  }, [enriched, dateRange]);

  // ─── Per-account summary (always all-time for balance, date-filtered for period) ───
  const accountSummaries = useMemo(() => {
    const allAccounts = [...accounts, { id: UNASSIGNED, name: "Unassigned", enabled: true }];
    return allAccounts.map((acc) => {
      let allIncome = 0, allExpense = 0, allCount = 0;
      let periodIncome = 0, periodExpense = 0, periodCount = 0;
      enriched.forEach((t) => {
        if (t._accountId !== acc.id) return;
        const amt = Number(t.amount) || 0;
        if (t.type === "income") allIncome += amt; else allExpense += amt;
        allCount += 1;
        if (dateRange && !isWithinInterval(new Date(t.created_at), { start: dateRange.from, end: dateRange.to })) return;
        if (t.type === "income") periodIncome += amt; else periodExpense += amt;
        periodCount += 1;
      });
      return {
        ...acc,
        balance: allIncome - allExpense,
        allIncome, allExpense, allCount,
        periodIncome, periodExpense, periodCount,
      };
    }).filter((a) => a.id !== UNASSIGNED);
  }, [enriched, accounts, dateRange]);

  const totals = useMemo(() => {
    const t = accountSummaries.reduce(
      (acc, a) => ({
        balance: acc.balance + a.balance,
        income: acc.income + a.periodIncome,
        expense: acc.expense + a.periodExpense,
        count: acc.count + a.periodCount,
      }),
      { balance: 0, income: 0, expense: 0, count: 0 }
    );
    return t;
  }, [accountSummaries]);

  // ─── Detail view filtering ───
  const visibleTxns = useMemo(() => {
    return dateFiltered.filter((t) => {
      if (activeAccountId && t._accountId !== activeAccountId) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${t.category || ""} ${t.note || ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dateFiltered, activeAccountId, typeFilter, search]);

  const pagination = usePagination(visibleTxns.length, {
    storageKey: `pg:account-book:${activeStore?.id ?? "none"}`,
    filterSignature: JSON.stringify({ activeAccountId, typeFilter, search, datePreset, customFrom, customTo }),
  });
  const pagedTxns = useMemo(
    () => paginate(visibleTxns, pagination.page, pagination.pageSize),
    [visibleTxns, pagination.page, pagination.pageSize],
  );

  const accountName = useCallback((id: string) => {
    if (id === UNASSIGNED) return "Unassigned";
    return accounts.find((a) => a.id === id)?.name || id;
  }, [accounts]);

  // ─── Manual entry submit ───
  const submitManual = async () => {
    if (!activeStore || !effectiveUserId) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.account_id) { toast.error("Select an account"); return; }
    const { error } = await supabase.from("transactions").insert({
      user_id: effectiveUserId,
      store_id: activeStore.id,
      type: form.type,
      amount: amt,
      category: form.category || (form.type === "income" ? "Other Income" : "Other Expense"),
      note: form.note,
      account_id: form.account_id,
      is_paid: true,
      created_at: form.created_at.toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.type === "income" ? "Income" : "Expense"} added`);
    setSheetOpen(false);
    setForm({ type: "income", amount: "", category: "", note: "", account_id: "", created_at: new Date() });
    loadTxns();
  };

  // ─── Save WC mapping (uses business_settings.notification_prefs as kv store to avoid migration) ───
  const openMappingDialog = () => {
    setDraftMapping({ ...wcMapping });
    setMapDialogOpen(true);
  };
  const saveMapping = async () => {
    if (!activeStore || !effectiveUserId) return;
    const { data: existing } = await supabase
      .from("business_settings")
      .select("id, notification_prefs")
      .eq("user_id", effectiveUserId)
      .eq("store_id", activeStore.id)
      .maybeSingle();
    const newPrefs = { ...((existing?.notification_prefs as any) || {}), wc_account_mapping: draftMapping };
    if (existing?.id) {
      await supabase.from("business_settings").update({ notification_prefs: newPrefs }).eq("id", existing.id);
    } else {
      await supabase.from("business_settings").insert({
        user_id: effectiveUserId, store_id: activeStore.id, notification_prefs: newPrefs,
      });
    }
    setWcMapping(draftMapping);
    setMapDialogOpen(false);
    toast.success("Gateway mapping saved");
  };

  // ─── Distinct WC gateways present in this store's orders ───
  const wcGateways = useMemo(() => {
    const set = new Set<string>();
    Object.entries(orderGateways).forEach(([oid, g]) => {
      if (g && orderSources[oid] === "woocommerce") set.add(g);
    });
    return Array.from(set);
  }, [orderGateways, orderSources]);

  // ─── Exports ───
  const downloadCSV = (mode: "account" | "summary") => {
    let csv = "";
    if (mode === "summary") {
      csv = "Account,Income,Expense,Balance,Transactions\n";
      accountSummaries.forEach((a) => {
        csv += `"${a.name}",${a.periodIncome},${a.periodExpense},${a.balance},${a.periodCount}\n`;
      });
    } else {
      const accId = activeAccountId || "all";
      const accLabel = accId === "all" ? "All Accounts" : accountName(accId);
      csv = `Statement: ${accLabel}\nDate,Type,Account,Category,Source,Amount,Note\n`;
      let running = 0;
      [...visibleTxns].reverse().forEach((t) => {
        const amt = Number(t.amount) || 0;
        running += t.type === "income" ? amt : -amt;
        csv += `${format(new Date(t.created_at), "yyyy-MM-dd HH:mm")},${t.type},"${accountName(t._accountId)}","${t.category || ""}",${t._source},${t.type === "income" ? amt : -amt},"${(t.note || "").replace(/"/g, '""')}"\n`;
      });
      csv += `\nClosing Balance,${running}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `account-book-${mode}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = (mode: "account" | "summary") => {
    const accLabel = mode === "summary" ? "All Accounts Summary" : (activeAccountId ? accountName(activeAccountId) : "All Accounts");
    const periodLabel = dateRange ? `${format(dateRange.from, "PP")} → ${format(dateRange.to, "PP")}` : "All Time";
    const css = `
      body{font-family:Inter,Arial,sans-serif;padding:24px;color:#0f172a}
      h1{margin:0 0 4px}
      .meta{color:#64748b;font-size:12px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
      th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:left}
      th{background:#f8fafc;text-transform:uppercase;font-size:10px;letter-spacing:0.05em;color:#475569}
      .income{color:#16a34a}
      .expense{color:#dc2626}
      .totals{margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;display:flex;gap:24px}
      .totals div{flex:1}
      .totals strong{display:block;font-size:18px;margin-top:4px}
    `;
    let body = "";
    if (mode === "summary") {
      body = `<table><thead><tr><th>Account</th><th>Income</th><th>Expense</th><th>Net</th><th>Txns</th></tr></thead><tbody>`;
      accountSummaries.forEach((a) => {
        body += `<tr><td>${a.name}</td><td class="income">+${formatCurrency(a.periodIncome)}</td><td class="expense">-${formatCurrency(a.periodExpense)}</td><td><strong>${formatCurrency(a.periodIncome - a.periodExpense)}</strong></td><td>${a.periodCount}</td></tr>`;
      });
      body += `</tbody></table>`;
      body += `<div class="totals"><div>Total Income<strong class="income">+${formatCurrency(totals.income)}</strong></div><div>Total Expense<strong class="expense">-${formatCurrency(totals.expense)}</strong></div><div>Net Balance<strong>${formatCurrency(totals.balance)}</strong></div></div>`;
    } else {
      body = `<table><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Category</th><th>Source</th><th>Note</th><th>Amount</th><th>Balance</th></tr></thead><tbody>`;
      let running = 0;
      [...visibleTxns].reverse().forEach((t) => {
        const amt = Number(t.amount) || 0;
        running += t.type === "income" ? amt : -amt;
        body += `<tr><td>${format(new Date(t.created_at), "PP p")}</td><td class="${t.type}">${t.type}</td><td>${accountName(t._accountId)}</td><td>${t.category || "-"}</td><td>${t._source}</td><td>${t.note || "-"}</td><td class="${t.type}">${t.type === "income" ? "+" : "-"}${formatCurrency(amt)}</td><td>${formatCurrency(running)}</td></tr>`;
      });
      body += `</tbody></table>`;
    }
    const html = `<!DOCTYPE html><html><head><title>Account Book - ${accLabel}</title><style>${css}</style></head><body><h1>${accLabel}</h1><div class="meta">${periodLabel} • ${activeStore?.name || ""} • Generated ${format(new Date(), "PPp")}</div>${body}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow popups to export PDF"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-5 max-w-7xl mx-auto px-2 sm:px-4 pb-4">
        {/* Header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">Account Book</h1>
                    <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> LIVE
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">Auto-synced ledger across all your payment accounts</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={openMappingDialog} className="gap-1.5 h-8 text-xs flex-1 sm:flex-none">
                  <Link2 className="h-3.5 w-3.5" /> <span className="hidden xs:inline sm:inline">WC </span>Mapping
                </Button>
                <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                  <SelectTrigger className="w-[120px] sm:w-[150px] h-8 text-xs flex-1 sm:flex-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="last30">Last 30 days</SelectItem>
                    <SelectItem value="last90">Last 90 days</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {datePreset === "custom" && (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {customFrom ? format(customFrom, "MMM d") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-auto"><CalendarComponent mode="single" selected={customFrom} onSelect={setCustomFrom} /></PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {customTo ? format(customTo, "MMM d") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-auto"><CalendarComponent mode="single" selected={customTo} onSelect={setCustomTo} /></PopoverContent>
                    </Popover>
                  </>
                )}
                <Button size="sm" className="gap-1.5 h-8 text-xs flex-1 sm:flex-none" onClick={() => setSheetOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> <span className="sm:inline">Manual Entry</span>
                </Button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-4 sm:mt-6">
              <KPI label="Net Balance" value={formatCurrency(totals.balance)} icon={Wallet} tone="primary" />
              <KPI label="Income (period)" value={`+${formatCurrency(totals.income)}`} icon={TrendingUp} tone="success" />
              <KPI label="Expense (period)" value={`-${formatCurrency(totals.expense)}`} icon={TrendingDown} tone="danger" />
              <KPI label="Transactions" value={String(totals.count)} icon={Activity} tone="muted" />
            </div>
          </CardContent>
        </Card>

        {/* Account cards grid */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3 px-1">
            <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2 min-w-0">
              <Wallet className="h-4 w-4 text-primary" /> Accounts ({accountSummaries.length})
            </h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => downloadCSV("summary")} className="gap-1.5 text-xs h-8 px-2 sm:px-3">
                <FileSpreadsheet className="h-3 w-3" /> <span className="hidden sm:inline">CSV Summary</span><span className="sm:hidden">CSV</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadPDF("summary")} className="gap-1.5 text-xs h-8 px-2 sm:px-3">
                <FileText className="h-3 w-3" /> <span className="hidden sm:inline">PDF Summary</span><span className="sm:hidden">PDF</span>
              </Button>
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 sm:h-32 rounded-xl" />)}
            </div>
          ) : accountSummaries.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 sm:p-8 text-center text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-xs sm:text-sm">No accounts yet — add payment methods in <strong>Settings → Payments</strong> to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {accountSummaries.map((a) => {
                const active = activeAccountId === a.id;
                return (
                  <Card
                    key={a.id}
                    onClick={() => setActiveAccountId(active ? null : a.id)}
                    className={`cursor-pointer transition-all hover:shadow-md ${active ? "ring-2 ring-primary border-primary/40 shadow-md" : "hover:border-primary/30"}`}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0 ${a.id === UNASSIGNED ? "bg-muted" : "bg-primary/10"}`}>
                            <Wallet className={`h-4 w-4 ${a.id === UNASSIGNED ? "text-muted-foreground" : "text-primary"}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs sm:text-sm truncate">{a.name}</div>
                            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{a.allCount} txns</div>
                          </div>
                        </div>
                        <Badge variant={a.balance >= 0 ? "default" : "destructive"} className="text-[10px] shrink-0 whitespace-nowrap">
                          {a.balance >= 0 ? "+" : ""}{formatCurrency(a.balance)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-xs pt-2 sm:pt-3 border-t">
                        <div className="flex items-center gap-1 min-w-0">
                          <ArrowUpRight className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="text-muted-foreground">In:</span>
                          <span className="font-semibold text-emerald-600 truncate">{formatCurrency(a.periodIncome)}</span>
                        </div>
                        <div className="flex items-center gap-1 min-w-0">
                          <ArrowDownRight className="h-3 w-3 text-rose-600 shrink-0" />
                          <span className="text-muted-foreground">Out:</span>
                          <span className="font-semibold text-rose-600 truncate">{formatCurrency(a.periodExpense)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail/transaction view */}
        <Card>
          <CardHeader className="pb-3 p-3 sm:p-6 sm:pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {activeAccountId && (
                  <Button variant="ghost" size="sm" onClick={() => setActiveAccountId(null)} className="h-7 gap-1">
                    <ArrowLeft className="h-3.5 w-3.5" /> All
                  </Button>
                )}
                <CardTitle className="text-sm sm:text-base truncate">
                  {activeAccountId ? `${accountName(activeAccountId)} · Statement` : "Recent Transactions"}
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 w-full sm:w-[180px] text-xs" />
                </div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                  <SelectTrigger className="h-8 w-[100px] sm:w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => downloadCSV("account")} className="gap-1.5 text-xs h-8 px-2 sm:px-3">
                  <Download className="h-3 w-3" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadPDF("account")} className="gap-1.5 text-xs h-8 px-2 sm:px-3">
                  <FileText className="h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-3 sm:p-6 space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : visibleTxns.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-muted-foreground text-sm">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No transactions in this view.
              </div>
            ) : (
              <>
                {/* Mobile list */}
                <div className="sm:hidden divide-y">
                  {pagedTxns.map((t) => (
                    <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                        {t.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-[13px] font-semibold truncate">{accountName(t._accountId)}</div>
                          <Badge variant="outline" className="text-[8px] uppercase tracking-wider px-1 py-0 h-3.5 shrink-0">{t._source}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {t.category || "—"}{t.note ? ` · ${t.note}` : ""}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(t.created_at), "PP p")}</div>
                      </div>
                      <div className={`text-sm font-bold whitespace-nowrap ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedTxns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(t.created_at), "PP p")}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === "income" ? "default" : "destructive"} className="text-[10px] gap-1">
                            {t.type === "income" ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{accountName(t._accountId)}</TableCell>
                        <TableCell className="text-xs">{t.category || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{t._source}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.note || "-"}</TableCell>
                        <TableCell className={`text-right font-semibold text-sm ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                          {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
                <div className="px-3 sm:px-4 py-2">
                  <DataPagination
                    page={pagination.page}
                    pageSize={pagination.pageSize}
                    total={visibleTxns.length}
                    onPageChange={pagination.setPage}
                    onPageSizeChange={pagination.setPageSize}
                    itemLabel="transactions"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual entry sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Manual Entry</SheetTitle>
            <SheetDescription>Record income or expense linked to an account.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <Tabs value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "income" | "expense" })}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="income" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Income</TabsTrigger>
                <TabsTrigger value="expense" className="gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> Expense</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-1.5">
              <Label>Account *</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={form.type === "income" ? "Sales, Refund…" : "Rent, Utilities…"} />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" /> {format(form.created_at, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto"><CalendarComponent mode="single" selected={form.created_at} onSelect={(d) => d && setForm({ ...form, created_at: d })} /></PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={submitManual}>Save Entry</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* WC Mapping dialog */}
      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> WooCommerce → Account Mapping</DialogTitle>
            <DialogDescription>
              Auto-match by name is used by default. Override here to send specific WooCommerce gateways into a chosen account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {wcGateways.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No WooCommerce orders found yet — mappings will appear here once orders sync.
              </p>
            ) : wcGateways.map((g) => (
              <div key={g} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium capitalize">{g}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">WC gateway</div>
                </div>
                <Select
                  value={draftMapping[g] || "__auto__"}
                  onValueChange={(v) => {
                    const next = { ...draftMapping };
                    if (v === "__auto__") delete next[g]; else next[g] = v;
                    setDraftMapping(next);
                  }}
                >
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Auto-match</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveMapping}>Save Mapping</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const KPI = ({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: "primary" | "success" | "danger" | "muted" }) => {
  const map = {
    primary: "from-primary/15 to-primary/5 text-primary",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
    danger: "from-rose-500/15 to-rose-500/5 text-rose-600",
    muted: "from-muted to-muted/50 text-muted-foreground",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${map[tone]} p-3 border border-border/40`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</span>
        <Icon className="h-3.5 w-3.5 opacity-70" />
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
};

export default AccountBook;