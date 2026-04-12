import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Package, Users, ShoppingCart, BarChart3, CreditCard } from "lucide-react";

interface StoreDetails {
  store: {
    id: string;
    name: string;
    phone: string;
    address: string;
    is_active: boolean;
    created_at: string;
    user_id: string;
    profiles: { id: string; name: string; email: string } | null;
  };
  plan: string;
  stats: {
    totalProducts: number;
    totalCustomers: number;
    totalOrders: number;
    totalRevenue: number;
    totalProfit: number;
    completedOrders: number;
    pendingOrders: number;
  };
  products: Array<{ id: string; name: string; price: number; stock: number; is_active: boolean; category: string | null; created_at: string }>;
  customers: Array<{ id: string; name: string; email: string | null; phone: string | null; created_at: string }>;
  orders: Array<{ id: string; total_amount: number; cost_price: number; status: string; payment_status: string; payment_method: string; created_at: string }>;
  subscriptions: Array<{ id: string; plan: string; status: string; product_name: string; variation: string; price: number; start_date: string; end_date: string | null }>;
}

const planColor = (plan: string) => {
  if (plan === "business") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (plan === "pro") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-slate-600/20 text-slate-400 border-slate-500/30";
};

const AdminStoreDetails = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const { adminCall, loading } = useAdmin();
  const [data, setData] = useState<StoreDetails | null>(null);

  useEffect(() => {
    if (storeId) {
      adminCall("get_store_details", { store_id: storeId }).then(setData);
    }
  }, [storeId, adminCall]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  if (!data || !data.store) return <p className="text-slate-400">Store not found.</p>;

  const { store, plan, stats, products, customers, orders, subscriptions } = data;
  const owner = store.profiles ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{store.name}</h1>
            <Badge variant="outline" className={planColor(plan)}>{plan}</Badge>
            <Badge variant="outline" className={store.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
              {store.is_active ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Owner: {owner?.name || "—"} ({owner?.email}) · Created {new Date(store.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Products", value: stats.totalProducts, icon: Package, color: "text-blue-400" },
          { label: "Customers", value: stats.totalCustomers, icon: Users, color: "text-emerald-400" },
          { label: "Orders", value: stats.totalOrders, icon: ShoppingCart, color: "text-purple-400" },
          { label: "Revenue", value: `৳${stats.totalRevenue.toLocaleString()}`, icon: BarChart3, color: "text-amber-400" },
          { label: "Profit", value: `৳${stats.totalProfit.toLocaleString()}`, icon: CreditCard, color: "text-cyan-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">Overview</TabsTrigger>
          <TabsTrigger value="orders" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">Orders ({stats.totalOrders})</TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">Products ({stats.totalProducts})</TabsTrigger>
          <TabsTrigger value="customers" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">Customers ({stats.totalCustomers})</TabsTrigger>
          <TabsTrigger value="subscriptions" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">Subscriptions</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-white text-sm">Store Info</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Phone</span><span className="text-white">{store.phone || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Address</span><span className="text-white">{store.address || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Plan</span><Badge variant="outline" className={planColor(plan)}>{plan}</Badge></div>
                <div className="flex justify-between"><span className="text-slate-400">Completed Orders</span><span className="text-white">{stats.completedOrders}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Pending Orders</span><span className="text-white">{stats.pendingOrders}</span></div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-white text-sm">Recent Orders</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex justify-between items-center text-sm bg-slate-700/30 rounded px-3 py-2">
                    <div>
                      <span className="text-white">৳{Number(o.total_amount).toLocaleString()}</span>
                      <span className="text-slate-500 ml-2 text-xs">{o.payment_method}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={o.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]"}>
                        {o.status}
                      </Badge>
                      <span className="text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && <p className="text-slate-500 text-sm">No orders yet.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Payment</TableHead>
                    <TableHead className="text-slate-400">Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="text-slate-300 text-sm">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-white font-medium">৳{Number(o.total_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={o.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : o.status === "cancelled" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={o.payment_status === "paid" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-500/20 text-slate-400 border-slate-500/30"}>
                          {o.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">{o.payment_method}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {orders.length === 0 && <p className="text-center text-slate-500 py-8">No orders.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products */}
        <TabsContent value="products">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Price</TableHead>
                    <TableHead className="text-slate-400">Stock</TableHead>
                    <TableHead className="text-slate-400">Category</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{p.name}</TableCell>
                      <TableCell className="text-slate-300">৳{Number(p.price).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-300">{p.stock}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{p.category || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {products.length === 0 && <p className="text-center text-slate-500 py-8">No products.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers */}
        <TabsContent value="customers">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Phone</TableHead>
                    <TableHead className="text-slate-400">Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{c.name}</TableCell>
                      <TableCell className="text-slate-300">{c.email || "—"}</TableCell>
                      <TableCell className="text-slate-300">{c.phone || "—"}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {customers.length === 0 && <p className="text-center text-slate-500 py-8">No customers.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions */}
        <TabsContent value="subscriptions">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Product</TableHead>
                    <TableHead className="text-slate-400">Variation</TableHead>
                    <TableHead className="text-slate-400">Price</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Start</TableHead>
                    <TableHead className="text-slate-400">End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((s) => (
                    <TableRow key={s.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{s.product_name || "—"}</TableCell>
                      <TableCell className="text-slate-300">{s.variation}</TableCell>
                      <TableCell className="text-slate-300">৳{Number(s.price).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-500/20 text-slate-400 border-slate-500/30"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">{new Date(s.start_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{s.end_date ? new Date(s.end_date).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {subscriptions.length === 0 && <p className="text-center text-slate-500 py-8">No subscriptions.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminStoreDetails;
