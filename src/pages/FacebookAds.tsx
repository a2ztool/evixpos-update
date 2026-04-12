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
import { toast } from "sonner";
import {
  Facebook, Instagram, RefreshCw, Wifi, WifiOff, Clock, TrendingUp,
  TrendingDown, DollarSign, MousePointerClick, Eye, Target, BarChart3,
  Zap, ArrowUpRight, ArrowDownRight, Link2, Unlink, AlertCircle, Sparkles
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from "recharts";
import { format, subDays } from "date-fns";

// Demo data for UI preview
const generateDemoData = () => {
  const campaigns = [
    { name: "Summer Sale 2026", platform: "facebook", status: "active", spend: 4520, impressions: 125000, clicks: 3200, conversions: 89, revenue: 12500 },
    { name: "Product Launch", platform: "instagram", status: "active", spend: 2800, impressions: 98000, clicks: 2100, conversions: 52, revenue: 7800 },
    { name: "Retargeting Q2", platform: "facebook", status: "active", spend: 1650, impressions: 45000, clicks: 1800, conversions: 41, revenue: 5200 },
    { name: "Story Ads - New", platform: "instagram", status: "paused", spend: 980, impressions: 32000, clicks: 850, conversions: 18, revenue: 2100 },
    { name: "Brand Awareness", platform: "facebook", status: "active", spend: 3200, impressions: 210000, clicks: 4500, conversions: 65, revenue: 8900 },
    { name: "Carousel Promo", platform: "instagram", status: "completed", spend: 1200, impressions: 55000, clicks: 1400, conversions: 32, revenue: 4200 },
  ];

  const dailyData = Array.from({ length: 14 }, (_, i) => {
    const date = subDays(new Date(), 13 - i);
    return {
      date: format(date, "MMM dd"),
      spend: Math.floor(Math.random() * 800 + 500),
      revenue: Math.floor(Math.random() * 1500 + 800),
      clicks: Math.floor(Math.random() * 400 + 100),
      impressions: Math.floor(Math.random() * 15000 + 5000),
    };
  });

  return { campaigns, dailyData };
};

const CHART_COLORS = ["#1877F2", "#E4405F", "#4F46E5", "#10B981", "#F59E0B", "#EF4444"];

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
  const [isDemoMode, setIsDemoMode] = useState(false);

  const { campaigns, dailyData } = useMemo(() => generateDemoData(), []);

  // Handle OAuth callback from URL (if redirected back with connected status)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    const account = params.get("account");
    
    if (connected === "true") {
      setIsConnected(true);
      setAccountName(account || "Facebook Ads");
      setIsDemoMode(false);
      toast.success(`✅ ${account || "Facebook Ads"} connected successfully!`);
      // Clean URL
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
        setIsDemoMode(false);
      }
      setLoading(false);
    };
    checkConnection();
  }, [user, activeStore]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh || !isConnected) return;
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isConnected]);

  const stats = useMemo(() => {
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    return {
      totalSpend,
      totalRevenue,
      roas: totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "0.00",
      profit: totalRevenue - totalSpend,
      totalClicks,
      totalImpressions,
      totalConversions,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00",
      cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : "0.00",
      cpa: totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : "0.00",
    };
  }, [campaigns]);

  const platformBreakdown = useMemo(() => {
    const fb = campaigns.filter(c => c.platform === "facebook");
    const ig = campaigns.filter(c => c.platform === "instagram");
    return [
      { name: "Facebook", spend: fb.reduce((s, c) => s + c.spend, 0), revenue: fb.reduce((s, c) => s + c.revenue, 0), fill: "#1877F2" },
      { name: "Instagram", spend: ig.reduce((s, c) => s + c.spend, 0), revenue: ig.reduce((s, c) => s + c.revenue, 0), fill: "#E4405F" },
    ];
  }, [campaigns]);

  const handleConnect = async () => {
    if (!user || !activeStore) {
      toast.error("Please select a store first");
      return;
    }
    setConnectingOAuth(true);
    try {
      // Use /api/facebook/callback as the OAuth redirect URI
      const redirectUri = `${window.location.origin}/api/facebook/callback`;
      const redirectAfterAuth = `${window.location.origin}/finance/facebook-ads`;
      
      const { data, error } = await supabase.functions.invoke("meta-oauth-callback?action=get_auth_url", {
        body: { store_id: activeStore.id, redirect_uri: redirectUri, redirect_after_auth: redirectAfterAuth },
      });
      if (error || !data?.auth_url) {
        toast.error(data?.error || "Failed to get OAuth URL");
        return;
      }
      window.location.href = data.auth_url;
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !activeStore) return;
    try {
      await supabase.functions.invoke("meta-oauth-callback?action=disconnect", {
        body: { store_id: activeStore.id },
      });
      setIsConnected(false);
      setAccountName("");
      setIsDemoMode(false);
      toast.success("Facebook Ads disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  // Not connected state
  const ConnectionCard = () => (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1877F2] to-[#E4405F] flex items-center justify-center shadow-xl">
            <Facebook className="h-10 w-10 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-[#E4405F] to-[#F77737] flex items-center justify-center shadow-lg">
            <Instagram className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-foreground">Connect Facebook & Instagram Ads</h2>
          <p className="text-muted-foreground">
            আপনার Meta Ads account connect করুন এবং real-time ads performance, campaign analytics, 
            এবং ROI tracking আপনার dashboard-এ দেখুন।
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <TrendingUp className="h-3.5 w-3.5" /> Real-time Analytics
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <BarChart3 className="h-3.5 w-3.5" /> Campaign Tracking
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <Zap className="h-3.5 w-3.5" /> Auto Sync (5 min)
          </Badge>
        </div>
        <div className="flex gap-3 mt-2">
          <Button size="lg" className="gap-2 bg-[#1877F2] hover:bg-[#1664d9] text-white shadow-lg" onClick={handleConnect} disabled={connectingOAuth}>
            {connectingOAuth ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Facebook className="h-5 w-5" />}
            {connectingOAuth ? "Connecting..." : "Connect Facebook Ads"}
          </Button>
          <Button size="lg" variant="outline" className="gap-2" onClick={() => { setIsConnected(true); setIsDemoMode(true); toast.success("Demo mode activated!"); }}>
            <Sparkles className="h-5 w-5" />
            Preview Demo
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Meta Developer App ও Marketing API access প্রয়োজন</span>
        </div>
      </CardContent>
    </Card>
  );

  // Status bar
  const StatusBar = () => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="default" className="gap-1.5 bg-emerald-500/90 hover:bg-emerald-500 text-white">
              <Wifi className="h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <WifiOff className="h-3 w-3" /> Not Connected
            </Badge>
          )}
        </div>
        {isConnected && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last updated: {format(lastUpdated, "hh:mm:ss a")}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        {isConnected && (
          <>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => { setAutoRefresh(!autoRefresh); toast.success(autoRefresh ? "Auto-refresh paused" : "Auto-refresh enabled (30s)"); }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
              {autoRefresh ? "Live" : "Paused"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnect}>
              <Unlink className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-2 md:p-6 max-w-[1400px] mx-auto">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 md:p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1877F2] to-[#E4405F] flex items-center justify-center shadow-md">
              <Facebook className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Facebook & Instagram Ads</h1>
              <p className="text-sm text-muted-foreground">Real-time ads performance dashboard</p>
            </div>
          </div>
          {activeStore && (
            <Badge variant="outline" className="gap-1.5 text-xs">
              🏪 {activeStore.name}
            </Badge>
          )}
        </div>

        <StatusBar />

        {!isConnected ? (
          <ConnectionCard />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4 text-red-500" /> Total Spend
                  </div>
                  <p className="text-2xl font-bold text-foreground">৳{stats.totalSpend.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                    <ArrowUpRight className="h-3 w-3" /> +12.5%
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue
                  </div>
                  <p className="text-2xl font-bold text-foreground">৳{stats.totalRevenue.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
                    <ArrowUpRight className="h-3 w-3" /> +18.3%
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Zap className="h-4 w-4 text-blue-500" /> ROAS
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stats.roas}x</p>
                  <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
                    <ArrowUpRight className="h-3 w-3" /> Good
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Target className="h-4 w-4 text-purple-500" /> Net Profit
                  </div>
                  <p className={`text-2xl font-bold ${stats.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    ৳{stats.profit.toLocaleString()}
                  </p>
                  <div className={`flex items-center gap-1 text-xs ${stats.profit >= 0 ? "text-emerald-500" : "text-red-500"} mt-1`}>
                    {stats.profit >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {stats.profit >= 0 ? "Profit" : "Loss"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { label: "Clicks", value: stats.totalClicks.toLocaleString(), icon: MousePointerClick },
                { label: "Impressions", value: stats.totalImpressions.toLocaleString(), icon: Eye },
                { label: "Conversions", value: stats.totalConversions.toString(), icon: Target },
                { label: "CTR", value: `${stats.ctr}%`, icon: BarChart3 },
                { label: "CPC", value: `৳${stats.cpc}`, icon: DollarSign },
                { label: "CPA", value: `৳${stats.cpa}`, icon: Zap },
              ].map(m => (
                <Card key={m.label}>
                  <CardContent className="py-3 px-4 text-center">
                    <m.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-lg font-bold text-foreground">{m.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="platforms">Platforms</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Spend vs Revenue Trend */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" /> Spend vs Revenue Trend
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={dailyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="spend" name="Spend" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
                          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" fill="#10B981" fillOpacity={0.1} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Platform Distribution */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" /> By Platform
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={platformBreakdown} dataKey="spend" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {platformBreakdown.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 mt-2">
                        {platformBreakdown.map(p => (
                          <div key={p.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.fill }} />
                              <span className="text-muted-foreground">{p.name}</span>
                            </div>
                            <span className="font-medium text-foreground">৳{p.spend.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Clicks Trend */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-primary" /> Clicks & Impressions Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="clicks" name="Clicks" fill="#1877F2" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="impressions" name="Impressions" fill="#E4405F" opacity={0.3} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="campaigns" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">All Campaigns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Mobile */}
                    <div className="md:hidden space-y-3">
                      {campaigns.map((c, i) => (
                        <Card key={i} className="border">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {c.platform === "facebook" ? (
                                  <Facebook className="h-4 w-4 text-[#1877F2]" />
                                ) : (
                                  <Instagram className="h-4 w-4 text-[#E4405F]" />
                                )}
                                <span className="font-medium text-sm">{c.name}</span>
                              </div>
                              <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "outline"} className="text-xs capitalize">
                                {c.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><span className="text-muted-foreground">Spend:</span> <span className="font-medium">৳{c.spend.toLocaleString()}</span></div>
                              <div><span className="text-muted-foreground">Revenue:</span> <span className="font-medium text-emerald-600">৳{c.revenue.toLocaleString()}</span></div>
                              <div><span className="text-muted-foreground">ROAS:</span> <span className="font-medium">{(c.revenue / c.spend).toFixed(2)}x</span></div>
                              <div><span className="text-muted-foreground">Clicks:</span> <span className="font-medium">{c.clicks.toLocaleString()}</span></div>
                              <div><span className="text-muted-foreground">Conv:</span> <span className="font-medium">{c.conversions}</span></div>
                              <div><span className="text-muted-foreground">CTR:</span> <span className="font-medium">{((c.clicks / c.impressions) * 100).toFixed(2)}%</span></div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">ROAS</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">Conv.</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right">CPC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaigns.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{c.name}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {c.platform === "facebook" ? (
                                    <Facebook className="h-4 w-4 text-[#1877F2]" />
                                  ) : (
                                    <Instagram className="h-4 w-4 text-[#E4405F]" />
                                  )}
                                  <span className="capitalize">{c.platform}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "outline"} className="text-xs capitalize">
                                  {c.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">৳{c.spend.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-emerald-600">৳{c.revenue.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-medium">{(c.revenue / c.spend).toFixed(2)}x</TableCell>
                              <TableCell className="text-right">{c.clicks.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{c.conversions}</TableCell>
                              <TableCell className="text-right">{((c.clicks / c.impressions) * 100).toFixed(2)}%</TableCell>
                              <TableCell className="text-right">৳{(c.spend / c.clicks).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="platforms" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {platformBreakdown.map(p => (
                    <Card key={p.name} className="border-l-4" style={{ borderLeftColor: p.fill }}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          {p.name === "Facebook" ? <Facebook className="h-5 w-5" style={{ color: p.fill }} /> : <Instagram className="h-5 w-5" style={{ color: p.fill }} />}
                          {p.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Spend</p>
                            <p className="text-xl font-bold text-foreground">৳{p.spend.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Revenue</p>
                            <p className="text-xl font-bold text-emerald-600">৳{p.revenue.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">ROAS</p>
                            <p className="text-lg font-bold text-foreground">{(p.revenue / p.spend).toFixed(2)}x</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Profit</p>
                            <p className={`text-lg font-bold ${p.revenue - p.spend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              ৳{(p.revenue - p.spend).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FacebookAds;
