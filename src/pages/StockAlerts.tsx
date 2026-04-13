import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Package, CheckCircle2, Archive } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { toast } from "sonner";

const StockAlerts = () => {
  const { storeId, ready } = useStoreQuery();
  const queryClient = useQueryClient();

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

  // Auto-detect low stock products
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ["low-stock-products", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, stock, sku")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .lte("stock", 5)
        .order("stock", { ascending: true });
      return data || [];
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

  const lowCount = lowStockProducts.filter((p: any) => p.stock > 0 && p.stock <= 5).length;
  const outOfStock = lowStockProducts.filter((p: any) => p.stock === 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Stock Alerts</h1>
          <p className="text-sm text-muted-foreground">Monitor inventory levels and prevent stockouts</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Archive className="h-8 w-8 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Active Alerts</p><p className="text-2xl font-bold">{alerts.length}</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Low stock products auto-detected */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /> Low Stock Products</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All products are well stocked!
                  </TableCell></TableRow>
                ) : lowStockProducts.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.sku || "—"}</TableCell>
                    <TableCell>
                      <span className={`text-lg font-bold ${p.stock === 0 ? "text-destructive" : "text-yellow-600"}`}>{p.stock}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.stock === 0 ? "destructive" : "secondary"}>
                        {p.stock === 0 ? "Out of Stock" : "Low Stock"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Manual alerts */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Manual Alerts</CardTitle></CardHeader>
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
                  {alerts.map((a: any) => (
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
        )}
      </div>
    </DashboardLayout>
  );
};

export default StockAlerts;
