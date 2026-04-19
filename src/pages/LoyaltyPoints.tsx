import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Star, Gift, TrendingUp, Search, ArrowDownCircle, BookOpen, Sparkles, Crown,
  Award, Medal, Trophy, FileDown, ArrowUpDown, Phone, Calendar, Users, Plus, Minus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

type TierFilter = "all" | "bronze" | "silver" | "gold" | "platinum";
type SortKey = "available_desc" | "total_desc" | "name" | "recent";

const TIER_THRESHOLDS = { platinum: 1000, gold: 500, silver: 200, bronze: 0 };

const tierOf = (available: number): { name: string; color: string; icon: any; next: number | null } => {
  if (available >= TIER_THRESHOLDS.platinum) return { name: "Platinum", color: "violet", icon: Crown, next: null };
  if (available >= TIER_THRESHOLDS.gold) return { name: "Gold", color: "amber", icon: Trophy, next: TIER_THRESHOLDS.platinum };
  if (available >= TIER_THRESHOLDS.silver) return { name: "Silver", color: "slate", icon: Medal, next: TIER_THRESHOLDS.gold };
  return { name: "Bronze", color: "orange", icon: Award, next: TIER_THRESHOLDS.silver };
};

const LoyaltyPoints = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format: formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("available_desc");
  const [redeemDialog, setRedeemDialog] = useState<any>(null);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemReason, setRedeemReason] = useState("manual");
  const [adjustDialog, setAdjustDialog] = useState<any>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustType, setAdjustType] = useState<"earned" | "redeemed">("earned");
  const [adjustNote, setAdjustNote] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const { data: loyaltyRecords = [], isLoading } = useQuery({
    queryKey: ["loyalty-points", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_points")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId!)
        .order("total_points", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["loyalty-transactions", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_transactions")
        .select("*, customers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`loyalty-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_points", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["loyalty-points", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_transactions", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["loyalty-transactions", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const redeemMutation = useMutation({
    mutationFn: async () => {
      if (!redeemDialog) return;
      const pts = Number(redeemPoints);
      const available = Number(redeemDialog.total_points) - Number(redeemDialog.redeemed_points);
      if (pts <= 0 || pts > available) throw new Error(`Invalid points. Available: ${available}`);

      await supabase.from("loyalty_points").update({
        redeemed_points: Number(redeemDialog.redeemed_points) + pts,
        updated_at: new Date().toISOString(),
      }).eq("id", redeemDialog.id);

      await supabase.from("loyalty_transactions").insert({
        customer_id: redeemDialog.customer_id,
        store_id: storeId!, user_id: userId!,
        points: pts, type: "redeemed",
        notes: `Manual redemption: ${redeemReason}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-points"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setRedeemDialog(null);
      setRedeemPoints("");
      toast.success("Points redeemed successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustDialog) return;
      const pts = Number(adjustPoints);
      if (pts <= 0) throw new Error("Enter a positive value");
      const updates: any = { updated_at: new Date().toISOString() };
      if (adjustType === "earned") {
        updates.total_points = Number(adjustDialog.total_points) + pts;
      } else {
        const avail = Number(adjustDialog.total_points) - Number(adjustDialog.redeemed_points);
        if (pts > avail) throw new Error(`Cannot deduct more than available (${avail})`);
        updates.redeemed_points = Number(adjustDialog.redeemed_points) + pts;
      }
      await supabase.from("loyalty_points").update(updates).eq("id", adjustDialog.id);
      await supabase.from("loyalty_transactions").insert({
        customer_id: adjustDialog.customer_id,
        store_id: storeId!, user_id: userId!,
        points: pts, type: adjustType,
        notes: adjustNote || `Manual ${adjustType === "earned" ? "credit" : "deduction"}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-points"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setAdjustDialog(null); setAdjustPoints(""); setAdjustNote("");
      toast.success("Points adjusted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPoints = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.total_points), 0);
  const totalRedeemed = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.redeemed_points), 0);
  const totalAvailable = totalPoints - totalRedeemed;
  const redemptionRate = totalPoints > 0 ? Math.round((totalRedeemed / totalPoints) * 100) : 0;

  const tierCounts = useMemo(() => {
    const counts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
    loyaltyRecords.forEach((r: any) => {
      const avail = Number(r.total_points) - Number(r.redeemed_points);
      counts[tierOf(avail).name.toLowerCase() as keyof typeof counts]++;
    });
    return counts;
  }, [loyaltyRecords]);

  const topCustomer = useMemo(() => {
    if (loyaltyRecords.length === 0) return null;
    return [...loyaltyRecords].sort((a: any, b: any) =>
      (Number(b.total_points) - Number(b.redeemed_points)) - (Number(a.total_points) - Number(a.redeemed_points))
    )[0];
  }, [loyaltyRecords]);

  const processed = useMemo(() => {
    let list = loyaltyRecords.filter((r: any) =>
      r.customers?.name?.toLowerCase().includes(search.toLowerCase()) || r.customers?.phone?.includes(search)
    );
    if (tierFilter !== "all") {
      list = list.filter((r: any) => {
        const avail = Number(r.total_points) - Number(r.redeemed_points);
        return tierOf(avail).name.toLowerCase() === tierFilter;
      });
    }
    if (sortKey === "available_desc") list.sort((a: any, b: any) =>
      (Number(b.total_points) - Number(b.redeemed_points)) - (Number(a.total_points) - Number(a.redeemed_points))
    );
    else if (sortKey === "total_desc") list.sort((a: any, b: any) => Number(b.total_points) - Number(a.total_points));
    else if (sortKey === "name") list.sort((a: any, b: any) => (a.customers?.name || "").localeCompare(b.customers?.name || ""));
    else if (sortKey === "recent") list.sort((a: any, b: any) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    );
    return list;
  }, [loyaltyRecords, search, tierFilter, sortKey]);

  const exportCSV = () => {
    const header = "Customer,Phone,Tier,Total,Redeemed,Available\n";
    const rows = loyaltyRecords.map((r: any) => {
      const avail = Number(r.total_points) - Number(r.redeemed_points);
      return `"${r.customers?.name}","${r.customers?.phone || ""}","${tierOf(avail).name}",${r.total_points},${r.redeemed_points},${avail}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "loyalty_points.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const tierBadge = (avail: number) => {
    const t = tierOf(avail);
    const Icon = t.icon;
    const colorClass = t.color === "violet" ? "bg-violet-500/15 text-violet-600 border-violet-500/30"
      : t.color === "amber" ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : t.color === "slate" ? "bg-slate-500/15 text-slate-600 border-slate-500/30"
      : "bg-orange-500/15 text-orange-600 border-orange-500/30";
    return <Badge variant="outline" className={`${colorClass} gap-1`}><Icon className="h-3 w-3" />{t.name}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* Premium header */}
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-amber-500/10 via-violet-500/5 to-transparent p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25">
                <Star className="h-6 w-6 fill-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Loyalty Points</h1>
                  <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Live</Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Reward repeat customers · Bronze → Silver → Gold → Platinum tiers
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
                <FileDown className="h-4 w-4" /> Export
              </Button>
              <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" className="gap-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700">
                    <BookOpen className="h-4 w-4" /> Guide
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-amber-500" /> Loyalty Program Guide
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-5">
                    {[
                      { icon: Sparkles, title: "Auto-Earn from POS", desc: "Customers earn 1 point per 100 currency on each paid POS order. Points are credited automatically — no manual entry." },
                      { icon: Trophy, title: "4-Tier System", desc: "Bronze (0-199 pts), Silver (200-499), Gold (500-999), Platinum (1000+). Tier shown live next to each customer." },
                      { icon: Gift, title: "Flexible Redemption", desc: "Redeem as discount on purchase, free gift, cashback, or fully manual. 1 point = 1 currency unit by default." },
                      { icon: Plus, title: "Manual Adjustments", desc: "Use Adjust to credit (refer-a-friend bonus, complaint goodwill) or deduct points (correction). Every change is logged." },
                      { icon: ArrowDownCircle, title: "Quick Redeem", desc: "Click Redeem to use Half / All Points instantly with a reason note for audit trail." },
                      { icon: Award, title: "Top Customer Spotlight", desc: "Identify your most loyal customer at a glance — surprise them with extra rewards to build advocacy." },
                      { icon: TrendingUp, title: "Redemption Rate", desc: "Healthy programs aim for 30-50% redemption. Too low = customers don't feel rewarded; too high = thin margins." },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-3 rounded-xl border border-border/40 bg-card/50 p-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-violet-500/10 p-4 border border-amber-500/20">
                      <p className="text-xs font-semibold text-amber-600 mb-1">🏆 Pro Tip</p>
                      <p className="text-xs text-muted-foreground">Run a "double points week" once a quarter. It boosts repeat visits and reactivates dormant members without permanently eroding margins.</p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-gradient-to-br from-amber-500/5 to-transparent border-amber-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Issued</p>
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{totalPoints.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">All-time points</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500/5 to-transparent border-violet-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Redeemed</p>
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Gift className="h-4 w-4 text-violet-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-violet-600">{totalRedeemed.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{redemptionRate}% redemption rate</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available</p>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{totalAvailable.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">≈ {formatCurrency(totalAvailable)} liability</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members</p>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{loyaltyRecords.length}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Active loyalty accounts</p>
            </CardContent>
          </Card>
        </div>

        {/* Tier distribution + Top customer */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Tier Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: "Platinum", count: tierCounts.platinum, color: "violet", icon: Crown, range: "1000+" },
                  { name: "Gold", count: tierCounts.gold, color: "amber", icon: Trophy, range: "500-999" },
                  { name: "Silver", count: tierCounts.silver, color: "slate", icon: Medal, range: "200-499" },
                  { name: "Bronze", count: tierCounts.bronze, color: "orange", icon: Award, range: "0-199" },
                ].map((t) => {
                  const Icon = t.icon;
                  const pct = loyaltyRecords.length > 0 ? (t.count / loyaltyRecords.length) * 100 : 0;
                  const colorBg = t.color === "violet" ? "bg-violet-500" : t.color === "amber" ? "bg-amber-500" : t.color === "slate" ? "bg-slate-500" : "bg-orange-500";
                  const colorText = t.color === "violet" ? "text-violet-600" : t.color === "amber" ? "text-amber-600" : t.color === "slate" ? "text-slate-600" : "text-orange-600";
                  return (
                    <div key={t.name} className="rounded-xl border border-border/40 p-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <Icon className={`h-4 w-4 ${colorText}`} />
                        <span className="text-[10px] text-muted-foreground">{t.range}</span>
                      </div>
                      <p className="text-base sm:text-lg font-bold mt-1.5">{t.count}</p>
                      <p className={`text-[11px] font-medium ${colorText}`}>{t.name}</p>
                      <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${colorBg}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/5 via-card to-card border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" /> Top Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCustomer ? (() => {
                const avail = Number(topCustomer.total_points) - Number(topCustomer.redeemed_points);
                const t = tierOf(avail);
                return (
                  <div className="space-y-3">
                    <div>
                      <p className="font-bold text-base">{topCustomer.customers?.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />{topCustomer.customers?.phone || "No phone"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                      <p className="text-[10px] uppercase font-semibold text-amber-600/80">Available</p>
                      <p className="text-xl font-bold text-amber-600">{avail.toLocaleString()} pts</p>
                      <div className="mt-1">{tierBadge(avail)}</div>
                    </div>
                    <Button size="sm" className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white" onClick={() => { setRedeemDialog(topCustomer); setRedeemPoints(""); }}>
                      <Gift className="h-3 w-3 mr-1" /> Reward Now
                    </Button>
                  </div>
                );
              })() : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Star className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium">No members yet</p>
                  <p className="text-xs text-muted-foreground">Sales auto-create loyalty</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone..." className="pl-9" />
              </div>
              <Tabs value={tierFilter} onValueChange={(v) => setTierFilter(v as TierFilter)}>
                <TabsList className="grid grid-cols-5 w-full lg:w-auto">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="bronze" className="text-xs">Bronze</TabsTrigger>
                  <TabsTrigger value="silver" className="text-xs">Silver</TabsTrigger>
                  <TabsTrigger value="gold" className="text-xs">Gold</TabsTrigger>
                  <TabsTrigger value="platinum" className="text-xs">Platinum</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <ArrowUpDown className="h-4 w-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available_desc">Most Available</SelectItem>
                  <SelectItem value="total_desc">Most Earned</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="recent">Recent Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Customer points list */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Customer Points
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
                  <Star className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No loyalty records yet</p>
                </div>
              ) : processed.map((r: any) => {
                const avail = Number(r.total_points) - Number(r.redeemed_points);
                const t = tierOf(avail);
                const nextProgress = t.next ? Math.min(100, (avail / t.next) * 100) : 100;
                return (
                  <div key={r.id} className="bg-card rounded-xl border border-border/40 p-3.5 space-y-3 hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center text-xs font-semibold text-amber-600 shrink-0">
                          {(r.customers?.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{r.customers?.name}</p>
                          <p className="text-xs text-muted-foreground">{r.customers?.phone || "No phone"}</p>
                        </div>
                      </div>
                      {tierBadge(avail)}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-muted/40 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Total</p>
                        <p className="font-bold text-xs">{r.total_points}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Used</p>
                        <p className="font-bold text-xs text-violet-600">{r.redeemed_points}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-500/10 p-1.5">
                        <p className="text-[9px] uppercase text-muted-foreground">Available</p>
                        <p className="font-bold text-xs text-emerald-600">{avail}</p>
                      </div>
                    </div>
                    {t.next && (
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                          <span>To next tier</span>
                          <span>{avail} / {t.next}</span>
                        </div>
                        <Progress value={nextProgress} className="h-1" />
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      {avail > 0 && (
                        <Button size="sm" variant="default" className="flex-1 h-8" onClick={() => { setRedeemDialog(r); setRedeemPoints(""); }}>
                          <Gift className="h-3 w-3 mr-1" /> Redeem
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => { setAdjustDialog(r); setAdjustPoints(""); setAdjustType("earned"); setAdjustNote(""); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
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
                    <TableHead>Tier</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Redeemed</TableHead>
                    <TableHead className="text-center">Available</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10">Loading...</TableCell></TableRow>
                  ) : processed.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10">
                      <Star className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No loyalty records yet</p>
                    </TableCell></TableRow>
                  ) : processed.map((r: any) => {
                    const avail = Number(r.total_points) - Number(r.redeemed_points);
                    const t = tierOf(avail);
                    const nextProgress = t.next ? Math.min(100, (avail / t.next) * 100) : 100;
                    return (
                      <TableRow key={r.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center text-xs font-semibold text-amber-600">
                              {(r.customers?.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{r.customers?.name}</p>
                              <p className="text-xs text-muted-foreground">{r.customers?.phone || "No phone"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{tierBadge(avail)}</TableCell>
                        <TableCell className="w-40">
                          {t.next ? (
                            <div>
                              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                                <span>Next: {tierOf(t.next).name}</span>
                                <span>{avail}/{t.next}</span>
                              </div>
                              <Progress value={nextProgress} className="h-1.5" />
                            </div>
                          ) : <Badge className="bg-violet-500/15 text-violet-600 border-violet-500/30" variant="outline">Max Tier 👑</Badge>}
                        </TableCell>
                        <TableCell className="text-center font-medium">{r.total_points}</TableCell>
                        <TableCell className="text-center text-violet-600">{r.redeemed_points}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">{avail}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {avail > 0 && (
                            <Button size="sm" variant="default" className="gap-1" onClick={() => { setRedeemDialog(r); setRedeemPoints(""); }}>
                              <Gift className="h-3 w-3" /> Redeem
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setAdjustDialog(r); setAdjustPoints(""); setAdjustType("earned"); setAdjustNote(""); }} title="Adjust points">
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(new Date(t.created_at), "dd MMM yy HH:mm")}</TableCell>
                        <TableCell className="font-medium text-sm">{t.customers?.name}</TableCell>
                        <TableCell className={`font-bold ${t.type === "earned" ? "text-emerald-600" : "text-violet-600"}`}>
                          {t.type === "earned" ? "+" : "-"}{t.points}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={t.type === "earned" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-violet-500/10 text-violet-600 border-violet-500/30"}>
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="sm:hidden p-3 space-y-2">
                {transactions.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/40 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.customers?.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(new Date(t.created_at), "dd MMM, HH:mm")}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${t.type === "earned" ? "text-emerald-600" : "text-violet-600"}`}>
                        {t.type === "earned" ? "+" : "-"}{t.points}
                      </p>
                      <Badge variant="outline" className="text-[10px] capitalize">{t.type}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Redeem Dialog */}
        <Dialog open={!!redeemDialog} onOpenChange={v => { if (!v) setRedeemDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-amber-500" /> Redeem Points
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
                <p className="font-semibold">{redeemDialog?.customers?.name}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Total</p><p className="font-bold text-sm">{redeemDialog?.total_points}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Used</p><p className="font-bold text-sm text-violet-600">{redeemDialog?.redeemed_points}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Available</p><p className="font-bold text-sm text-emerald-600">{Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)}</p></div>
                </div>
              </div>
              <div>
                <Label>Points to Redeem</Label>
                <Input type="number" value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} placeholder="0" className="text-lg font-semibold" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setRedeemPoints(String(Math.floor((Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)) / 4)))}>25%</Button>
                <Button variant="outline" size="sm" onClick={() => setRedeemPoints(String(Math.floor((Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)) / 2)))}>Half</Button>
                <Button variant="outline" size="sm" onClick={() => setRedeemPoints(String(Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)))}>All</Button>
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={redeemReason} onValueChange={setRedeemReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">📝 Manual Redemption</SelectItem>
                    <SelectItem value="discount">🏷️ Discount on Purchase</SelectItem>
                    <SelectItem value="gift">🎁 Free Gift / Product</SelectItem>
                    <SelectItem value="cashback">💵 Cashback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs">
                💡 <strong>{redeemPoints || 0} pts</strong> ≈ {formatCurrency(Number(redeemPoints) || 0)} value
              </div>
              <Button onClick={() => redeemMutation.mutate()} disabled={!redeemPoints || redeemMutation.isPending} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                {redeemMutation.isPending ? "Redeeming..." : `Redeem ${redeemPoints || 0} Points`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Adjust Dialog */}
        <Dialog open={!!adjustDialog} onOpenChange={v => { if (!v) setAdjustDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Adjust Points
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
                <p className="font-semibold">{adjustDialog?.customers?.name}</p>
                <p className="text-xs text-muted-foreground">Current available: {Number(adjustDialog?.total_points || 0) - Number(adjustDialog?.redeemed_points || 0)} pts</p>
              </div>
              <Tabs value={adjustType} onValueChange={(v) => setAdjustType(v as any)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="earned" className="gap-1"><Plus className="h-3 w-3" />Credit</TabsTrigger>
                  <TabsTrigger value="redeemed" className="gap-1"><Minus className="h-3 w-3" />Deduct</TabsTrigger>
                </TabsList>
              </Tabs>
              <div>
                <Label>Points</Label>
                <Input type="number" value={adjustPoints} onChange={e => setAdjustPoints(e.target.value)} placeholder="0" className="text-lg font-semibold" />
              </div>
              <div>
                <Label>Reason / Note</Label>
                <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Refer-a-friend bonus" />
              </div>
              <Button onClick={() => adjustMutation.mutate()} disabled={!adjustPoints || adjustMutation.isPending} className="w-full">
                {adjustMutation.isPending ? "Saving..." : adjustType === "earned" ? "Credit Points" : "Deduct Points"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default LoyaltyPoints;
