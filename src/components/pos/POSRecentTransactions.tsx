import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Receipt } from "lucide-react";

interface RecentOrder {
  id: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  customers?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  format: (n: number, d?: number) => string;
}

const POSRecentTransactions = ({ open, onOpenChange, storeId, format }: Props) => {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !storeId) return;
    setLoading(true);
    supabase
      .from("orders")
      .select("id, total_amount, payment_method, payment_status, created_at, customers(name)")
      .eq("store_id", storeId)
      .eq("source", "pos")
      .order("created_at", { ascending: false })
      .limit(15)
      .then(({ data }) => {
        setOrders((data ?? []) as RecentOrder[]);
        setLoading(false);
      });
  }, [open, storeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Recent POS Transactions
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No recent transactions</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{o.customers?.name || "Walk-in"}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold">{format(o.total_amount)}</p>
                    <Badge variant={o.payment_status === "paid" ? "default" : "secondary"} className="text-[9px]">
                      {o.payment_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default POSRecentTransactions;
