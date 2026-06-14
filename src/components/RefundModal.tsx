import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import {
  RotateCcw, AlertTriangle, ArrowRight, ArrowLeft, Check, Package, DollarSign,
} from "lucide-react";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product_id: string | null;
  products: { name: string; type?: string } | null;
}

interface RefundOrder {
  id: string;
  total_amount: number;
  payment_currency: string;
  payment_method: string;
  payment_status: string;
  status: string;
  customers: { name: string } | null;
}

interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: RefundOrder | null;
  orderItems: OrderItem[];
  onRefundComplete: () => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

const RefundModal = ({ open, onOpenChange, order, orderItems, onRefundComplete }: RefundModalProps) => {
  const { user } = useAuth();
  const { activeStore } = useStore();

  const [step, setStep] = useState(0);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [customAmount, setCustomAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0);
      setRefundType("full");
      setSelectedItems({});
      setCustomAmount("");
      setReason("");
    }
  }, [open]);

  if (!order) return null;

  const cur = CURRENCY_SYMBOLS[order.payment_currency] || order.payment_currency;
  const total = Number(order.total_amount);

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      if (prev[itemId]) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: maxQty };
    });
  };

  const updateItemQty = (itemId: string, qty: number, maxQty: number) => {
    if (qty < 1 || qty > maxQty) return;
    setSelectedItems((prev) => ({ ...prev, [itemId]: qty }));
  };

  const refundAmount = refundType === "full"
    ? total
    : customAmount
      ? parseFloat(customAmount) || 0
      : orderItems
          .filter((i) => selectedItems[i.id])
          .reduce((sum, i) => sum + Number(i.price) * (selectedItems[i.id] || 0), 0);

  const refundItemsList = refundType === "full"
    ? orderItems.map((i) => ({
        item_id: i.id,
        product_id: i.product_id,
        product_name: i.products?.name || "Unknown",
        product_type: (i.products as any)?.type || "physical",
        quantity: i.quantity,
        price: Number(i.price),
      }))
    : orderItems
        .filter((i) => selectedItems[i.id])
        .map((i) => ({
          item_id: i.id,
          product_id: i.product_id,
          product_name: i.products?.name || "Unknown",
          product_type: (i.products as any)?.type || "physical",
          quantity: selectedItems[i.id] || i.quantity,
          price: Number(i.price),
        }));

  const handleSubmit = async () => {
    if (refundAmount <= 0) {
      toast.error("Refund amount must be greater than 0");
      return;
    }
    if (refundAmount > total) {
      toast.error("Refund amount cannot exceed order total");
      return;
    }

    setSubmitting(true);
    try {
      // Create refund record
      const { error: refundErr } = await supabase.from("refunds").insert({
        user_id: user!.id,
        order_id: order.id,
        store_id: activeStore?.id,
        refund_type: refundType,
        refund_amount: refundAmount,
        refund_items: refundItemsList as any,
        reason,
        status: "approved",
      });
      if (refundErr) throw refundErr;

      // Update order payment_status
      const newPaymentStatus = refundType === "full" ? "refunded" : "partial_refund";
      await supabase
        .from("orders")
        .update({ payment_status: newPaymentStatus })
        .eq("id", order.id);

      // Restore stock for physical products
      const physicalItems = refundItemsList.filter((i) => i.product_type === "physical" && i.product_id);
      for (const item of physicalItems) {
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", item.product_id!)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock: prod.stock + item.quantity })
            .eq("id", item.product_id!);
        }
      }

      toast.success(refundType === "full" ? "Full refund processed!" : "Partial refund processed!");
      onRefundComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to process refund");
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    // Step 0: Choose type
    <div key="type" className="space-y-4">
      <p className="text-sm text-muted-foreground">Select the type of refund for this order.</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setRefundType("full")}
          className={`rounded-xl p-4 border-2 text-left transition-all ${
            refundType === "full"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <DollarSign className={`h-5 w-5 mb-2 ${refundType === "full" ? "text-primary" : "text-muted-foreground"}`} />
          <p className="font-bold text-sm">Full Refund</p>
          <p className="text-[11px] text-muted-foreground mt-1">Refund entire order amount</p>
          <p className="text-lg font-extrabold mt-2 text-primary">{cur}{total.toFixed(2)}</p>
        </button>
        <button
          onClick={() => setRefundType("partial")}
          className={`rounded-xl p-4 border-2 text-left transition-all ${
            refundType === "partial"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <Package className={`h-5 w-5 mb-2 ${refundType === "partial" ? "text-primary" : "text-muted-foreground"}`} />
          <p className="font-bold text-sm">Partial Refund</p>
          <p className="text-[11px] text-muted-foreground mt-1">Select items or custom amount</p>
          <p className="text-lg font-extrabold mt-2 text-muted-foreground">Custom</p>
        </button>
      </div>
    </div>,

    // Step 1: Select items (partial) or confirm items (full)
    <div key="items" className="space-y-4">
      {refundType === "partial" ? (
        <>
          <p className="text-sm text-muted-foreground">Select items to refund or enter a custom amount.</p>
          {orderItems.length > 0 && (
            <div className="space-y-2">
              {orderItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                    selectedItems[item.id] ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <Checkbox
                    checked={!!selectedItems[item.id]}
                    onCheckedChange={() => toggleItem(item.id, item.quantity)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.products?.name || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {cur}{Number(item.price).toFixed(2)} × {item.quantity} = {cur}{(Number(item.price) * item.quantity).toFixed(2)}
                    </p>
                  </div>
                  {selectedItems[item.id] && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateItemQty(item.id, (selectedItems[item.id] || 1) - 1, item.quantity)}
                      >-</Button>
                      <span className="w-8 text-center text-sm font-bold">{selectedItems[item.id]}</span>
                      <Button
                        variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateItemQty(item.id, (selectedItems[item.id] || 1) + 1, item.quantity)}
                      >+</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Or enter custom refund amount</Label>
            <Input
              type="number"
              placeholder={`Max: ${cur}${total.toFixed(2)}`}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedItems({});
              }}
              max={total}
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">The following items will be refunded:</p>
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="font-medium text-sm">{item.products?.name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="font-bold text-sm">{cur}{(Number(item.price) * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex justify-between items-center">
        <span className="text-sm font-semibold">Refund Amount</span>
        <span className="text-lg font-black text-primary">{cur}{refundAmount.toFixed(2)}</span>
      </div>
    </div>,

    // Step 2: Reason + Confirm
    <div key="confirm" className="space-y-4">
      <div className="space-y-2">
        <Label>Reason for refund (optional)</Label>
        <Textarea
          placeholder="e.g. Customer not satisfied, wrong product, etc."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
      </div>

      <Separator />

      {/* Summary */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <h4 className="font-bold text-sm">Refund Summary</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Order ID</span>
          <span className="font-mono text-xs break-all">{(order as any).order_code ?? (order as any).order_number ?? order.id}</span>
          <span className="text-muted-foreground">Customer</span>
          <span className="font-medium">{order.customers?.name || "Walk-in"}</span>
          <span className="text-muted-foreground">Refund Type</span>
          <span className="capitalize font-medium">{refundType}</span>
          <span className="text-muted-foreground">Items</span>
          <span>{refundItemsList.length} item(s)</span>
        </div>
        <Separator />
        <div className="flex justify-between items-center">
          <span className="font-bold">Refund Amount</span>
          <span className="text-xl font-black text-primary">{cur}{refundAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Are you sure?</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            This action will update the order status and restore stock for physical products. This cannot be easily undone.
          </p>
        </div>
      </div>
    </div>,
  ];

  const stepTitles = ["Refund Type", "Select Items", "Confirm Refund"];
  const canNext = step === 0 ? true : step === 1 ? refundAmount > 0 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            {stepTitles[step]}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {stepTitles.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="mt-2">{steps[step]}</div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < 2 ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setStep(step + 1)}
              disabled={!canNext}
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Processing..." : "Confirm Refund"}
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RefundModal;
