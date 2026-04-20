import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageGuide from "@/components/PageGuide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Users, ShoppingCart, DollarSign, TrendingUp, Award, Trophy, Medal,
  Sparkles, Download, Search, Activity, Target, Zap, AlertTriangle,
  CheckCircle2, Crown, Star, BarChart3, ArrowUpRight, Clock, Receipt
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { subDays, startOfDay, format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  LineChart, Line
} from "recharts";
import { toast } from "sonner";

const guideSteps = [
  { title: "Select Period", description: "Pick 7, 30, or 90 days to analyze staff performance over different timeframes. Use 30 days for monthly reviews." },
  { title: "Top Performer Spotlight", description: "The gold trophy card highlights your highest scoring staff member based on sales, orders, and operational accuracy." },
  { title: "Performance Score", description: "Composite score = (Orders × 10) + (Sales × 0.01) − (Cash Mismatch × 5). Higher = better all-round performance." },
  { title: "Leaderboard Rankings", description: "Staff ranked by score with medals (🥇🥈🥉). Use this for monthly bonuses, promotions, or training decisions." },
  { title: "Sales vs Activity Chart", description: "Bar chart compares each staff member's order volume vs revenue. Spot who's selling high-ticket items." },
  { title: "Cash Accuracy Audit", description: "Cash mismatch tracks discrepancies in shift closures. Zero mismatch = trustworthy. Repeated issues = retraining needed." },
  { title: "Search & Filter", description: "Quickly find specific staff by name. Tabs filter between All, Top Performers, and Needs Attention." },
  { title: "Export Reports", description: "Download CSV for HR records, payroll bonuses, or quarterly performance reviews. Print-friendly layout included." },
];

