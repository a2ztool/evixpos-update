import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Tag, Check, X, ShieldCheck, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createRazorpayOrder, openRazorpayCheckout } from "@/lib/razorpayCheckout";
import { useAuth } from "@/contexts/AuthContext";

interface PlatformCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  expires_at: string | null;
  is_active: boolean;
  max_uses: number;
  used_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planKey: "pro" | "business";
  planName: string;
  volume: number;
  billingType: "monthly" | "yearly";
  /** Base price in INR before coupon (already includes yearly discount) */
  basePriceINR: number;
  onSuccess?: () => void;
}

const RazorpayUpgradeModal = ({
  open, onOpenChange, planKey, planName, volume, billingType, basePriceINR, onSuccess,
}: Props) => {
  const { user } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<PlatformCoupon | null>(null);
  const [applying, setApplying] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!open) {
      setCouponCode("");
      setAppliedCoupon(null);
      setApplying(false);
      setPaying(false);
    }
  }, [open]);

  const discount = (() => {
    if (!appliedCoupon) return 0;
    const dv = Number(appliedCoupon.discount_value);
    const raw = appliedCoupon.discount_type === "percentage" ? basePriceINR * (dv / 100) : dv;
    return Math.max(0, Math.min(basePriceINR, Math.round(raw)));
  })();
  const finalPrice = Math.max(1, basePriceINR - discount);

  const fmt = (n: number) => `₹${n.toFixed(0)}`;

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { toast.error("Enter a coupon code"); return; }
    setApplying(true);
    try {
      const { data } = await supabase
        .from("platform_coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) { toast.error("Invalid or expired coupon code"); return; }
      const c = data as unknown as PlatformCoupon;
      if (c.expires_at && new Date(c.expires_at) < new Date()) { toast.error("This coupon has expired"); return; }
      if (c.max_uses > 0 && c.used_count >= c.max_uses) { toast.error("Coupon usage limit reached"); return; }
      setAppliedCoupon(c);
      toast.success(`Coupon applied: ${c.discount_type === "percentage" ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}`);
    } finally {
      setApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
  };

  const handleProceed = async () => {
    if (!user) { toast.error("Please log in"); return; }
    setPaying(true);
    try {
      // Ensure we have a fresh, valid session before invoking the edge function.
      // A stale/missing refresh token causes the function to return 401.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Your session has expired. Please log in again.");
        await supabase.auth.signOut();
        if (typeof window !== "undefined") window.location.href = "/auth";
        return;
      }
      const order = await createRazorpayOrder({
        plan: planKey,
        volume,
        billing_type: billingType,
        coupon_code: appliedCoupon?.code,
      });
      // Hard guard: backend amount must match what the user sees
      const backendINR = order.amount / 100;
      if (Math.abs(backendINR - finalPrice) > 0.5) {
        toast.error(`Price mismatch. UI ₹${finalPrice.toFixed(0)} vs server ₹${backendINR.toFixed(0)}. Please retry.`);
        setPaying(false);
        return;
      }
      // Close our Radix Dialog before opening Razorpay popup so its overlay
      // doesn't trap focus / block pointer events on the Razorpay iframe.
      onOpenChange(false);
      await new Promise((r) => setTimeout(r, 150));

      await openRazorpayCheckout({
        ...order,
        planName,
        prefill: { name: user.user_metadata?.name || "", email: user.email || "" },
        onSuccess: () => {
          toast.success("Payment received! Activating your plan…");
          setPaying(false);
          onSuccess?.();
          setTimeout(() => window.location.reload(), 2500);
        },
        onDismiss: () => {
          setPaying(false);
          toast.info("Payment cancelled");
        },
        onFailure: (err) => {
          setPaying(false);
          toast.error(err?.description || "Payment failed. Please retry.");
        },
      });
    } catch (e: any) {
      setPaying(false);
      toast.error(e?.message || "Could not start checkout. Please retry.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !paying && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Upgrade to {planName}
          </DialogTitle>
          <DialogDescription>
            Review your plan and apply a coupon before paying.
          </DialogDescription>
        </DialogHeader>

        {/* Plan summary */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">{planName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Billing</span>
            <span className="font-medium capitalize">{billingType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Volume</span>
            <span className="font-medium">{volume.toLocaleString()} customers</span>
          </div>
        </div>

        {/* Coupon */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" /> Coupon code
          </label>
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                <span className="text-sm font-mono font-semibold">{appliedCoupon.code}</span>
                <Badge variant="outline" className="text-success border-success/30 text-[10px]">
                  {appliedCoupon.discount_type === "percentage"
                    ? `${appliedCoupon.discount_value}% OFF`
                    : `₹${appliedCoupon.discount_value} OFF`}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRemoveCoupon} disabled={paying}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                disabled={applying || paying}
                className="font-mono uppercase"
              />
              <Button onClick={handleApplyCoupon} disabled={applying || paying || !couponCode.trim()} variant="secondary">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          )}
        </div>

        {/* Price breakdown */}
        <div className="rounded-lg border p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Original price</span>
            <span className={appliedCoupon ? "line-through text-muted-foreground" : ""}>{fmt(basePriceINR)}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-success">
              <span>Discount ({appliedCoupon.code})</span>
              <span>− {fmt(discount)}</span>
            </div>
          )}
          <div className="border-t pt-1.5 flex justify-between items-baseline">
            <span className="font-semibold">Final amount</span>
            <span className="text-xl font-bold text-primary">{fmt(finalPrice)}</span>
          </div>
        </div>

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleProceed}
          disabled={paying || applying}
        >
          {paying ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
          ) : (
            <><ShieldCheck className="h-4 w-4" /> Proceed to Payment · {fmt(finalPrice)}</>
          )}
        </Button>
        <p className="text-[11px] text-center text-muted-foreground">
          Secure payment powered by Razorpay. Your card details are never stored.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default RazorpayUpgradeModal;