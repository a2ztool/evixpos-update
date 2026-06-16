import { useEffect, useState, useMemo, useCallback } from "react";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Search, Megaphone, MousePointerClick, DollarSign,
  TrendingUp, TrendingDown, Target, Eye, BarChart3, Download, FileText,
  Calendar, Zap, ArrowUpRight, ArrowDownRight, Sparkles, BookOpen,
  ChevronUp, ChevronDown, Lightbulb, Activity, Award, AlertTriangle,
  CheckCircle2, Info, LineChart as LineChartIcon, Flame
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, differenceInDays } from "date-fns";

interface AdCost {
  id: string;
  platform: string;
  campaign_name: string;
  amount: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ad_date: string;
  notes: string | null;
  store_id: string | null;
}

const PLATFORMS = ["Facebook", "Google", "Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn", "Snapchat", "Other"];

const PLATFORM_COLORS: Record<string, string> = {
  Facebook: "#1877F2", Google: "#4285F4", Instagram: "#E4405F", TikTok: "#010101",
  YouTube: "#FF0000", "Twitter/X": "#1DA1F2", LinkedIn: "#0A66C2", Snapchat: "#FFFC00", Other: "#6b7280"
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6"];

type DatePreset = "today" | "week" | "month" | "last30" | "last90" | "year" | "all" | "custom";

const AdCosts = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [ads, setAds] = useState<AdCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    platform: "Facebook", campaign_name: "", amount: "", impressions: "", clicks: "",
    conversions: "", revenue: "", ad_date: new Date().toISOString().split("T")[0], notes: ""
  });
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [showGuide, setShowGuide] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchAds = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    const { data } = await supabase
      .from("ad_costs")
      .select("*")
      .eq("store_id", activeStore.id)
      .order("ad_date", { ascending: false });
    if (data) setAds(data as AdCost[]);
    setLoading(false);
  }, [activeStore]);

  useEffect(() => {
    if (user && activeStore) fetchAds();
  }, [user, activeStore, fetchAds]);

  // Real-time
  useEffect(() => {
    if (!user || !activeStore) return;
    const channel = supabase
      .channel(`ad-costs-${activeStore.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "ad_costs",
        filter: `store_id=eq.${activeStore.id}`
      }, () => fetchAds());
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeStore, fetchAds]);

  const getDateRange = useCallback((): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (datePreset) {
      case "today": return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
      case "week": return { from: startOfWeek(now), to: endOfWeek(now) };
      case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last30": return { from: subDays(now, 30), to: now };
      case "last90": return { from: subDays(now, 90), to: now };
      case "year": return { from: new Date(now.getFullYear(), 0, 1), to: now };
      case "custom":
        if (customDateFrom && customDateTo) return { from: customDateFrom, to: customDateTo };
        return null;
      case "all": return null;
      default: return null;
    }
  }, [datePreset, customDateFrom, customDateTo]);

  const filtered = useMemo(() => {
    const range = getDateRange();
    return ads.filter((a) => {
      if (platformFilter !== "all" && a.platform !== platformFilter) return false;
      if (search && ![a.campaign_name, a.platform, a.notes].some((f) => (f || "").toLowerCase().includes(search.toLowerCase()))) return false;
      if (range) {
        const d = new Date(a.ad_date);
        if (!isWithinInterval(d, { start: range.from, end: range.to })) return false;
      }
      return true;
    });
  }, [ads, platformFilter, search, getDateRange]);

  const pagination = usePagination(filtered.length, {
    storageKey: `pg:ad-costs:${activeStore?.id ?? "none"}`,
    filterSignature: JSON.stringify({ search, platformFilter, datePreset, customDateFrom, customDateTo }),
  });
  const pagedFiltered = useMemo(
    () => paginate(filtered, pagination.page, pagination.pageSize),
    [filtered, pagination.page, pagination.pageSize],
  );

  const stats = useMemo(() => {
    const totalSpend = filtered.reduce((s, a) => s + Number(a.amount), 0);
    const totalRevenue = filtered.reduce((s, a) => s + Number(a.revenue), 0);
    const totalClicks = filtered.reduce((s, a) => s + a.clicks, 0);
    const totalImpressions = filtered.reduce((s, a) => s + a.impressions, 0);
    const totalConversions = filtered.reduce((s, a) => s + a.conversions, 0);
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const profit = totalRevenue - totalSpend;
    const convRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    return { totalSpend, totalRevenue, roas, cpc, ctr, profit, totalClicks, totalImpressions, totalConversions, convRate, cpa, campaigns: filtered.length };
  }, [filtered]);

  // Period-over-period comparison
  const prevPeriodStats = useMemo(() => {
    const range = getDateRange();
    if (!range) return null;
    const days = Math.max(1, differenceInDays(range.to, range.from));
    const prevTo = subDays(range.from, 1);
    const prevFrom = subDays(prevTo, days);
    const prev = ads.filter((a) => {
      if (platformFilter !== "all" && a.platform !== platformFilter) return false;
      const d = new Date(a.ad_date);
      return isWithinInterval(d, { start: prevFrom, end: prevTo });
    });
    const spend = prev.reduce((s, a) => s + Number(a.amount), 0);
    const revenue = prev.reduce((s, a) => s + Number(a.revenue), 0);
    return { spend, revenue, profit: revenue - spend, roas: spend > 0 ? revenue / spend : 0 };
  }, [ads, platformFilter, getDateRange]);

  const deltas = useMemo(() => {
    if (!prevPeriodStats) return null;
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      spend: pct(stats.totalSpend, prevPeriodStats.spend),
      revenue: pct(stats.totalRevenue, prevPeriodStats.revenue),
      profit: pct(stats.profit, prevPeriodStats.profit),
      roas: pct(stats.roas, prevPeriodStats.roas),
    };
  }, [stats, prevPeriodStats]);

  // Smart insights
  const insights = useMemo(() => {
    const list: { type: "good" | "warn" | "info"; text: string }[] = [];
    if (stats.roas >= 3) list.push({ type: "good", text: `Outstanding ROAS of ${stats.roas.toFixed(2)}x — scale these campaigns!` });
    else if (stats.roas >= 1.5) list.push({ type: "info", text: `Healthy ROAS (${stats.roas.toFixed(2)}x). Optimize creatives to push above 3x.` });
    else if (stats.totalSpend > 0) list.push({ type: "warn", text: `Low ROAS (${stats.roas.toFixed(2)}x). Pause underperformers & test new audiences.` });

    if (deltas && deltas.revenue > 15) list.push({ type: "good", text: `Revenue up ${deltas.revenue.toFixed(0)}% vs previous period 🚀` });
    else if (deltas && deltas.revenue < -15) list.push({ type: "warn", text: `Revenue dropped ${Math.abs(deltas.revenue).toFixed(0)}%. Check ad fatigue.` });

    if (stats.ctr > 0 && stats.ctr < 1) list.push({ type: "warn", text: `CTR ${stats.ctr.toFixed(2)}% is low — refresh ad creative & copy.` });
    else if (stats.ctr >= 2) list.push({ type: "good", text: `Strong CTR of ${stats.ctr.toFixed(2)}% — great audience-creative fit.` });

    if (stats.totalConversions > 0 && stats.cpa > 0 && stats.cpa > stats.totalRevenue / Math.max(1, stats.totalConversions)) {
      list.push({ type: "warn", text: `CPA (৳${stats.cpa.toFixed(0)}) is higher than avg order value — unprofitable.` });
    }
    if (list.length === 0) list.push({ type: "info", text: "Add ad campaigns to unlock smart insights & ROI tracking." });
    return list.slice(0, 4);
  }, [stats, deltas]);


  const platformChart = useMemo(() => {
    const map: Record<string, { platform: string; spend: number; revenue: number; clicks: number; conversions: number }> = {};
    filtered.forEach((a) => {
      if (!map[a.platform]) map[a.platform] = { platform: a.platform, spend: 0, revenue: 0, clicks: 0, conversions: 0 };
      map[a.platform].spend += Number(a.amount);
      map[a.platform].revenue += Number(a.revenue);
      map[a.platform].clicks += a.clicks;
      map[a.platform].conversions += a.conversions;
    });
    return Object.values(map).sort((a, b) => b.spend - a.spend);
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const map: Record<string, { day: string; spend: number; revenue: number }> = {};
    filtered.forEach((a) => {
      const d = format(new Date(a.ad_date), "dd MMM");
      if (!map[d]) map[d] = { day: d, spend: 0, revenue: 0 };
      map[d].spend += Number(a.amount);
      map[d].revenue += Number(a.revenue);
    });
    return Object.values(map).reverse().slice(-14);
  }, [filtered]);

  const platformPie = useMemo(() => {
    return platformChart.map((p) => ({ name: p.platform, value: p.spend }));
  }, [platformChart]);

  const topCampaigns = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (Number(b.revenue) - Number(b.amount)) - (Number(a.revenue) - Number(a.amount)))
      .slice(0, 5);
  }, [filtered]);

  const openAdd = () => {
    setEditId(null);
    setForm({ platform: "Facebook", campaign_name: "", amount: "", impressions: "", clicks: "", conversions: "", revenue: "", ad_date: new Date().toISOString().split("T")[0], notes: "" });
    setSheetOpen(true);
  };

  const openEdit = (a: AdCost) => {
    setEditId(a.id);
    setForm({
      platform: a.platform, campaign_name: a.campaign_name,
      amount: String(a.amount), impressions: String(a.impressions),
      clicks: String(a.clicks), conversions: String(a.conversions),
      revenue: String(a.revenue), ad_date: a.ad_date, notes: a.notes || ""
    });
    setSheetOpen(true);
  };

  const [campaignError, setCampaignError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaign_name.trim()) {
      setCampaignError("Campaign name is required");
      toast.error("Campaign name is required");
      return;
    }
    setCampaignError("");
    const payload = {
      platform: form.platform, campaign_name: form.campaign_name.trim(),
      amount: Number(form.amount) || 0, impressions: Number(form.impressions) || 0,
      clicks: Number(form.clicks) || 0, conversions: Number(form.conversions) || 0,
      revenue: Number(form.revenue) || 0, ad_date: form.ad_date, notes: form.notes
    };
    if (editId) {
      const { error } = await supabase.from("ad_costs").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Ad cost updated!");
    } else {
      const { error } = await supabase.from("ad_costs").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore?.id });
      if (error) toast.error(error.message); else toast.success("Ad cost added!");
    }
    setSheetOpen(false);
    fetchAds();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ad_costs").delete().eq("id", id);
    toast.success("Ad cost deleted");
    fetchAds();
  };

  const exportCSV = () => {
    const headers = ["Date", "Platform", "Campaign", "Spend", "Revenue", "Profit", "Impressions", "Clicks", "Conversions", "CPC", "CTR%", "ROAS", "Notes"];
    const rows = filtered.map((a) => {
      const spend = Number(a.amount);
      const rev = Number(a.revenue);
      const cpc = a.clicks > 0 ? (spend / a.clicks).toFixed(2) : "0";
      const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1) : "0";
      const roas = spend > 0 ? (rev / spend).toFixed(2) : "0";
      return [a.ad_date, a.platform, `"${a.campaign_name}"`, spend.toFixed(2), rev.toFixed(2), (rev - spend).toFixed(2), a.impressions, a.clicks, a.conversions, cpc, ctr, roas, `"${(a.notes || "").replace(/"/g, '""')}"`];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ad-costs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const renderDelta = (val: number | undefined | null) => {
    if (val === null || val === undefined) return null;
    const pos = val >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${pos ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
        {pos ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
        {Math.abs(val).toFixed(1)}%
      </span>
    );
  };

  return (
    <DashboardLayout>
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-orange-500/10 via-background to-violet-500/10 p-5 sm:p-6 mb-5">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-500 to-violet-500 flex items-center justify-center shadow-lg shrink-0">
              <Megaphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ad Cost Manager</h1>
                <Badge className="bg-gradient-to-r from-orange-500 to-violet-500 text-white border-0 text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> PRO
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Track campaigns, ROAS & smart insights to optimize ad spend
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowGuide(!showGuide)} className="gap-1.5 rounded-xl">
              <BookOpen className="h-4 w-4" /> Guide {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
            <Button size="sm" onClick={openAdd} className="gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-violet-500 hover:opacity-90 text-white border-0">
              <Plus className="h-4 w-4" /> Add Ad
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Guide */}
      {showGuide && (
        <Card className="mb-5 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <Lightbulb className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Quick Guide — Master your Ad ROI</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Understand each metric and how to act on it.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Zap, color: "text-amber-500 bg-amber-500/10", title: "ROAS (Return on Ad Spend)", desc: "Revenue ÷ Spend. Above 3x = excellent, 1.5–3x = good, below 1x = losing money." },
                { icon: MousePointerClick, color: "text-blue-500 bg-blue-500/10", title: "CTR (Click-through Rate)", desc: "Clicks ÷ Impressions. Above 2% = strong creative-audience fit." },
                { icon: DollarSign, color: "text-emerald-500 bg-emerald-500/10", title: "CPC (Cost per Click)", desc: "Lower is better. Compare across platforms to spot deals." },
                { icon: Target, color: "text-violet-500 bg-violet-500/10", title: "CPA (Cost per Acquisition)", desc: "Spend ÷ Conversions. Must stay below avg order value to stay profitable." },
                { icon: Activity, color: "text-cyan-500 bg-cyan-500/10", title: "Period Comparison", desc: "Green ▲ = growth vs prior equal period. Red ▼ = decline — investigate." },
                { icon: Award, color: "text-pink-500 bg-pink-500/10", title: "Top Campaigns", desc: "Scale these winners. Pause campaigns with negative profit." },
              ].map((g) => (
                <div key={g.title} className="flex gap-3 p-3 rounded-xl bg-card border border-border/40">
                  <div className={`h-8 w-8 rounded-lg ${g.color} flex items-center justify-center shrink-0`}>
                    <g.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{g.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total Spend", value: `৳${stats.totalSpend.toLocaleString()}`, icon: DollarSign, bg: "bg-red-500/10 text-red-500", delta: deltas?.spend, valueClass: "text-destructive" },
          { label: "Revenue", value: `৳${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, bg: "bg-emerald-500/10 text-emerald-600", delta: deltas?.revenue, valueClass: "text-emerald-600" },
          { label: "ROAS", value: `${stats.roas.toFixed(2)}x`, icon: Zap, bg: "bg-amber-500/10 text-amber-500", delta: deltas?.roas, valueClass: stats.roas >= 1 ? "text-emerald-600" : "text-destructive" },
          { label: "Net Profit", value: `${stats.profit >= 0 ? "+" : ""}৳${stats.profit.toLocaleString()}`, icon: stats.profit >= 0 ? ArrowUpRight : ArrowDownRight, bg: stats.profit >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500", delta: deltas?.profit, valueClass: stats.profit >= 0 ? "text-emerald-600" : "text-destructive" },
        ].map((k) => (
          <Card key={k.label} className="rounded-2xl">
            <CardContent className="!p-3.5 sm:!p-4 flex items-center gap-3">
              <div className={`h-9 w-9 shrink-0 rounded-xl ${k.bg} flex items-center justify-center`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{k.label}</p>
                  {renderDelta(k.delta)}
                </div>
                {loading ? <Skeleton className="h-6 w-20 mt-1" /> : (
                  <p className={`text-lg sm:text-xl font-bold tabular-nums mt-0.5 truncate ${k.valueClass}`}>{k.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-5">
        {[
          { label: "Clicks", value: stats.totalClicks.toLocaleString(), icon: MousePointerClick, color: "text-blue-500 bg-blue-500/10" },
          { label: "Impressions", value: stats.totalImpressions.toLocaleString(), icon: Eye, color: "text-cyan-500 bg-cyan-500/10" },
          { label: "Conversions", value: stats.totalConversions.toLocaleString(), icon: Target, color: "text-emerald-600 bg-emerald-500/10" },
          { label: "CTR", value: `${stats.ctr.toFixed(1)}%`, icon: BarChart3, color: "text-violet-500 bg-violet-500/10" },
          { label: "CPC", value: `৳${stats.cpc.toFixed(1)}`, icon: DollarSign, color: "text-amber-500 bg-amber-500/10" },
          { label: "CPA", value: `৳${stats.cpa.toFixed(0)}`, icon: Flame, color: "text-pink-500 bg-pink-500/10" },
        ].map((m) => (
          <Card key={m.label} className="rounded-2xl">
            <CardContent className="!p-3 text-center">
              <div className={`h-7 w-7 rounded-lg ${m.color} flex items-center justify-center mx-auto mb-1.5`}>
                <m.icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">{m.label}</p>
              {loading ? <Skeleton className="h-4 w-12 mx-auto mt-1" /> : (
                <p className="text-sm font-bold tabular-nums">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Smart Insights */}
      {!loading && (
        <Card className="mb-5 rounded-2xl border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-card to-violet-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500 to-violet-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold">Smart Insights</h3>
              <Badge variant="outline" className="text-[10px] ml-auto">AI Powered</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {insights.map((ins, i) => {
                const cfg = ins.type === "good"
                  ? { Icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10" }
                  : ins.type === "warn"
                  ? { Icon: AlertTriangle, cls: "text-amber-500 bg-amber-500/10" }
                  : { Icon: Info, cls: "text-blue-500 bg-blue-500/10" };
                return (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-card border border-border/40">
                    <div className={`h-7 w-7 rounded-lg ${cfg.cls} flex items-center justify-center shrink-0`}>
                      <cfg.Icon className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-xs leading-relaxed">{ins.text}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 mb-5">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex rounded-xl">
          <TabsTrigger value="overview" className="gap-1.5 rounded-lg"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span></TabsTrigger>
          <TabsTrigger value="platforms" className="gap-1.5 rounded-lg"><Megaphone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Platforms</span></TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5 rounded-lg"><Award className="h-3.5 w-3.5" /><span className="hidden sm:inline">Top Campaigns</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Spend vs Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="!pt-0">
                {loading ? <Skeleton className="h-[220px] w-full" /> : dailyTrend.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No trend data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="spendG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="day" fontSize={10} tickLine={false} />
                      <YAxis fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Area type="monotone" dataKey="spend" stroke="#ef4444" fill="url(#spendG)" strokeWidth={2} name="Spend" />
                      <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revG)" strokeWidth={2} name="Revenue" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" /> Spend by Platform
                </CardTitle>
              </CardHeader>
              <CardContent className="!pt-0">
                {loading ? <Skeleton className="h-[220px] w-full" /> : platformPie.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                    <Megaphone className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">No platform data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={platformPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                        {platformPie.map((entry, i) => (
                          <Cell key={i} fill={PLATFORM_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Spend"]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ROAS Health */}
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">ROAS Health</h3>
                </div>
                <span className="text-sm font-bold tabular-nums">{stats.roas.toFixed(2)}x</span>
              </div>
              <Progress value={Math.min(100, (stats.roas / 5) * 100)} className="h-2 mb-2" />
              <p className="text-[11px] text-muted-foreground">
                {stats.roas >= 3 ? "🚀 Excellent — scale aggressively." : stats.roas >= 1.5 ? "👍 Healthy — keep optimizing creatives." : stats.roas >= 1 ? "⚠️ Break-even — needs improvement." : stats.totalSpend > 0 ? "🔴 Losing money — pause and rethink." : "Add campaigns to evaluate ROAS."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platforms" className="space-y-4 mt-0">
          {platformChart.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Megaphone className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No platform data yet</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Platform Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="!pt-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={platformChart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="platform" fontSize={10} tickLine={false} />
                      <YAxis fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="spend" fill="#ef4444" radius={[4, 4, 0, 0]} name="Spend" />
                      <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" /> Platform Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {platformChart.map((p, i) => {
                      const profit = p.revenue - p.spend;
                      const roas = p.spend > 0 ? p.revenue / p.spend : 0;
                      const max = platformChart[0].spend || 1;
                      const pct = (p.spend / max) * 100;
                      return (
                        <div key={p.platform} className="p-3 rounded-xl border border-border/40 hover:border-primary/40 transition-all">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p.platform] || "#6b7280" }}>
                              #{i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{p.platform}</p>
                              <p className="text-[10px] text-muted-foreground">{p.clicks.toLocaleString()} clicks • {p.conversions} conv.</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                {profit >= 0 ? "+" : ""}৳{profit.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-muted-foreground">ROAS: {roas.toFixed(2)}x</p>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PLATFORM_COLORS[p.platform] || "#6b7280" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4 mt-0">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Top Performing Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Award className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">No campaigns yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topCampaigns.map((a, i) => {
                    const profit = Number(a.revenue) - Number(a.amount);
                    const roas = Number(a.amount) > 0 ? (Number(a.revenue) / Number(a.amount)) : 0;
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-muted/30 transition-all">
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${i === 0 ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white" : i === 1 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white" : i === 2 ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white" : "bg-primary/10 text-primary"}`}>
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{a.campaign_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px]" style={{ borderColor: PLATFORM_COLORS[a.platform], color: PLATFORM_COLORS[a.platform] }}>{a.platform}</Badge>
                            <span className="text-[10px] text-muted-foreground">{a.ad_date}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {profit >= 0 ? "+" : ""}৳{profit.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">ROAS: {roas.toFixed(2)}x</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search campaigns..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Period" /></SelectTrigger>
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

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3 pb-safe">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Megaphone className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">No ad costs found</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Add your first campaign</p>
            </CardContent>
          </Card>
        ) : pagedFiltered.map((a) => {
          const profit = Number(a.revenue) - Number(a.amount);
          const roas = Number(a.amount) > 0 ? (Number(a.revenue) / Number(a.amount)) : 0;
          return (
            <Card key={a.id} className="overflow-hidden">
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{a.campaign_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: PLATFORM_COLORS[a.platform] || undefined, color: PLATFORM_COLORS[a.platform] || undefined }}>
                        {a.platform}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{a.ad_date}</span>
                    </div>
                  </div>
                  <Badge variant={profit >= 0 ? "default" : "destructive"} className="text-[10px]">
                    {profit >= 0 ? "Profit" : "Loss"}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  <div className="rounded-lg bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Spend</p>
                    <p className="text-xs font-bold text-destructive">৳{Number(a.amount).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Revenue</p>
                    <p className="text-xs font-bold text-green-600">৳{Number(a.revenue).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">ROAS</p>
                    <p className="text-xs font-bold">{roas.toFixed(2)}x</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Clicks</p>
                    <p className="text-xs font-bold">{a.clicks}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <p className={`text-sm font-bold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {profit >= 0 ? "+" : ""}৳{profit.toLocaleString()}
                  </p>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
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
                          <AlertDialogTitle>Delete Ad Cost?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-center">ROAS</TableHead>
                  <TableHead className="text-center">Clicks</TableHead>
                  <TableHead className="text-center">Conv.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <Megaphone className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No ad costs found</p>
                    </TableCell>
                  </TableRow>
                ) : pagedFiltered.map((a) => {
                  const profit = Number(a.revenue) - Number(a.amount);
                  const roas = Number(a.amount) > 0 ? (Number(a.revenue) / Number(a.amount)) : 0;
                  return (
                    <TableRow key={a.id} className="group">
                      <TableCell className="text-sm text-muted-foreground">{a.ad_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs" style={{ borderColor: PLATFORM_COLORS[a.platform] || undefined, color: PLATFORM_COLORS[a.platform] || undefined }}>
                          {a.platform}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate">{a.campaign_name}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">৳{Number(a.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">৳{Number(a.revenue).toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-bold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {profit >= 0 ? "+" : ""}৳{profit.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={roas >= 1 ? "default" : "destructive"} className="text-[10px]">
                          {roas.toFixed(2)}x
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{a.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{a.conversions}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
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
                                <AlertDialogTitle>Delete Ad Cost?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {editId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editId ? "Edit" : "Add"} Ad Cost
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campaign Name *</Label>
              <Input
                value={form.campaign_name}
                onChange={(e) => { setForm({ ...form, campaign_name: e.target.value }); if (campaignError) setCampaignError(""); }}
                error={!!campaignError}
                placeholder="e.g., Summer Sale Campaign"
              />
              {campaignError && <p className="text-xs text-destructive animate-fade-in">{campaignError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Spend (৳)</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Revenue (৳)</Label>
                <Input type="number" step="0.01" min="0" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Impressions</Label>
                <Input type="number" min="0" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Clicks</Label>
                <Input type="number" min="0" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Conversions</Label>
                <Input type="number" min="0" value={form.conversions} onChange={(e) => setForm({ ...form, conversions: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.ad_date} onChange={(e) => setForm({ ...form, ad_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes..." />
            </div>

            {/* Preview */}
            {(form.amount || form.revenue) && (
              <Card className="bg-muted/30">
                <CardContent className="pt-3 pb-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Profit</p>
                      <p className={`text-sm font-bold ${(Number(form.revenue) - Number(form.amount)) >= 0 ? "text-green-600" : "text-destructive"}`}>
                        ৳{(Number(form.revenue || 0) - Number(form.amount || 0)).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">ROAS</p>
                      <p className="text-sm font-bold">
                        {Number(form.amount) > 0 ? (Number(form.revenue || 0) / Number(form.amount)).toFixed(2) : "0.00"}x
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">CPC</p>
                      <p className="text-sm font-bold">
                        ৳{Number(form.clicks) > 0 ? (Number(form.amount || 0) / Number(form.clicks)).toFixed(2) : "0.00"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button type="submit" className="w-full" size="lg">
              {editId ? "Update Ad Cost" : "Save Ad Cost"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default AdCosts;
