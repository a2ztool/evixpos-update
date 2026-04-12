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

  // Fetch metrics when connected
  useEffect(() => {
    if (isConnected) {
      fetchMetrics();
    }
  }, [isConnected, fetchMetrics]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh || !isConnected) return;
    const interval = setInterval(() => {
      fetchMetrics();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isConnected, fetchMetrics]);

  // Compute stats from real metrics
  const stats = useMemo(() => {
    const totalSpend = metrics.reduce((s, m) => s + Number(m.spend), 0);
    const totalClicks = metrics.reduce((s, m) => s + Number(m.clicks), 0);
    const totalImpressions = metrics.reduce((s, m) => s + Number(m.impressions), 0);
    return {
      totalSpend,
      totalClicks,
      totalImpressions,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00",
      cpc: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : "0.00",
    };
  }, [metrics]);

  // Daily chart data
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
      .map(([date, vals]) => ({
        date: format(new Date(date), "MMM dd"),
        ...vals,
      }));
  }, [metrics]);

  // Per-account breakdown for "campaigns" table
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
    if (!user || !activeStore) {
      toast.error("Please select a store first");
      return;
    }
    setConnectingOAuth(true);

    const META_APP_ID = "1304633021527034";
    const redirectUri = "https://identical-copy.lovable.app/api/facebook/callback";
    const state = btoa(JSON.stringify({ user_id: user.id, store_id: activeStore.id }));

    const authUrl =
      `https://www.facebook.com/v19.0/dialog/oauth` +
      `?client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=ads_read,ads_management` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    if (!user || !activeStore) return;
    try {
      await supabase.functions.invoke("meta-oauth-callback?action=disconnect", {
        body: { store_id: activeStore.id },
      });
      setIsConnected(false);
      setAccountName("");
      setMetrics([]);
      toast.success("Facebook Ads disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

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
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Meta Developer App ও Marketing API access প্রয়োজন</span>
        </div>
      </CardContent>
    </Card>
  );

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
          {accountName && (
            <span className="text-xs text-muted-foreground">• {accountName}</span>
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
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fetchMetrics()}
              disabled={metricsLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${metricsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => { setAutoRefresh(!autoRefresh); toast.success(autoRefresh ? "Auto-refresh paused" : "Auto-refresh enabled (30s)"); }}
            >
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
        ) : noData ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">No ads data yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  আপনার অ্যাকাউন্ট কানেক্ট হয়েছে। ডেটা প্রতি ৫ মিনিট অন্তর সিঙ্ক হবে।
                  <br />প্রথম ডেটা আসতে কিছু সময় লাগতে পারে।
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchMetrics()} disabled={metricsLoading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${metricsLoading ? "animate-spin" : ""}`} />
                Refresh Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4 text-red-500" /> Total Spend
                  </div>
                  <p className="text-2xl font-bold text-foreground">৳{stats.totalSpend.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">CPC: ৳{stats.cpc}</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <MousePointerClick className="h-4 w-4 text-blue-500" /> Total Clicks
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalClicks.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">CTR: {stats.ctr}%</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-bl-[40px]" />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Eye className="h-4 w-4 text-purple-500" /> Impressions
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalImpressions.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Last {dateRange} days</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="campaigns">Ad Accounts</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Spend Trend */}
                <Card>
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
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="spend" name="Spend (৳)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Clicks & Impressions Trend */}
                <Card>
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
                    <CardTitle className="text-base">Ad Account Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Mobile */}
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

                    {/* Desktop */}
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
                              <TableCell className="text-right">
                                {c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00"}%
                              </TableCell>
                              <TableCell className="text-right">
                                ৳{c.clicks > 0 ? (c.spend / c.clicks).toFixed(2) : "0.00"}
                              </TableCell>
                            </TableRow>
                          ))}
                          {accountBreakdown.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No ad account data available
                              </TableCell>
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