const StaffPerformance = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: fmt } = useCurrency();
  const [range, setRange] = useState("30");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const days = Number(range);
  const startDate = startOfDay(subDays(new Date(), days)).toISOString();

  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-list", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name, role, email, auth_user_id, is_active, created_at")
        .eq("store_id", storeId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: storeData } = useQuery({
    queryKey: ["store-owner", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("user_id, name").eq("id", storeId!).single();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["staff-orders", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("user_id, total_amount, cost_price, discount, payment_status, payment_method, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", startDate);
      return data || [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["staff-shifts", storeId, range],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_register_shifts")
        .select("user_id, opening_balance, closing_balance, mismatch, status, opened_at, closed_at")
        .eq("store_id", storeId!)
        .gte("opened_at", startDate);
      return data || [];
    },
  });

  const performanceData = useMemo(() => {
    const allUsers = [
      ...(storeData ? [{ id: "owner", name: storeData.name ? `${storeData.name} (Owner)` : "Owner", role: "owner", auth_user_id: storeData.user_id, email: "" }] : []),
      ...staffMembers.map((s: any) => ({ id: s.id, name: s.name, role: s.role, auth_user_id: s.auth_user_id, email: s.email })),
    ];

    return allUsers.map(staff => {
      const staffOrders = orders.filter((o: any) => o.user_id === staff.auth_user_id);
      const totalSales = staffOrders.reduce((s, o: any) => s + Number(o.total_amount), 0);
      const totalProfit = staffOrders.reduce((s, o: any) => s + (Number(o.total_amount) - Number(o.cost_price || 0)), 0);
      const totalDiscount = staffOrders.reduce((s, o: any) => s + Number(o.discount || 0), 0);
      const orderCount = staffOrders.length;
      const paidOrders = staffOrders.filter((o: any) => o.payment_status === "paid").length;
      const dueOrders = orderCount - paidOrders;
      const avgOrder = orderCount > 0 ? totalSales / orderCount : 0;
      const margin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
      const collectionRate = orderCount > 0 ? (paidOrders / orderCount) * 100 : 0;

      const staffShifts = shifts.filter((s: any) => s.user_id === staff.auth_user_id);
      const totalMismatch = staffShifts.reduce((s, sh: any) => s + Math.abs(Number(sh.mismatch || 0)), 0);
      const shiftCount = staffShifts.length;
      const closedShifts = staffShifts.filter((s: any) => s.status === "closed").length;

      const score = Math.max(0, orderCount * 10 + totalSales * 0.01 - totalMismatch * 5);

      return {
        ...staff,
        totalSales, totalProfit, totalDiscount, orderCount, paidOrders, dueOrders, avgOrder,
        margin, collectionRate, totalMismatch, shiftCount, closedShifts, score,
      };
    }).sort((a, b) => b.score - a.score);
  }, [staffMembers, storeData, orders, shifts]);

  const filteredData = useMemo(() => {
    let data = performanceData.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
    if (tab === "top") data = data.filter(s => s.orderCount > 0).slice(0, 5);
    if (tab === "attention") data = data.filter(s => s.totalMismatch > 0 || (s.shiftCount > 0 && s.orderCount === 0));
    return data;
  }, [performanceData, search, tab]);

  const topPerformer = performanceData.find(s => s.orderCount > 0);
  const totalSales = orders.reduce((s, o: any) => s + Number(o.total_amount), 0);
  const totalOrders = orders.length;
  const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
  const totalMismatch = performanceData.reduce((s, p) => s + p.totalMismatch, 0);
  const activeContributors = performanceData.filter(s => s.orderCount > 0).length;

  // Chart data
  const chartData = performanceData
    .filter(s => s.orderCount > 0)
    .slice(0, 8)
    .map(s => ({
      name: s.name.length > 10 ? s.name.slice(0, 10) + "…" : s.name,
      Orders: s.orderCount,
      Sales: Math.round(s.totalSales),
    }));

  const radarData = topPerformer ? [
    { metric: "Orders", value: Math.min(100, (topPerformer.orderCount / Math.max(1, totalOrders)) * 100) },
    { metric: "Revenue", value: Math.min(100, (topPerformer.totalSales / Math.max(1, totalSales)) * 100) },
    { metric: "Accuracy", value: topPerformer.totalMismatch === 0 ? 100 : Math.max(0, 100 - topPerformer.totalMismatch / 10) },
    { metric: "Collection", value: topPerformer.collectionRate },
    { metric: "Margin", value: Math.min(100, topPerformer.margin * 2) },
  ] : [];

  const exportCSV = () => {
    const headers = ["Rank,Name,Role,Orders,Sales,Profit,Margin %,Avg Order,Paid,Due,Collection %,Shifts,Cash Mismatch,Score"];
    const rows = performanceData.map((s, i) => [
      i + 1, s.name, s.role, s.orderCount, s.totalSales.toFixed(2), s.totalProfit.toFixed(2),
      s.margin.toFixed(1), s.avgOrder.toFixed(2), s.paidOrders, s.dueOrders,
      s.collectionRate.toFixed(1), s.shiftCount, s.totalMismatch.toFixed(2), s.score.toFixed(0)
    ].join(","));
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-performance-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("Performance report exported");
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const getMedalIcon = (i: number, hasOrders: boolean) => {
    if (!hasOrders) return null;
    if (i === 0) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (i === 1) return <Medal className="h-4 w-4 text-gray-400" />;
    if (i === 2) return <Medal className="h-4 w-4 text-amber-700" />;
    return null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Staff Performance
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">Track productivity, sales contribution & operational accuracy</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span>
            </Button>
            <PageGuide title="Staff Performance Guide" steps={guideSteps} />
          </div>
        </div>

        {/* Top Performer Spotlight */}
        {topPerformer && (
          <Card className="relative overflow-hidden border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-transparent">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.1),transparent_50%)]" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl" />
            <CardContent className="relative px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-4 ring-yellow-500/30">
                    <AvatarFallback className="bg-gradient-to-br from-yellow-500 to-amber-600 text-white text-xl font-bold">
                      {getInitials(topPerformer.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg">
                    <Trophy className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 mb-1.5 gap-1">
                    <Sparkles className="h-3 w-3" /> Top Performer
                  </Badge>
                  <h3 className="text-xl sm:text-2xl font-bold">{topPerformer.name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{topPerformer.role}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="text-lg font-bold">{topPerformer.orderCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sales</p>
                      <p className="text-lg font-bold text-green-600">{fmt(topPerformer.totalSales)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Order</p>
                      <p className="text-lg font-bold">{fmt(topPerformer.avgOrder)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Score</p>
                      <p className="text-lg font-bold text-primary">{topPerformer.score.toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Active Staff", value: staffMembers.length + (storeData ? 1 : 0), icon: Users, color: "from-blue-500 to-cyan-500", sub: `${activeContributors} contributing` },
            { label: "Total Orders", value: totalOrders, icon: ShoppingCart, color: "from-violet-500 to-purple-500", sub: `Last ${days} days` },
            { label: "Total Sales", value: fmt(totalSales), icon: DollarSign, color: "from-emerald-500 to-green-500", sub: `Avg ${fmt(avgOrder)}` },
            { label: "Cash Accuracy", value: totalMismatch === 0 ? "100%" : `${Math.max(0, 100 - (totalMismatch / Math.max(1, totalSales)) * 100).toFixed(1)}%`, icon: Target, color: "from-orange-500 to-amber-500", sub: totalMismatch === 0 ? "Perfect" : `${fmt(totalMismatch)} variance` },
          ].map((kpi, i) => (
            <Card key={i} className="relative overflow-hidden border-border/50 backdrop-blur-sm hover:shadow-lg transition-all group">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-[0.03] group-hover:opacity-[0.06] transition-opacity`} />
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${kpi.color} opacity-10 rounded-full blur-2xl`} />
              <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-start justify-between mb-2">
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-md`}>
                    <kpi.icon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                <p className="text-xl sm:text-2xl font-bold mt-0.5 truncate">{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sales vs Orders Chart */}
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Sales vs Activity
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">Top 8</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                  No sales data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="Orders" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    <Bar yAxisId="right" dataKey="Sales" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Performer Radar */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Performance DNA
              </CardTitle>
            </CardHeader>
            <CardContent>
              {radarData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                    <Radar name={topPerformer?.name} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Insights */}
        {performanceData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {totalMismatch > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Cash Variance Detected</p>
                  <p className="text-[11px] text-muted-foreground">{fmt(totalMismatch)} mismatch across shifts. Review training.</p>
                </div>
              </div>
            )}
            {topPerformer && topPerformer.orderCount > 5 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">High Performer Active</p>
                  <p className="text-[11px] text-muted-foreground">{topPerformer.name} processed {topPerformer.orderCount} orders. Consider rewards.</p>
                </div>
              </div>
            )}
            {activeContributors < (staffMembers.length + 1) && staffMembers.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
                <Zap className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Inactive Staff</p>
                  <p className="text-[11px] text-muted-foreground">{(staffMembers.length + 1) - activeContributors} member(s) didn't record sales. Check shift assignments.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" /> Leaderboard
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search staff..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 w-full sm:w-[200px] text-sm"
                  />
                </div>
              </div>
            </div>
            <Tabs value={tab} onValueChange={setTab} className="mt-2">
              <TabsList className="grid grid-cols-3 h-9">
                <TabsTrigger value="all" className="text-xs">All ({performanceData.length})</TabsTrigger>
                <TabsTrigger value="top" className="text-xs">🏆 Top</TabsTrigger>
                <TabsTrigger value="attention" className="text-xs">⚠ Attention</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {filteredData.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                No staff matching this filter
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-y border-border/50">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2.5 font-medium">Rank</th>
                        <th className="text-left px-4 py-2.5 font-medium">Staff</th>
                        <th className="text-right px-4 py-2.5 font-medium">Orders</th>
                        <th className="text-right px-4 py-2.5 font-medium">Sales</th>
                        <th className="text-right px-4 py-2.5 font-medium">Avg Order</th>
                        <th className="text-right px-4 py-2.5 font-medium">Margin</th>
                        <th className="text-center px-4 py-2.5 font-medium">Collection</th>
                        <th className="text-center px-4 py-2.5 font-medium">Cash</th>
                        <th className="text-right px-4 py-2.5 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map((s, i) => {
                        const originalRank = performanceData.findIndex(p => p.id === s.id);
                        return (
                          <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {getMedalIcon(originalRank, s.orderCount > 0)}
                                <span className="font-semibold text-muted-foreground text-xs">#{originalRank + 1}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-xs font-semibold">
                                    {getInitials(s.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{s.name}</p>
                                  <Badge variant="outline" className="capitalize text-[10px] h-4 mt-0.5">{s.role}</Badge>
                                </div>
                              </div>
                            </td>
                            <td className="text-right px-4 py-3 font-medium">{s.orderCount}</td>
                            <td className="text-right px-4 py-3 font-semibold text-green-600">{fmt(s.totalSales)}</td>
                            <td className="text-right px-4 py-3 text-muted-foreground">{fmt(s.avgOrder)}</td>
                            <td className="text-right px-4 py-3">
                              <span className={s.margin >= 15 ? "text-emerald-600 font-medium" : s.margin > 0 ? "text-orange-600" : "text-muted-foreground"}>
                                {s.margin.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <Progress value={s.collectionRate} className="h-1.5 w-16" />
                                <span className="text-[11px] text-muted-foreground w-9">{s.collectionRate.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="text-center px-4 py-3">
                              {s.totalMismatch > 0 ? (
                                <Badge variant="destructive" className="text-[10px] h-5">{fmt(s.totalMismatch)}</Badge>
                              ) : s.shiftCount > 0 ? (
                                <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">✓ Clean</Badge>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="text-right px-4 py-3">
                              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 font-bold">
                                {s.score.toFixed(0)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-border/30">
                  {filteredData.map((s) => {
                    const originalRank = performanceData.findIndex(p => p.id === s.id);
                    return (
                      <div key={s.id} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-11 w-11">
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-sm font-semibold">
                              {getInitials(s.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {getMedalIcon(originalRank, s.orderCount > 0)}
                              <p className="font-semibold text-sm truncate">{s.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className="capitalize text-[10px] h-4">{s.role}</Badge>
                              <span className="text-[11px] text-muted-foreground">Rank #{originalRank + 1}</span>
                            </div>
                          </div>
                          <Badge className="bg-primary/10 text-primary border-primary/20 font-bold shrink-0">
                            {s.score.toFixed(0)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded-lg bg-muted/40">
                            <p className="text-[10px] text-muted-foreground">Orders</p>
                            <p className="text-sm font-bold">{s.orderCount}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-500/10">
                            <p className="text-[10px] text-muted-foreground">Sales</p>
                            <p className="text-sm font-bold text-green-600 truncate">{fmt(s.totalSales)}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/40">
                            <p className="text-[10px] text-muted-foreground">Avg</p>
                            <p className="text-sm font-bold truncate">{fmt(s.avgOrder)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Collection</span>
                          <div className="flex items-center gap-2 flex-1 max-w-[140px] ml-2">
                            <Progress value={s.collectionRate} className="h-1.5 flex-1" />
                            <span className="font-medium w-9 text-right">{s.collectionRate.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Cash Accuracy</span>
                          {s.totalMismatch > 0 ? (
                            <Badge variant="destructive" className="text-[10px] h-5">{fmt(s.totalMismatch)} off</Badge>
                          ) : s.shiftCount > 0 ? (
                            <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">✓ Clean</Badge>
                          ) : (
                            <span className="text-muted-foreground">No shifts</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default StaffPerformance;
