import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, CheckCircle2, Archive, Skull, TrendingDown, Search, Plus, RefreshCw } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";

const StockAlerts = () => {
  const { storeId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [restockDialog, setRestockDialog] = useState<any>(null);
  const [restockQty, setRestockQty] = useState("");

  const { data: alerts = [], isLoading } = useQuery({
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

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ["low-stock-products", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, stock, sku, price")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .eq("type", "physical")
        .lte("stock", 5)
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
        .select("id, name, stock, sku, price")
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

  // Restock product
  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!restockDialog) return;
      const qty = Number(restockQty);
      if (qty <= 0) throw new Error("Invalid quantity");
      const newStock = Number(restockDialog.stock) + qty;
      const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", restockDialog.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
      queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
      setRestockDialog(null);
      setRestockQty("");
      toast.success("Stock updated!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lowCount = lowStockProducts.filter((p: any) => p.stock > 0 && p.stock <= 5).length;
  const outOfStock = lowStockProducts.filter((p: any) => p.stock === 0).length;
  const deadCount = deadStockProducts.length;
  const deadStockValue = deadStockProducts.reduce((sum: number, p: any) => sum + (p.price * p.stock), 0);

  const filteredLow = lowStockProducts.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredDead = deadStockProducts.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Stock Alerts</h1>
            <p className="text-sm text-muted-foreground">Monitor inventory levels, detect dead stock, and prevent stockouts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["low-stock-products"] });
              queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
              toast.success("Refreshed!");
            }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <PageGuide title="How Stock Alerts Work" steps={[
              { title: "Low Stock", description: "Products with stock ≤5 appear as warnings. Click 'Restock' to add inventory." },
              { title: "Dead Stock", description: "Products with stock but zero sales in 30 days are flagged." },
              { title: "Quick Restock", description: "Click the restock button to quickly add inventory to any product." },
            ]} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-yellow-500/30">
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div><p className="text-sm text-muted-foreground">Low Stock</p><p className="text-2xl font-bold text-yellow-600">{lowCount}</p></div>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="pt-4 flex items-center gap-3">
              <Package className="h-8 w-8 text-destructive" />
              <div><p className="text-sm text-muted-foreground">Out of Stock</p><p className="text-2xl font-bold text-destructive">{outOfStock}</p></div>
            </CardContent>
          </Card>
          <Card className="border-orange-500/30">
            <CardContent className="pt-4 flex items-center gap-3">
              <Skull className="h-8 w-8 text-orange-500" />
              <div><p className="text-sm text-muted-foreground">Dead Stock</p><p className="text-2xl font-bold text-orange-600">{deadCount}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Dead Value</p><p className="text-2xl font-bold">{format(deadStockValue)}</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="pl-9" />
        </div>

        <Tabs defaultValue="low-stock">
          <TabsList>
            <TabsTrigger value="low-stock">Low Stock ({lowStockProducts.length})</TabsTrigger>
            <TabsTrigger value="dead-stock">Dead Stock ({deadCount})</TabsTrigger>
            <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="low-stock">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /> Low Stock Products</CardTitle></CardHeader>
              <CardContent className="p-0">
                {/* Mobile cards */}
                <div className="md:hidden space-y-3 p-4">
                  {filteredLow.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      All products are well stocked!
                    </div>
                  ) : filteredLow.map((p: any) => (
                    <div key={p.id} className="border rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku || "No SKU"}</p>
                        <Badge variant={p.stock === 0 ? "destructive" : "secondary"} className="mt-1 text-xs">
                          {p.stock === 0 ? "Out of Stock" : `Stock: ${p.stock}`}
                        </Badge>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { setRestockDialog(p); setRestockQty(""); }}>
                        <Plus className="h-3 w-3 mr-1" /> Restock
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Current Stock</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLow.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          All products are well stocked!
                        </TableCell></TableRow>
                      ) : filteredLow.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sku || "—"}</TableCell>
                          <TableCell>
                            <span className={`text-lg font-bold ${p.stock === 0 ? "text-destructive" : "text-yellow-600"}`}>{p.stock}</span>
                          </TableCell>
                          <TableCell>{format(p.price * p.stock)}</TableCell>
                          <TableCell>
                            <Badge variant={p.stock === 0 ? "destructive" : "secondary"}>
                              {p.stock === 0 ? "Out of Stock" : "Low Stock"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => { setRestockDialog(p); setRestockQty(""); }}>
                              <Plus className="h-3 w-3 mr-1" /> Restock
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

          <TabsContent value="dead-stock">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Skull className="h-5 w-5 text-orange-500" /> Dead Stock (No sales in 30+ days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile cards */}
                <div className="md:hidden space-y-3 p-4">
                  {filteredDead.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      No dead stock detected!
                    </div>
                  ) : filteredDead.map((p: any) => (
                    <div key={p.id} className="border rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <div className="flex gap-2 mt-1 text-xs">
                          <span>Stock: <strong className="text-orange-600">{p.stock}</strong></span>
                          <span>Value: <strong>{format(p.price * p.stock)}</strong></span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">Dead</Badge>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Total Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDead.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          No dead stock detected!
                        </TableCell></TableRow>
                      ) : filteredDead.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sku || "—"}</TableCell>
                          <TableCell><span className="text-lg font-bold text-orange-600">{p.stock}</span></TableCell>
                          <TableCell>{format(p.price)}</TableCell>
                          <TableCell className="font-medium">{format(p.price * p.stock)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                              Dead Stock
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Archive className="h-5 w-5" /> Manual Alerts</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No active alerts</TableCell></TableRow>
                    ) : alerts.map((a: any) => (
                      <TableRow key={a.id}>
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

        {/* Restock Dialog */}
        <Dialog open={!!restockDialog} onOpenChange={v => { if (!v) setRestockDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Restock — {restockDialog?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Current Stock</span><span className="font-bold">{restockDialog?.stock}</span></div>
                {restockQty && (
                  <div className="flex justify-between mt-1"><span className="text-muted-foreground">After Restock</span><span className="font-bold text-green-600">{Number(restockDialog?.stock || 0) + Number(restockQty)}</span></div>
                )}
              </div>
              <div>
                <Label>Quantity to Add</Label>
                <Input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="How many units?" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRestockQty("10")}>+10</Button>
                <Button variant="outline" size="sm" onClick={() => setRestockQty("25")}>+25</Button>
                <Button variant="outline" size="sm" onClick={() => setRestockQty("50")}>+50</Button>
                <Button variant="outline" size="sm" onClick={() => setRestockQty("100")}>+100</Button>
              </div>
              <Button onClick={() => restockMutation.mutate()} disabled={!restockQty || restockMutation.isPending} className="w-full">
                {restockMutation.isPending ? "Updating..." : `Add ${restockQty || 0} Units`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default StockAlerts;
