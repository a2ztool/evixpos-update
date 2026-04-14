import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Facebook, Instagram, RefreshCw, Wifi, WifiOff, Clock, TrendingUp,
  DollarSign, MousePointerClick, Eye, BarChart3,
  Zap, Unlink, AlertCircle, ChevronDown, Copy, Check,
  Download, BookOpen, ExternalLink, Plug
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from "recharts";
import { format, subDays } from "date-fns";

interface AdsMetric {
  id: string;
  ad_account_id: string;
  impressions: number;
  clicks: number;
  spend: number;
  date_start: string;
  date_stop: string;
  fetched_at: string;
}

const getRedirectUri = () => {
  const origin = window.location.origin;
  // Use real/custom domain when available, fallback to published domain
  if (origin.includes("lovableproject.com") || origin.includes("localhost")) {
    return "https://evipose.lovable.app/api/facebook/callback";
  }
  return `${origin}/api/facebook/callback`;
};

const getSetupSteps = () => [
  {
    title: "Meta Developer অ্যাপ তৈরি করুন",
    desc: "প্রথমে developers.facebook.com-এ যান এবং একটি নতুন অ্যাপ তৈরি করুন। অ্যাপের ধরন 'Business' সিলেক্ট করুন। এই অ্যাপটি আপনার Facebook Ads account-এর সাথে সংযুক্ত হবে।",
    link: "https://developers.facebook.com/apps/create/",
  },
  {
    title: "Marketing API চালু করুন",
    desc: "আপনার অ্যাপের সেটিংসে গিয়ে 'Add Product' বাটনে ক্লিক করুন এবং 'Marketing API' যোগ করুন। এটি ছাড়া আপনার ads-এর ডেটা পড়া যাবে না।",
  },
  {
    title: "OAuth Redirect URL যোগ করুন",
    desc: "আপনার Meta অ্যাপের Settings → Facebook Login → Valid OAuth Redirect URIs-এ নিচের URL টি পেস্ট করুন। এই URL-এ Facebook আপনাকে ফেরত পাঠাবে connect হওয়ার পর।",
    copyValue: getRedirectUri(),
  },
  {
    title: "Connect বাটনে ক্লিক করুন",
    desc: "উপরের 'Connect Meta Ads' বাটনে ক্লিক করুন। এটি আপনাকে Facebook-এ নিয়ে যাবে permission দেওয়ার জন্য। Permission দিলেই আপনার account connect হয়ে যাবে।",
  },
  {
    title: "Permission দিন এবং দেখুন",
    desc: "Facebook আপনাকে ads_read এবং ads_management permission চাইবে — 'Allow' করুন। এরপর আপনার সব Facebook ও Instagram Ads-এর spend, clicks, impressions সবকিছু এই dashboard-এ অটো সিঙ্ক হবে প্রতি ৫ মিনিটে।",
  },
];

