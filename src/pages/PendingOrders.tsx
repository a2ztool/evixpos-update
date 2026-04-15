import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Clock, Eye, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  products: { name: string } | null;
}

interface PendingOrder {
  id: string;
  total_amount: number;
  cost_price: number;
  payment_method: string;
  payment_currency: string;
  payment_status: string;
  notes: string;
  source: string;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
  customers: { name: string } | null;
}

const paymentColors: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const PendingOrders = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const fetchPendingOrders = async () => {
    if (!activeStore) return;
    const { data } = await supabase
      .from("orders")
      .select("*, customers(name)")
      .eq("store_id", activeStore.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) setOrders(data as unknown as PendingOrder[]);
  };

  useEffect(() => {
    if (user && activeStore) fetchPendingOrders();
  }, [user, activeStore]);

  const updateStatus = async (id: string, status: "completed" | "cancelled") => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Order marked as ${status}`);
      fetchPendingOrders();
    }
  };

  const viewDetails = async (order: PendingOrder) => {
    setSelectedOrder(order);
    const { data } = await supabase
      .from("order_items")
      .select("id, quantity, price, products(name)")
      .eq("order_id", order.id);
    setOrderItems((data ?? []) as unknown as OrderItem[]);
    setDetailOpen(true);
  };

  const filtered = orders.filter((o) => {
    if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.id.toLowerCase().includes(q) && !(o.customers?.name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="hidden sm:block">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-amber-500" />
            Pending Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {orders.length} pending order{orders.length !== 1 ? "s" : ""} awaiting action
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pending orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="premium-card flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No pending orders</h3>
          <p className="text-sm text-muted-foreground mb-4">All orders have been processed!</p>
          <Button variant="outline" onClick={() => navigate("/orders")}>View All Orders</Button>
        </div>
      ) : (
        <div className="premium-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}...</TableCell>
                  <TableCell className="font-medium">{o.customers?.name ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{o.payment_currency} {Number(o.total_amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={paymentColors[o.payment_status] ?? "bg-muted text-muted-foreground"}>{o.payment_status}</Badge>
                  </TableCell>
                  <TableCell className="capitalize text-sm">{o.payment_method}</TableCell>
                  <TableCell className="capitalize text-sm">{o.source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => viewDetails(o)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => updateStatus(o.id, "completed")}>
                        Complete
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => updateStatus(o.id, "cancelled")}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Order Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Order ID</span>
                  <p className="font-mono text-xs">{selectedOrder.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <p className="font-medium">{selectedOrder.customers?.name ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment</span>
                  <p className="capitalize font-medium">{selectedOrder.payment_status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Method</span>
                  <p className="capitalize">{selectedOrder.payment_method}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p>{new Date(selectedOrder.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total</span>
                  <p className="text-lg font-bold">{selectedOrder.payment_currency} {Number(selectedOrder.total_amount).toFixed(2)}</p>
                </div>
              </div>
              {selectedOrder.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-1 text-sm">Notes</h3>
                    <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                  </div>
                </>
              )}
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Items</h3>
                {orderItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No items</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.products?.name ?? "—"}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{Number(item.price).toFixed(2)}</TableCell>
                          <TableCell>{(Number(item.price) * item.quantity).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={() => { updateStatus(selectedOrder.id, "completed"); setDetailOpen(false); }}>
                  Mark Completed
                </Button>
                <Button variant="outline" className="flex-1 text-destructive" onClick={() => { updateStatus(selectedOrder.id, "cancelled"); setDetailOpen(false); }}>
                  Cancel Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PendingOrders;
