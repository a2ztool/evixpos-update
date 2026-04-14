import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pause, Play, Trash2, ShoppingCart, Clock } from "lucide-react";

interface CartItem {
  product: { id: string; name: string; price: number; type: string; stock: number; image_url?: string; category?: string; sku?: string };
  quantity: number;
  variation?: any;
}

interface HeldOrder {
  id: string;
  items: CartItem[];
  customerName?: string;
  customerId?: string;
  heldAt: string;
  note?: string;
}

interface POSHeldOrdersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  cart: CartItem[];
  customerId: string;
  customerName?: string;
  onHold: () => void;
  onResume: (order: HeldOrder) => void;
  format: (n: number, d?: number) => string;
}

const STORAGE_KEY = (storeId: string) => `pos_held_orders_${storeId}`;

export const getHeldOrders = (storeId: string): HeldOrder[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(storeId)) || "[]");
  } catch { return []; }
};

export const saveHeldOrder = (storeId: string, order: HeldOrder) => {
  const orders = getHeldOrders(storeId);
  orders.push(order);
  localStorage.setItem(STORAGE_KEY(storeId), JSON.stringify(orders));
};

export const removeHeldOrder = (storeId: string, orderId: string) => {
  const orders = getHeldOrders(storeId).filter(o => o.id !== orderId);
  localStorage.setItem(STORAGE_KEY(storeId), JSON.stringify(orders));
};

const POSHeldOrders = ({ open, onOpenChange, storeId, cart, customerId, customerName, onHold, onResume, format }: POSHeldOrdersProps) => {
  const [orders, setOrders] = useState<HeldOrder[]>([]);

  const refresh = useCallback(() => {
    setOrders(getHeldOrders(storeId));
  }, [storeId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleResume = (order: HeldOrder) => {
    removeHeldOrder(storeId, order.id);
    onResume(order);
    onOpenChange(false);
  };

  const handleDelete = (orderId: string) => {
    removeHeldOrder(storeId, orderId);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5 text-amber-500" />
            Held Orders ({orders.length})
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No held orders</p>
              <p className="text-xs mt-1">Press F2 to hold current cart</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {orders.map(order => {
                const total = order.items.reduce((s, i) => s + (i.variation ? Number(i.variation.price) : Number(i.product.price)) * i.quantity, 0);
                const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <div key={order.id} className="rounded-lg border p-3 space-y-2 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{order.customerName || "Walk-in"}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(order.heldAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <Badge variant="secondary">{itemCount} items • {format(total)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {order.items.map(i => i.product.name).join(", ")}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 gap-1 h-8" onClick={() => handleResume(order)}>
                        <Play className="h-3 w-3" /> Resume
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => handleDelete(order.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default POSHeldOrders;