const FacebookAds = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState("14");
  const [activeTab, setActiveTab] = useState("overview");
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [accountName, setAccountName] = useState<string>("");
  const [metrics, setMetrics] = useState<AdsMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  // Fetch metrics from Supabase
  const fetchMetrics = useCallback(async () => {
    if (!user || !activeStore) return;
    setMetricsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ads_metrics")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", activeStore.id)
        .gte("date_start", format(subDays(new Date(), parseInt(dateRange)), "yyyy-MM-dd"))
        .order("date_start", { ascending: true });

      if (error) {
        console.error("Failed to fetch metrics:", error);
      } else {
        setMetrics((data as AdsMetric[]) || []);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Metrics fetch error:", err);
    } finally {
      setMetricsLoading(false);
    }
  }, [user, activeStore, dateRange]);

  // Handle OAuth callback from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    const account = params.get("account");

    if (connected === "true") {
      setIsConnected(true);
      setAccountName(account || "Facebook Ads");
      toast.success(`✅ ${account || "Facebook Ads"} connected successfully!`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast.error("Connection failed: " + error);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Check existing connection on load
  useEffect(() => {
    const checkConnection = async () => {
      if (!user || !activeStore) { setLoading(false); return; }
      const { data } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", activeStore.id)
        .eq("is_active", true)
        .maybeSingle();
      if (data) {
        setIsConnected(true);
        setAccountName(data.account_name || "Facebook Ads");
      }
      setLoading(false);
    };
    checkConnection();
  }, [user, activeStore]);

  useEffect(() => {
    if (isConnected) fetchMetrics();
  }, [isConnected, fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh || !isConnected) return;
    const interval = setInterval(() => fetchMetrics(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isConnected, fetchMetrics]);

  const stats = useMemo(() => {
    const totalSpend = metrics.reduce((s, m) => s + Number(m.spend), 0);
    const totalClicks = metrics.reduce((s, m) => s + Number(m.clicks), 0);
    const totalImpressions = metrics.reduce((s, m) => s + Number(m.impressions), 0);
    return {
      totalSpend, totalClicks, totalImpressions,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00",
      cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : "0.00",
    };
  }, [metrics]);

  const dailyData = useMemo(() => {
    const grouped: Record<string, { spend: number; clicks: number; impressions: number }> = {};
    metrics.forEach(m => {
      const key = m.date_start;
      if (!grouped[key]) grouped[key] = { spend: 0, clicks: 0, impressions: 0 };
      grouped[key].spend += Number(m.spend);
      grouped[key].clicks += Number(m.clicks);
      grouped[key].impressions += Number(m.impressions);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: format(new Date(date), "MMM dd"), ...vals }));
  }, [metrics]);

  const accountBreakdown = useMemo(() => {
    const grouped: Record<string, { ad_account_id: string; spend: number; clicks: number; impressions: number }> = {};
    metrics.forEach(m => {
      const key = m.ad_account_id;
      if (!grouped[key]) grouped[key] = { ad_account_id: key, spend: 0, clicks: 0, impressions: 0 };
      grouped[key].spend += Number(m.spend);
      grouped[key].clicks += Number(m.clicks);
      grouped[key].impressions += Number(m.impressions);
    });
    return Object.values(grouped);
  }, [metrics]);

  const handleConnect = () => {
    if (!user || !activeStore) { toast.error("Please select a store first"); return; }
    setConnectingOAuth(true);
    const META_APP_ID = "1304633021527034";
    const redirectUri = "https://identical-copy.lovable.app/api/facebook/callback";
    const state = btoa(JSON.stringify({ user_id: user.id, store_id: activeStore.id }));
    window.location.href =
      `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=ads_read,ads_management&response_type=code&state=${encodeURIComponent(state)}`;
  };

  const handleDisconnect = async () => {
    if (!user || !activeStore) return;
    try {
      await supabase.functions.invoke("meta-oauth-callback?action=disconnect", { body: { store_id: activeStore.id } });
      setIsConnected(false); setAccountName(""); setMetrics([]);
      toast.success("Facebook Ads disconnected");
    } catch { toast.error("Failed to disconnect"); }
  };

  const handleCopyStep = (index: number, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedStep(index);
    toast.success("Copied!");
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const handleExportCSV = () => {
    if (metrics.length === 0) { toast.error("No data to export"); return; }
    const headers = ["Date", "Ad Account", "Spend", "Clicks", "Impressions", "CTR", "CPC"];
    const rows = metrics.map(m => [
      m.date_start, m.ad_account_id, m.spend, m.clicks, m.impressions,
      Number(m.impressions) > 0 ? ((Number(m.clicks) / Number(m.impressions)) * 100).toFixed(2) + "%" : "0%",
      Number(m.clicks) > 0 ? (Number(m.spend) / Number(m.clicks)).toFixed(2) : "0",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `facebook-ads-${dateRange}d-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-2 md:p-6 max-w-[1400px] mx-auto">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const noData = metrics.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 md:p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1877F2] to-[#0866FF] flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Facebook className="h-6 w-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-gradient-to-br from-[#E4405F] via-[#F77737] to-[#FCAF45] flex items-center justify-center shadow-md">
                <Instagram className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-foreground">Facebook & Instagram Ads</h1>
                <Badge variant="outline" className="text-xs font-medium gap-1 border-primary/30 text-primary">
                  <Plug className="h-3 w-3" /> Integration
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">Real-time ads performance dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeStore && (
              <Badge variant="outline" className="gap-1.5 text-xs">🏪 {activeStore.name}</Badge>
            )}
            {isConnected ? (
              <Badge className="gap-1.5 bg-emerald-500/90 hover:bg-emerald-500 text-white border-0">
                <Wifi className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5">
                <WifiOff className="h-3 w-3" /> Not Connected
              </Badge>
            )}
          </div>
        </div>

        {/* Status Bar - only when connected */}
        {isConnected && (
          <Card className="border-border/50">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {accountName && (
                    <span className="text-sm font-medium text-foreground">{accountName}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last sync: {format(lastUpdated, "hh:mm:ss a")}
                  </div>
                  {autoRefresh && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600">
                      <Zap className="h-2.5 w-2.5" /> Auto Sync (30s)
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => fetchMetrics()} disabled={metricsLoading}>
                    <RefreshCw className={`h-3 w-3 ${metricsLoading ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                  <Button variant={autoRefresh ? "default" : "outline"} size="sm" className="gap-1.5 h-8 text-xs"
                    onClick={() => { setAutoRefresh(!autoRefresh); toast.success(autoRefresh ? "Auto-refresh paused" : "Auto-refresh enabled"); }}>
                    {autoRefresh ? "Live" : "Paused"}
                  </Button>
                  {metrics.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExportCSV}>
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnect}>
                    <Unlink className="h-3 w-3" /> Disconnect
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isConnected ? (
          <>
            {/* Premium Connect Card */}
            <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-blue-50/50 via-background to-pink-50/30 dark:from-blue-950/20 dark:to-pink-950/10 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#1877F2]/5 to-transparent rounded-bl-full" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-[#E4405F]/5 to-transparent rounded-tr-full" />
              <CardContent className="flex flex-col items-center justify-center py-16 md:py-20 text-center gap-6 relative z-10">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#1877F2] to-[#0866FF] flex items-center justify-center shadow-2xl shadow-blue-500/30 rotate-3 hover:rotate-0 transition-transform duration-300">
                    <Facebook className="h-12 w-12 text-white" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-gradient-to-br from-[#E4405F] via-[#F77737] to-[#FCAF45] flex items-center justify-center shadow-lg shadow-pink-500/30 -rotate-6">
                    <Instagram className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="space-y-3 max-w-lg">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">Connect Facebook & Instagram Ads</h2>
                  <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                    আপনার Meta Ads account connect করুন এবং real-time ads performance, campaign analytics,
                    এবং ROI tracking আপনার dashboard-এ দেখুন।
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Badge variant="secondary" className="gap-1.5 py-2 px-4 text-sm bg-background/80 backdrop-blur-sm shadow-sm">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Real-time Analytics
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5 py-2 px-4 text-sm bg-background/80 backdrop-blur-sm shadow-sm">
                    <BarChart3 className="h-4 w-4 text-blue-500" /> Campaign Tracking
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5 py-2 px-4 text-sm bg-background/80 backdrop-blur-sm shadow-sm">
                    <Zap className="h-4 w-4 text-amber-500" /> Auto Sync (5 min)
                  </Badge>
                </div>
                <Button
                  size="lg"
                  className="gap-2.5 bg-gradient-to-r from-[#1877F2] to-[#0866FF] hover:from-[#1664d9] hover:to-[#0756e0] text-white shadow-xl shadow-blue-500/25 px-8 h-12 text-base font-semibold mt-2"
                  onClick={handleConnect}
                  disabled={connectingOAuth}
                >
                  {connectingOAuth ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Facebook className="h-5 w-5" />}
                  {connectingOAuth ? "Connecting..." : "Connect Meta Ads"}
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Meta Developer App ও Marketing API access প্রয়োজন</span>
                </div>
              </CardContent>
            </Card>

            {/* Setup Guide */}
            <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
              <Card className="border-border/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-xl">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        Setup Guide — How to Connect
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${guideOpen ? "rotate-180" : ""}`} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {getSetupSteps().map((step, i) => (
                      <div key={i} className="flex gap-4 p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            {step.title}
                            {step.link && (
                              <a href={step.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </h4>
                          <p className="text-xs text-muted-foreground">{step.desc}</p>
                          {step.copyValue && (
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-[11px] bg-background border border-border rounded px-2 py-1 text-foreground font-mono break-all">
                                {step.copyValue}
                              </code>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => handleCopyStep(i, step.copyValue!)}>
                                {copiedStep === i ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </>
        ) : noData ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">No ads data yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  আপনার অ্যাকাউন্ট কানেক্ট হয়েছে। ডেটা প্রতি ৫ মিনিট অন্তর সিঙ্ক হবে।
                  <br />প্রথম ডেটা আসতে কিছু সময় লাগতে পারে।
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchMetrics()} disabled={metricsLoading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${metricsLoading ? "animate-spin" : ""}`} /> Refresh Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Total Spend", value: `৳${stats.totalSpend.toLocaleString()}`, sub: `CPC: ৳${stats.cpc}`, icon: DollarSign, color: "text-red-500", bg: "bg-red-500/10" },
                { label: "Clicks", value: stats.totalClicks.toLocaleString(), sub: `CTR: ${stats.ctr}%`, icon: MousePointerClick, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: "Impressions", value: stats.totalImpressions.toLocaleString(), sub: `Last ${dateRange}d`, icon: Eye, color: "text-purple-500", bg: "bg-purple-500/10" },
                { label: "CTR", value: `${stats.ctr}%`, sub: "Click-through rate", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { label: "CPC", value: `৳${stats.cpc}`, sub: "Cost per click", icon: DollarSign, color: "text-amber-500", bg: "bg-amber-500/10" },
              ].map((card) => (
                <Card key={card.label} className="border-border/50 hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                        <card.icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                      <span className="text-xs text-muted-foreground">{card.label}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{card.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts & Tables */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="campaigns">Ad Accounts</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Spend Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                        <Legend />
                        <Area type="monotone" dataKey="spend" name="Spend (৳)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-primary" /> Clicks & Impressions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="clicks" name="Clicks" fill="#1877F2" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="impressions" name="Impressions" fill="#E4405F" opacity={0.3} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="campaigns" className="mt-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Ad Account Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="md:hidden space-y-3">
                      {accountBreakdown.map((c) => (
                        <Card key={c.ad_account_id} className="border">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <Facebook className="h-4 w-4 text-[#1877F2]" />
                              <span className="font-medium text-sm">{c.ad_account_id}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><span className="text-muted-foreground">Spend:</span> <span className="font-medium">৳{c.spend.toLocaleString()}</span></div>
                              <div><span className="text-muted-foreground">Clicks:</span> <span className="font-medium">{c.clicks.toLocaleString()}</span></div>
                              <div><span className="text-muted-foreground">Impr:</span> <span className="font-medium">{c.impressions.toLocaleString()}</span></div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ad Account</TableHead>
                            <TableHead className="text-right">Spend (৳)</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">Impressions</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right">CPC (৳)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accountBreakdown.map((c) => (
                            <TableRow key={c.ad_account_id}>
                              <TableCell className="font-medium">{c.ad_account_id}</TableCell>
                              <TableCell className="text-right">৳{c.spend.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{c.clicks.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{c.impressions.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00"}%</TableCell>
                              <TableCell className="text-right">৳{c.clicks > 0 ? (c.spend / c.clicks).toFixed(2) : "0.00"}</TableCell>
                            </TableRow>
                          ))}
                          {accountBreakdown.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No ad account data available</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FacebookAds;
