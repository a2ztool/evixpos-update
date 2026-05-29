import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import PageGuide from "@/components/PageGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Search, Clock, Eye, ClipboardList, CheckCircle2, XCircle, AlertTriangle,
  Timer, TrendingUp, DollarSign, Package, ArrowUpDown, RefreshCw,
  ChevronRight, Hourglass, Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  products: { name: string } | null;
}

interface PendingOrder {
  id: string;
  order_number?: number | null;
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
  paid: "bg-success/10 text-success border-success/20",
  unpaid: "bg-destructive/10 text-destructive border-destructive/20",
  partial: "bg-warning/10 text-warning border-warning/20",
};

const sourceIcons: Record<string, string> = {
  pos: "🏪",
  online: "🌐",
  woocommerce: "🛒",
  manual: "✍️",
};

type SortKey = "newest" | "oldest" | "amount_high" | "amount_low";

const getElapsed = (created: string) => {
  const diff = Date.now() - new Date(created).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return { label: "Just now", urgency: "fresh" as const };
  if (mins < 60) return { label: `${mins}m ago`, urgency: "fresh" as const };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ago`, urgency: hrs >= 6 ? ("warning" as const) : ("fresh" as const) };
  const days = Math.floor(hrs / 24);
  return { label: `${days}d ago`, urgency: "urgent" as const };
};

const urgencyStyles = {
  fresh: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
};

const PendingOrders = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"completed" | "cancelled" | null>(null);

  const fetchPendingOrders = async () => {
    if (!activeStore) return;
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*, customers(name)")
      .eq("store_id", activeStore.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) setOrders(data as unknown as PendingOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user && activeStore) fetchPendingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeStore]);

  // Realtime subscription
  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`pending-orders-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${activeStore.id}` }, () => {
        fetchPendingOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore?.id]);

  const updateStatus = async (id: string, status: "completed" | "cancelled") => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Order marked as ${status}`);
      setSelectedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      fetchPendingOrders();
    }
  };

  const performBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("orders").update({ status: bulkAction }).in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`${ids.length} order${ids.length > 1 ? "s" : ""} marked as ${bulkAction}`);
      setSelectedIds(new Set());
      fetchPendingOrders();
    }
    setBulkAction(null);
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

  const filtered = useMemo(() => {
    let list = orders.filter((o) => {
      if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
      if (sourceFilter !== "all" && o.source !== sourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!o.id.toLowerCase().includes(q) && !(o.customers?.name ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    switch (sortKey) {
      case "oldest":
        list = [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        break;
      case "amount_high":
        list = [...list].sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
        break;
      case "amount_low":
        list = [...list].sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
        break;
      default:
        list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return list;
  }, [orders, paymentFilter, sourceFilter, search, sortKey]);

  // Stats
  const stats = useMemo(() => {
    const total = orders.length;
    const totalValue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const unpaid = orders.filter((o) => o.payment_status === "unpaid").length;
    const urgent = orders.filter((o) => Date.now() - new Date(o.created_at).getTime() > 6 * 3600 * 1000).length;
    const currency = orders[0]?.payment_currency ?? "";
    return { total, totalValue, unpaid, urgent, currency };
  }, [orders]);

  const allSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  const someSelected = filtered.some((o) => selectedIds.has(o.id)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <DashboardLayout>
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-3 sm:p-6 mb-3 sm:mb-6">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 flex-shrink-0">
              <Hourglass className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-2xl font-bold tracking-tight flex items-center gap-1.5 sm:gap-2 truncate">
                Pending Orders
                {stats.urgent > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border border-destructive/20 gap-1 text-[10px] sm:text-xs px-1.5 py-0 h-4 sm:h-auto">
                    <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {stats.urgent}
                  </Badge>
                )}
              </h1>
              <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 truncate">
                {stats.total} order{stats.total !== 1 ? "s" : ""} awaiting action
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={fetchPendingOrders} className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <PageGuide
              title="Pending Orders Guide"
              steps={[
                { title: "What is this page?", description: "All orders waiting to be completed or cancelled appear here in real-time." },
                { title: "Time tracking", description: "Each order shows how long it's been pending. Orders older than 6 hours show as urgent." },
                { title: "Bulk actions", description: "Select multiple orders using checkboxes to complete or cancel them in one click." },
                { title: "Quick actions", description: "Use the inline buttons to instantly complete or cancel an order." },
                { title: "Smart filtering", description: "Filter by payment status, source channel, or sort by amount/age to prioritize." },
                { title: "Realtime sync", description: "New orders from POS, WooCommerce, or order forms appear automatically — no refresh needed." },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-6">
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="Total Pending"
          value={stats.total.toString()}
          accent="from-primary/10 to-primary/5 text-primary border-primary/20"
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Pending Value"
          value={`${stats.currency} ${stats.totalValue.toFixed(2)}`}
          accent="from-success/10 to-success/5 text-success border-success/20"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="Unpaid"
          value={stats.unpaid.toString()}
          accent="from-destructive/10 to-destructive/5 text-destructive border-destructive/20"
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="Urgent (>6h)"
          value={stats.urgent.toString()}
          accent="from-warning/10 to-warning/5 text-warning border-warning/20"
        />
      </div>

      {/* Filters Bar */}
      <div className="rounded-xl sm:rounded-2xl border bg-card p-2 sm:p-4 mb-3 sm:mb-4 flex flex-col lg:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 sm:pl-9 h-9 sm:h-10 text-xs sm:text-sm bg-background"
          />
        </div>
        <div className="grid grid-cols-3 lg:flex gap-1.5 sm:gap-2">
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full lg:w-[140px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full lg:w-[140px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="woocommerce">WooCommerce</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-full lg:w-[160px] h-9 sm:h-10 text-xs sm:text-sm bg-background">
              <ArrowUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 flex-shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="amount_high">Amount: High → Low</SelectItem>
              <SelectItem value="amount_low">Amount: Low → High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-xl sm:rounded-2xl border-2 border-primary/30 bg-primary/5 backdrop-blur-sm p-2 sm:p-3 mb-3 sm:mb-4 flex flex-row items-center justify-between gap-2 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium min-w-0">
            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
            <span className="truncate">{selectedIds.size} selected</span>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Button size="sm" variant="ghost" className="h-7 sm:h-8 text-xs px-2" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button size="sm" variant="outline" className="h-7 sm:h-8 text-xs px-2 text-destructive hover:text-destructive gap-1" onClick={() => setBulkAction("cancelled")}>
              <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Cancel
            </Button>
            <Button size="sm" className="h-7 sm:h-8 text-xs px-2 gap-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => setBulkAction("completed")}>
              <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Complete
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <RefreshCw className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Loading pending orders...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/20 flex flex-col items-center justify-center py-20 px-4">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-success/20 blur-2xl rounded-full" />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center border border-success/20">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-1">All caught up! 🎉</h3>
          <p className="text-sm text-muted-foreground mb-5 text-center max-w-sm">
            No pending orders. Everything has been processed. Great job!
          </p>
          <Button variant="outline" onClick={() => navigate("/orders")} className="gap-1.5">
            View All Orders
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((o) => {
              const elapsed = getElapsed(o.created_at);
              const checked = selectedIds.has(o.id);
              return (
                <div key={o.id} className={cn(
                  "rounded-2xl border bg-card p-4 space-y-3 transition-all",
                  checked && "border-primary/50 ring-2 ring-primary/20",
                )}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={checked} onCheckedChange={() => toggleOne(o.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{o.customers?.name ?? "Walk-in customer"}</p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all" title={o.order_number ? String(o.order_number) : o.id}>{o.order_number ?? o.id}</p>
                        </div>
                        <Badge variant="outline" className={cn("border", paymentColors[o.payment_status] ?? "")}>
                          {o.payment_status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold">{o.payment_currency} {Number(o.total_amount).toFixed(2)}</span>
                        <Badge variant="outline" className={cn("border gap-1 text-[10px]", urgencyStyles[elapsed.urgency])}>
                          <Clock className="h-2.5 w-2.5" />
                          {elapsed.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                        <span>{sourceIcons[o.source] ?? "📦"} {o.source}</span>
                        <span>•</span>
                        <span className="capitalize">{o.payment_method}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" className="h-8 text-xs flex-1 bg-success hover:bg-success/90 text-success-foreground gap-1" onClick={() => updateStatus(o.id, "completed")}>
                      <CheckCircle2 className="h-3 w-3" /> Complete
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1 text-destructive hover:text-destructive gap-1" onClick={() => updateStatus(o.id, "cancelled")}>
                      <XCircle className="h-3 w-3" /> Cancel
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => viewDetails(o)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      ref={(el) => {
                        if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected;
                      }}
                    />
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const elapsed = getElapsed(o.created_at);
                  const checked = selectedIds.has(o.id);
                  return (
                    <TableRow key={o.id} className={cn("hover:bg-muted/40 transition-colors", checked && "bg-primary/5")}>
                      <TableCell>
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(o.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-muted-foreground break-all" title={o.order_number ? String(o.order_number) : o.id}>{o.order_number ?? o.id}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(o.created_at).toLocaleDateString()}</div>
                      </TableCell>
                      <TableCell className="font-medium">{o.customers?.name ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                      <TableCell className="font-semibold">{o.payment_currency} {Number(o.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border", paymentColors[o.payment_status] ?? "")}>
                          {o.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <span>{sourceIcons[o.source] ?? "📦"}</span>
                          <span className="capitalize">{o.source}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border gap-1 font-normal", urgencyStyles[elapsed.urgency])}>
                          <Clock className="h-3 w-3" />
                          {elapsed.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewDetails(o)} title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" className="h-8 text-xs gap-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => updateStatus(o.id, "completed")}>
                            <CheckCircle2 className="h-3 w-3" /> Complete
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:text-destructive gap-1" onClick={() => updateStatus(o.id, "cancelled")}>
                            <XCircle className="h-3 w-3" /> Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pro Tip Footer */}
          <div className="mt-4 rounded-xl border border-dashed bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span>
              <strong className="text-foreground">Pro tip:</strong> Process urgent orders (red badges) first to keep customers happy and improve fulfillment time.
            </span>
          </div>
        </>
      )}

      {/* Bulk confirm */}
      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "completed" ? "Complete" : "Cancel"} {selectedIds.size} order{selectedIds.size > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "completed"
                ? "These orders will be marked as completed and removed from pending."
                : "These orders will be cancelled. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={bulkAction === "cancelled" ? "bg-destructive hover:bg-destructive/90" : "bg-success hover:bg-success/90"}
              onClick={performBulk}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Order Details
            </DialogTitle>
            <DialogDescription>
              View order summary, items, and take action on this pending order.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm rounded-xl bg-muted/40 p-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Order ID</span>
                  <p className="font-mono text-xs">{selectedOrder.order_number ?? selectedOrder.id}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</span>
                  <p className="font-medium">{selectedOrder.customers?.name ?? "Walk-in"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</span>
                  <Badge variant="outline" className={cn("border mt-0.5", paymentColors[selectedOrder.payment_status] ?? "")}>
                    {selectedOrder.payment_status}
                  </Badge>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Method</span>
                  <p className="capitalize">{selectedOrder.payment_method}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</span>
                  <p className="text-xs">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                  <p className="text-lg font-bold text-primary">{selectedOrder.payment_currency} {Number(selectedOrder.total_amount).toFixed(2)}</p>
                </div>
              </div>
              {selectedOrder.notes && (
                <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                  <h3 className="font-semibold mb-1 text-xs uppercase tracking-wider text-warning">Notes</h3>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Items ({orderItems.length})
                </h3>
                {orderItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No items</p>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.products?.name ?? "—"}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">{Number(item.price).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{(Number(item.price) * item.quantity).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-1.5" onClick={() => { updateStatus(selectedOrder.id, "completed"); setDetailOpen(false); }}>
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Completed
                </Button>
                <Button variant="outline" className="flex-1 text-destructive hover:text-destructive gap-1.5" onClick={() => { updateStatus(selectedOrder.id, "cancelled"); setDetailOpen(false); }}>
                  <XCircle className="h-4 w-4" />
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

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}

const StatCard = ({ icon, label, value, accent }: StatCardProps) => (
  <div className={cn("relative rounded-lg sm:rounded-2xl border bg-gradient-to-br p-2 sm:p-4 overflow-hidden", accent)}>
    <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-1.5">
      <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 backdrop-blur flex items-center justify-center flex-shrink-0 [&>svg]:h-3 [&>svg]:w-3 sm:[&>svg]:h-4 sm:[&>svg]:w-4">
        {icon}
      </div>
      <span className="text-[9px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">{label}</span>
    </div>
    <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{value}</p>
  </div>
);

export default PendingOrders;
