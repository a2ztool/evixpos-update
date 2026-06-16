import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle, Package, CheckCircle2, Archive, Skull, TrendingDown, Search, Plus,
  RefreshCw, BookOpen, Sparkles, Download, Boxes, Activity, ShieldAlert, Tag,
  PackageX, Zap, Clock, Eye,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";

const StockAlerts = () => {
  const { storeId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [restockDialog, setRestockDialog] = useState<any>(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockCost, setRestockCost] = useState("");
  const [bulkRestockOpen, setBulkRestockOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkQty, setBulkQty] = useState("");
  const [thresholdDialog, setThresholdDialog] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(5);
  const [criticalThreshold, setCriticalThreshold] = useState(2);
  const [discountDialog, setDiscountDialog] = useState<any>(null);
  const [discountPct, setDiscountPct] = useState("20");

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["stock-alerts", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_alerts")
        .select("*, products(name, stock, sku)")
        .eq("store_id", storeId!)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: lowStockProducts = [], isLoading } = useQuery({
    queryKey: ["low-stock-products", storeId, lowThreshold],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, stock, sku, price, image_url")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .eq("type", "physical")
        .lte("stock", lowThreshold)
        .order("stock", { ascending: true });
      return data || [];
    },
  });

  const { data: deadStockProducts = [] } = useQuery({
    queryKey: ["dead-stock", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, stock, sku, price, image_url, created_at")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .eq("type", "physical")
        .gt("stock", 0);

      if (!products || products.length === 0) return [];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentOrderItems } = await supabase
        .from("order_items")
        .select("product_id, orders!inner(store_id, created_at)")
        .eq("orders.store_id", storeId!)
        .gte("orders.created_at", thirtyDaysAgo.toISOString());

      const recentProductIds = new Set(
        (recentOrderItems || []).map((item: any) => item.product_id)
      );

      return products.filter(p => !recentProductIds.has(p.id));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_alerts").update({ is_resolved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-alerts"] });
      toast.success("Alert resolved");
    },
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!restockDialog) return;
      const qty = Number(restockQty);
      if (qty <= 0) throw new Error("Invalid quantity");
      const newStock = Number(restockDialog.stock) + qty;
      const updates: any = { stock: newStock };
      const { error } = await supabase.from("products").update(updates).eq("id", restockDialog.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
      queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
      setRestockDialog(null);
      setRestockQty("");
      setRestockCost("");
      toast.success("Stock updated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkRestockMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(bulkQty);
      if (qty <= 0) throw new Error("Invalid quantity");
      const targets = lowStockProducts.filter((p: any) => selectedIds.includes(p.id));
      for (const p of targets) {
        await supabase.from("products").update({ stock: Number(p.stock) + qty }).eq("id", p.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
      setBulkRestockOpen(false);
      setSelectedIds([]);
      setBulkQty("");
      toast.success(`Restocked ${selectedIds.length} products`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const discountMutation = useMutation({
    mutationFn: async () => {
      if (!discountDialog) return;
      const pct = Number(discountPct);
      const newPrice = Number(discountDialog.price) * (1 - pct / 100);
      const { error } = await supabase.from("products").update({ price: Math.round(newPrice * 100) / 100 }).eq("id", discountDialog.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
      setDiscountDialog(null);
      toast.success("Discount applied — try clearing dead stock!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // KPIs
  const lowCount = lowStockProducts.filter((p: any) => p.stock > 0 && p.stock <= lowThreshold).length;
  const criticalCount = lowStockProducts.filter((p: any) => p.stock > 0 && p.stock <= criticalThreshold).length;
  const outOfStock = lowStockProducts.filter((p: any) => p.stock === 0).length;
  const deadCount = deadStockProducts.length;
  const deadStockValue = deadStockProducts.reduce((sum: number, p: any) => sum + (Number(p.price) * Number(p.stock)), 0);
  const lowStockValue = lowStockProducts.reduce((sum: number, p: any) => sum + (Number(p.price) * Number(p.stock)), 0);
  const reorderCost = lowStockProducts.reduce(
    (sum: number, p: any) => sum + (Number(p.price) * 0.7 * Math.max(lowThreshold * 4 - Number(p.stock), 0)),
    0
  );

  // Health Score (0-100): 100 means no issues
  const totalActive = lowStockProducts.length + deadCount + 50; // baseline
  const healthScore = Math.max(0, Math.round(100 - (criticalCount * 10 + outOfStock * 8 + deadCount * 3) / Math.max(totalActive / 30, 1)));

  // Charts
  const stockBuckets = useMemo(() => [
    { name: "Out of Stock", value: outOfStock, color: "hsl(var(--destructive))" },
    { name: "Critical", value: criticalCount, color: "hsl(38 92% 50%)" },
    { name: "Low", value: Math.max(lowCount - criticalCount, 0), color: "hsl(48 96% 53%)" },
    { name: "Dead", value: deadCount, color: "hsl(25 95% 53%)" },
  ].filter(b => b.value > 0), [outOfStock, criticalCount, lowCount, deadCount]);

  const topLowChart = lowStockProducts.slice(0, 6).map((p: any) => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
    stock: Number(p.stock),
  }));

  const filteredLow = lowStockProducts.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredDead = deadStockProducts.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const lowPagination = usePagination(filteredLow.length, {
    storageKey: `pg:stock-low:${storeId ?? "none"}`,
    filterSignature: JSON.stringify({ search, lowThreshold }),
  });
  const pagedLow = useMemo(
    () => paginate(filteredLow, lowPagination.page, lowPagination.pageSize),
    [filteredLow, lowPagination.page, lowPagination.pageSize],
  );
  const deadPagination = usePagination(filteredDead.length, {
    storageKey: `pg:stock-dead:${storeId ?? "none"}`,
    filterSignature: JSON.stringify({ search }),
  });
  const pagedDead = useMemo(
    () => paginate(filteredDead, deadPagination.page, deadPagination.pageSize),
    [filteredDead, deadPagination.page, deadPagination.pageSize],
  );

  const stockBadge = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive" className="gap-1"><PackageX className="h-3 w-3" />Out</Badge>;
    if (stock <= criticalThreshold) return <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20 gap-1"><ShieldAlert className="h-3 w-3" />Critical</Badge>;
    return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 gap-1"><AlertTriangle className="h-3 w-3" />Low</Badge>;
  };

  const exportCSV = (rows: any[], type: string) => {
    const head = ["Name", "SKU", "Stock", "Price", "Value"];
    const csv = [
      head.join(","),
      ...rows.map((p: any) => [p.name, p.sku || "", p.stock, p.price, (p.price * p.stock).toFixed(2)].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${type}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const toggleAll = () => {
    const pageIds = pagedLow.map((p: any) => p.id);
    const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allOnPageSelected) setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    else setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 pb-24 md:pb-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Stock Alerts</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Inventory intelligence · dead-stock detection · auto-reorder insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setThresholdDialog(true)}>
              <Tag className="h-4 w-4 mr-1.5" /> Thresholds
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
              queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
              toast.success("Refreshed");
            }}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <BookOpen className="h-4 w-4" /> Guide
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Stock Alerts — Master Guide</SheetTitle>
                  <SheetDescription>Inventory health monitoring and dead-stock recovery</SheetDescription>
                </SheetHeader>
                <div className="space-y-3 mt-6 text-sm">
                  {[
                    { icon: AlertTriangle, title: "1 · Low Stock Detection", desc: `Products with stock ≤ ${lowThreshold} appear here. Customize your threshold from the Thresholds button to match your reorder cycle (slower-selling items can use a lower threshold).` },
                    { icon: ShieldAlert, title: "2 · Critical Items", desc: `Items with stock ≤ ${criticalThreshold} are flagged as Critical (red badge). These need immediate reordering — you risk stockout within days.` },
                    { icon: PackageX, title: "3 · Out of Stock", desc: "Zero-stock items lose sales every hour. Restock these first — check Suppliers page to record a purchase order, which auto-updates inventory." },
                    { icon: Skull, title: "4 · Dead Stock (30d Rule)", desc: "Products in stock with zero sales in the last 30 days. They tie up capital and shelf space. Use 'Apply Discount' to clear them — even at a small loss, freeing capital is profit." },
                    { icon: Zap, title: "5 · Bulk Restock", desc: "Select multiple low-stock items via checkboxes and restock them all at once with the same quantity. Saves time during weekly reorder runs." },
                    { icon: Activity, title: "6 · Stock Health Score", desc: "An aggregate 0–100 score blending out-of-stock, critical, and dead items. Aim for 85+. Below 60 means urgent attention required." },
                    { icon: Download, title: "7 · CSV Export", desc: "Export low-stock or dead-stock lists as CSV — perfect for sharing with suppliers, accountants, or for offline reorder planning." },
                    { icon: Tag, title: "8 · Smart Pricing", desc: "For dead stock, apply a quick discount (10/20/30/50%) to stimulate sales. Track the impact in Reports → Sales Analytics." },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <step.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold mb-1">{step.title}</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4">
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Pro Tip</p>
                    <p className="text-xs text-muted-foreground">Review this page every Monday morning. Top-performing stores reorder once a week based on this exact dashboard.</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* PREMIUM KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Out of Stock", value: outOfStock, sub: "Zero inventory", icon: PackageX, color: "text-destructive", bg: "from-destructive/10 to-destructive/5" },
            { label: "Critical", value: criticalCount, sub: `≤ ${criticalThreshold} units`, icon: ShieldAlert, color: "text-orange-600", bg: "from-orange-500/10 to-orange-500/5" },
            { label: "Low Stock", value: lowCount, sub: format(lowStockValue), icon: AlertTriangle, color: "text-yellow-600", bg: "from-yellow-500/10 to-yellow-500/5" },
            { label: "Dead Stock", value: deadCount, sub: format(deadStockValue), icon: Skull, color: "text-amber-700", bg: "from-amber-500/10 to-amber-500/5" },
          ].map((kpi, i) => (
            <Card key={i} className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.bg}`} />
              <CardContent className="relative px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">{kpi.label}</p>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className={`text-xl sm:text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* HEALTH SCORE + CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-0 shadow-md lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Stock Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-2">
                <p className={`text-5xl font-extrabold ${healthScore >= 85 ? "text-emerald-600" : healthScore >= 60 ? "text-yellow-600" : "text-destructive"}`}>{healthScore}</p>
                <p className="text-xs text-muted-foreground mt-1">{healthScore >= 85 ? "Excellent" : healthScore >= 60 ? "Needs attention" : "Critical — act now"}</p>
              </div>
              <Progress value={healthScore} className="h-2 mt-2" />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>0</span><span>Target 85+</span><span>100</span>
              </div>
              <div className="mt-3 pt-3 border-t text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Reorder Investment</span><span className="font-semibold">{format(reorderCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Capital Stuck (Dead)</span><span className="font-semibold text-amber-600">{format(deadStockValue)}</span></div>
              </div>
            </CardContent>
          </Card>

          {stockBuckets.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> Inventory Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={stockBuckets} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {stockBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center text-[10px]">
                  {stockBuckets.map((b, i) => (
                    <div key={i} className="flex items-center gap-1"><div className="h-2 w-2 rounded-full" style={{ background: b.color }} /><span>{b.name} ({b.value})</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {topLowChart.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Lowest 6 Items</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={topLowChart} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
                    <Bar dataKey="stock" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* SEARCH */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products by name or SKU..." className="pl-9 h-10" />
          </div>
          {selectedIds.length > 0 && (
            <Button onClick={() => setBulkRestockOpen(true)} className="gap-1.5">
              <Zap className="h-4 w-4" /> Bulk Restock ({selectedIds.length})
            </Button>
          )}
        </div>

        {/* TABS */}
        <Tabs defaultValue="low-stock">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="low-stock" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Low Stock <Badge variant="secondary" className="ml-1 h-5">{lowStockProducts.length}</Badge></TabsTrigger>
            <TabsTrigger value="dead-stock" className="gap-1.5"><Skull className="h-3.5 w-3.5" />Dead Stock <Badge variant="secondary" className="ml-1 h-5">{deadCount}</Badge></TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5"><Archive className="h-3.5 w-3.5" />Alerts <Badge variant="secondary" className="ml-1 h-5">{alerts.length}</Badge></TabsTrigger>
          </TabsList>

          {/* LOW STOCK */}
          <TabsContent value="low-stock" className="mt-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500" /> Low Stock Products</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => exportCSV(filteredLow, "low-stock")} disabled={!filteredLow.length}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile cards */}
                <div className="md:hidden space-y-2 p-3">
                  {filteredLow.length === 0 ? (
                    <div className="text-center py-10">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                      <p className="text-sm text-muted-foreground">All products well stocked!</p>
                    </div>
                  ) : pagedLow.map((p: any) => {
                    const pct = Math.min((p.stock / lowThreshold) * 100, 100);
                    return (
                      <div key={p.id} className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => setSelectedIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{p.name}</p>
                            <p className="text-[11px] text-muted-foreground">{p.sku || "No SKU"} · {format(p.price)}</p>
                          </div>
                          {stockBadge(p.stock)}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs font-bold tabular-nums">{p.stock}/{lowThreshold}</span>
                        </div>
                        <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => { setRestockDialog(p); setRestockQty(""); setRestockCost(p.cost_price || ""); }}>
                          <Plus className="h-3 w-3 mr-1" /> Restock
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-10"><Checkbox checked={pagedLow.length > 0 && pagedLow.every((p: any) => selectedIds.includes(p.id))} onCheckedChange={toggleAll} /></TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Stock Level</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
                      ) : filteredLow.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-12">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                          <p className="text-muted-foreground">All products are well stocked!</p>
                        </TableCell></TableRow>
                      ) : pagedLow.map((p: any) => {
                        const pct = Math.min((p.stock / lowThreshold) * 100, 100);
                        return (
                          <TableRow key={p.id} className="hover:bg-muted/30">
                            <TableCell><Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => setSelectedIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} /></TableCell>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.sku || "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 w-40">
                                <Progress value={pct} className="h-1.5 flex-1" />
                                <span className={`text-sm font-bold tabular-nums ${p.stock === 0 ? "text-destructive" : p.stock <= criticalThreshold ? "text-orange-600" : "text-yellow-600"}`}>{p.stock}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{format(p.price * p.stock)}</TableCell>
                            <TableCell>{stockBadge(p.stock)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => { setRestockDialog(p); setRestockQty(""); setRestockCost(p.cost_price || ""); }}>
                                <Plus className="h-3 w-3 mr-1" /> Restock
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              {filteredLow.length > 0 && (
                <div className="px-3 pb-3">
                  <DataPagination
                    page={lowPagination.page}
                    pageSize={lowPagination.pageSize}
                    total={filteredLow.length}
                    onPageChange={lowPagination.setPage}
                    onPageSizeChange={lowPagination.setPageSize}
                    itemLabel="products"
                  />
                </div>
              )}
            </Card>
          </TabsContent>

          {/* DEAD STOCK */}
          <TabsContent value="dead-stock" className="mt-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Skull className="h-4 w-4 text-orange-500" /> Dead Stock — No sales in 30+ days</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => exportCSV(filteredDead, "dead-stock")} disabled={!filteredDead.length}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile cards */}
                <div className="md:hidden space-y-2 p-3">
                  {filteredDead.length === 0 ? (
                    <div className="text-center py-10">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                      <p className="text-sm text-muted-foreground">No dead stock detected!</p>
                    </div>
                  ) : pagedDead.map((p: any) => (
                    <div key={p.id} className="rounded-xl border bg-gradient-to-br from-card to-amber-500/5 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.sku || "No SKU"}</p>
                        </div>
                        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"><Skull className="h-3 w-3 mr-1" />Dead</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                        <div className="rounded-lg bg-background/60 p-1.5"><p className="text-[9px] uppercase text-muted-foreground">Stock</p><p className="font-bold text-xs text-orange-600">{p.stock}</p></div>
                        <div className="rounded-lg bg-background/60 p-1.5"><p className="text-[9px] uppercase text-muted-foreground">Price</p><p className="font-bold text-xs">{format(p.price)}</p></div>
                        <div className="rounded-lg bg-background/60 p-1.5"><p className="text-[9px] uppercase text-muted-foreground">Value</p><p className="font-bold text-xs">{format(p.price * p.stock)}</p></div>
                      </div>
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => { setDiscountDialog(p); setDiscountPct("20"); }}>
                        <Tag className="h-3 w-3 mr-1" /> Apply Discount
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Capital Stuck</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDead.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-12">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                          <p className="text-muted-foreground">No dead stock detected!</p>
                        </TableCell></TableRow>
                      ) : pagedDead.map((p: any) => (
                        <TableRow key={p.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sku || "—"}</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{p.stock}</TableCell>
                          <TableCell className="text-right">{format(p.price)}</TableCell>
                          <TableCell className="text-right font-semibold text-amber-700 dark:text-amber-400">{format(p.price * p.stock)}</TableCell>
                          <TableCell><Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"><Skull className="h-3 w-3 mr-1" />Dead</Badge></TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => { setDiscountDialog(p); setDiscountPct("20"); }}>
                              <Tag className="h-3 w-3 mr-1" /> Discount
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ALERTS */}
          <TabsContent value="alerts" className="mt-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Archive className="h-4 w-4 text-primary" /> Manual Alerts</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertsLoading ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : alerts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-12">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                        <p className="text-muted-foreground">No active alerts</p>
                      </TableCell></TableRow>
                    ) : alerts.map((a: any) => (
                      <TableRow key={a.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{a.products?.name}</TableCell>
                        <TableCell><Badge variant="secondary">{a.alert_type}</Badge></TableCell>
                        <TableCell>{a.threshold}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate(a.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* RESTOCK DIALOG */}
        <Dialog open={!!restockDialog} onOpenChange={v => { if (!v) setRestockDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Restock Product</DialogTitle>
              <DialogDescription>{restockDialog?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span className="font-mono text-xs">{restockDialog?.sku || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Stock</span><span className="font-bold">{restockDialog?.stock}</span></div>
                {restockQty && (
                  <div className="flex justify-between border-t pt-1.5 mt-1.5"><span className="text-muted-foreground">After Restock</span><span className="font-bold text-emerald-600">{Number(restockDialog?.stock || 0) + Number(restockQty)}</span></div>
                )}
              </div>
              <div>
                <Label>Quantity to Add</Label>
                <Input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="0" className="mt-1 h-11 text-lg font-semibold" autoFocus />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[10, 25, 50, 100, 200].map(n => (
                    <Button key={n} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRestockQty(String(n))}>+{n}</Button>
                  ))}
                </div>
              </div>
              <Button onClick={() => restockMutation.mutate()} disabled={!restockQty || restockMutation.isPending} className="w-full h-11">
                {restockMutation.isPending ? "Updating..." : `Add ${restockQty || 0} units`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* BULK RESTOCK DIALOG */}
        <Dialog open={bulkRestockOpen} onOpenChange={setBulkRestockOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Bulk Restock</DialogTitle>
              <DialogDescription>Add the same quantity to {selectedIds.length} selected products</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 max-h-32 overflow-y-auto">
                {lowStockProducts.filter((p: any) => selectedIds.includes(p.id)).map((p: any) => (
                  <div key={p.id} className="flex justify-between text-xs py-1 border-b last:border-0">
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">{p.stock} → {p.stock + (Number(bulkQty) || 0)}</span>
                  </div>
                ))}
              </div>
              <div>
                <Label>Quantity per product</Label>
                <Input type="number" value={bulkQty} onChange={e => setBulkQty(e.target.value)} placeholder="0" className="mt-1 h-11 text-lg font-semibold" autoFocus />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[10, 25, 50, 100].map(n => <Button key={n} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setBulkQty(String(n))}>+{n}</Button>)}
                </div>
              </div>
              <Button onClick={() => bulkRestockMutation.mutate()} disabled={!bulkQty || bulkRestockMutation.isPending} className="w-full h-11">
                {bulkRestockMutation.isPending ? "Updating..." : `Restock ${selectedIds.length} products`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* THRESHOLD DIALOG */}
        <Dialog open={thresholdDialog} onOpenChange={setThresholdDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Custom Thresholds</DialogTitle>
              <DialogDescription>Tune what counts as low or critical stock for your business</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Low Stock Threshold</Label>
                <Input type="number" value={lowThreshold} onChange={e => setLowThreshold(Number(e.target.value) || 5)} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Items with stock ≤ this number show as Low</p>
              </div>
              <div>
                <Label>Critical Threshold</Label>
                <Input type="number" value={criticalThreshold} onChange={e => setCriticalThreshold(Number(e.target.value) || 2)} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Items with stock ≤ this number show as Critical (red)</p>
              </div>
              <Button onClick={() => { setThresholdDialog(false); toast.success("Thresholds updated"); }} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DISCOUNT DIALOG */}
        <Dialog open={!!discountDialog} onOpenChange={v => { if (!v) setDiscountDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Apply Clearance Discount</DialogTitle>
              <DialogDescription>{discountDialog?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Current Price</span><span className="font-bold">{format(discountDialog?.price || 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">After Discount</span><span className="font-bold text-emerald-600">{format((discountDialog?.price || 0) * (1 - Number(discountPct) / 100))}</span></div>
                <div className="flex justify-between border-t pt-1.5 mt-1.5"><span className="text-muted-foreground">Capital Recovered (est.)</span><span className="font-bold">{format((discountDialog?.price || 0) * (1 - Number(discountPct) / 100) * (discountDialog?.stock || 0))}</span></div>
              </div>
              <div>
                <Label>Discount %</Label>
                <Input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="mt-1 h-11 text-lg font-semibold" />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[10, 20, 30, 50, 70].map(n => <Button key={n} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDiscountPct(String(n))}>{n}%</Button>)}
                </div>
              </div>
              <Button onClick={() => discountMutation.mutate()} disabled={!discountPct || discountMutation.isPending} className="w-full h-11">
                {discountMutation.isPending ? "Applying..." : `Apply ${discountPct}% Off`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default StockAlerts;
