import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, TrendingUp, Clock, Star, AlertTriangle, Heart,
  DollarSign, CalendarDays, Package, Zap, Target, UserCheck
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

interface CustomerDNAProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  storeId: string;
}

interface OrderData {
  id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  source: string;
  created_at: string;
  meta?: Record<string, any> | null;
}

interface OrderItemData {
  quantity: number;
  price: number;
  products: { name: string; category: string | null } | null;
}

type CustomerTier = "VIP" | "Loyal" | "Regular" | "New" | "At Risk" | "Lost";

const tierConfig: Record<CustomerTier, { color: string; icon: typeof Star; bg: string }> = {
  VIP: { color: "text-amber-600", icon: Star, bg: "bg-amber-100 dark:bg-amber-900/30" },
  Loyal: { color: "text-emerald-600", icon: Heart, bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  Regular: { color: "text-blue-600", icon: UserCheck, bg: "bg-blue-100 dark:bg-blue-900/30" },
  New: { color: "text-indigo-600", icon: Zap, bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  "At Risk": { color: "text-orange-600", icon: AlertTriangle, bg: "bg-orange-100 dark:bg-orange-900/30" },
  Lost: { color: "text-red-600", icon: AlertTriangle, bg: "bg-red-100 dark:bg-red-900/30" },
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const CustomerDNAProfile = ({ open, onOpenChange, customerId, customerName, storeId }: CustomerDNAProfileProps) => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemData[]>([]);

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    const fetchData = async () => {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total_amount, status, payment_status, payment_method, source, created_at, meta")
          .eq("customer_id", customerId)
          .eq("store_id", storeId)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_items")
          .select("quantity, price, products(name, category)")
          .in(
            "order_id",
            (await supabase.from("orders").select("id").eq("customer_id", customerId).eq("store_id", storeId)).data?.map((o) => o.id) || []
          ),
      ]);
      setOrders((ordersRes.data ?? []) as unknown as OrderData[]);
      setOrderItems((itemsRes.data ?? []) as unknown as OrderItemData[]);
      setLoading(false);
    };
    fetchData();
  }, [open, customerId, storeId]);

  const analytics = useMemo(() => {
    const completedOrders = orders.filter((o) => o.status === "completed");
    const totalSpent = completedOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const avgOrderValue = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;
    const totalOrders = orders.length;

    // Frequency analysis
    const now = new Date();
    const firstOrder = orders.length > 0 ? new Date(orders[0].created_at) : now;
    const lastOrder = orders.length > 0 ? new Date(orders[orders.length - 1].created_at) : now;
    const daysSinceFirst = Math.max(1, Math.floor((now.getTime() - firstOrder.getTime()) / 86400000));
    const daysSinceLast = Math.floor((now.getTime() - lastOrder.getTime()) / 86400000);
    const avgDaysBetween = totalOrders > 1
      ? Math.floor((lastOrder.getTime() - firstOrder.getTime()) / 86400000 / (totalOrders - 1))
      : 0;

    // Preferred payment method
    const methodCounts: Record<string, number> = {};
    orders.forEach((o) => { methodCounts[o.payment_method] = (methodCounts[o.payment_method] || 0) + 1; });
    const preferredMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    // Preferred source
    const sourceCounts: Record<string, number> = {};
    orders.forEach((o) => { sourceCounts[o.source] = (sourceCounts[o.source] || 0) + 1; });

    // Category preferences
    const categoryCounts: Record<string, number> = {};
    orderItems.forEach((item) => {
      const cat = item.products?.category || "Uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + item.quantity;
    });
    const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top products
    const productCounts: Record<string, number> = {};
    orderItems.forEach((item) => {
      const name = item.products?.name || "Unknown";
      productCounts[name] = (productCounts[name] || 0) + item.quantity;
    });
    const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Monthly spending trend
    const monthlySpend: Record<string, number> = {};
    completedOrders.forEach((o) => {
      const key = new Date(o.created_at).toLocaleDateString("en-US", { year: "2-digit", month: "short" });
      monthlySpend[key] = (monthlySpend[key] || 0) + Number(o.total_amount);
    });
    const spendTrend = Object.entries(monthlySpend).map(([month, amount]) => ({ month, amount: Math.round(amount) }));

    // Day of week preference
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    orders.forEach((o) => { dayCounts[new Date(o.created_at).getDay()]++; });
    const dayPreference = dayNames[dayCounts.indexOf(Math.max(...dayCounts))];

    // Hour preference
    const hourCounts: Record<number, number> = {};
    orders.forEach((o) => { const h = new Date(o.created_at).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const peakTime = peakHour ? `${Number(peakHour[0]) % 12 || 12}${Number(peakHour[0]) >= 12 ? "PM" : "AM"}` : "N/A";

    // Customer tier
    let tier: CustomerTier = "New";
    if (daysSinceFirst < 14 && totalOrders <= 1) tier = "New";
    else if (daysSinceLast > 60) tier = "Lost";
    else if (daysSinceLast > 30) tier = "At Risk";
    else if (totalOrders >= 10 && avgOrderValue > 500) tier = "VIP";
    else if (totalOrders >= 5) tier = "Loyal";
    else tier = "Regular";

    // Loyalty score (0-100)
    const recencyScore = Math.max(0, 100 - daysSinceLast * 2);
    const frequencyScore = Math.min(100, totalOrders * 10);
    const monetaryScore = Math.min(100, totalSpent / 50);
    const loyaltyScore = Math.round((recencyScore * 0.3 + frequencyScore * 0.4 + monetaryScore * 0.3));

    // Actionable insights
    const insights: { type: "success" | "warning" | "info"; message: string }[] = [];
    if (tier === "VIP") insights.push({ type: "success", message: "🌟 VIP Customer — Send exclusive offers & early access deals" });
    if (tier === "At Risk") insights.push({ type: "warning", message: `⚠️ Inactive for ${daysSinceLast} days — Send a re-engagement offer` });
    if (tier === "Lost") insights.push({ type: "warning", message: `🔴 Lost customer (${daysSinceLast} days inactive) — Win-back campaign needed` });
    if (avgOrderValue > 1000) insights.push({ type: "success", message: "💰 High spender — Consider premium tier or loyalty rewards" });
    if (totalOrders >= 3 && avgDaysBetween > 0) {
      const nextExpected = avgDaysBetween - daysSinceLast;
      if (nextExpected <= 3 && nextExpected > 0) insights.push({ type: "info", message: `📅 Next order expected in ~${nextExpected} days based on pattern` });
    }
    if (topProducts.length > 0) insights.push({ type: "info", message: `🛍️ Favorite product: "${topProducts[0][0]}" — Suggest similar items` });
    if (tier === "New") insights.push({ type: "info", message: "🆕 New customer — Send welcome offer to encourage repeat purchase" });

    return {
      totalSpent, avgOrderValue, totalOrders, daysSinceLast, avgDaysBetween,
      preferredMethod, topCategories, topProducts, spendTrend, dayPreference,
      peakTime, tier, loyaltyScore, insights, sourceCounts, completedOrders: completedOrders.length,
      cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
    };
  }, [orders, orderItems]);

  const TierIcon = tierConfig[analytics.tier]?.icon || Star;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tierConfig[analytics.tier]?.bg}`}>
              <TierIcon className={`h-5 w-5 ${tierConfig[analytics.tier]?.color}`} />
            </div>
            <div>
              <span className="text-lg">{customerName}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className={`${tierConfig[analytics.tier]?.bg} ${tierConfig[analytics.tier]?.color} text-xs font-semibold border-0`}>
                  {analytics.tier}
                </Badge>
                <span className="text-xs text-muted-foreground">Loyalty Score: {analytics.loyaltyScore}/100</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No order data available</p>
            <p className="text-sm text-muted-foreground mt-1">DNA profile will appear after the first purchase.</p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Loyalty Score Bar */}
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">Loyalty Score</span>
                <span className="font-bold">{analytics.loyaltyScore}%</span>
              </div>
              <Progress value={analytics.loyaltyScore} className="h-2.5" />
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: ShoppingCart, label: "Total Orders", value: analytics.totalOrders, sub: `${analytics.completedOrders} completed` },
                { icon: DollarSign, label: "Total Spent", value: `৳${analytics.totalSpent.toFixed(0)}`, sub: `Avg ৳${analytics.avgOrderValue.toFixed(0)}/order` },
                { icon: Clock, label: "Last Seen", value: `${analytics.daysSinceLast}d ago`, sub: analytics.avgDaysBetween > 0 ? `Every ~${analytics.avgDaysBetween}d` : "First time" },
                { icon: CalendarDays, label: "Peak Time", value: analytics.peakTime, sub: `${analytics.dayPreference}s` },
              ].map((m, i) => (
                <div key={i} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground font-medium">{m.label}</span>
                  </div>
                  <p className="text-lg font-bold leading-tight">{m.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Actionable Insights */}
            {analytics.insights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Target className="h-4 w-4" /> Actionable Insights
                </h4>
                {analytics.insights.map((insight, i) => (
                  <div key={i} className={`text-sm px-3 py-2 rounded-lg border ${
                    insight.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300" :
                    insight.type === "warning" ? "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300" :
                    "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                  }`}>
                    {insight.message}
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Spending Trend Chart */}
            {analytics.spendTrend.length > 1 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4" /> Spending Trend
                </h4>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.spendTrend}>
                      <defs>
                        <linearGradient id="dnaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`৳${v}`, "Spent"]} />
                      <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="url(#dnaGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top Products & Categories */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {analytics.topProducts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Package className="h-4 w-4" /> Top Products
                  </h4>
                  <div className="space-y-1.5">
                    {analytics.topProducts.map(([name, qty], i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-1.5">
                        <span className="truncate font-medium">{name}</span>
                        <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">{qty}x</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.topCategories.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Category Preference</h4>
                  <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.topCategories.map(([name, value]) => ({ name, value }))}
                          cx="50%" cy="50%"
                          innerRadius={30} outerRadius={55}
                          dataKey="value"
                          paddingAngle={3}
                        >
                          {analytics.topCategories.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, name: string) => [v, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {analytics.topCategories.map(([name], i) => (
                      <span key={i} className="text-[10px] flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Payment & Source Preferences */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-3">
                <span className="text-[11px] text-muted-foreground font-medium">Preferred Payment</span>
                <p className="text-sm font-bold capitalize mt-1">{analytics.preferredMethod}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <span className="text-[11px] text-muted-foreground font-medium">Order Sources</span>
                <div className="flex gap-1 flex-wrap mt-1">
                  {Object.entries(analytics.sourceCounts).map(([src, cnt]) => (
                    <Badge key={src} variant="outline" className="text-[10px] capitalize">{src} ({cnt})</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDNAProfile;
